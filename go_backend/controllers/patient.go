package controllers

import (
	"go_backend/database"
	"go_backend/models"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

// CreatePatient รับข้อมูลจากหน้าเว็บและบันทึกลงตาราง Patients พร้อมผูกผู้ดูแลอัตโนมัติ
func CreatePatient(c *fiber.Ctx) error {
	patient := new(models.Patient)

	if err := c.BodyParser(patient); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "รูปแบบข้อมูลไม่ถูกต้อง",
		})
	}

	// 1. ดึง Token จาก c.Locals("user") ที่มาจาก RequireAuth Middleware
	userToken, ok := c.Locals("user").(*jwt.Token)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Unauthorized: ไม่พบข้อมูลการเข้าสู่ระบบ",
		})
	}

	claims := userToken.Claims.(jwt.MapClaims)

	// 2. ดึง user_id จาก Claims
	userIDClaim, ok := claims["user_id"].(float64)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Unauthorized: Token ไม่สมบูรณ์แบบ",
		})
	}
	userID := uint(userIDClaim)

	// 3. ค้นหา User ใน Database เพื่อเอาข้อมูลผู้ใช้คนนี้
	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{
			"error": "ไม่พบผู้ใช้งานในระบบ",
		})
	}

	// 4. ⭐ กำหนดให้ User ที่ล็อกอินอยู่เป็น Caregiver ของผู้ป่วยคนนี้ (Many-to-Many)
	patient.Caregivers = []models.User{user}

	// 5. บันทึกลง Database (GORM จะบันทึกทั้ง Patient และตารางกลาง caregiver_patients ให้เสร็จสรรพ)
	if err := database.DB.Create(&patient).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "ไม่สามารถบันทึกข้อมูลผู้ป่วยได้",
		})
	}

	// ส่งผลลัพธ์กลับไปที่หน้าเว็บ
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "เพิ่มข้อมูลผู้ป่วยสำเร็จ",
		"patient": patient,
	})
}