package controllers

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"go_backend/config"
	"go_backend/database"
	"go_backend/middleware"
	"go_backend/models"
	"go_backend/utils"

	"github.com/gofiber/fiber/v2"
	"github.com/valyala/fasthttp"
	"gorm.io/gorm"
)

type AlertInput struct {
	BoardID  string `json:"board_id"`
	AudioURL string `json:"audio_url"`
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

// CreateAlert ถูกเรียกจาก service ภายใน (route ครอบด้วย RequireInternalKey) — ไม่มี user ใน Locals และไม่ต้องใช้
func CreateAlert(c *fiber.Ctx) error {
	var input AlertInput
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "รูปแบบข้อมูลไม่ถูกต้อง"})
	}

	var sourceDevice models.Device
	if err := database.DB.Where("UPPER(mac_address) = UPPER(?)", input.BoardID).First(&sourceDevice).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "ไม่พบอุปกรณ์นี้ในระบบ (ยังไม่ได้ลงทะเบียน)",
		})
	}

	var deviceRelation models.Device_patient
	if err := database.DB.Where("device_id = ?", sourceDevice.ID).First(&deviceRelation).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "อุปกรณ์นี้ยังไม่ได้ผูกกับผู้ป่วย",
		})
	}

	var patient models.Patient
	if err := database.DB.Preload("Caregivers").First(&patient, deviceRelation.PatientID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "ไม่พบข้อมูลผู้ป่วยที่ผูกกับอุปกรณ์นี้",
		})
	}

	alert := models.DetectionLog{
		PatientID: &patient.ID,
		DeviceMAC: sourceDevice.MacAddress,
		AudioURL:  input.AudioURL,
		Status:    "needs_help",
	}

	if err := database.DB.Create(&alert).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "บันทึกข้อมูลไม่ได้"})
	}

	// 5. กระจายงานให้แผนก LINE และ Telegram พร้อม Throttle
	for _, caregiver := range patient.Caregivers {
		throttleKey := fmt.Sprintf("alert:throttle:%d:%s", caregiver.ID, sourceDevice.MacAddress)
		// SetNX: ตั้ง key ได้ = ยังไม่เคยแจ้งในช่วง 5 นาที, ตั้งไม่ได้ = เพิ่งแจ้งไปแล้ว
		first, err := database.SetNX(throttleKey, true, 5*time.Minute)
		if err != nil {
			// Redis ล่ม → fail open (ยังแจ้งเตือนต่อ) ดีกว่าเงียบในเหตุฉุกเฉิน
			fmt.Printf("⚠️ [Throttle] เช็ค Redis ไม่สำเร็จ (%v) แจ้งเตือนต่อโดยไม่ throttle\n", err)
		} else if !first {
			fmt.Printf("⏳ [Throttle] ข้าม caregiver %d เพิ่งแจ้งเตือนไปแล้ว\n", caregiver.ID)
			continue
		}

		go TriggerLineAlert(caregiver.ID, patient.Name, patient.RoomNumber, sourceDevice.MacAddress)
		go TriggerTelegramAlert(caregiver.ID, patient.Name, patient.RoomNumber, sourceDevice.MacAddress)
	}

	return c.JSON(fiber.Map{"message": "บันทึกเหตุฉุกเฉินลง DB เรียบร้อย!"})
}

