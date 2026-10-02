package controllers

import (
	"go_backend/database"
	"go_backend/models"

	"github.com/gofiber/fiber/v2"
)

// 📦 Struct สำหรับรับข้อมูลที่ Frontend ส่งมา
type RegisterDeviceInput struct {
	MacAddress string `json:"mac_address"`
	IPAddress  string `json:"ip_address"`
	Status     string `json:"status"`
	IsVerified bool   `json:"is_verified"`
	IsActive   bool   `json:"is_active"`
}

// 📡 API: ลงทะเบียนบอร์ดใหม่เข้าระบบ (admin เท่านั้น — routes ครอบด้วย RequireAuth + RequireAdmin)
// is_active / is_verified รับจาก body ได้เพราะเป็น admin เป็นคนตั้งค่า
func RegisterDevice(c *fiber.Ctx) error {
	var input RegisterDeviceInput

	// 1. รับค่าและแปลง JSON จาก Body
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "รูปแบบข้อมูลไม่ถูกต้อง",
		})
	}

	// 2. Validate ป้องกันการส่งค่าว่าง + ทำ MAC ให้อยู่รูปแบบเดียวกับทั้งระบบ (ตัดช่องว่าง + ตัวพิมพ์ใหญ่)
	mac := normalizeMAC(input.MacAddress)
	if mac == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "กรุณาระบุ MAC Address",
		})
	}

	// 3. เช็คว่าบอร์ดนี้ (MAC Address) เคยลงทะเบียนในระบบไปแล้วหรือยัง (ไม่สนตัวพิมพ์เล็ก/ใหญ่)
	var existingDevice models.Device
	if err := database.DB.Where("UPPER(mac_address) = ?", mac).First(&existingDevice).Error; err == nil {
		// err == nil แปลว่าหาเจอ แปลว่ามีคนลงทะเบียนซ้ำ
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": "อุปกรณ์นี้ (MAC Address) ถูกลงทะเบียนในระบบแล้ว",
		})
	}

	// 4. เตรียมข้อมูลบอร์ดใหม่เพื่อบันทึกลง Database
	newDevice := models.Device{
		MacAddress: mac,
		IpAddress:  input.IPAddress,
		Status:     input.Status,     // รับ "offline" จาก Frontend
		IsVerified: input.IsVerified, // รับ true จาก Frontend
		IsActive:   input.IsActive,   // รับ false จาก Frontend
	}

	// 5. บันทึกลงตาราง devices
	if err := database.DB.Create(&newDevice).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "ไม่สามารถบันทึกข้อมูลอุปกรณ์ลงฐานข้อมูลได้",
		})
	}

	// ล้าง cache activation ที่อาจค้างค่า is_active=false ของ MAC นี้ไว้ก่อนลงทะเบียน
	InvalidateDeviceCache(mac)

	// 6. ตอบกลับ Frontend ว่าสำเร็จ!
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "ลงทะเบียนบอร์ดสำเร็จ",
		"data":    newDevice,
	})
}
