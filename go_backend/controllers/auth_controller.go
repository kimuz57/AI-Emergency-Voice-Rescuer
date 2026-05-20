package controllers

import (
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"go_backend/database"
	"go_backend/models"
	"go_backend/utils"
	"golang.org/x/crypto/bcrypt" // 🟢 นำเข้า bcrypt สำหรับเข้ารหัสผ่าน
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

	// ดึงข้อมูลที่ Next.js ส่งมา
	if err := c.BodyParser(input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}

	fmt.Println("รับข้อมูลจาก Next.js - Email:", input.Email, "Profile:", input.Profile)

	var user models.User

	// ค้นหาว่ามี User คนนี้ในระบบหรือยัง?
	result := database.DB.Where("email = ?", input.Email).First(&user)

	if result.Error != nil {
		// ถ้าไม่เจอ (เป็นคนใหม่) ให้สร้าง User ใหม่
		user = models.User{
			Name:       input.Name,
			Email:      input.Email,
			Profile:    input.Profile,
			IsVerified: true, // กำหนดให้ยืนยันตัวตนผ่าน Google เรียบร้อย
		}

		if err := database.DB.Create(&user).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ไม่สามารถสร้างบัญชีได้"})
		}
		fmt.Println("✅ สร้างบัญชีใหม่สำเร็จ:", user.Email)
	} else {
		// ถ้าเจอคนเดิม ให้อัปเดตเฉพาะรูปโปรไฟล์ (เผื่อเขาเปลี่ยนรูปใน Google)
		err := database.DB.Model(&user).UpdateColumn("profile", input.Profile).Error
		if err != nil {
			fmt.Println("❌ อัปเดตรูปโปรไฟล์ลง Database ไม่สำเร็จ เกิดข้อผิดพลาด:", err)
		} else {
			fmt.Println("✅ อัปเดตรูปโปรไฟล์สำเร็จ")
		}
	}

	// 🟢 ใช้งานฟังก์ชันสร้าง Token จาก utils/jwt.go
	tokenString, err := utils.GenerateToken(user.ID, user.Email)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ไม่สามารถสร้าง Token ได้"})
	}

	// สร้าง Cookie ชื่อ "token" เพื่อแนบกลับไปให้หน้าบ้าน
	c.Cookie(&fiber.Cookie{
		Name:     "token",
		Value:    tokenString,
		Expires:  time.Now().Add(time.Hour * 72), // ตรงกับที่ตั้งไว้ใน utils
		HTTPOnly: true,
		SameSite: "Lax",
	})

	// ส่งข้อมูลกลับ
	return c.JSON(fiber.Map{
		"message": "ล็อกอินสำเร็จ",
		"user":    user,
	})
}

// ==========================================
// 3. ฟังก์ชันสำหรับออกจากระบบ (Logout)
// ==========================================
func Logout(c *fiber.Ctx) error {
	// สั่งล้างคุกกี้โดยการตั้งค่าให้หมดอายุย้อนหลัง
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
// 4. ฟังก์ชันดึงข้อมูลโปรไฟล์ (ใช้เช็คว่า Token ยังใช้งานได้ไหม)
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
	user := new(models.User)
	if err := c.BodyParser(user); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}
	
	// เข้ารหัสผ่านก่อนเซฟลง Database
	hashedPassword, err := HashPassword(user.Password) 
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "เข้ารหัสผ่านไม่สำเร็จ"})
	}
	user.Password = hashedPassword

	result := database.DB.Create(&user)
	if result.Error != nil {
		return c.Status(500).JSON(fiber.Map{"error": "อีเมลนี้มีในระบบแล้ว หรือบันทึกไม่สำเร็จ"})
	}

	return c.Status(201).JSON(fiber.Map{
		"message": "สมัครสมาชิกสำเร็จ!",
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

	// ตรวจสอบความถูกต้องของรหัสผ่าน
	if !CheckPasswordHash(input.Password, user.Password) { 
		return c.Status(401).JSON(fiber.Map{"error": "รหัสผ่านไม่ถูกต้อง"})
	}

	// 🟢 ใช้ GenerateToken จาก utils ที่เราทำไว้!
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
		},
	})
}