// GET /api/alerts/?email= — email ไม่บังคับแล้ว (ไม่ส่ง = ของตัวเอง / admin เห็นทั้งหมด) ดู alertScope (S12)
func GetActiveAlerts(c *fiber.Ctx) error {
	scope, err := alertScope(c)
	if err != nil {
		if errors.Is(err, middleware.ErrUserNotFound) {
			return c.JSON([]AlertResponse{})
		}
		return middleware.IdentityError(c, err)
	}

	alerts, err := fetchActiveAlertsFromDB(scope)
	if err != nil {
		fmt.Println("❌ ดึงข้อมูลแจ้งเตือนไม่สำเร็จ:", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ดึงข้อมูลแจ้งเตือนล้มเหลว"})
	}

	return c.JSON(alerts)
}

// isCaregiverOfPatient เช็คว่า user ผูกกับผู้ป่วยนี้ใน caregiver_patients (ไม่นับแถวที่ถูก soft delete)
func isCaregiverOfPatient(userID, patientID uint) (bool, error) {
	var count int64
	err := database.DB.Model(&models.CaregiverPatient{}).
		Where("user_id = ? AND patient_id = ?", userID, patientID).
		Count(&count).Error
	return count > 0, err
}

// PUT /api/alerts/:id/resolve — admin ปิดได้ทุก alert, ผู้ดูแลปิดได้เฉพาะ alert ของผู้ป่วยที่ผูกกับตัวเอง
func ResolveAlert(c *fiber.Ctx) error {
	me, err := middleware.CurrentUser(c)
	if err != nil {
		return middleware.IdentityError(c, err)
	}

	id := c.Params("id")
	var alert models.DetectionLog

	if err := database.DB.First(&alert, "id = ?", id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบรายการแจ้งเตือนนี้"})
	}

	if me.Role != "admin" {
		allowed := false
		if alert.PatientID != nil {
			linked, err := isCaregiverOfPatient(me.ID, *alert.PatientID)
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "เกิดข้อผิดพลาดกับฐานข้อมูล"})
			}
			allowed = linked
		}
		if !allowed {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "คุณไม่มีสิทธิ์ปิดการแจ้งเตือนนี้"})
		}
	}

	now := time.Now()
	if err := database.DB.Model(&alert).Updates(map[string]interface{}{
		"status":      "resolved",
		"is_resolved": true,
		"resolved_at": now,
	}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "อัปเดตสถานะการแจ้งเตือนไม่สำเร็จ"})
	}
	return c.JSON(fiber.Map{"message": "ผู้ป่วยได้รับการช่วยเหลือแล้ว"})
}

// GET /api/alerts/stream?email=&token= — RequireAuth รับ ?token= ได้ EventSource จึงใช้ต่อได้
func StreamAlerts(c *fiber.Ctx) error {
	// คำนวณสิทธิ์ครั้งเดียวก่อนเปิด stream (ห้ามใช้ c ภายใน StreamWriter เพราะ ctx ถูก recycle แล้ว)
	scope, err := alertScope(c)
	if err != nil {
		return middleware.IdentityError(c, err)
	}

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")

	c.Context().SetBodyStreamWriter(fasthttp.StreamWriter(func(w *bufio.Writer) {
		ticker := time.NewTicker(1 * time.Second)
		defer ticker.Stop()

		for range ticker.C {
			alertsData, err := fetchActiveAlertsFromDB(scope)
			var jsonData []byte
			if err == nil {
				jsonData, err = json.Marshal(alertsData)
			}

			if err != nil {
				fmt.Println("🔴 Failed to fetch alerts for stream:", err)
				// ส่ง SSE comment แทน เพื่อให้ Flush ตรวจเจอว่า client หลุดแล้วจะได้ออกจาก loop
				fmt.Fprint(w, ": keep-alive\n\n")
			} else {
				fmt.Fprintf(w, "data: %s\n\n", jsonData)
			}

			if err := w.Flush(); err != nil {
				fmt.Println("Client disconnected from Alerts SSE stream")
				return
			}
		}
	}))

	return nil
}

// fetchActiveAlertsFromDB ดึง alert ที่ยัง needs_help ตาม scope สิทธิ์ (จาก alertScope)
func fetchActiveAlertsFromDB(scope func(*gorm.DB) *gorm.DB) ([]AlertResponse, error) {
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
		Where("detection_logs.deleted_at IS NULL AND detection_logs.status = ?", "needs_help").
		Scopes(scope).
		Order("detection_logs.created_at DESC").
		Scan(&alerts).Error

	if err != nil {
		return nil, fmt.Errorf("ดึงข้อมูลแจ้งเตือนล้มเหลว: %v", err)
	}

	if alerts == nil {
		alerts = []AlertResponse{}
	}

	return alerts, nil
}

type AcknowledgeReq struct {
	MacAddress string `json:"mac_address"`
	Token      string `json:"token"`
}

// alertTokenFromRequest อ่าน alert token ตามลำดับ: header X-Alert-Token → ?token= → body "token"
func alertTokenFromRequest(c *fiber.Ctx, bodyToken string) string {
	if t := strings.TrimSpace(c.Get("X-Alert-Token")); t != "" {
		return t
	}
	if t := strings.TrimSpace(c.Query("token")); t != "" {
		return t
	}
	return strings.TrimSpace(bodyToken)
}

