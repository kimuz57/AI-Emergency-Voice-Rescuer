package controllers

import (
	"go_backend/database"
	"go_backend/models"
	"strings"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

func CheckinDeviceIP(c *fiber.Ctx) error {
	mac := c.Query("mac")
	ip := c.Query("ip")
	mac = strings.ToUpper(strings.TrimSpace(mac))
	if mac == "" || ip == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ส่งพารามิเตอร์ mac และ ip ไม่ครบ"})
	}

	var device models.Device
	result := database.DB.Where("UPPER(mac_address) = ?", mac).First(&device)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			newDevice := models.Device{
				MacAddress: strings.ToUpper(mac),
				IpAddress:  ip,
				Status:     "online", // เพิ่ม Status online
				IsActive:   false,
				IsVerified: true,
			}
			database.DB.Create(&newDevice)

			// 🌟 [จุดที่ 1] แจ้งเตือนหน้าเว็บ (SSE) ว่ามี "อุปกรณ์ใหม่" เช็คอินเข้ามา
			// ส่งข้อมูลไปครบๆ ฝั่ง React จะได้เอาไปต่อท้าย Array ทันท

			return c.Status(fiber.StatusOK).JSON(fiber.Map{
				"message":     "สร้างอุปกรณ์ใหม่และบันทึก IP สำเร็จ!",
				"mac":         mac,
				"ip":          ip,
				"is_verified": true,
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "เกิดข้อผิดพลาดกับฐานข้อมูล"})
	}

	// ถ้ามีอุปกรณ์อยู่แล้ว อัปเดตข้อมูลพร้อมตั้งให้เป็น online
	database.DB.Model(&device).Updates(map[string]interface{}{
		"ip_address":  ip,
		"is_verified": true,
		"status":      "online", // อัปเดตเมื่อ Check-in
	})


	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"message":     "อัปเดต IP Address สำเร็จ!",
		"mac":         mac,
		"ip":          ip,
		"is_verified": true,
	})
}

func CheckDeviceActivation(c *fiber.Ctx) error {
	mac := c.Query("mac")

	if mac == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":     "Missing 'mac' parameter",
			"is_active": false,
		})
	}

	var device models.Device
	result := database.DB.Where("UPPER(mac_address) = UPPER(?)", mac).First(&device)

	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			return c.Status(fiber.StatusOK).JSON(fiber.Map{
				"is_active": false,
				"message":   "Device not found or not activated",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":     "Database error",
			"is_active": false,
		})
	}

	if !device.IsVerified {
		return c.Status(fiber.StatusOK).JSON(fiber.Map{
			"is_active":   false,
			"is_verified": false,
			"message":     "Device not verified",
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"is_active":   device.IsActive,
		"is_verified": device.IsVerified,
	})
}