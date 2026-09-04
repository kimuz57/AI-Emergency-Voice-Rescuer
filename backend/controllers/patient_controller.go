package controllers

import (
	"errors"
	"go_backend/database"
	"go_backend/middleware"
	"go_backend/models"
	"go_backend/utils" // 🟢 อย่าลืม Import utils สำหรับแกะ Token
	"strings"
	"time"
	"bufio"
	"encoding/json"
	"fmt"
	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
	"github.com/valyala/fasthttp"
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

// ==========================================
// 🟢 UpdatePatientInput: ฟิลด์ตรงกับ PatientFormModal ฝั่ง frontend
// (patientName, age, gender, roomNumber, medicalCondition)
// ไม่รวมข้อมูลอุปกรณ์ เพราะหน้าแก้ไขไม่ได้ให้เปลี่ยนอุปกรณ์ตรงนี้
// ==========================================
type UpdatePatientInput struct {
	PatientName      string `json:"patientName"`
	Age              int    `json:"age"`
	Gender           string `json:"gender"`
	RoomNumber       string `json:"roomNumber"`
	MedicalCondition string `json:"medicalCondition"`
}

// UpdatePatient แก้ไขข้อมูลผู้ป่วย (PUT /api/patients/:id)
// - caregiver ทั่วไป: แก้ได้เฉพาะผู้ป่วยที่ผูกกับตัวเองผ่าน caregiver_patients เท่านั้น
// - admin: ข้ามการเช็คความเป็นเจ้าของ แก้ไขได้ทุกคน
//
// 🟢 หมายเหตุ: โค้ดนี้สมมติว่า models.User มีฟิลด์ Role string (เช่น "admin")
// ถ้าฟิลด์/ค่าจริงต่างจากนี้ ให้ปรับบรรทัด isAdmin ด้านล่างให้ตรงกับ model จริง
func UpdatePatient(c *fiber.Ctx) error {
	patientID := c.Params("id")

	// ==========================================
	// 1. ตรวจสอบผู้ใช้งานจาก Token (pattern เดียวกับ RegisterPatientWithDevice)
	// ==========================================
	tokenString := middleware.ExtractToken(c)
	if tokenString == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "กรุณาล็อกอินก่อนทำรายการ"})
	}

	claims, err := utils.ParseToken(tokenString)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Session หมดอายุหรือไม่ถูกต้อง"})
	}

	var currentUser models.User
	if err := database.DB.Where("email = ?", claims.Email).First(&currentUser).Error; err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "ไม่พบข้อมูลผู้ใช้งาน กรุณาล็อกอินใหม่"})
	}

	// 🟢 ปรับตรงนี้ถ้าชื่อฟิลด์/ค่า Role ของ models.User ในโปรเจกต์จริงไม่ตรงกัน
	isAdmin := currentUser.Role == "admin"

	// ==========================================
	// 2. ค้นหาผู้ป่วย + ตรวจสอบสิทธิ์การแก้ไข
	// ==========================================
	var patient models.Patient

	if isAdmin {
		// แอดมิน: แก้ได้ทุกคน ไม่ต้องเช็คความเป็นเจ้าของ
		if err := database.DB.First(&patient, patientID).Error; err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "ไม่พบข้อมูลผู้ป่วยในระบบ"})
		}
	} else {
		// ผู้ดูแลทั่วไป: ต้องเป็น caregiver ที่ผูกกับผู้ป่วยรายนี้เท่านั้น
		err := database.DB.
			Joins("JOIN caregiver_patients ON caregiver_patients.patient_id = patients.id").
			Where("patients.id = ? AND caregiver_patients.user_id = ?", patientID, currentUser.ID).
			First(&patient).Error
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
					"error": "ไม่พบข้อมูลผู้ป่วย หรือคุณไม่มีสิทธิ์แก้ไขผู้ป่วยรายนี้",
				})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์"})
		}
	}

	// ==========================================
	// 3. รับและตรวจสอบข้อมูลที่ส่งมา
	// ==========================================
	var input UpdatePatientInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "รูปแบบข้อมูลไม่ถูกต้อง"})
	}

	name := strings.TrimSpace(input.PatientName)
	room := strings.TrimSpace(input.RoomNumber)

	if name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "กรุณากรอกชื่อ-นามสกุล"})
	}
	if room == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "กรุณากรอกหมายเลขห้อง/เตียง"})
	}

	// ==========================================
	// 4. อัปเดตข้อมูลลง Database
	// ==========================================
	updates := map[string]interface{}{
		"name":              name,
		"age":               input.Age,
		"gender":            input.Gender,
		"room_number":       room,
		"medical_condition": strings.TrimSpace(input.MedicalCondition),
	}

	if err := database.DB.Model(&patient).Updates(updates).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ไม่สามารถบันทึกการแก้ไขข้อมูลได้"})
	}

	return c.JSON(fiber.Map{
		"message": "แก้ไขข้อมูลผู้ป่วยสำเร็จ",
		"patient": patient,
	})
}

func StreamPatients(c *fiber.Ctx) error {
	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")

	// รับ email ที่ส่งมาจาก React
	targetEmail := c.Query("email")

	c.Context().SetBodyStreamWriter(fasthttp.StreamWriter(func(w *bufio.Writer) {
		ticker := time.NewTicker(1 * time.Second) // ส่งข้อมูลอัปเดตทุก 5 วินาที
		defer ticker.Stop()

		for range ticker.C {
			if targetEmail == "" {
				continue
			}

			// ดึงรายชื่อผู้ป่วยที่ผูกกับผู้ดูแลรายนี้
			patientsData, err := fetchPatientsFromDB(targetEmail)
			if err != nil {
				continue
			}

			jsonData, err := json.Marshal(patientsData)
			if err != nil {
				continue
			}

			// ส่งข้อมูลรูปแบบ SSE
			fmt.Fprintf(w, "data: %s\n\n", jsonData)

			// ดันข้อมูลออกไปหา React ทันที
			if err := w.Flush(); err != nil {
				fmt.Println("Client disconnected from Patients SSE stream")
				return
			}
		}
	}))

	return nil
}

// 🟢 Helper Function สำหรับ Query รายชื่อผู้ป่วยจาก DB
func fetchPatientsFromDB(email string) ([]models.Patient, error) {
	var user models.User
	if err := database.DB.Where("email = ?", email).First(&user).Error; err != nil {
		return []models.Patient{}, nil // ถ้าหาผู้ใช้งานไม่เจอ ให้ส่ง array เปล่า
	}

	var patients []models.Patient

	// ดึงผู้ป่วยที่มีความสัมพันธ์กับ user_id นี้ผ่านตาราง caregiver_patients
	err := database.DB.Table("patients").
		Joins("JOIN caregiver_patients ON caregiver_patients.patient_id = patients.id").
		Where("caregiver_patients.user_id = ?", user.ID).
		Find(&patients).Error

	if err != nil {
		return nil, fmt.Errorf("ดึงข้อมูลผู้ป่วยล้มเหลว: %v", err)
	}

	if patients == nil {
		patients = []models.Patient{}
	}

	return patients, nil
}