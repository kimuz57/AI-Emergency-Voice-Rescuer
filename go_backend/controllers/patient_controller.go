package controllers

import (
	"errors"
	"go_backend/database"
	"go_backend/models"
	"strings"

	// "net/http"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// ในไฟล์ controllers/patient_controller.go
type RegisterInput struct {
	PatientName      string `json:"patientName"`
	Age              int    `json:"age"`
	Gender           string `json:"gender"`
	RoomNumber       string `json:"roomNumber"`
	MedicalCondition string `json:"medicalCondition"`
	CaregiverEmail   string `json:"caregiverEmail"`
	BoardID          string `json:"board_id"` // 🟢 ใช้ json:"board_id" ให้ตรงกันทั้งหมด
	DeviceName       string `json:"deviceName"`
}

func RegisterPatientWithDevice(c *fiber.Ctx) error {
	var input RegisterInput

	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "รูปแบบข้อมูลไม่ถูกต้อง"})
	}

	normalizedBoardID := strings.ToUpper(strings.TrimSpace(input.BoardID))
	deviceName := strings.TrimSpace(input.DeviceName)
	if deviceName == "" {
		deviceName = "ไมค์หัวเตียง"
	}

	// 🟢 1. ตรวจสอบอีเมลผู้ดูแลก่อนเลย ถ้าใส่มาแต่ไม่มีในระบบ ให้ตีกลับทันที!
	var caregiver models.User
	if input.CaregiverEmail != "" {
		if err := database.DB.Where("email = ?", input.CaregiverEmail).First(&caregiver).Error; err != nil {
			// ส่งข้อมูลกลับไปบอกหน้าบ้านว่า พังที่ฟิลด์ caregiverEmail
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "ไม่พบอีเมลผู้ดูแลนี้ในระบบ กรุณาตรวจสอบใหม่อีกครั้ง",
				"field": "caregiverEmail",
			})
		}
	}

	if normalizedBoardID != "" {
		var existingDevice models.Device
		err := database.DB.Where("mac_address = ?", normalizedBoardID).First(&existingDevice).Error
		if err == nil {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{
				"error": "อุปกรณ์นี้ถูกลงทะเบียนในระบบแล้ว",
				"field": "boardId",
			})
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ไม่สามารถตรวจสอบข้อมูลอุปกรณ์ได้"})
		}
	}

	// 2. สร้างข้อมูลผู้ป่วยและอุปกรณ์ใน transaction เดียว เพื่อไม่ให้เกิดข้อมูลค้างครึ่งทาง
	err := database.DB.Transaction(func(tx *gorm.DB) error {
		patient := models.Patient{
			Name:             input.PatientName,
			Age:              input.Age,
			Gender:           input.Gender,
			RoomNumber:       input.RoomNumber,
			MedicalCondition: input.MedicalCondition,
		}

		if err := tx.Create(&patient).Error; err != nil {
			return err
		}

		if input.CaregiverEmail != "" {
			if err := tx.Model(&patient).Association("Caregivers").Append(&caregiver); err != nil {
				return err
			}
		}

		if normalizedBoardID != "" {
			device := models.Device{
				MACAddress: normalizedBoardID,
				Name:       deviceName,
				Status:     "offline",
				PatientID:  patient.ID,
			}

			if err := tx.Create(&device).Error; err != nil {
				return err
			}
		}

		return nil
	})

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ไม่สามารถบันทึกข้อมูลผู้ป่วยได้"})
	}

	return c.JSON(fiber.Map{
		"message": "ลงทะเบียนผู้ป่วยและผูกอุปกรณ์เรียบร้อย!",
	})
}

func GetPatientsByCaretaker(c *fiber.Ctx) error {
	email := c.Query("email")
	if email == "" {
		return c.Status(400).JSON(fiber.Map{"error": "กรุณาส่ง email มาด้วย"})
	}

	// 1. 🟢 ค้นหาข้อมูล User จากอีเมล เพื่อเอา user_id
	var user models.User // สมมติว่าโมเดลชื่อ User
	if err := database.DB.Where("email = ?", email).First(&user).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบข้อมูลผู้ใช้งาน"})
	}

	// 2. 🟢 ดึงผู้ป่วยผ่านตาราง many-to-many ให้ตรงกับ flow ตอนลงทะเบียนจริง
	var patients []models.Patient
	if err := database.DB.
		Joins("JOIN caregiver_patients ON caregiver_patients.patient_id = patients.id").
		Where("caregiver_patients.user_id = ?", user.ID).
		Preload("Devices").
		Find(&patients).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "ไม่สามารถดึงข้อมูลผู้ป่วยได้"})
	}

	return c.JSON(patients)
}
