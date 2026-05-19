package controllers

import (
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
		PatientID:    &patient.ID,      // ใส่ ID ผู้ป่วย (เพื่อเชื่อมกับผู้ดูแล)
		DeviceID:     &device.ID,       // ใส่ ID อุปกรณ์
		PatientName:  patient.Name,     // ก๊อปปี้ชื่อมาให้หน้าเว็บใช้ง่ายๆ
		RoomNumber:   patient.RoomNumber, // ก๊อปปี้ห้องมา
		AudioURL:     input.AudioURL,
		Status:       "needs_help",
	}

	// 5. บันทึกลงตาราง detection_logs
	if err := database.DB.Create(&alert).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "บันทึกข้อมูลไม่ได้"})
	}

	return c.JSON(fiber.Map{"message": "บันทึกเหตุฉุกเฉินลง DB เรียบร้อย!"})
}

// 2. API: สำหรับให้ Next.js ดึงข้อมูลเฉพาะเคสที่ "ยังไม่ได้รับความช่วยเหลือ" ไปโชว์บนบอร์ด
// GET /api/alerts
// ฟังก์ชันสำหรับดึงข้อมูลแจ้งเตือน (Get Active Alerts)
func GetActiveAlerts(c *fiber.Ctx) error {
	var alerts []models.DetectionLog
	
	// 🟢 1. รับค่า email ที่หน้าบ้าน (Next.js) ส่งมาทาง Query String (?email=...)
	email := c.Query("email")

	// 2. เริ่มสร้างคำสั่งค้นหา (ดึงเฉพาะที่ต้องการความช่วยเหลือ)
	dbQuery := database.DB.Where("detection_logs.status = ?", "needs_help")

	// 🟢 3. ถ้ามีการส่งอีเมลมาด้วย ให้คัดกรองเฉพาะผู้ป่วยของคุณหมอคนนี้
	if email != "" {
		dbQuery = dbQuery.
			Joins("JOIN caregiver_patients ON caregiver_patients.patient_id = detection_logs.patient_id").
			Joins("JOIN users ON users.id = caregiver_patients.user_id").
			Where("users.email = ?", email)
	}

	// 4. ดึงข้อมูลและเรียงจากเหตุการณ์ล่าสุดไปเก่าสุด
	if err := dbQuery.Order("detection_logs.created_at desc").Find(&alerts).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "ไม่สามารถดึงข้อมูลแจ้งเตือนได้: " + err.Error(),
		})
	}

	return c.JSON(alerts)
}

// 3. API: สำหรับเวลาพยาบาลกดปุ่ม "รับทราบ" บนหน้าเว็บ ให้เปลี่ยนสถานะใน DB เพื่อเคลียร์หน้าจอ
// PUT /api/alerts/:id/resolve
func ResolveAlert(c *fiber.Ctx) error {
	id := c.Params("id")
	var alert models.DetectionLog

	if err := database.DB.First(&alert, id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบรายการแจ้งเตือนนี้"})
	}

	// อัปเดตสถานะใน DB เป็นช่วยเหลือแล้ว ข้อมูลจะได้หายไปจากหน้า Dashboard หลัก
	database.DB.Model(&alert).Update("status", "resolved")

	return c.JSON(fiber.Map{"message": "ผู้ป่วยได้รับการช่วยเหลือแล้ว"})
}