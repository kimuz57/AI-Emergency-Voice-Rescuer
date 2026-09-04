package controllers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"go_backend/database"
	"go_backend/models"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/valyala/fasthttp" // 🌟 อย่าลืม Import ตัวนี้
)

// ==========================================
// 📡 2. Controller ส่งข้อมูล SSE (สไตล์เดียวกับ Dashboard เป๊ะๆ)
// ==========================================
func StreamDevices(c *fiber.Ctx) error {
	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")

	// รับ email ที่ส่งมาจาก React
	targetEmail := c.Query("email")

	// 🌟 ต้องมี fasthttp.StreamWriter ครอบแบบนี้ (นี่แหละที่ทำให้โค้ดเก่าพัง!)
	c.Context().SetBodyStreamWriter(fasthttp.StreamWriter(func(w *bufio.Writer) {
		ticker := time.NewTicker(2 * time.Second) // ดึงข้อมูลอัปเดตทุก 2 วินาที (ปรับลดได้)
		defer ticker.Stop()

		for range ticker.C {
			if targetEmail == "" {
				continue
			}

			// 1. เรียกใช้ Helper Function เพื่อดึงข้อมูลล่าสุด
			devicesData, err := fetchDashboardDevices(targetEmail)
			if err != nil {
				fmt.Println("🔴 Failed to fetch devices for stream:", err)
				continue
			}

			// 2. แปลงเป็น JSON
			jsonData, err := json.Marshal(devicesData)
			if err != nil {
				continue
			}

			// 3. ส่งข้อมูลรูปแบบ SSE
			fmt.Fprintf(w, "data: %s\n\n", jsonData)

			// 4. ดันข้อมูลออกไปหา React ทันที
			if err := w.Flush(); err != nil {
				fmt.Println("🔴 Client disconnected from Devices SSE stream")
				return
			}
		}
	}))

	return nil
}

// UpdateDevices ใช้สำหรับอัปเดตข้อมูลของอุปกรณ์ (เช่น ผูกชื่อผู้ป่วย, เปลี่ยนชื่ออุปกรณ์)
func UpdateDevices(c *fiber.Ctx) error {
	id := c.Params("id") // รับ ID จาก URL

	// โครงสร้างชั่วคราวสำหรับรับข้อมูล JSON
	type UpdatePayload struct {
		PatientName *string `json:"patient_name"`
		DeviceName  *string `json:"device_name"`
		IsActive    *bool   `json:"is_active"`
		Status      *string `json:"status"` // 🌟 1. เพิ่มตัวแปรมารับค่า status (online/offline)
	}

	payload := new(UpdatePayload)
	if err := c.BodyParser(payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "รูปแบบข้อมูลไม่ถูกต้อง"})
	}

	var device models.Device
	if err := database.DB.First(&device, id).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "ไม่พบอุปกรณ์นี้ในระบบ"})
	}

	// อัปเดตข้อมูล (แก้ไขลอจิกตรงนี้ได้ตามต้องการ)
	updates := make(map[string]interface{})
	if payload.PatientName != nil {
		updates["patient_name"] = *payload.PatientName
	}
	if payload.DeviceName != nil {
		updates["device_name"] = *payload.DeviceName
	}
	if payload.IsActive != nil {
		updates["is_active"] = *payload.IsActive
	}
	if payload.Status != nil {
		updates["status"] = *payload.Status // 🌟 2. สั่งให้อัปเดต status ลงใน Database
	}

	database.DB.Model(&device).Updates(updates)

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"message": "อัปเดตข้อมูลอุปกรณ์สำเร็จ!",
		"device":  device,
	})
}