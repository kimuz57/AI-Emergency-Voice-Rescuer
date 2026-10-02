package controllers

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"go_backend/database" // ดึงตัวแปร DB ของคุณมาใช้โดยตรง
	"go_backend/middleware"
	"go_backend/models"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// linkedPatientsScope กรอง detection_logs เฉพาะผู้ป่วยที่ผูกกับ userID ใน caregiver_patients (ไม่นับแถวที่ถูก soft delete)
func linkedPatientsScope(userID uint) func(*gorm.DB) *gorm.DB {
	return func(db *gorm.DB) *gorm.DB {
		return db.Where("detection_logs.patient_id IN (SELECT patient_id FROM caregiver_patients WHERE user_id = ? AND deleted_at IS NULL)", userID)
	}
}

// alertScope คืน scope สำหรับกรอง detection_logs ตามสิทธิ์ของผู้เรียก (S12) ใช้กับ /api/alerts/, /history, /stats, /stream
//   - ไม่ส่ง email + admin → ไม่กรอง (เห็นทั้งหมด ใช้โดยหน้า calendar / audio-diagnostics)
//   - ไม่ส่ง email + ไม่ใช่ admin → เฉพาะผู้ป่วยที่ผูกกับตัวเอง
//   - ส่ง email → ResolveTargetUser (email คนอื่นได้เฉพาะ admin) แล้วกรองเฉพาะผู้ป่วยที่ผูกกับคนนั้น
//
// error มาจาก middleware.ResolveTargetUser — ส่งต่อให้ middleware.IdentityError
func alertScope(c *fiber.Ctx) (func(*gorm.DB) *gorm.DB, error) {
	email := strings.TrimSpace(c.Query("email"))
	target, err := middleware.ResolveTargetUser(c, email)
	if err != nil {
		return nil, err
	}
	if email == "" && target.Role == "admin" {
		return func(db *gorm.DB) *gorm.DB { return db }, nil
	}
	return linkedPatientsScope(target.ID), nil
}

// 📅 API: ดึงประวัติสำหรับปฏิทิน (GET /api/alerts/history?email=&from=&to=) — ต้องล็อกอิน ขอบเขตตาม alertScope
func GetHistoryAlerts(c *fiber.Ctx) error {
	fromDate := c.Query("from")
	toDate := c.Query("to")

	results := make([]models.HistoryResponse, 0)

	scope, err := alertScope(c)
	if err != nil {
		// email ที่ admin ระบุไม่มีในระบบ → ตอบผลว่างเหมือนเดิม
		if errors.Is(err, middleware.ErrUserNotFound) {
			return c.JSON(results)
		}
		return middleware.IdentityError(c, err)
	}

	// เรียกใช้ database.DB โดยตรง
	// 🟢 ผู้ป่วยมาจาก detection_logs.patient_id (SaveEmergencyAudio เป็นคนเติม) — ตาราง devices ไม่มีคอลัมน์ patient_id
	query := database.DB.Table("detection_logs").
		Select(`
			detection_logs.id, 
			detection_logs.created_at, 
			detection_logs.device_mac, 
			detection_logs.event_type, 
			detection_logs.confidence, 
			detection_logs.decibel_level, 
			detection_logs.is_resolved, 
			detection_logs.audio_url, 
			detection_logs.status, 
			patients.name as patient_name, 
			patients.room_number
		`).
		Joins("LEFT JOIN patients ON patients.id = detection_logs.patient_id").
		Where("detection_logs.deleted_at IS NULL").
		Scopes(scope)

	if fromDate != "" && toDate != "" {
		startOfDay := fromDate + " 00:00:00"
		endOfDay := toDate + " 23:59:59"
		query = query.Where("detection_logs.created_at BETWEEN ? AND ?", startOfDay, endOfDay)
	}

	if err := query.Order("detection_logs.created_at DESC").Find(&results).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "ไม่สามารถดึงข้อมูลประวัติได้",
		})
	}

	return c.JSON(results)
}

