package controllers

import (
	"fmt"
	"go_backend/database"
	"go_backend/models"
	"strings"
	"time"

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
				Status:     "online",
				IsActive:   false,
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

	// ถ้ามีอุปกรณ์อยู่แล้ว อัปเดตข้อมูลพร้อมตั้งให้เป็น online
	database.DB.Model(&device).Updates(map[string]interface{}{
		"ip_address":  ip,
		"is_verified": true,
		"status":      "online",
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

	// ── 1. เช็ค Redis ก่อน ──
	var cached struct {
		IsActive bool `json:"is_active"`
	}
	hit, _ := database.GetJSON(fmt.Sprintf("device:activation:%s", mac), &cached)
	if hit {
		return c.JSON(fiber.Map{
			"is_active": cached.IsActive,
			"source":    "cache",
		})
	}

	// ── 2. Cache miss → query Postgres ──
	var device models.Device
	result := database.DB.Where("UPPER(mac_address) = UPPER(?)", mac).First(&device)
	if result.Error != nil {
		return c.Status(fiber.StatusOK).JSON(fiber.Map{
			"is_active": false,
		})
	}

	// ── 3. เก็บลง Redis ──
	ttl := 10 * time.Second
	if device.IsActive {
		ttl = 1 * time.Hour
	}
	database.SetJSON(fmt.Sprintf("device:activation:%s", mac), fiber.Map{"is_active": device.IsActive}, ttl)

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"is_active":   device.IsActive,
		"is_verified": device.IsVerified,
		"source":      "db",
	})
}

// InvalidateDeviceCache ลบ cache ของ device นั้นออก
// เรียกตอนที่ admin เปลี่ยน is_active ใน UpdateDevices
func InvalidateDeviceCache(mac string) {
	key := fmt.Sprintf("device:activation:%s", mac)
	if err := database.Del(key); err != nil {
		fmt.Printf("⚠️ [Redis] ลบ cache MAC %s ไม่สำเร็จ: %v\n", mac, err)
	} else {
		fmt.Printf("🗑️ [Redis] ล้าง cache MAC %s แล้ว\n", mac)
	}
}
