package controllers

import (
	"go_backend/database"
	"go_backend/models"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

// 📦 1. อัปเดต Struct ตอบกลับ (ใส่ Pointer *string เพื่อรองรับค่า NULL ตอนที่ยังไม่ผูกผู้ป่วย)
type DashboardDeviceResponse struct {
	ID          uint    `json:"id"`
	MacAddress  string  `json:"mac_address"`
	PatientName *string `json:"patient_name"` // 🟢 ใช้ Pointer กัน Error เวลาเป็น Null
	DeviceName  *string `json:"device_name"`
	Status      string  `json:"status"`
	IsActive    bool    `json:"is_active"`   // 🟢 เพิ่มสถานะการทำงาน
	IsVerified  bool    `json:"is_verified"` // 🟢 เพิ่มสถานะการยืนยัน
}

// 📡 API: ดึงรายการอุปกรณ์
// 📡 API: ดึงรายการอุปกรณ์ทั้งหมดเพื่อแสดงบนหน้าแดชบอร์ด
func GetDashboardDevices(c *fiber.Ctx) error {
	// ==========================================
	// 🟢 1. ดึง Token เพื่อดูว่าใครเป็นคนเรียก API นี้
	// ==========================================
	userToken, ok := c.Locals("user").(*jwt.Token)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "ไม่พบข้อมูลการเข้าสู่ระบบ",
		})
	}
	claims := userToken.Claims.(jwt.MapClaims)
	
	// ดึง Email และ UserID มาจาก JWT
	loggedInEmail := claims["email"].(string)
	userIDClaim, _ := claims["user_id"].(float64)
	userID := uint(userIDClaim)

	// ==========================================
	// 🟢 2. ดึง Role ของ User จาก Database โดยตรง
	// ==========================================
	var user models.User
	userRole := ""
	if err := database.DB.First(&user, userID).Error; err == nil {
		userRole = user.Role
	}

	var results []DashboardDeviceResponse

	// ==========================================
	// 🌟 3. สร้าง Query โดยยึดตาราง devices เป็นหลัก (LEFT JOIN)
	// ==========================================
	query := database.DB.Model(&models.Device{}).
		Select("devices.id, devices.mac_address, devices.status, devices.is_active, devices.is_verified, patients.name as patient_name, device_patients.device_name").
		Joins("LEFT JOIN device_patients ON devices.id = device_patients.device_id").
		Joins("LEFT JOIN patients ON patients.id = device_patients.patient_id")

	// ==========================================
	// 👑 4. เช็คสิทธิ์: ถ้าไม่ใช่ Admin ให้เห็นแค่คนไข้ตัวเอง
	// ==========================================
	if userRole != "admin" {
		query = query.
			Joins("JOIN caregiver_patients ON caregiver_patients.patient_id = patients.id").
			Joins("JOIN users ON users.id = caregiver_patients.user_id").
			Where("users.email = ?", loggedInEmail)
	}

	// ==========================================
	// 5. สั่งรัน Query และส่งข้อมูลกลับ
	// ==========================================
	if err := query.Scan(&results).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "ไม่สามารถดึงข้อมูลอุปกรณ์ได้",
		})
	}

	if results == nil {
		results = []DashboardDeviceResponse{}
	}

	return c.JSON(fiber.Map{
		"message": "ดึงข้อมูลสำเร็จ",
		"data":    results,
	})
}