package controllers

import (
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"go_backend/database"
	"go_backend/models"
	"go_backend/utils"
	"golang.org/x/crypto/bcrypt"
)

// ==========================================
// 🛠️ Helpers สำหรับจัดการรหัสผ่าน (Hashing)
// ==========================================
func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 14)
	return string(bytes), err
}

func CheckPasswordHash(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

// ==========================================
// 1. โครงสร้างสำหรับรับข้อมูลการล็อกอินจาก Next.js
// ==========================================
type GoogleLoginInput struct {
	Email   string `json:"email"`
	Name    string `json:"name"`
	Profile string `json:"profile"`
}

// ==========================================
// 2. ฟังก์ชันจัดการการล็อกอินผ่าน Google (หลัก)
// ==========================================
func GoogleLogin(c *fiber.Ctx) error {
	input := new(GoogleLoginInput)

	if err := c.BodyParser(input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}

	fmt.Println("รับข้อมูลจาก Next.js - Email:", input.Email, "Profile:", input.Profile)

	var user models.User
	result := database.DB.Where("email = ?", input.Email).First(&user)

	if result.Error != nil {
		user = models.User{
			Name:       input.Name,
			Email:      input.Email,
			Profile:    input.Profile,
			IsVerified: true, // 🟢 ล็อกอินผ่าน Google ถือว่ายืนยันอีเมลแล้ว
		}

		if err := database.DB.Create(&user).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ไม่สามารถสร้างบัญชีได้"})
		}
		fmt.Println("✅ สร้างบัญชีใหม่สำเร็จ:", user.Email)
	} else {
		err := database.DB.Model(&user).UpdateColumn("profile", input.Profile).Error
		if err != nil {
			fmt.Println("❌ อัปเดตรูปโปรไฟล์ลง Database ไม่สำเร็จ เกิดข้อผิดพลาด:", err)
		}
	}

	tokenString, err := utils.GenerateToken(user.ID, user.Email)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ไม่สามารถสร้าง Token ได้"})
	}

	c.Cookie(&fiber.Cookie{
		Name:     "token",
		Value:    tokenString,
		Expires:  time.Now().Add(time.Hour * 72),
		HTTPOnly: true,
		SameSite: "Lax",
	})

	return c.JSON(fiber.Map{
		"message": "ล็อกอินสำเร็จ",
		"user":    user,
	})
}

// ==========================================
// 3. ฟังก์ชันสำหรับออกจากระบบ (Logout)
// ==========================================
func Logout(c *fiber.Ctx) error {
	c.Cookie(&fiber.Cookie{
		Name:     "token",
		Value:    "",
		Expires:  time.Now().Add(-time.Hour),
		HTTPOnly: true,
		SameSite: "Lax",
	})

	return c.JSON(fiber.Map{
		"message": "ออกจากระบบสำเร็จ",
	})
}

// ==========================================
// 4. ฟังก์ชันดึงข้อมูลโปรไฟล์
// ==========================================
func GetProfile(c *fiber.Ctx) error {
	tokenString := c.Cookies("token")

	if tokenString == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"message": "กรุณาล็อกอินก่อน (ไม่มี Token)",
		})
	}

	return c.JSON(fiber.Map{
		"status":  "success",
		"message": "พบ Token แล้ว",
	})
}

// ==========================================
// 5. สมัครสมาชิก (ด้วย Email/Password ปกติ)
// ==========================================
func Register(c *fiber.Ctx) error {
	var input struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}

	if input.Password == "" {
		return c.Status(400).JSON(fiber.Map{"error": "กรุณากรอกรหัสผ่าน"})
	}

	hashedPassword, err := HashPassword(input.Password)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "เข้ารหัสผ่านไม่สำเร็จ"})
	}

	// 🟢 1. สร้าง Token สำหรับยืนยันอีเมล (ต้องสร้างฟังก์ชันนี้ใน utils/email.go)
	verifyToken := utils.GenerateVerificationToken()

	user := models.User{
		Name:              input.Name,
		Email:             input.Email,
		Password:          hashedPassword,
		IsVerified:        false,       // 🟢 ให้สถานะเป็น False จนกว่าจะกดลิงก์
		VerificationToken: verifyToken, // 🟢 บันทึก Token ลง DB
	}

	result := database.DB.Create(&user)
	if result.Error != nil {
		return c.Status(500).JSON(fiber.Map{"error": "อีเมลนี้มีในระบบแล้ว หรือบันทึกไม่สำเร็จ"})
	}

	// 🟢 2. สั่งให้ส่งอีเมลทำงานเบื้องหลัง
	go utils.SendVerificationEmail(user.Email, user.Name, verifyToken)

	return c.Status(201).JSON(fiber.Map{
		"message": "สมัครสมาชิกสำเร็จ! กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชี",
		"email":   user.Email,
	})
}

