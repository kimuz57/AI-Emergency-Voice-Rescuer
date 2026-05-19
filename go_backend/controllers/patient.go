package controllers

import (
	"go_backend/database" // 🚨 แก้ path ให้ตรงกับที่เก็บตัวแปร DB ของคุณ
	"go_backend/models"   // 🚨 แก้ path ให้ตรงกับโปรเจกต์คุณ
	"github.com/gofiber/fiber/v2"
)

// CreatePatient รับข้อมูลจากหน้าเว็บและบันทึกลงตาราง Patients
func CreatePatient(c *fiber.Ctx) error {
	// สร้างตัวแปรมารับข้อมูลตามโครงสร้าง Model
	patient := new(models.Patient)

	// แปลงข้อมูล JSON จากหน้าเว็บให้อยู่ในรูปแบบ Struct
	if err := c.BodyParser(patient); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "รูปแบบข้อมูลไม่ถูกต้อง",
		})
	}

	// ใช้ GORM บันทึกลง Database
	if err := database.DB.Create(&patient).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "ไม่สามารถบันทึกข้อมูลผู้ป่วยได้",
		})
	}

	// ส่งข้อความยืนยันกลับไปให้หน้าเว็บ
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "เพิ่มข้อมูลผู้ป่วยสำเร็จ",
		"patient": patient,
	})
}