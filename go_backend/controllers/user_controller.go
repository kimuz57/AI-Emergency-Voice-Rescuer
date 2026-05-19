package controllers

import (
	"go_backend/database"
	"go_backend/models"
	"github.com/gofiber/fiber/v2"
)

// API: ดึงข้อมูลโปรไฟล์ผู้ใช้จาก Query Email
func GetUserProfile(c *fiber.Ctx) error {
	email := c.Query("email")
	if email == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "กรุณาระบุอีเมลผู้ใช้งาน",
		})
	}

	var user models.User
	// ค้นหาในตาราง users ด้วยอีเมล
	if err := database.DB.Where("email = ?", email).First(&user).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "ไม่พบข้อมูลผู้ใช้งานในระบบ",
		})
	}

	// 🟢 ส่งข้อมูลกลับไปให้หน้าบ้าน โดยแปลงคอลัมน์ profile ใน DB เป็น profileImage
	return c.JSON(fiber.Map{
		"name":         user.Name,
		"email":        user.Email,
		"role":         user.Role,
		"profileImage": user.Profile, // อิงตามฟิลด์ profile ใน DB ของคุณผู้กองที่มีลิงก์ Google
	})
}