// ==========================================
// 6. เข้าสู่ระบบ (ด้วย Email/Password ปกติ)
// ==========================================
func LoginWithEmail(c *fiber.Ctx) error {
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}

	var user models.User
	result := database.DB.Where("email = ?", input.Email).First(&user)
	if result.Error != nil {
		return c.Status(401).JSON(fiber.Map{"error": "ไม่พบอีเมลนี้ในระบบ"})
	}

	// 🟢 2. ดักจับ! เช็คว่ายืนยันอีเมลหรือยังก่อนเช็ครหัสผ่าน
	if !user.IsVerified {
		// 🟢 2.1 สร้าง Token ยืนยันตัวใหม่
		newToken := utils.GenerateVerificationToken()

		// 🟢 2.2 อัปเดต Token ใหม่นี้ลงไปในฐานข้อมูลแทนของเดิม
		database.DB.Model(&user).Update("verification_token", newToken)

		// 🟢 2.3 สั่งให้ระบบส่งอีเมลยืนยันไปใหม่อีกรอบ (ทำงานเบื้องหลัง)
		go utils.SendVerificationEmail(user.Email, user.Name, newToken)

		// 🟢 2.4 ส่ง Status 403 กลับไป พร้อมเปลี่ยนข้อความให้ผู้ใช้รู้ว่าส่งเมลไปให้ใหม่แล้ว
		return c.Status(403).JSON(fiber.Map{
			"error": "คุณยังไม่ได้ยืนยันอีเมล ระบบได้ส่งลิงก์ใหม่ไปให้แล้ว กรุณาตรวจสอบกล่องข้อความอีกครั้ง",
		})
	}

	if !CheckPasswordHash(input.Password, user.Password) {
		return c.Status(401).JSON(fiber.Map{"error": "รหัสผ่านไม่ถูกต้อง"})
	}

	tokenString, err := utils.GenerateToken(user.ID, user.Email)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "สร้าง Token ไม่สำเร็จ"})
	}

	c.Cookie(&fiber.Cookie{
		Name:     "token",
		Value:    tokenString,
		Expires:  time.Now().Add(time.Hour * 72),
		HTTPOnly: true,
		SameSite: "Lax",
	})

	return c.Status(200).JSON(fiber.Map{
		"message": "เข้าสู่ระบบสำเร็จ",
		"user": fiber.Map{
			"name":  user.Name,
			"email": user.Email,
			"role":  user.Role,
		},
	})
}

// ==========================================
// 7. ฟังก์ชันยืนยันอีเมล (Verify Email) 🟢 (เพิ่มใหม่)
// ==========================================
func VerifyEmail(c *fiber.Ctx) error {
	token := c.Query("token")
	if token == "" {
		return c.Status(400).JSON(fiber.Map{"error": "ไม่พบข้อมูล Token"})
	}

	var user models.User
	// ค้นหา User ที่มี Token ตรงกับที่ส่งมาใน URL
	if err := database.DB.Where("verification_token = ?", token).First(&user).Error; err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ลิงก์ไม่ถูกต้อง หรืออีเมลนี้ได้รับการยืนยันไปแล้ว"})
	}

	// อัปเดตให้ IsVerified เป็น true และล้างค่า Token เดิมทิ้ง
	database.DB.Model(&user).Updates(map[string]interface{}{
		"is_verified":        true,
		"verification_token": "", 
	})

	return c.JSON(fiber.Map{"message": "ยืนยันอีเมลสำเร็จ! บัญชีของคุณพร้อมใช้งานแล้ว"})
}