package controllers

import (
	"go_backend/database" // 🌟 1. Import ตัวแปร DB ของจริงระบบคุณเข้ามา
	"go_backend/models"
	"strings"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

func CheckinDeviceIP(c *fiber.Ctx) error {
	mac := c.Query("mac")
	ip := c.Query("ip")

	if mac == "" || ip == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ส่งพารามิเตอร์ mac และ ip ไม่ครบ"})
	}

	var device models.Device

	// 1. ลองค้นหาอุปกรณ์ดูก่อน
	result := database.DB.Where("UPPER(mac_address) = UPPER(?)", mac).First(&device)

	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			// 🌟 [จุดที่แก้] ถ้าหาไม่เจอ ให้สร้าง Device ใหม่พร้อมกำหนด verified = true
			newDevice := models.Device{
				MacAddress: strings.ToUpper(mac),
				IpAddress:  ip,
				IsActive:   false, // สร้างไว้ก่อน แต่ยังไม่เปิดใช้งาน (รอคุณมากดทีหลัง)
				IsVerified: true,
			}
			database.DB.Create(&newDevice)

			return c.Status(fiber.StatusOK).JSON(fiber.Map{
				"message":     "สร้างอุปกรณ์ใหม่และบันทึก IP สำเร็จ!",
				"mac":         mac,
				"ip":          ip,
				"is_verified": true,
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "เกิดข้อผิดพลาดกับฐานข้อมูล"})
	}

	// 2. ถ้ามีอุปกรณ์นี้อยู่แล้วในตาราง ก็อัปเดต IP และตั้งค่า verified
	database.DB.Model(&device).Updates(map[string]interface{}{
		"ip_address":  ip,
		"is_verified": true,
	})

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"message":     "อัปเดต IP Address สำเร็จ!",
		"mac":         mac,
		"ip":          ip,
		"is_verified": true,
	})
}

func CheckDeviceActivation(c *fiber.Ctx) error {
	// 1. รับค่า MAC Address จาก Query Parameter (?mac=...)
	mac := c.Query("mac")

	if mac == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":     "Missing 'mac' parameter",
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
			"error":     "Database error",
			"is_active": false,
		})
	}

	// 4. ถ้ายังไม่ verified ให้ตอบกลับว่าไม่อนุญาตให้ประมวลผล
	if !device.IsVerified {
		return c.Status(fiber.StatusOK).JSON(fiber.Map{
			"is_active":   false,
			"is_verified": false,
			"message":     "Device not verified",
		})
	}

	// ถ้า verified แล้ว ส่งสถานะการอนุมัติจาก IsActive พร้อมสถานะแจ้งว่า verified
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"is_active":   device.IsActive,
		"is_verified": device.IsVerified,
	})
}
