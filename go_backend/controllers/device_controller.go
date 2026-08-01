package controllers

import (
	"github.com/gofiber/fiber/v2"
	"go_backend/database"
	"go_backend/models"
)

// โครงสร้างสำหรับรับข้อมูล JSON จาก Python
type DeviceStatusPayload struct {
	Mac    string `json:"mac"`
	Status string `json:"status"`
}

// UpdateDeviceStatus รับหน้าที่เปลี่ยนสถานะ Online / Offline
func UpdateDeviceStatus(c *fiber.Ctx) error {
	payload := new(DeviceStatusPayload)

	// 1. อ่านข้อมูล JSON ที่ส่งมา
	if err := c.BodyParser(payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "รูปแบบข้อมูลไม่ถูกต้อง",
		})
	}

	// เช็กว่าส่งข้อมูลมาครบไหม
	if payload.Mac == "" || payload.Status == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "ส่งพารามิเตอร์ mac หรือ status ไม่ครบ",
		})
	}

	// 2. ค้นหาอุปกรณ์ในฐานข้อมูล
	var device models.Device
	result := database.DB.Where("UPPER(mac_address) = UPPER(?)", payload.Mac).First(&device)

	if result.Error != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "ไม่พบอุปกรณ์นี้ในระบบ",
		})
	}

	// 3. อัปเดตเฉพาะคอลัมน์ status
	database.DB.Model(&device).Update("status", payload.Status)

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"message": "อัปเดตสถานะอุปกรณ์สำเร็จ!",
		"mac":     payload.Mac,
		"status":  payload.Status,
	})
}