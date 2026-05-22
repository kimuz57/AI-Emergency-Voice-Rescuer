package controllers

import (
	"strings"
	"go_backend/database"
	"go_backend/models"
	// "net/http"

	"github.com/gofiber/fiber/v2"
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

	// 2. สร้างข้อมูลผู้ป่วย (ทำต่อเมื่อผ่านด่านเช็คอีเมลแล้ว)
	patient := models.Patient{
		Name:             input.PatientName,
		Age:              input.Age,
		Gender:           input.Gender,
		RoomNumber:       input.RoomNumber,
		MedicalCondition: input.MedicalCondition,
	}

	if err := database.DB.Create(&patient).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ไม่สามารถบันทึกข้อมูลผู้ป่วยได้"})
	}

	// 3. ผูกผู้ดูแลเข้ากับผู้ป่วย (เพราะเราหาตัวเจอตนจากข้อ 1 แล้ว)
	if input.CaregiverEmail != "" {
		database.DB.Model(&patient).Association("Caregivers").Append(&caregiver)
	}

	// 4. สร้างอุปกรณ์ผูกกับผู้ป่วย
	if input.BoardID != "" {
		device := models.Device{
			MACAddress: strings.ToUpper(input.BoardID),
			
			Name:       input.DeviceName,
			Status:     "offline",
			PatientID:  patient.ID,
		}
		database.DB.Create(&device)
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

    // 2. 🟢 เอา user.ID ไปค้นหาผู้ป่วยในตาราง patients
    var patients []models.Patient // สมมติว่าโมเดลชื่อ Patient
    database.DB.Where("user_id = ?", user.ID).Find(&patients)

    return c.JSON(patients)
}