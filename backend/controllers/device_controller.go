package controllers

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"go_backend/database"
	"go_backend/middleware"
	"go_backend/models"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/valyala/fasthttp" // 🌟 อย่าลืม Import ตัวนี้
	"gorm.io/gorm"
)

// ==========================================
// 📡 2. Controller ส่งข้อมูล SSE (สไตล์เดียวกับ Dashboard เป๊ะๆ)
// ==========================================
func StreamDevices(c *fiber.Ctx) error {
	// รับ email ที่ส่งมาจาก React (ไม่บังคับ) — ตรวจสิทธิ์จาก token: email คนอื่นได้เฉพาะ admin (S14)
	// resolve ครั้งเดียวก่อนเปิด stream (ห้ามใช้ c ภายใน StreamWriter)
	targetUser, err := middleware.ResolveTargetUser(c, c.Query("email"))
	if err != nil {
		return middleware.IdentityError(c, err)
	}

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")

	// 🌟 ต้องมี fasthttp.StreamWriter ครอบแบบนี้ (นี่แหละที่ทำให้โค้ดเก่าพัง!)
	c.Context().SetBodyStreamWriter(fasthttp.StreamWriter(func(w *bufio.Writer) {
		ticker := time.NewTicker(2 * time.Second) // ดึงข้อมูลอัปเดตทุก 2 วินาที (ปรับลดได้)
		defer ticker.Stop()

		for range ticker.C {
			// 1. เรียกใช้ Helper Function เพื่อดึงข้อมูลล่าสุด
			devicesData, err := fetchDashboardDevices(targetUser)
			var jsonData []byte
			if err != nil {
				fmt.Println("🔴 Failed to fetch devices for stream:", err)
			} else {
				// 2. แปลงเป็น JSON
				jsonData, err = json.Marshal(devicesData)
			}

			// 3. ส่งข้อมูลรูปแบบ SSE (ถ้า error ส่ง comment แทน เพื่อให้ Flush ตรวจเจอ client ที่หลุด)
			if err != nil {
				fmt.Fprint(w, ": keep-alive\n\n")
			} else {
				fmt.Fprintf(w, "data: %s\n\n", jsonData)
			}

			// 4. ดันข้อมูลออกไปหา React ทันที
			if err := w.Flush(); err != nil {
				fmt.Println("🔴 Client disconnected from Devices SSE stream")
				return
			}
		}
	}))

	return nil
}

// UpdateDevices ใช้สำหรับอัปเดตข้อมูลของอุปกรณ์ (เช่น เปลี่ยนชื่ออุปกรณ์, สถานะ online/offline)
// ระบุอุปกรณ์ได้ 2 แบบ: :id ใน URL หรือ "mac" / "mac_address" ใน body
// (Python mqtt_audio_receiver ส่ง {"mac": "...", "status": "offline"} มาที่ POST /api/device/status)
func UpdateDevices(c *fiber.Ctx) error {
	id := c.Params("id") // รับ ID จาก URL (route ปัจจุบันไม่มี :id จึงมักเป็นค่าว่าง)

	// โครงสร้างชั่วคราวสำหรับรับข้อมูล JSON
	type UpdatePayload struct {
		Mac         *string `json:"mac"`
		MacAddress  *string `json:"mac_address"`
		PatientName *string `json:"patient_name"` // ไม่ใช่คอลัมน์ของ devices — รับไว้เพื่อไม่ให้ caller เดิมพัง แต่ไม่ได้ใช้
		DeviceName  *string `json:"device_name"`
		IsActive    *bool   `json:"is_active"`
		Status      *string `json:"status"` // 🌟 1. เพิ่มตัวแปรมารับค่า status (online/offline)
	}

	payload := new(UpdatePayload)
	if err := c.BodyParser(payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "รูปแบบข้อมูลไม่ถูกต้อง"})
	}

	mac := ""
	if payload.Mac != nil {
		mac = *payload.Mac
	} else if payload.MacAddress != nil {
		mac = *payload.MacAddress
	}
	mac = normalizeMAC(mac)

	// 🟢 ห้ามเรียก First() โดยไม่มีเงื่อนไข (เดิมจะได้อุปกรณ์ id ต่ำสุดแทนเครื่องจริง)
	var device models.Device
	var err error
	switch {
	case id != "":
		err = database.DB.First(&device, "id = ?", id).Error
	case mac != "":
		err = database.DB.Where("UPPER(mac_address) = ?", mac).First(&device).Error
	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "กรุณาระบุ id หรือ mac ของอุปกรณ์"})
	}
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "ไม่พบอุปกรณ์นี้ในระบบ"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "เกิดข้อผิดพลาดกับฐานข้อมูล"})
	}

	// อัปเดตข้อมูลเฉพาะคอลัมน์ที่มีอยู่จริงในตาราง devices
	updates := make(map[string]interface{})
	if payload.IsActive != nil {
		updates["is_active"] = *payload.IsActive
	}
	if payload.Status != nil {
		if *payload.Status != "online" && *payload.Status != "offline" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "status ต้องเป็น online หรือ offline"})
		}
		updates["status"] = *payload.Status // 🌟 2. สั่งให้อัปเดต status ลงใน Database
	}

	if len(updates) > 0 {
		if err := database.DB.Model(&device).Updates(updates).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "อัปเดตข้อมูลอุปกรณ์ไม่สำเร็จ"})
		}
	}

	// device_name อยู่ในตาราง device_patients (ชื่อจุดติดตั้งของการผูกครั้งนั้น) ไม่ใช่ devices
	if payload.DeviceName != nil {
		if err := database.DB.Model(&models.Device_patient{}).
			Where("device_id = ?", device.ID).
			Update("device_name", *payload.DeviceName).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "อัปเดตชื่ออุปกรณ์ไม่สำเร็จ"})
		}
	}

	// ทำหลังเขียน DB สำเร็จ เพื่อไม่ให้ cache ถูกเติมค่าเก่ากลับเข้าไประหว่างทาง
	if payload.IsActive != nil {
		InvalidateDeviceCache(device.MacAddress)
	}
	if payload.Status != nil && *payload.Status == "online" {
		if err := database.SetDeviceOnline(device.ID, 35*time.Second); err != nil {
			fmt.Printf("⚠️ [Redis] ตั้งสถานะ online ของ device %d ไม่สำเร็จ: %v\n", device.ID, err)
		}
	}

	// ดึงค่าล่าสุดกลับมาตอบ (เดิมตอบค่าก่อนอัปเดต)
	if err := database.DB.First(&device, device.ID).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "อ่านข้อมูลอุปกรณ์หลังอัปเดตไม่สำเร็จ"})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"message": "อัปเดตข้อมูลอุปกรณ์สำเร็จ!",
		"device":  device,
	})
}
