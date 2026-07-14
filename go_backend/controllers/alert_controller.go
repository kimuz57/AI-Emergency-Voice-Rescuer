package controllers

import (
	"fmt"
	"time"
	"go_backend/database"
	"go_backend/models"
	"github.com/gofiber/fiber/v2"
	"strconv"
)

type AlertInput struct {
	BoardID  string `json:"board_id"`  // 🟢 ESP32 จะส่งรหัส MAC Address มาทางช่องนี้
	AudioURL string `json:"audio_url"`
}

func CreateAlert(c *fiber.Ctx) error {
	var input AlertInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "รูปแบบข้อมูลไม่ถูกต้อง"})
	}

	// 🟢 1. เอา BoardID (MAC Address) ไปค้นหาในตารางอุปกรณ์ (devices)
	var device models.Device
	if err := database.DB.Where("mac_address = ?", input.BoardID).First(&device).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "ไม่พบอุปกรณ์นี้ในระบบ (ยังไม่ได้ลงทะเบียน)",
		})
	}

	// 🟢 2. ดึงข้อมูลผู้ป่วย พร้อมโหลดรายชื่อผู้ดูแล (Caregivers)
	var patient models.Patient
	// ใช้ Preload เพื่อให้ GORM ไปดึงตาราง Caregivers ที่ผูกแบบ Many-to-Many มาให้ด้วย
	if err := database.DB.Preload("Caregivers").First(&patient, device.PatientID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "ไม่พบข้อมูลผู้ป่วยที่ผูกกับอุปกรณ์นี้",
		})
	}

	// 🟢 3. สร้างประวัติแจ้งเตือน
	alert := models.DetectionLog{
		PatientID:    &patient.ID,
		DeviceMAC:    device.MACAddress,
		AudioURL:     input.AudioURL,
		Status:       "needs_help",
	}

	if err := database.DB.Create(&alert).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "บันทึกข้อมูลไม่ได้"})
	}

	// ==========================================
	// 🟢 4. กระจายงานให้แผนก LINE และ Telegram 
	// ==========================================
	// วนลูปส่งแจ้งเตือนไปให้ผู้ดูแลทุกคนที่มีรายชื่ออยู่ใน Caregivers ของผู้ป่วยคนนี้
	for _, caregiver := range patient.Caregivers {
		go TriggerLineAlert(caregiver.ID, patient.Name, patient.RoomNumber)
		go TriggerTelegramAlert(caregiver.ID, patient.Name, patient.RoomNumber)
	}

	return c.JSON(fiber.Map{"message": "บันทึกเหตุฉุกเฉินลง DB เรียบร้อย!"})
}

// 2. API: สำหรับให้ Next.js ดึงข้อมูลเฉพาะเคสที่ "ยังไม่ได้รับความช่วยเหลือ" ไปโชว์บนบอร์ด
func GetActiveAlerts(c *fiber.Ctx) error {
	email := c.Query("email")
	if email == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "กรุณาระบุอีเมล"})
	}

	var user models.User
	if err := database.DB.Where("email = ?", email).First(&user).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "ไม่พบผู้ใช้งาน"})
	}

	type AlertResponse struct {
		ID          uint      `json:"id"`
		CreatedAt   time.Time `json:"created_at"`
		DeviceMAC   string    `json:"device_mac"`
		EventType   string    `json:"event_type"`
		AudioURL    string    `json:"audio_url"`
		Status      string    `json:"status"`
		PatientName string    `json:"patient_name"`
		RoomNumber  string    `json:"room_number"`
	}

	var alerts []AlertResponse

	err := database.DB.Table("detection_logs").
		Select("detection_logs.id, "+
			"detection_logs.created_at, "+
			"detection_logs.device_mac, "+
			"detection_logs.event_type, "+
			"detection_logs.audio_url, "+
			"detection_logs.status, "+
			"patients.name as patient_name, "+
			"patients.room_number as room_number").
		Joins("LEFT JOIN patients ON patients.id = detection_logs.patient_id").
		Where("patients.id IN (SELECT patient_id FROM caregiver_patients WHERE user_id = ?) AND detection_logs.status = ?", user.ID, "needs_help").
		Order("detection_logs.created_at DESC").
		Scan(&alerts).Error

	if err != nil {
		fmt.Println("❌ ดึงข้อมูลแจ้งเตือนล้มเหลว:", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ดึงข้อมูลแจ้งเตือนล้มเหลว"})
	}

	if alerts == nil {
		alerts = []AlertResponse{}
	}

	return c.JSON(alerts)
}

