package controllers

import (
	"errors" // 🟢 อย่าลืม import errors
	"go_backend/database"
	"go_backend/models"
	"strings"

	"gorm.io/gorm"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

// 🟢 สร้าง Struct สำหรับรับข้อมูล JSON ป้องกันปัญหาเมื่อ Model ไม่มีฟิลด์ MACAddress แล้ว
type CreatePatientInput struct {
	Name             string `json:"name"`
	Age              int    `json:"age"`
	Gender           string `json:"gender"`
	RoomNumber       string `json:"room_number"`
	MedicalCondition string `json:"medical_condition"`
	Devices          []struct {
		MACAddress string `json:"mac_address"` // รับ MAC จากหน้าเว็บเพื่อใช้ค้นหา
		DeviceName string `json:"device_name"` // จุดติดตั้ง เช่น "ไมค์ห้องน้ำ"
	} `json:"devices"`
}

// CreatePatient รับข้อมูลจากหน้าเว็บและบันทึกลงตาราง Patients พร้อมผูกผู้ดูแลอัตโนมัติ
func CreatePatient(c *fiber.Ctx) error {
	var input CreatePatientInput

	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "รูปแบบข้อมูลไม่ถูกต้อง",
		})
	}

	// 1. ดึง Token จาก c.Locals("user")
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

	// 3. ค้นหา User ใน Database
	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "ไม่พบผู้ใช้งานในระบบ",
		})
	}

	// 4. ตรวจสอบว่าส่งข้อมูลอุปกรณ์มาหรือไม่
	if len(input.Devices) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "กรุณาส่งข้อมูลอุปกรณ์อย่างน้อย 1 เครื่องมาด้วย",
		})
	}

	// เตรียม Object ผู้ป่วย
	patient := models.Patient{
		Name:             input.Name,
		Age:              input.Age,
		Gender:           input.Gender,
		RoomNumber:       input.RoomNumber,
		MedicalCondition: input.MedicalCondition,
		Caregivers:       []models.User{user}, // ผูกผู้ดูแลทันที
	}

	var validDevices []models.Device_patient

	// ⭐ ทำงานผ่าน Transaction เพื่อให้บันทึกและอัปเดตไปพร้อมกัน
	txErr := database.DB.Transaction(func(tx *gorm.DB) error {
		for _, dev := range input.Devices {
			mac := strings.TrimSpace(strings.ToUpper(dev.MACAddress))
			if mac == "" {
				return fiber.NewError(fiber.StatusBadRequest, "MAC Address ของอุปกรณ์ต้องไม่เป็นค่าว่าง")
			}

			var hardware models.Device
			result := tx.Where("UPPER(mac_address) = ?", mac).First(&hardware)
			if result.Error != nil {
				if errors.Is(result.Error, gorm.ErrRecordNotFound) {
					return fiber.NewError(fiber.StatusBadRequest, "ไม่พบอุปกรณ์ MAC Address: "+dev.MACAddress+" ในระบบ กรุณาเสียบอุปกรณ์ให้ทำงานก่อน")
				}
				return fiber.NewError(fiber.StatusInternalServerError, "เกิดข้อผิดพลาดในการตรวจสอบอุปกรณ์ในฐานข้อมูล")
			}

			deviceName := strings.TrimSpace(dev.DeviceName)
			if deviceName == "" {
				deviceName = "ไมค์หัวเตียง" // ค่าเริ่มต้นหากไม่ได้ส่งมา
			}

			// 🟢 นำเข้าตารางกลางด้วยโครงสร้างใหม่ (ตัด MACAddress และ Status ออกแล้ว)
			validDevices = append(validDevices, models.Device_patient{
				DeviceID:   hardware.ID,
				DeviceName: deviceName,
			})

			// 🟢 อัปเดตสถานะของอุปกรณ์นั้นให้พร้อมใช้งาน (IsActive)
			if err := tx.Model(&hardware).Update("is_active", true).Error; err != nil {
				return fiber.NewError(fiber.StatusInternalServerError, "ไม่สามารถอัปเดตสถานะอุปกรณ์ได้")
			}
		}

		// 🟢 กำหนดค่าไปยัง Field ความสัมพันธ์ใหม่ (DeviceAssignments)
		patient.DeviceAssignments = validDevices

		// 6. บันทึกลง Database (GORM จะเซฟข้อมูลทั้งหมดให้เรียงตามความสัมพันธ์)
		if err := tx.Create(&patient).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "ไม่สามารถบันทึกข้อมูลผู้ป่วยได้")
		}

		return nil
	})

	// 7. จัดการ Error ที่เด้งมาจาก Transaction
	if txErr != nil {
		var fiberErr *fiber.Error
		if errors.As(txErr, &fiberErr) {
			return c.Status(fiberErr.Code).JSON(fiber.Map{"error": fiberErr.Message})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "เกิดข้อผิดพลาดภายในระบบบันทึกข้อมูล"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "เพิ่มข้อมูลผู้ป่วยและผูกอุปกรณ์สำเร็จ",
		"patient": patient,
	})
}