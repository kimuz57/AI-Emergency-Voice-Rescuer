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
	// 🟢 1. ดึงและตรวจสอบผู้ใช้งานจาก Cookie/Token
	// ==========================================
	tokenString := middleware.ExtractToken(c)
	if tokenString == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "กรุณาล็อกอินก่อนทำรายการ"})
	}

	claims, err := utils.ParseToken(tokenString)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Session หมดอายุหรือไม่ถูกต้อง"})
	}
	loggedInEmail := claims.Email 

	var caregiver models.User
	if err := database.DB.Where("email = ?", loggedInEmail).First(&caregiver).Error; err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "ไม่พบข้อมูลผู้ดูแลในระบบ กรุณาล็อกอินใหม่",
		})
	}

	// ==========================================
	// 🟢 2. รับข้อมูลและ Validation เบื้องต้น
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

	// เช็คสถานะอุปกรณ์ล่วงหน้า (ถ้ามีการกรอก MAC)
	var sourceDevice models.Device
	if normalizedBoardID != "" {
		// 2.1 ตรวจสอบว่ามี Device นี้ในระบบหรือไม่
		if err := database.DB.Where("UPPER(mac_address) = ?", normalizedBoardID).First(&sourceDevice).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
					"error": "ไม่พบอุปกรณ์ในระบบ โปรดเพิ่ม MAC เข้าระบบก่อนลงทะเบียน",
					"field": "boardId",
				})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ไม่สามารถตรวจสอบข้อมูลอุปกรณ์ได้"})
		}
		
		// 2.2 ตรวจสอบว่าอุปกรณ์ถูกผูกใช้งานอยู่แล้วหรือไม่ (เฉพาะตัวที่ไม่ได้ถูก Soft Delete)
		var activeRelation models.Device_patient
		err = database.DB.Where("device_id = ?", sourceDevice.ID).First(&activeRelation).Error
		if err == nil {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{
				"error": "อุปกรณ์นี้ถูกลงทะเบียนให้ผู้ป่วยรายอื่นในระบบแล้ว",
				"field": "boardId",
			})
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ระบบฐานข้อมูลขัดข้อง"})
		}
	}

	// ==========================================
	// 🟢 3. บันทึกข้อมูล (Transaction)
	// ==========================================
	txErr := database.DB.Transaction(func(tx *gorm.DB) error {
		// 3.1 บันทึกข้อมูลผู้ป่วย
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

		// 3.2 ผูกคนไข้เข้ากับผู้ดูแล (ตาราง M:M)
		caregiverPatient := models.CaregiverPatient{
			PatientID: patient.ID,
			UserID:    caregiver.ID,
		}
		if err := tx.Create(&caregiverPatient).Error; err != nil {
			return err
		}

		// 3.3 ผูกอุปกรณ์เข้ากับคนไข้ (ใช้ Schema ใหม่)
		if normalizedBoardID != "" {
			var trashedRelation models.Device_patient
			
			// เช็คว่าอุปกรณ์นี้เคยถูกผูกแล้วลบ (Soft Delete) ไปแล้วหรือไม่ ?
			err := tx.Unscoped().Where("device_id = ?", sourceDevice.ID).First(&trashedRelation).Error

			if err == nil {
				// ✅ กรณีเคยมีประวัติ: ให้อัปเดต Record เดิม ทับเพื่อกู้กลับมา (ลดขยะใน Database)
				err = tx.Unscoped().Model(&trashedRelation).Updates(map[string]interface{}{
					"deleted_at":  nil, // ยกเลิก Soft delete
					"patient_id":  patient.ID,
					"device_name": deviceName, 
					// ❌ ไม่ต้องเซ็ต MACAddress และ Status แล้ว
				}).Error
				if err != nil { return err }
			} else {
				// ✅ กรณีใหม่เอี่ยม: สร้าง Record ลงตารางกลางใหม่เลย
				newRelation := models.Device_patient{
					DeviceID:   sourceDevice.ID,
					PatientID:  patient.ID,
					DeviceName: deviceName,
				}
				if err := tx.Create(&newRelation).Error; err != nil {
					return err
				}
			}

			// ========================================================
			// 🟢 3.4 อัปเดตสถานะบอร์ดเป็น Active (เพิ่มเข้ามาใหม่ตรงนี้)
			// ========================================================
			if err := tx.Model(&models.Device{}).Where("id = ?", sourceDevice.ID).Update("is_active", true).Error; err != nil {
				return err // ถ้าอัปเดตบอร์ดไม่สำเร็จ ให้ยกเลิกกระบวนการทั้งหมด (Rollback)
			}
		}

		return nil
	})

	if txErr != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ไม่สามารถบันทึกข้อมูลได้"})
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
	// 🟢 1. ดึงอีเมลจาก Cookie Token อัตโนมัติ
	// ==========================================
	tokenString := middleware.ExtractToken(c)
	if tokenString == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "กรุณาล็อกอินก่อนทำรายการ"})
	}

	claims, err := utils.ParseToken(tokenString)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Session หมดอายุหรือไม่ถูกต้อง"})
	}

	email := claims.Email 

	// ==========================================
	// 🟢 2. ค้นหาข้อมูล User
	// ==========================================
	var user models.User
	if err := database.DB.Where("email = ?", email).First(&user).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "ไม่พบข้อมูลผู้ใช้งาน"})
	}

	// ==========================================
	// 🟢 3. ดึงข้อมูลผู้ป่วย พร้อมจุดติดตั้ง และสถานะบอร์ด
	// ==========================================
	var patients []models.Patient
	if err := database.DB.
		Joins("JOIN caregiver_patients ON caregiver_patients.patient_id = patients.id").
		Where("caregiver_patients.user_id = ?", user.ID).
		Preload("DeviceAssignments").        // 🌟 1. ดึงข้อมูลการผูกอุปกรณ์ (ชื่อจุดติดตั้ง)
		Preload("DeviceAssignments.Device"). // 🌟 2. ดึงข้อมูลบอร์ดทะลุไปถึงตาราง Device (เพื่อเอา MAC Address และ Status)
		Find(&patients).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ไม่สามารถดึงข้อมูลผู้ป่วยได้"})
	}

	return c.JSON(patients)
}

