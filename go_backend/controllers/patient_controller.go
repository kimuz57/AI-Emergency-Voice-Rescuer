package controllers

import (
	"errors"
	"go_backend/database"
	"go_backend/middleware"
	"go_backend/models"
	"go_backend/utils" // 🟢 อย่าลืม Import utils สำหรับแกะ Token
	"strings"

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
	// 🟢 เอา CaregiverEmail ออกจากตรงนี้ได้เลย เพราะหน้าบ้านไม่ได้ส่งมาแล้ว
	BoardID    string `json:"board_id"`
	DeviceName string `json:"deviceName"`
}

func RegisterPatientWithDevice(c *fiber.Ctx) error {
	// ==========================================
	// 🟢 1. ดึงและตรวจสอบผู้ใช้งานจาก Cookie Token
	// ==========================================
	tokenString := middleware.ExtractToken(c)
	if tokenString == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "กรุณาล็อกอินก่อนทำรายการ"})
	}

	// แกะ Token เพื่อเอาอีเมล (ปรับชื่อฟังก์ชัน ParseToken ตามที่คุณเขียนไว้ใน utils)
	claims, err := utils.ParseToken(tokenString)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Session หมดอายุหรือไม่ถูกต้อง"})
	}
	loggedInEmail := claims.Email // หรือตัวแปรที่เก็บ Email ใน JWT Claims ของคุณ

	// ตรวจสอบว่าผู้ใช้งานนี้มีอยู่จริงในระบบหรือไม่
	var caregiver models.User
	if err := database.DB.Where("email = ?", loggedInEmail).First(&caregiver).Error; err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "ไม่พบข้อมูลผู้ดูแลในระบบ กรุณาล็อกอินใหม่",
		})
	}

	// ==========================================
	// 🟢 2. รับข้อมูลผู้ป่วยและอุปกรณ์จากหน้าบ้าน
	// ==========================================
	var input RegisterInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "รูปแบบข้อมูลไม่ถูกต้อง"})
	}

	normalizedBoardID := strings.ToUpper(strings.TrimSpace(input.BoardID))
	deviceName := strings.TrimSpace(input.DeviceName)
	if deviceName == "" {
		deviceName = "ไมค์หัวเตียง"
	}

	var sourceDevice models.Device
	if normalizedBoardID != "" {
		// เช็คก่อนว่า MAC นี้มีอยู่ในตาราง Device ต้นทางหรือไม่
		err := database.DB.Where("UPPER(mac_address) = UPPER(?)", normalizedBoardID).First(&sourceDevice).Error
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
					"error": "ไม่พบอุปกรณ์ในระบบ โปรดเพิ่ม MAC ให้ตรงกับอุปกรณ์ที่ลงทะเบียนไว้ก่อน",
					"field": "boardId",
				})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ไม่สามารถตรวจสอบข้อมูลอุปกรณ์ได้"})
		}

		var existingDevice models.Device_patient
		err = database.DB.Where("device_id = ?", sourceDevice.ID).First(&existingDevice).Error
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

	// ==========================================
	// 🟢 3. บันทึกข้อมูลแบบ Transaction
	// ==========================================
	txErr := database.DB.Transaction(func(tx *gorm.DB) error {
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

		caregiverPatient := models.CaregiverPatient{
			PatientID: patient.ID,
			UserID:    caregiver.ID,
		}
		if err := tx.Create(&caregiverPatient).Error; err != nil {
			return err
		}

		if normalizedBoardID != "" {
			var existingDevice models.Device_patient
			err := tx.Unscoped().Where("device_id = ?", sourceDevice.ID).First(&existingDevice).Error

			if err == nil {
				err = tx.Unscoped().Model(&existingDevice).Updates(map[string]interface{}{
					"deleted_at": nil,
					"patient_id": patient.ID,
					"name":       deviceName,
					"status":     "offline",
				}).Error
				if err != nil {
					return err
				}
			} else if errors.Is(err, gorm.ErrRecordNotFound) {
				deviceRelation := models.Device_patient{
					DeviceID:   sourceDevice.ID,
					MACAddress: normalizedBoardID,
					Name:       deviceName,
					Status:     "offline",
					PatientID:  patient.ID,
				}
				if err := tx.Create(&deviceRelation).Error; err != nil {
					return err
				}
			} else {
				return err
			}
		}

		return nil
	})

	if txErr != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ไม่สามารถบันทึกข้อมูลผู้ป่วยได้"})
	}

	return c.JSON(fiber.Map{
		"message": "ลงทะเบียนผู้ป่วยและผูกอุปกรณ์เรียบร้อย!",
	})
}

// ==========================================
// นำ 2 ฟังก์ชันนี้ไปวางต่อท้ายไฟล์ patient_controller.go (ถ้ามันหายไป)
// ==========================================

func GetPatientsByCaretaker(c *fiber.Ctx) error {
	// ==========================================
	// 🟢 1. ดึงอีเมลจาก Cookie Token อัตโนมัติ (ไม่ต้องรอรับจาก Query แล้ว)
	// ==========================================
	tokenString := middleware.ExtractToken(c)
	if tokenString == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "กรุณาล็อกอินก่อนทำรายการ"})
	}

	claims, err := utils.ParseToken(tokenString)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Session หมดอายุหรือไม่ถูกต้อง"})
	}

	email := claims.Email // ได้อีเมลของคนที่ล็อกอินมาใช้งานทันที!

	// ==========================================
	// 🟢 2. ค้นหาข้อมูล User และผู้ป่วยที่ผูกไว้ (เหมือนเดิม)
	// ==========================================
	var user models.User
	if err := database.DB.Where("email = ?", email).First(&user).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "ไม่พบข้อมูลผู้ใช้งาน"})
	}

	var patients []models.Patient
	if err := database.DB.
		Joins("JOIN caregiver_patients ON caregiver_patients.patient_id = patients.id").
		Where("caregiver_patients.user_id = ?", user.ID).
		Preload("Devices"). // โหลดข้อมูลอุปกรณ์ที่ผูกไว้มาด้วย
		Find(&patients).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ไม่สามารถดึงข้อมูลผู้ป่วยได้"})
	}

	return c.JSON(patients)
}

func DeletePatient(c *fiber.Ctx) error {
	patientID := c.Params("id")

	var patient models.Patient
	if err := database.DB.Preload("Devices").First(&patient, patientID).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบข้อมูลผู้ป่วยในระบบ"})
	}

	if err := database.DB.Model(&patient).Association("Caregivers").Clear(); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "ไม่สามารถยกเลิกการเชื่อมต่อผู้ดูแลได้"})
	}

	if len(patient.Devices) > 0 {
		if err := database.DB.Where("patient_id = ?", patient.ID).Delete(&models.Device_patient{}).Error; err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "ไม่สามารถลบข้อมูลอุปกรณ์ได้"})
		}
	}

	if err := database.DB.Delete(&patient).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "ไม่สามารถลบข้อมูลผู้ป่วยได้"})
	}

	return c.JSON(fiber.Map{"message": "ลบข้อมูลผู้ป่วยและยกเลิกการผูกอุปกรณ์เรียบร้อยแล้ว"})
}
