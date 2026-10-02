package controllers

import (
	"go_backend/database"
	"go_backend/middleware"
	"go_backend/models"

	"github.com/gofiber/fiber/v2"
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

// fetchDashboardDevices ดึงอุปกรณ์ที่ user มองเห็น (S14)
// - admin → อุปกรณ์ทั้งหมด
// - คนอื่น → เฉพาะอุปกรณ์ของผู้ป่วยที่ผูกกับตัวเองใน caregiver_patients
// user มาจาก token (CurrentUser / ResolveTargetUser) เท่านั้น ไม่รับ email ดิบจาก client แล้ว
func fetchDashboardDevices(user *models.User) ([]DashboardDeviceResponse, error) {
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

	if user.Role != "admin" {
		query = query.
			Joins("JOIN caregiver_patients ON caregiver_patients.patient_id = patients.id AND caregiver_patients.deleted_at IS NULL").
			Where("caregiver_patients.user_id = ?", user.ID)
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
	// 🟢 1. ดูว่าใครเป็นคนเรียก API นี้ (จาก token ที่ RequireAuth ตรวจแล้ว อ่าน role จาก DB)
	// ==========================================
	me, err := middleware.CurrentUser(c)
	if err != nil {
		return middleware.IdentityError(c, err)
	}

	results, err := fetchDashboardDevices(me)
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
