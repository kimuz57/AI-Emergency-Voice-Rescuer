package controllers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"time"

	"go_backend/config"
	"go_backend/database"
	"go_backend/models"

	"github.com/gofiber/fiber/v2"
	"github.com/valyala/fasthttp"
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
		hit, _ := database.GetJSON(throttleKey, &struct{}{})
		if hit {
			fmt.Printf("⏳ [Throttle] ข้าม caregiver %d เพิ่งแจ้งเตือนไปแล้ว\n", caregiver.ID)
			continue
		}
		database.SetJSON(throttleKey, true, 5*time.Minute)

		go TriggerLineAlert(caregiver.ID, patient.Name, patient.RoomNumber, sourceDevice.MacAddress)
		go TriggerTelegramAlert(caregiver.ID, patient.Name, patient.RoomNumber)
	}

	return c.JSON(fiber.Map{"message": "บันทึกเหตุฉุกเฉินลง DB เรียบร้อย!"})
}

func GetActiveAlerts(c *fiber.Ctx) error {
	email := c.Query("email")
	if email == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "กรุณาระบุอีเมล"})
	}

	alerts, err := fetchActiveAlertsFromDB(email)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(alerts)
}

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

func StreamAlerts(c *fiber.Ctx) error {
	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")

	targetEmail := c.Query("email")

	c.Context().SetBodyStreamWriter(fasthttp.StreamWriter(func(w *bufio.Writer) {
		ticker := time.NewTicker(1 * time.Second)
		defer ticker.Stop()

		for range ticker.C {
			if targetEmail == "" {
				continue
			}

			alertsData, err := fetchActiveAlertsFromDB(targetEmail)
			if err != nil {
				continue
			}

			jsonData, err := json.Marshal(alertsData)
			if err != nil {
				continue
			}

			fmt.Fprintf(w, "data: %s\n\n", jsonData)

			if err := w.Flush(); err != nil {
				fmt.Println("Client disconnected from Alerts SSE stream")
				return
			}
		}
	}))

	return nil
}

func fetchActiveAlertsFromDB(email string) ([]AlertResponse, error) {
	var user models.User
	if err := database.DB.Where("email = ?", email).First(&user).Error; err != nil {
		return []AlertResponse{}, nil
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

func AcknowledgeAlert(c *fiber.Ctx) error {
	req := new(AcknowledgeReq)

	if err := c.BodyParser(req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}

	var alert models.DetectionLog

	if err := database.DB.Where("device_mac = ? AND is_resolved = ?", req.MacAddress, false).Order("created_at desc").First(&alert).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่มีการแจ้งเตือนที่ค้างอยู่สำหรับอุปกรณ์นี้"})
	}

	now := time.Now()
	database.DB.Model(&alert).Updates(map[string]interface{}{
		"status":      "resolved",
		"is_resolved": true,
		"resolved_at": now,
	})

	return c.JSON(fiber.Map{
		"message":     "ผู้ป่วยได้รับการช่วยเหลือแล้ว",
		"mac_address": req.MacAddress,
	})
}

func GetAlertDeviceInfo(c *fiber.Ctx) error {
	mac := c.Query("mac")
	if mac == "" {
		return c.Status(400).JSON(fiber.Map{"error": "กรุณาระบุ MAC Address"})
	}

	var alert models.DetectionLog
	if err := database.DB.Where("device_mac = ? AND is_resolved = ?", mac, false).Order("created_at desc").First(&alert).Error; err != nil {
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
			Joins("JOIN device_patient ON device_patient.patient_id = patients.id").
			Joins("JOIN devices ON devices.id = device_patient.device_id").
			Where("devices.mac_address = ?", mac).
			First(&patient).Error

		if err == nil {
			patientName = patient.Name
			roomNumber = patient.RoomNumber
			underlyingDisease = patient.MedicalCondition
		}
	}

	baseURL := config.GetEnv("API_BASE_URL", "http://localhost:8080")
	fullAudioURL := fmt.Sprintf("%s%s", baseURL, alert.AudioURL)

	return c.JSON(fiber.Map{
		"patient_name":       patientName,
		"room_number":        roomNumber,
		"underlying_disease": underlyingDisease,
		"audio_url":          fullAudioURL,
	})
}