// 3. API: รับทราบการแจ้งเตือน (อัปเดต status + is_resolved + resolved_at)
func ResolveAlert(c *fiber.Ctx) error {
	id := c.Params("id")
	var alert models.DetectionLog

	if err := database.DB.First(&alert, id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบรายการแจ้งเตือนนี้"})
	}

	now := time.Now()
	database.DB.Model(&alert).Updates(map[string]interface{}{
		"status":      "resolved",
		"is_resolved": true,
		"resolved_at": now,
	})
	return c.JSON(fiber.Map{"message": "ผู้ป่วยได้รับการช่วยเหลือแล้ว"})
}

// ==========================================================
// 4. API: ดึงประวัติเหตุการณ์ทั้งหมด (สำหรับ Calendar History)
// ==========================================================
func GetAlertHistory(c *fiber.Ctx) error {
	email := c.Query("email")
	if email == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "กรุณาระบุอีเมล"})
	}

	var user models.User
	if err := database.DB.Where("email = ?", email).First(&user).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "ไม่พบผู้ใช้งาน"})
	}

	// รับ query params สำหรับช่วงวันที่
	fromStr := c.Query("from") // format: 2026-07-01
	toStr := c.Query("to")     // format: 2026-07-31

	var alerts []models.DetectionLogResponse

	query := database.DB.Table("detection_logs").
		Select("detection_logs.id, "+
			"detection_logs.created_at, "+
			"detection_logs.device_mac, "+
			"detection_logs.event_type, "+
			"detection_logs.confidence, "+
			"detection_logs.decibel_level, "+
			"detection_logs.is_resolved, "+
			"detection_logs.audio_url, "+
			"detection_logs.status, "+
			"patients.name as patient_name, "+
			"patients.room_number as room_number").
		Joins("LEFT JOIN patients ON patients.id = detection_logs.patient_id").
		Where("patients.id IN (SELECT patient_id FROM caregiver_patients WHERE user_id = ?)", user.ID).
		Where("detection_logs.deleted_at IS NULL")

	// กรองตามช่วงวันที่ (ถ้ามี)
	if fromStr != "" {
		if fromTime, err := time.Parse("2006-01-02", fromStr); err == nil {
			query = query.Where("detection_logs.created_at >= ?", fromTime)
		}
	}
	if toStr != "" {
		if toTime, err := time.Parse("2006-01-02", toStr); err == nil {
			// เพิ่ม 1 วัน เพื่อให้ครอบคลุมทั้งวันสุดท้าย
			query = query.Where("detection_logs.created_at < ?", toTime.AddDate(0, 0, 1))
		}
	}

	err := query.Order("detection_logs.created_at DESC").Scan(&alerts).Error

	if err != nil {
		fmt.Println("❌ ดึงประวัติเหตุการณ์ล้มเหลว:", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ดึงประวัติเหตุการณ์ล้มเหลว"})
	}

	if alerts == nil {
		alerts = []models.DetectionLogResponse{}
	}

	return c.JSON(alerts)
}

// ==========================================================
// 5. API: สถิติเหตุการณ์ (สำหรับกราฟ Analytics)
// ==========================================================
type StatItem struct {
	Label string `json:"label"`
	Count int    `json:"count"`
}

type StatsResponse struct {
	Daily   []StatItem `json:"daily"`
	Hourly  []StatItem `json:"hourly"`
	Monthly []StatItem `json:"monthly"`
	Summary struct {
		Today      int `json:"today"`
		ThisWeek   int `json:"this_week"`
		ThisMonth  int `json:"this_month"`
		Unresolved int `json:"unresolved"`
		Total      int `json:"total"`
	} `json:"summary"`
}

