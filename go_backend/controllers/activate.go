package controllers

import (
	"github.com/gofiber/fiber/v2"
	"go_backend/database" // 🌟 1. Import ตัวแปร DB ของจริงระบบคุณเข้ามา
	"go_backend/models"
	"gorm.io/gorm"
)

// ❌ ลบ var DB *gorm.DB ที่เคยอยู่ตรงนี้ทิ้งไปเลยครับ!

func CheckDeviceActivation(c *fiber.Ctx) error {
	// 1. รับค่า MAC Address จาก Query Parameter (?mac=...)
	mac := c.Query("mac")
	
	if mac == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Missing 'mac' parameter",
			"is_active": false,
		})
	}

	// 2. ค้นหาอุปกรณ์ในฐานข้อมูล
	var device models.Device
	// 🌟 2. เรียกใช้ database.DB.Where แทน DB.Where ธรรมดา
	//result := database.DB.Where("mac_address = ?", mac).First(&device)
	result := database.DB.Where("UPPER(mac_address) = UPPER(?)", mac).First(&device)
	// 3. จัดการกรณีไม่พบอุปกรณ์ หรือยังไม่เคยลงทะเบียน
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			// ตอบกลับแบบ 200 OK ให้ Python รู้ว่าค้นหาเสร็จแล้ว แต่แค่ยังไม่อนุมัติ
			return c.Status(fiber.StatusOK).JSON(fiber.Map{
				"is_active": false,
				"message":   "Device not found or not activated",
			})
		}
		
		// กรณี DB ล่ม
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Database error",
			"is_active": false,
		})
	}

	// 4. ส่งสถานะการอนุมัติ (true/false) กลับไปให้ Python
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"is_active": device.IsActive,
	})
}