// 📊 API: ดึงข้อมูลสถิติสำหรับหน้า Analytics (GET /api/alerts/stats?email=&days=30)
func GetAlertStats(c *fiber.Ctx) error {
	var response models.StatsResponse
	response.Daily = []models.StatItem{}
	response.Hourly = []models.StatItem{}
	response.Monthly = []models.StatItem{}

	// จำนวนวันย้อนหลังของกราฟรายวัน (ค่าเริ่มต้น 30, จำกัด 1-365)
	days, err := strconv.Atoi(c.Query("days", "30"))
	if err != nil || days < 1 {
		days = 30
	}
	if days > 365 {
		days = 365
	}

	scope, err := alertScope(c)
	if err != nil {
		if errors.Is(err, middleware.ErrUserNotFound) {
			return c.JSON(response)
		}
		return middleware.IdentityError(c, err)
	}

	// สร้าง query ใหม่ทุกครั้ง (GORM statement ใช้ซ้ำข้าม query ไม่ได้)
	base := func() *gorm.DB {
		return database.DB.Table("detection_logs").Where("detection_logs.deleted_at IS NULL").Scopes(scope)
	}

	var firstErr error
	check := func(err error) {
		if err != nil && firstErr == nil {
			firstErr = err
		}
	}

	// --- 1. ดึงข้อมูล Summary (ภาพรวมตัวเลข) ---
	// นับทั้งหมด
	check(base().Count(&response.Summary.Total).Error)

	// นับที่ยังไม่ช่วยเหลือ
	check(base().Where("is_resolved = ?", false).Count(&response.Summary.Unresolved).Error)

	// นับของวันนี้ (PostgreSQL ใช้ CURRENT_DATE)
	check(base().Where("DATE(created_at) = CURRENT_DATE").Count(&response.Summary.Today).Error)

	// นับของสัปดาห์นี้
	check(base().Where("created_at >= CURRENT_DATE - INTERVAL '7 days'").Count(&response.Summary.ThisWeek).Error)

	// นับของเดือนนี้
	check(base().Where("created_at >= CURRENT_DATE - INTERVAL '30 days'").Count(&response.Summary.ThisMonth).Error)

	// --- 2. ดึงข้อมูลกราฟแท่ง (รายวัน ย้อนหลัง days วัน) ---
	// days เป็น int ที่ผ่าน strconv แล้ว จึงต่อ string ได้อย่างปลอดภัย
	check(base().
		Select("TO_CHAR(created_at, 'YYYY-MM-DD') as label, COUNT(id) as count").
		Where(fmt.Sprintf("created_at >= CURRENT_DATE - INTERVAL '%d days'", days)).
		Group("TO_CHAR(created_at, 'YYYY-MM-DD')").
		Order("label ASC").
		Find(&response.Daily).Error)

	// --- 3. ดึงข้อมูลกราฟพื้นที่ (ความถี่แยกตามรายชั่วโมง 00-23 น.) ---
	check(base().
		Select("TO_CHAR(created_at, 'HH24') as label, COUNT(id) as count").
		Group("TO_CHAR(created_at, 'HH24')").
		Order("label ASC").
		Find(&response.Hourly).Error)

	// --- 4. ดึงข้อมูลรายเดือน (12 เดือนล่าสุด รวมเดือนปัจจุบัน) ---
	check(base().
		Select("TO_CHAR(created_at, 'YYYY-MM') as label, COUNT(id) as count").
		Where("created_at >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'").
		Group("TO_CHAR(created_at, 'YYYY-MM')").
		Order("label ASC").
		Find(&response.Monthly).Error)

	if firstErr != nil {
		fmt.Println("❌ ดึงข้อมูลสถิติไม่สำเร็จ:", firstErr)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ไม่สามารถดึงข้อมูลสถิติได้"})
	}

	// ส่งกลับไปให้หน้า React
	return c.JSON(response)
}
