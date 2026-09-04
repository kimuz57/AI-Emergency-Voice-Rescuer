package controllers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"time"

	"go_backend/database"
	"go_backend/models"
	"go_backend/config"
	"github.com/gofiber/fiber/v2"
	"github.com/valyala/fasthttp"
)

type AlertInput struct {
	BoardID  string `json:"board_id"` // ESP32 จะส่งรหัส MAC Address มาทางช่องนี้
	AudioURL string `json:"audio_url"`
}

// 🟢 ย้าย struct นี้ออกมาไว้นอกฟังก์ชัน เพื่อให้ใช้ร่วมกันได้ทั้ง GetActiveAlerts และ SSE
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

	// 1. เอา BoardID (MAC Address) ไปค้นหาในตารางอุปกรณ์ต้นทาง
	var sourceDevice models.Device
	if err := database.DB.Where("UPPER(mac_address) = UPPER(?)", input.BoardID).First(&sourceDevice).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "ไม่พบอุปกรณ์นี้ในระบบ (ยังไม่ได้ลงทะเบียน)",
		})
	}

	// 2. หา Device_patient ที่ผูกกับอุปกรณ์นี้
	var deviceRelation models.Device_patient
	if err := database.DB.Where("device_id = ?", sourceDevice.ID).First(&deviceRelation).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "อุปกรณ์นี้ยังไม่ได้ผูกกับผู้ป่วย",
		})
	}

	// 3. ดึงข้อมูลผู้ป่วย พร้อมโหลดรายชื่อผู้ดูแล (Caregivers)
	var patient models.Patient
	if err := database.DB.Preload("Caregivers").First(&patient, deviceRelation.PatientID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "ไม่พบข้อมูลผู้ป่วยที่ผูกกับอุปกรณ์นี้",
		})
	}

	// 4. สร้างประวัติแจ้งเตือน (ดึง MAC จาก sourceDevice โดยตรง)
	alert := models.DetectionLog{
		PatientID: &patient.ID,
		DeviceMAC: sourceDevice.MacAddress,
		AudioURL:  input.AudioURL,
		Status:    "needs_help",
	}

	if err := database.DB.Create(&alert).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "บันทึกข้อมูลไม่ได้"})
	}

	// 5. กระจายงานให้แผนก LINE และ Telegram
	for _, caregiver := range patient.Caregivers {
		go TriggerLineAlert(caregiver.ID, patient.Name, patient.RoomNumber, sourceDevice.MacAddress)
		go TriggerTelegramAlert(caregiver.ID, patient.Name, patient.RoomNumber)
	}

	return c.JSON(fiber.Map{"message": "บันทึกเหตุฉุกเฉินลง DB เรียบร้อย!"})
}

// 🟢 GetActiveAlerts เรียกใช้ helper function เดียวกัน
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

// 🟢 SSE Stream Endpoint สำหรับ Alerts
func StreamAlerts(c *fiber.Ctx) error {
	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")

	targetEmail := c.Query("email")

	c.Context().SetBodyStreamWriter(fasthttp.StreamWriter(func(w *bufio.Writer) {
		ticker := time.NewTicker(1 * time.Second) // ส่งข้อมูลอัปเดตทุก 1 วินาที
		defer ticker.Stop()

		for range ticker.C {
			if targetEmail == "" {
				continue
			}

			// ดึงข้อมูล alerts จาก DB ตาม email ของผู้ดูแล
			alertsData, err := fetchActiveAlertsFromDB(targetEmail)
			if err != nil {
				continue
			}

			jsonData, err := json.Marshal(alertsData)
			if err != nil {
				continue
			}

			// ส่งตามรูปแบบ SSE -> "data: {...}\n\n"
			fmt.Fprintf(w, "data: %s\n\n", jsonData)

			// ดันข้อมูลออกไปหา React ทันที
			if err := w.Flush(); err != nil {
				fmt.Println("Client disconnected from Alerts SSE stream")
				return
			}
		}
	}))

	return nil
}

