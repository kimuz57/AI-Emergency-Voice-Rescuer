package controllers

import (
	"fmt"
	"go_backend/database"
	"go_backend/models"
	"go_backend/utils"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

func CheckinDeviceIP(c *fiber.Ctx) error {
	ip := strings.TrimSpace(c.Query("ip"))
	if strings.TrimSpace(c.Query("mac")) == "" || ip == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ส่งพารามิเตอร์ mac และ ip ไม่ครบ"})
	}
	// endpoint นี้ public (firmware ส่ง key ไม่ได้) จึงต้องไม่ให้สร้างอุปกรณ์จาก MAC ที่ผิดรูปแบบ
	mac, ok := utils.ParseMAC(c.Query("mac"))
	if !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": msgInvalidMAC})
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

// normalizeMAC ทำให้ MAC อยู่รูปแบบเดียวกันทั้งระบบ (ตัดช่องว่าง + ตัวพิมพ์ใหญ่)
// ตรงกับที่ CheckinDeviceIP ใช้ตอนสร้าง device และใช้เป็น key ของ cache
// msgInvalidMAC ข้อความเดียวกันทุก endpoint ที่ตรวจรูปแบบ MAC ด้วย utils.ParseMAC
const msgInvalidMAC = "รูปแบบ MAC Address ไม่ถูกต้อง (ต้องเป็น AA:BB:CC:DD:EE:FF)"

func normalizeMAC(mac string) string {
	return strings.ToUpper(strings.TrimSpace(mac))
}

// deviceActivationKey คือ key ของ cache สถานะ activation — ใช้ทั้งตอนอ่าน/เขียน/ลบ เพื่อให้ invalidate โดนเสมอ
func deviceActivationKey(mac string) string {
	return fmt.Sprintf("device:activation:%s", normalizeMAC(mac))
}

// deviceHeardTTL นานแค่ไหนหลังระบบได้ยินเสียงจากบอร์ดล่าสุด ที่ผู้ดูแล (ไม่ใช่ admin) ยังผูกบอร์ดนั้นได้
// receiver ถาม check-activation ของบอร์ดที่ยังไม่เปิดใช้งานทุก ~10 วิ ขณะที่บอร์ดส่งเสียง key จึงต่ออายุไปเรื่อย ๆ
const deviceHeardTTL = 10 * time.Minute

const msgDeviceNotHeard = "ระบบยังไม่ได้รับเสียงจากอุปกรณ์นี้ กรุณาเสียบปลั๊กบอร์ดและตั้งค่า Wi-Fi ให้เรียบร้อยก่อน " +
	"แล้วลงทะเบียนภายใน 10 นาที (ถ้ายังไม่ได้ ให้ผู้ดูแลระบบผูกอุปกรณ์ให้)"

func deviceHeardKey(mac string) string {
	return fmt.Sprintf("device:heard:%s", normalizeMAC(mac))
}

// markDeviceHeard จดว่าบอร์ดนี้กำลังส่งเสียงเข้า MQTT อยู่จริง (เรียกจาก check-activation ซึ่งต้องมี X-Internal-Key
// และ receiver เรียกเมื่อได้เสียงจากบอร์ดเท่านั้น) — ต่างจาก /api/device/checkin ที่เป็น public ใครก็ยิงได้
func markDeviceHeard(mac string) {
	if err := database.SetJSON(deviceHeardKey(mac), true, deviceHeardTTL); err != nil {
		fmt.Printf("⚠️ [Redis] บันทึก device:heard ของ MAC %s ไม่สำเร็จ: %v\n", mac, err)
	}
}

// deviceRecentlyHeard เป็นตัวแปรเพื่อให้ test แทนที่ได้โดยไม่ต้องมี Redis
var deviceRecentlyHeard = func(mac string) (bool, error) {
	var heard bool
	return database.GetJSON(deviceHeardKey(mac), &heard)
}

// canClaimDevice กฎการผูกบอร์ดที่ยังว่างเข้ากับผู้ป่วย: admin ผูกได้เสมอ ผู้ดูแลผูกได้เฉพาะบอร์ดที่กำลังส่งเสียงเข้าระบบ
// (กันการเดา/อ่าน MAC จากฉลากแล้วผูกบอร์ดของคนอื่นที่ยังไม่ได้เสียบใช้งาน) — ผูกซ้ำบอร์ดที่มีเจ้าของแล้วถูกกันแยกต่างหาก
func canClaimDevice(user *models.User, mac string) (bool, error) {
	if user.Role == "admin" {
		return true, nil
	}
	return deviceRecentlyHeard(mac)
}

func CheckDeviceActivation(c *fiber.Ctx) error {
	if strings.TrimSpace(c.Query("mac")) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":     "Missing 'mac' parameter",
			"is_active": false,
		})
	}
	mac, ok := utils.ParseMAC(c.Query("mac"))
	if !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":     msgInvalidMAC,
			"is_active": false,
		})
	}
	markDeviceHeard(mac)

	// ── 1. เช็ค Redis ก่อน ──
	var cached struct {
		IsActive bool `json:"is_active"`
	}
	hit, _ := database.GetJSON(deviceActivationKey(mac), &cached)
	if hit {
		return c.JSON(fiber.Map{
			"is_active": cached.IsActive,
			"source":    "cache",
		})
	}

	// ── 2. Cache miss → query Postgres ──
	var device models.Device
	result := database.DB.Where("UPPER(mac_address) = ?", mac).First(&device)
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
	database.SetJSON(deviceActivationKey(mac), fiber.Map{"is_active": device.IsActive}, ttl)

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"is_active":   device.IsActive,
		"is_verified": device.IsVerified,
		"source":      "db",
	})
}

// InvalidateDeviceCache ลบ cache ของ device นั้นออก
// เรียกตอนที่ admin เปลี่ยน is_active ใน UpdateDevices
func InvalidateDeviceCache(mac string) {
	key := deviceActivationKey(mac)
	if err := database.Del(key); err != nil {
		fmt.Printf("⚠️ [Redis] ลบ cache MAC %s ไม่สำเร็จ: %v\n", mac, err)
	} else {
		fmt.Printf("🗑️ [Redis] ล้าง cache MAC %s แล้ว\n", mac)
	}
}
