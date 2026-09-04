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

func fetchDashboardDevices(email string) ([]DashboardDeviceResponse, error) {
	query := database.DB.Model(&models.Device{}).
		Select(`devices.id,
			devices.mac_address,
			devices.status,
			devices.is_active,
			devices.is_verified,
			patients.name as patient_name,
			device_patients.device_name`).
		Joins("LEFT JOIN device_patients ON devices.id = device_patients.device_id AND device_patients.deleted_at IS NULL").
		Joins("LEFT JOIN patients ON patients.id = device_patients.patient_id AND patients.deleted_at IS NULL")

	if email != "" {
		var user models.User
		userRole := ""
		if err := database.DB.Where("email = ?", email).First(&user).Error; err == nil {
			userRole = user.Role
		}

		if userRole != "admin" {
			query = query.
				Joins("JOIN caregiver_patients ON caregiver_patients.patient_id = patients.id").
				Joins("JOIN users ON users.id = caregiver_patients.user_id").
				Where("users.email = ?", email)
		}
	}

	var results []DashboardDeviceResponse
	if err := query.Scan(&results).Error; err != nil {
		return nil, err
	}

	if results == nil {
		results = []DashboardDeviceResponse{}
	}

	return results, nil
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

	results, err := fetchDashboardDevices(loggedInEmail)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "ไม่สามารถดึงข้อมูลอุปกรณ์ได้",
		})
	}

	return c.JSON(fiber.Map{
		"message": "ดึงข้อมูลสำเร็จ",
		"data":    results,
	})
}