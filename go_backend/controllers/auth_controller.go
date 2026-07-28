package controllers

import (
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	//"go_backend/config"
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

	//isLocal := config.GetEnv("APP_ENV", "development") == "development"
	c.Cookie(&fiber.Cookie{
		Name:     "token",
		Value:    tokenString,
		Expires:  time.Now().Add(time.Hour * 72),
		Path:     "/",
		HTTPOnly: true,
		SameSite: "None",
		Secure:   true, // 🟢 ปรับเป็น false สำหรับ localhost (ไม่ใช่ HTTPS) แต่ถ้าเป็น Production ให้ตั้งเป็น true
	})

	return c.JSON(fiber.Map{
		"message": "ล็อกอินสำเร็จ",
		"user":    user,
		"token":   tokenString,
	})
}

// ==========================================
// 3. ฟังก์ชันสำหรับออกจากระบบ (Logout)
// ==========================================
func Logout(c *fiber.Ctx) error {
	c.Cookie(&fiber.Cookie{
		Name:     "token",
		Value:    "",
		Path:     "/", // 🌟 [จุดสำคัญที่เติมเข้าไป] ต้องระบุ Path ให้ตรงกับตอนสร้าง
		MaxAge:   -1,  // 🌟 ใช้ MaxAge -1 ชัวร์กว่า Expires ในการสั่งลบทันที
		HTTPOnly: true,
		SameSite: "Lax", // ใช้ตามของเดิมคุณได้เลย
		Secure:   false, // ⚠️ โหมด Local ใช้ false (ถ้าเอาขึ้น Server จริงที่มี HTTPS ค่อยเปลี่ยนเป็น true)
	})

	return c.JSON(fiber.Map{
		"message": "ออกจากระบบสำเร็จและล้างคุกกี้เรียบร้อย",
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

	var existingUser models.User
	result := database.DB.Where("email = ?", input.Email).First(&existingUser)

	if result.Error == nil {
		// เจออีเมลในระบบแล้ว
		if existingUser.Password != "" {
			return c.Status(400).JSON(fiber.Map{"error": "อีเมลนี้มีในระบบแล้ว กรุณาเข้าสู่ระบบ"})
		}

		// ถ้า Password ว่างเปล่า แปลว่าเคยเข้าสู่ระบบด้วย Google
		// ให้อัปเดตรหัสผ่านใหม่ลงไปได้เลย
		existingUser.Password = hashedPassword
		if existingUser.Name == "" {
			existingUser.Name = input.Name
		}
		database.DB.Save(&existingUser)

		return c.Status(200).JSON(fiber.Map{
			"message": "เพิ่มรหัสผ่านให้บัญชี Google สำเร็จ! สามารถเข้าสู่ระบบด้วยรหัสผ่านได้แล้ว",
			"email":   existingUser.Email,
		})
	}

	// 🟢 ถ้ายังไม่เคยมีอีเมลในระบบ ก็สร้าง User ใหม่ และส่งอีเมลยืนยันตามปกติ
	verifyToken := utils.GenerateVerificationToken()

	user := models.User{
		Name:              input.Name,
		Email:             input.Email,
		Password:          hashedPassword,
		IsVerified:        false,       // 🟢 ให้สถานะเป็น False จนกว่าจะกดลิงก์
		VerificationToken: verifyToken, // 🟢 บันทึก Token ลง DB
	}

	createResult := database.DB.Create(&user)
	if createResult.Error != nil {
		return c.Status(500).JSON(fiber.Map{"error": "บันทึกข้อมูลไม่สำเร็จ"})
	}

	// 🟢 สั่งให้ส่งอีเมลทำงานเบื้องหลัง
	go utils.SendVerificationEmail(user.Email, user.Name, verifyToken)

	return c.Status(201).JSON(fiber.Map{
		"message": "สมัครสมาชิกสำเร็จ! กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชี",
		"email":   user.Email,
	})
}

// ==========================================
// Forgot Password - สร้าง token แล้วส่งอีเมล
// ==========================================
func ForgotPassword(c *fiber.Ctx) error {
	var input struct {
		Email string `json:"email"`
	}

	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}

	// Basic validation: non-empty + simple email format
	if input.Email == "" {
		return c.Status(400).JSON(fiber.Map{"error": "กรุณาระบุอีเมล"})
	}
	// rudimentary email check
	if len(input.Email) < 5 || !strings.Contains(input.Email, "@") {
		return c.Status(400).JSON(fiber.Map{"error": "อีเมลไม่ถูกต้อง"})
	}

	var user models.User
	if err := database.DB.Where("email = ?", input.Email).First(&user).Error; err != nil {
		// ไม่เปิดเผยว่ามีอีเมลในระบบไหม ส่งข้อความสำเร็จเสมอ
		return c.JSON(fiber.Map{"message": "ถ้าอีเมลอยู่ในระบบ เราได้ส่งลิงก์รีเซ็ตรหัสผ่านให้แล้ว"})
	}

	// สร้าง token และบันทึกลง DB พร้อม expiry (1 hour)
	token := utils.GenerateVerificationToken()
	expiry := time.Now().Add(time.Hour * 1)

	if err := database.DB.Model(&user).Updates(map[string]interface{}{
		"password_reset_token":  token,
		"password_reset_expiry": expiry,
	}).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "ไม่สามารถสร้างลิงก์รีเซ็ตได้"})
	}

	// ส่งอีเมลแบบ background
	go utils.SendResetPasswordEmail(user.Email, user.Name, token)

	return c.JSON(fiber.Map{"message": "ถ้าอีเมลอยู่ในระบบ เราได้ส่งลิงก์รีเซ็ตรหัสผ่านให้แล้ว"})
}

// ==========================================
// Reset Password - ตรวจ token แล้วเซ็ตพาสใหม่
// ==========================================
func ResetPassword(c *fiber.Ctx) error {
	var input struct {
		Token       string `json:"token"`
		NewPassword string `json:"new_password"`
	}

	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}

	if input.NewPassword == "" || len(input.NewPassword) < 6 {
		return c.Status(400).JSON(fiber.Map{"error": "รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร"})
	}

	var user models.User
	if err := database.DB.Where("password_reset_token = ?", input.Token).First(&user).Error; err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ลิงก์ไม่ถูกต้องหรือหมดอายุ"})
	}

	// เช็ค expiry
	if !user.PasswordResetExpiry.IsZero() && time.Now().After(user.PasswordResetExpiry) {
		return c.Status(400).JSON(fiber.Map{"error": "ลิงก์รีเซ็ตหมดอายุ"})
	}

	hashed, err := HashPassword(input.NewPassword)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "ไม่สามารถเข้ารหัสรหัสผ่านใหม่ได้"})
	}

	if err := database.DB.Model(&user).Updates(map[string]interface{}{
		"password":              hashed,
		"password_reset_token":  "",
		"password_reset_expiry": time.Time{},
	}).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "ไม่สามารถบันทึกรหัสผ่านใหม่ได้"})
	}

	return c.JSON(fiber.Map{"message": "รีเซ็ตรหัสผ่านสำเร็จ"})
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
		Path:     "/",
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
		"token": tokenString,
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
