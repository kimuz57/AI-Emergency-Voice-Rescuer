package controllers

import (
	"go_backend/database"
	"go_backend/models"
	"strings"

	"gorm.io/gorm"

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
		return c.Status(404).JSON(fiber.Map{
			"error": "ไม่พบผู้ใช้งานในระบบ",
		})
	}

	// ⭐ 4. ตรวจสอบ MAC Address ของอุปกรณ์ที่ส่งมาให้ตรงกับ Device ต้นทาง
	if len(patient.Devices) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "กรุณาส่งข้อมูลอุปกรณ์อย่างน้อย 1 เครื่องมาด้วย",
		})
	}

	validDevices := make([]models.Device_patient, 0, len(patient.Devices))
	for _, dev := range patient.Devices {
		mac := strings.TrimSpace(strings.ToUpper(dev.MACAddress))
		if mac == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "MAC Address ของอุปกรณ์ต้องไม่เป็นค่าว่าง",
			})
		}

		var hardware models.Device
		result := database.DB.Where("UPPER(mac_address) = ?", mac).First(&hardware)
		if result.Error != nil {
			if result.Error == gorm.ErrRecordNotFound {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
					"error": "ไม่พบอุปกรณ์ MAC Address: " + dev.MACAddress + " ในระบบ กรุณาเสียบอุปกรณ์ให้ทำงานก่อน",
				})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "เกิดข้อผิดพลาดในการตรวจสอบอุปกรณ์ฐานข้อมูล",
			})
		}

		status := "offline"
		if hardware.IsActive {
			status = "online"
		}

		validDevices = append(validDevices, models.Device_patient{
			DeviceID:   hardware.ID,
			MACAddress: hardware.MacAddress,
			Name:       strings.TrimSpace(dev.Name),
			Status:     status,
		})

		if err := database.DB.Model(&hardware).Update("is_active", true).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "ไม่สามารถอัปเดตสถานะอุปกรณ์ได้",
			})
		}
	}

	patient.Devices = validDevices

	// 5. กำหนดให้ User เป็น Caregiver
	patient.Caregivers = []models.User{user}

	// 6. บันทึกลง Database
	// GORM จะเซฟทั้งตาราง Patient, Caregiver_patients, และ Device_patients ให้อัตโนมัติ
	if err := database.DB.Create(&patient).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "ไม่สามารถบันทึกข้อมูลผู้ป่วยได้",
		})
	}

	// 7. ส่งผลลัพธ์กลับไปที่หน้าเว็บ
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "เพิ่มข้อมูลผู้ป่วยและผูกอุปกรณ์สำเร็จ",
		"patient": patient,
	})
}