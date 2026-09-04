package controllers

import (
	"go_backend/database" // ดึงตัวแปร DB ของคุณมาใช้โดยตรง
	"go_backend/models"

	"github.com/gofiber/fiber/v2"
)

// 📅 API: ดึงประวัติสำหรับปฏิทิน (GET /api/alerts/history)
func GetHistoryAlerts(c *fiber.Ctx) error {
	fromDate := c.Query("from")
	toDate := c.Query("to")

	results := make([]models.HistoryResponse, 0)

	// เรียกใช้ database.DB โดยตรง
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
		Joins("LEFT JOIN devices ON devices.mac_address = detection_logs.device_mac").
		Joins("LEFT JOIN patients ON patients.id = devices.patient_id")

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

// 📊 API: ดึงข้อมูลสถิติสำหรับหน้า Analytics (GET /api/alerts/stats)
func GetAlertStats(c *fiber.Ctx) error {
	var response models.StatsResponse
	db := database.DB

	// --- 1. ดึงข้อมูล Summary (ภาพรวมตัวเลข) ---
	// นับทั้งหมด
	db.Table("detection_logs").Count(&response.Summary.Total)
	
	// นับที่ยังไม่ช่วยเหลือ
	db.Table("detection_logs").Where("is_resolved = ?", false).Count(&response.Summary.Unresolved)
	
	// นับของวันนี้ (PostgreSQL ใช้ CURRENT_DATE)
	db.Table("detection_logs").Where("DATE(created_at) = CURRENT_DATE").Count(&response.Summary.Today)
	
	// นับของสัปดาห์นี้
	db.Table("detection_logs").Where("created_at >= CURRENT_DATE - INTERVAL '7 days'").Count(&response.Summary.ThisWeek)
	
	// นับของเดือนนี้
	db.Table("detection_logs").Where("created_at >= CURRENT_DATE - INTERVAL '30 days'").Count(&response.Summary.ThisMonth)

	// --- 2. ดึงข้อมูลกราฟแท่ง (รายวัน 30 วันย้อนหลัง) ---
	db.Table("detection_logs").
		Select("TO_CHAR(created_at, 'YYYY-MM-DD') as label, COUNT(id) as count").
		Where("created_at >= CURRENT_DATE - INTERVAL '30 days'").
		Group("TO_CHAR(created_at, 'YYYY-MM-DD')").
		Order("label ASC").
		Find(&response.Daily)

	// --- 3. ดึงข้อมูลกราฟพื้นที่ (ความถี่แยกตามรายชั่วโมง 00-23 น.) ---
	db.Table("detection_logs").
		Select("TO_CHAR(created_at, 'HH24') as label, COUNT(id) as count").
		Group("TO_CHAR(created_at, 'HH24')").
		Order("label ASC").
		Find(&response.Hourly)

	// ส่งกลับไปให้หน้า React
	return c.JSON(response)
}