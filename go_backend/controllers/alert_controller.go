package controllers

import (
	"fmt"
	"time"
	"go_backend/database"
	"go_backend/models"
	"github.com/gofiber/fiber/v2"
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

	// 🟢 2. เอา BoardID (MAC Address) ไปค้นหาในตารางอุปกรณ์ (devices)
	var device models.Device
	if err := database.DB.Where("mac_address = ?", input.BoardID).First(&device).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "ไม่พบอุปกรณ์นี้ในระบบ (ยังไม่ได้ลงทะเบียน)",
		})
	}

	// 🟢 3. พอรู้แล้วว่าบอร์ดนี้เป็นของใคร ก็ไปดึงข้อมูลผู้ป่วย (patients) คนนั้นมา
	var patient models.Patient
	if err := database.DB.First(&patient, device.PatientID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "ไม่พบข้อมูลผู้ป่วยที่ผูกกับอุปกรณ์นี้",
		})
	}

	// 🟢 4. สร้างประวัติแจ้งเตือน โดยใส่ ID ให้ครบ เพื่อให้หน้าเว็บดึงไปโชว์ได้เป๊ะๆ
	alert := models.DetectionLog{
		PatientID:    &patient.ID,
		DeviceMAC:    device.MACAddress,
		AudioURL:     input.AudioURL,
		Status:       "needs_help",
	}

	// 5. บันทึกลงตาราง detection_logs
	if err := database.DB.Create(&alert).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "บันทึกข้อมูลไม่ได้"})
	}

	// ==========================================
	// 🟢 6. กระจายงานให้แผนก LINE และ Telegram ไปจัดการต่อ (ทำงานเบื้องหลัง)
	// ==========================================
	go TriggerLineAlert(patient.UserID, patient.Name, patient.RoomNumber)
	go TriggerTelegramAlert(patient.UserID, patient.Name, patient.RoomNumber)

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
		Where("patients.user_id = ? AND detection_logs.status = ?", user.ID, "needs_help"). // ⚠️ แก้ตรงนี้ให้ตรงกับ Status ที่ใช้จริง
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

// 3. API: รับทราบการแจ้งเตือน
func ResolveAlert(c *fiber.Ctx) error {
	id := c.Params("id")
	var alert models.DetectionLog

	if err := database.DB.First(&alert, id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบรายการแจ้งเตือนนี้"})
	}

	database.DB.Model(&alert).Update("status", "resolved")
	return c.JSON(fiber.Map{"message": "ผู้ป่วยได้รับการช่วยเหลือแล้ว"})
}