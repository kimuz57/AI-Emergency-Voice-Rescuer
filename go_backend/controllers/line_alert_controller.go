package controllers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/gofiber/fiber/v2"
	"go_backend/database"
	"go_backend/models"
	"go_backend/config"
)

// โครงสร้างข้อมูลที่ AI จะส่งมาให้ Go
type AIAlertPayload struct {
	DeviceMAC    string  `json:"device_mac"`
	EventType    string  `json:"event_type"`
	Confidence   float64 `json:"confidence"`
	DecibelLevel float64 `json:"decibel_level"`
}

// 🚀 API: รับข้อมูลจาก AI บันทึกและแจ้งเตือน (POST /api/alerts)
func HandleAIAlert(c *fiber.Ctx) error {
	payload := new(AIAlertPayload)
	if err := c.BodyParser(payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "รูปแบบข้อมูลไม่ถูกต้อง"})
	}
	fmt.Println("👉 1. AI ยิงมาแล้ว! MAC:", payload.DeviceMAC)
	// 1. ค้นหาผู้ป่วยจาก MAC Address ของอุปกรณ์
	var patient models.Patient
	if err := database.DB.Where("device_mac = ?", payload.DeviceMAC).First(&patient).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "ไม่พบผู้ป่วยที่ใช้อุปกรณ์นี้"})
	}
	fmt.Println("👉 3. เจอผู้ป่วยแล้ว! ชื่อ:", patient.Name, "รหัสคนดูแล:", patient.UserID)
	// 2. บันทึกประวัติลงตาราง DetectionLog
	newLog := models.DetectionLog{
		PatientID:    &patient.ID,
		DeviceMAC:    payload.DeviceMAC,
		EventType:    payload.EventType,
		Confidence:   payload.Confidence,
		DecibelLevel: payload.DecibelLevel,
		Status:       "needs_help", // สถานะเริ่มต้นคือต้องการความช่วยเหลือ
	}
	
	if err := database.DB.Create(&newLog).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "บันทึกประวัติล้มเหลว"})
	}

	// 3. ค้นหาว่าคนดูแล (UserID) ผูก LINE OA ไว้หรือไม่
	var lineMapping models.UserLineMapping
	if err := database.DB.Where("user_id = ?", patient.UserID).First(&lineMapping).Error; err == nil {
		fmt.Println("👉 4. เจอคนผูกไลน์แล้ว! LineUserID:", lineMapping.LineUserID)
		go sendLineOAPushMessage(lineMapping.LineUserID, patient.Name, patient.RoomNumber)
	} else {
		fmt.Println("⚠️ 5. ผู้ดูแลยังไม่ได้ผูกบัญชี LINE OA")
	}

	// (อนาคต: คุณสามารถเพิ่มโค้ดส่งข้อมูลผ่าน WebSockets/SSE ไปหน้า Next.js ตรงนี้ได้ครับ)

	return c.JSON(fiber.Map{
		"message": "รับสัญญาณฉุกเฉินและดำเนินการแจ้งเตือนเรียบร้อย",
		"log_id":  newLog.ID,
	})
}

// 📞 ฟังก์ชันยิง LINE Messaging API (Push Message)
func sendLineOAPushMessage(lineUserID string, patientName string, roomNumber string) {
	// ดึงค่า Token ของ LINE OA จากไฟล์ .env
	channelAccessToken := config.GetEnv("LINE_CHANNEL_TOKEN", "")
	if channelAccessToken == "" {
		fmt.Println("❌ ข้อผิดพลาด: ไม่พบ LINE_CHANNEL_TOKEN ในระบบ")
		return
	}

	apiURL := "https://api.line.me/v2/bot/message/push"

	// ออกแบบข้อความที่จะส่งไปหาคนดูแล
	msgText := fmt.Sprintf("🚨 แจ้งเตือนฉุกเฉิน 🚨\n\nพบเสียงร้องขอความช่วยเหลือ!\nผู้ป่วย: %s\nห้องพัก: %s\nเวลา: %s\n\nกรุณาเข้าตรวจสอบทันที!", 
		patientName, 
		roomNumber, 
		time.Now().Format("15:04:05"),
	)

	// โครงสร้าง JSON สำหรับ LINE OA
	requestBody := map[string]interface{}{
		"to": lineUserID, // ยิงตรงไปหา U... ของผู้ใช้
		"messages": []map[string]string{
			{
				"type": "text",
				"text": msgText,
			},
		},
	}

	jsonData, _ := json.Marshal(requestBody)

	// สร้าง HTTP Request
	req, _ := http.NewRequest("POST", apiURL, bytes.NewBuffer(jsonData))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+channelAccessToken)

	// ส่งข้อมูล
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	
	if err != nil {
		fmt.Println("💥 ไม่สามารถเชื่อมต่อกับ LINE API ได้:", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == 200 {
		fmt.Println("✅ ส่งแจ้งเตือนเข้า LINE OA ของผู้ดูแลสำเร็จ!")
	} else {
		fmt.Printf("❌ ส่ง LINE OA ล้มเหลว (Status: %d)\n", resp.StatusCode)
	}
}