// POST /api/alerts/acknowledge (หน้า /alert จากลิงก์ LINE/Telegram) — ต้องมี alert token ที่เซ็นกับ MAC นี้
func AcknowledgeAlert(c *fiber.Ctx) error {
	req := new(AcknowledgeReq)

	if err := c.BodyParser(req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}

	mac := normalizeMAC(req.MacAddress)
	if mac == "" {
		return c.Status(400).JSON(fiber.Map{"error": "กรุณาระบุ MAC Address"})
	}
	if !utils.VerifyAlertToken(mac, alertTokenFromRequest(c, req.Token)) {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "ลิงก์แจ้งเตือนไม่ถูกต้องหรือหมดอายุ"})
	}

	var alert models.DetectionLog

	if err := database.DB.Where("UPPER(device_mac) = ? AND is_resolved = ?", mac, false).Order("created_at desc").First(&alert).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่มีการแจ้งเตือนที่ค้างอยู่สำหรับอุปกรณ์นี้"})
	}

	now := time.Now()
	if err := database.DB.Model(&alert).Updates(map[string]interface{}{
		"status":      "resolved",
		"is_resolved": true,
		"resolved_at": now,
	}).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "อัปเดตสถานะการแจ้งเตือนไม่สำเร็จ"})
	}

	return c.JSON(fiber.Map{
		"message":     "ผู้ป่วยได้รับการช่วยเหลือแล้ว",
		"mac_address": req.MacAddress,
	})
}

// GET /api/alerts/device?mac= (หน้า /alert) — ต้องมี alert token ที่เซ็นกับ MAC นี้
func GetAlertDeviceInfo(c *fiber.Ctx) error {
	mac := normalizeMAC(c.Query("mac"))
	if mac == "" {
		return c.Status(400).JSON(fiber.Map{"error": "กรุณาระบุ MAC Address"})
	}
	if !utils.VerifyAlertToken(mac, alertTokenFromRequest(c, "")) {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "ลิงก์แจ้งเตือนไม่ถูกต้องหรือหมดอายุ"})
	}

	var alert models.DetectionLog
	if err := database.DB.Where("UPPER(device_mac) = ? AND is_resolved = ?", mac, false).Order("created_at desc").First(&alert).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบการแจ้งเตือนฉุกเฉินที่ค้างอยู่"})
	}

	patientName := "ไม่ทราบชื่อ"
	roomNumber := "-"
	underlyingDisease := "ไม่ระบุ"

	if alert.PatientID != nil {
		var patient models.Patient
		if err := database.DB.First(&patient, *alert.PatientID).Error; err == nil {
			patientName = patient.Name
			roomNumber = patient.RoomNumber
			underlyingDisease = patient.MedicalCondition
		}
	} else {
		var patient models.Patient
		err := database.DB.Table("patients").
			Select("patients.*").
			Joins("JOIN device_patients ON device_patients.patient_id = patients.id AND device_patients.deleted_at IS NULL").
			Joins("JOIN devices ON devices.id = device_patients.device_id").
			Where("UPPER(devices.mac_address) = ? AND patients.deleted_at IS NULL", mac).
			First(&patient).Error

		if err == nil {
			patientName = patient.Name
			roomNumber = patient.RoomNumber
			underlyingDisease = patient.MedicalCondition
		}
	}

	// 🔒 GET /api/audio/:filename ไม่ public แล้ว — แนบ mac + alert token เดิม (ตรวจแล้วข้างบน) ให้ <audio> บนหน้า /alert
	// เล่นได้โดยไม่ต้องล็อกอิน (GetAudioFile ยอมรับเฉพาะไฟล์ที่ detection_logs ของ MAC นี้อ้างถึง)
	baseURL := config.GetEnv("API_BASE_URL", "http://localhost:8080")
	fullAudioURL := ""
	if strings.HasPrefix(alert.AudioURL, "/api/audio/") {
		fullAudioURL = fmt.Sprintf("%s%s?mac=%s&alert_token=%s", baseURL, alert.AudioURL,
			url.QueryEscape(mac), url.QueryEscape(alertTokenFromRequest(c, "")))
	} else if alert.AudioURL != "" {
		fullAudioURL = fmt.Sprintf("%s%s", baseURL, alert.AudioURL)
	}

	return c.JSON(fiber.Map{
		"patient_name":       patientName,
		"room_number":        roomNumber,
		"underlying_disease": underlyingDisease,
		"audio_url":          fullAudioURL,
	})
}
