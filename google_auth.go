// package controllers

// import (
// 	"go_backend/database"
// 	"go_backend/models"
// 	"go_backend/utils" // เปลี่ยนให้ตรงกับ path ที่เก็บฟังก์ชันสร้าง Token ของคุณ

// 	"github.com/gofiber/fiber/v2"
// )

// type GoogleLoginInput struct {
// 	Email string `json:"email"`
// 	Name  string `json:"name"`
// }

// // GoogleLogin รองรับการขอ Token เมื่อล็อกอินผ่าน NextAuth สำเร็จ
// func GoogleLogin(c *fiber.Ctx) error {
// 	var input GoogleLoginInput
// 	if err := c.BodyParser(&input); err != nil {
// 		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
// 	}

// 	if input.Email == "" {
// 		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ไม่พบอีเมลจาก Google"})
// 	}

// 	var user models.User
// 	// 1. ลองค้นหาว่าเคยมีอีเมลนี้ในระบบหรือยัง
// 	result := database.DB.Where("email = ?", input.Email).First(&user)

// 	if result.Error != nil {
// 		// 2. ถ้ายังไม่เคยมี ให้สมัครสมาชิกให้อัตโนมัติเลย (Auto-Register)
// 		user = models.User{
// 			Name:     input.Name,
// 			Email:    input.Email,
// 			Password: "",      // รหัสผ่านว่างไว้ เพราะล็อกอินผ่าน Google
// 			Role:     "user",  // ให้สิทธิ์พื้นฐานเป็น user
// 		}
// 		if err := database.DB.Create(&user).Error; err != nil {
// 			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "สร้างบัญชีผู้ใช้งานไม่สำเร็จ"})
// 		}
// 	}

// 	// 3. สร้าง JWT Token (ปรับโค้ดบรรทัดนี้ให้ตรงกับฟังก์ชัน GenerateToken ใน utils ของคุณ)
// 	token, err := utils.GenerateToken(user.ID, user.Email, user.Role)
// 	if err != nil {
// 		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ไม่สามารถสร้าง Token ได้"})
// 	}

// 	// 4. ส่ง Token กลับไปให้ Frontend เซฟลง localStorage
// 	return c.JSON(fiber.Map{
// 		"message": "เข้าสู่ระบบผ่าน Google สำเร็จ",
// 		"token":   token,
// 		"user": fiber.Map{
// 			"id":    user.ID,
// 			"name":  user.Name,
// 			"email": user.Email,
// 			"role":  user.Role,
// 		},
// 	})
// }