func GetAlertStats(c *fiber.Ctx) error {
	email := c.Query("email")
	if email == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "กรุณาระบุอีเมล"})
	}

	var user models.User
	if err := database.DB.Where("email = ?", email).First(&user).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "ไม่พบผู้ใช้งาน"})
	}

	// รับ days param สำหรับช่วงเวลาของกราฟ (default 30 วัน)
	daysStr := c.Query("days", "30")
	days, _ := strconv.Atoi(daysStr)
	if days <= 0 {
		days = 30
	}

	now := time.Now()
	startDate := now.AddDate(0, 0, -days)

	// Sub-query สำหรับกรอง patient ของ user นี้
	patientFilter := "patients.id IN (SELECT patient_id FROM caregiver_patients WHERE user_id = ?)"

	var stats StatsResponse

	// --- Daily counts (จำนวนเหตุการณ์ต่อวัน) ---
	var dailyRaw []struct {
		Day   string `json:"day"`
		Count int    `json:"count"`
	}
	database.DB.Table("detection_logs").
		Select("TO_CHAR(detection_logs.created_at, 'YYYY-MM-DD') as day, COUNT(*) as count").
		Joins("LEFT JOIN patients ON patients.id = detection_logs.patient_id").
		Where(patientFilter, user.ID).
		Where("detection_logs.created_at >= ? AND detection_logs.deleted_at IS NULL", startDate).
		Group("day").Order("day").Scan(&dailyRaw)

	for _, d := range dailyRaw {
		stats.Daily = append(stats.Daily, StatItem{Label: d.Day, Count: d.Count})
	}

	// --- Hourly counts (จำนวนเหตุการณ์ต่อชั่วโมง 0-23) ---
	var hourlyRaw []struct {
		Hour  int `json:"hour"`
		Count int `json:"count"`
	}
	database.DB.Table("detection_logs").
		Select("EXTRACT(HOUR FROM detection_logs.created_at)::int as hour, COUNT(*) as count").
		Joins("LEFT JOIN patients ON patients.id = detection_logs.patient_id").
		Where(patientFilter, user.ID).
		Where("detection_logs.created_at >= ? AND detection_logs.deleted_at IS NULL", startDate).
		Group("hour").Order("hour").Scan(&hourlyRaw)

	// สร้างข้อมูลครบ 24 ชั่วโมง
	hourMap := make(map[int]int)
	for _, h := range hourlyRaw {
		hourMap[h.Hour] = h.Count
	}
	for i := 0; i < 24; i++ {
		stats.Hourly = append(stats.Hourly, StatItem{
			Label: fmt.Sprintf("%02d:00", i),
			Count: hourMap[i],
		})
	}

	// --- Monthly counts (จำนวนเหตุการณ์ต่อเดือน) ---
	var monthlyRaw []struct {
		Month string `json:"month"`
		Count int    `json:"count"`
	}
	database.DB.Table("detection_logs").
		Select("TO_CHAR(detection_logs.created_at, 'YYYY-MM') as month, COUNT(*) as count").
		Joins("LEFT JOIN patients ON patients.id = detection_logs.patient_id").
		Where(patientFilter, user.ID).
		Where("detection_logs.deleted_at IS NULL").
		Group("month").Order("month").Scan(&monthlyRaw)

	for _, m := range monthlyRaw {
		stats.Monthly = append(stats.Monthly, StatItem{Label: m.Month, Count: m.Count})
	}

	// --- Summary counts ---
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	weekStart := todayStart.AddDate(0, 0, -int(todayStart.Weekday()))
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())

	var todayCount, weekCount, monthCount, unresolvedCount, totalCount int64

	database.DB.Table("detection_logs").
		Joins("LEFT JOIN patients ON patients.id = detection_logs.patient_id").
		Where(patientFilter, user.ID).
		Where("detection_logs.created_at >= ? AND detection_logs.deleted_at IS NULL", todayStart).
		Count(&todayCount)

	database.DB.Table("detection_logs").
		Joins("LEFT JOIN patients ON patients.id = detection_logs.patient_id").
		Where(patientFilter, user.ID).
		Where("detection_logs.created_at >= ? AND detection_logs.deleted_at IS NULL", weekStart).
		Count(&weekCount)

	database.DB.Table("detection_logs").
		Joins("LEFT JOIN patients ON patients.id = detection_logs.patient_id").
		Where(patientFilter, user.ID).
		Where("detection_logs.created_at >= ? AND detection_logs.deleted_at IS NULL", monthStart).
		Count(&monthCount)

	database.DB.Table("detection_logs").
		Joins("LEFT JOIN patients ON patients.id = detection_logs.patient_id").
		Where(patientFilter, user.ID).
		Where("detection_logs.status = ? AND detection_logs.deleted_at IS NULL", "needs_help").
		Count(&unresolvedCount)

	database.DB.Table("detection_logs").
		Joins("LEFT JOIN patients ON patients.id = detection_logs.patient_id").
		Where(patientFilter, user.ID).
		Where("detection_logs.deleted_at IS NULL").
		Count(&totalCount)

	stats.Summary.Today = int(todayCount)
	stats.Summary.ThisWeek = int(weekCount)
	stats.Summary.ThisMonth = int(monthCount)
	stats.Summary.Unresolved = int(unresolvedCount)
	stats.Summary.Total = int(totalCount)

	if stats.Daily == nil {
		stats.Daily = []StatItem{}
	}
	if stats.Monthly == nil {
		stats.Monthly = []StatItem{}
	}

	return c.JSON(stats)
}