// 🟢 Helper Function สำหรับดึงข้อมูลเหตุฉุกเฉินจาก PostgreSQL (ใช้ database.DB)
func fetchActiveAlertsFromDB(email string) ([]AlertResponse, error) {
	var user models.User
	if err := database.DB.Where("email = ?", email).First(&user).Error; err != nil {
		return []AlertResponse{}, nil // ไม่พบผู้ใช้งาน ให้คืน array เปล่า
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

// 1. สร้าง Struct มารอรับ JSON ที่หน้าเว็บส่งมา
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
	
	// 🌟 [แก้ตรงนี้!] เปลี่ยนคีย์เวิร์ดใน Where จาก mac_address เป็น device_mac ให้ตรงกับ Struct ของคุณ
	if err := database.DB.Where("device_mac = ? AND is_resolved = ?", req.MacAddress, false).Order("created_at desc").First(&alert).Error; err != nil {
		// ถ้าหาไม่เจอ จะตอบ 404 กลับไปให้ Frontend รู้
		return c.Status(404).JSON(fiber.Map{"error": "ไม่มีการแจ้งเตือนที่ค้างอยู่สำหรับอุปกรณ์นี้"})
	}

	now := time.Now()
	// อัปเดตสถานะให้เป็น resolved
	database.DB.Model(&alert).Updates(map[string]interface{}{
		"status":      "resolved",
		"is_resolved": true,
		"resolved_at": now,
	})

	return c.JSON(fiber.Map{
		"message": "ผู้ป่วยได้รับการช่วยเหลือแล้ว",
		"mac_address": req.MacAddress,
	})
}

// GetAlertDeviceInfo ดึงข้อมูลผู้ป่วยและไฟล์เสียงเพื่อแสดงในหน้า /alert
func GetAlertDeviceInfo(c *fiber.Ctx) error {
	// 1. รับค่า MAC Address จาก Query (เช่น ?mac=1C:C3:...)
	mac := c.Query("mac")
	if mac == "" {
		return c.Status(400).JSON(fiber.Map{"error": "กรุณาระบุ MAC Address"})
	}

	// 2. ค้นหา Log แจ้งเตือนฉุกเฉินที่ยังไม่ได้ถูกช่วยเหลือ (is_resolved = false)
	var alert models.DetectionLog
	if err := database.DB.Where("device_mac = ? AND is_resolved = ?", mac, false).Order("created_at desc").First(&alert).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบการแจ้งเตือนฉุกเฉินที่ค้างอยู่"})
	}

	// 3. เตรียมตัวแปรค่าเริ่มต้น (เผื่อหาผู้ป่วยไม่เจอ จะได้มีข้อมูลโชว์แก้ขัด)
	patientName := "ไม่ทราบชื่อ"
	roomNumber := "-"
	underlyingDisease := "ไม่ระบุ"

	// 4. ค้นหาข้อมูลผู้ป่วย 
	// (ใช้ PatientID จาก DetectionLog ถ้ามี หรือไปหาจากตาราง Device ก็ได้)
	if alert.PatientID != nil {
		var patient models.Patient
		if err := database.DB.First(&patient, *alert.PatientID).Error; err == nil {
			patientName = patient.Name
			roomNumber = patient.RoomNumber
			
			// 💡 ข้อควรระวัง: เช็กชื่อตัวแปร "โรคประจำตัว" ใน models.Patient ของคุณด้วยนะครับ
			// ในตัวอย่างนี้ผมสมมติว่าคุณตั้งชื่อฟิลด์ว่า UnderlyingDisease
			underlyingDisease = patient.MedicalCondition 
		}
	} else {
		// ท่าไม้ตายสำรอง: ควานหาข้อมูลผู้ป่วยผ่านตารางเชื่อม (device_patient)
		var patient models.Patient
		
		// 💡 เขียน Query JOIN ข้าม 3 ตาราง: devices -> device_patient -> patients
		err := database.DB.Table("patients").
			Select("patients.*").
			Joins("JOIN device_patient ON device_patient.patient_id = patients.id"). 
			Joins("JOIN devices ON devices.id = device_patient.device_id").
			Where("devices.mac_address = ?", mac).
			First(&patient).Error

		// ถ้า JOIN สำเร็จและเจอข้อมูลผู้ป่วย ก็ดึงค่ามาใช้ได้เลย
		if err == nil {
			patientName = patient.Name
			roomNumber = patient.RoomNumber
			underlyingDisease = patient.MedicalCondition // ใช้ฟิลด์ MedicalCondition ตามที่คุณแจ้งมาครับ
		}
	}
	baseURL := config.GetEnv("API_BASE_URL", "http://localhost:8080") // เปลี่ยนเป็น https://kwsb... บนเซิร์ฟเวอร์จริง

	// 🌟 นำ Base URL มาต่อกับ Path ใน Database
	fullAudioURL := fmt.Sprintf("%s%s", baseURL, alert.AudioURL)
	// 5. ประกอบร่าง JSON ส่งกลับไปให้หน้าเว็บ
	return c.JSON(fiber.Map{
		"patient_name":       patientName,
		"room_number":        roomNumber,
		"underlying_disease": underlyingDisease,
		"audio_url":          fullAudioURL,
	})
}