func DeletePatient(c *fiber.Ctx) error {
	patientID := c.Params("id")

	var patient models.Patient
	// 🟢 1. เปลี่ยนชื่อ Preload ให้ตรงกับ Model ใหม่ (DeviceAssignments)
	if err := database.DB.Preload("DeviceAssignments").First(&patient, patientID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "ไม่พบข้อมูลผู้ป่วยในระบบ"})
	}

	// 🟢 2. ทำงานทุกอย่างภายใน Transaction เพื่อความปลอดภัยของข้อมูล
	txErr := database.DB.Transaction(func(tx *gorm.DB) error {
		
		// 2.1 ล้างความสัมพันธ์ในตาราง Many-to-Many (Caregivers)
		if err := tx.Model(&patient).Association("Caregivers").Clear(); err != nil {
			return err // โยน Error กลับไปให้ Transaction ทำการ Rollback
		}

		// 2.2 ลบข้อมูลการผูกอุปกรณ์ในตารางกลาง (Device_patient)
		// เปลี่ยนจากการเช็ค patient.Devices เป็น patient.DeviceAssignments
		if len(patient.DeviceAssignments) > 0 {
			if err := tx.Where("patient_id = ?", patient.ID).Delete(&models.Device_patient{}).Error; err != nil {
				return err
			}
		}

		// 2.3 ลบข้อมูลผู้ป่วยออกจากตาราง Patients
		if err := tx.Delete(&patient).Error; err != nil {
			return err
		}

		return nil // ส่ง nil เพื่อบอกว่าทำสำเร็จทั้งหมด ให้ Commit บันทึกลงฐานข้อมูล
	})

	// 🟢 3. ถ้าเกิด Error ใน Transaction จะเด้งมาที่นี่
	if txErr != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "เกิดข้อผิดพลาด ไม่สามารถลบข้อมูลผู้ป่วยและยกเลิกการผูกอุปกรณ์ได้",
		})
	}

	return c.JSON(fiber.Map{
		"message": "ลบข้อมูลผู้ป่วยและยกเลิกการผูกอุปกรณ์เรียบร้อยแล้ว",
	})
}