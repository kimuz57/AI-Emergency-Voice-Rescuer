package controllers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
	"github.com/gofiber/fiber/v2"
	"go_backend/config"
	"go_backend/database"
	"go_backend/models"
)

// ฟังก์ชันรับ Webhook จาก LINE
func LineWebhook(c *fiber.Ctx) error {
    // นี่คือจุดที่ LINE จะส่งข้อมูลมา (เช่น user กดปุ่ม หรือส่งข้อความมา)
    // คุณสามารถเขียนลอจิกดักจับเหตุการณ์ที่นี่ได้ครับ
    fmt.Println("📩 [LINE] ได้รับข้อมูลจาก Webhook แล้ว!")

    // ตอบกลับ LINE ว่าได้รับข้อมูลแล้ว (LINE บังคับว่าต้องตอบ 200)
    return c.SendStatus(200)
}

// 🟢 รับคำสั่งจาก Manager และเช็กเงื่อนไขก่อนส่ง LINE
func TriggerLineAlert(userID uint, patientName string, roomNumber string) {
	var lineMapping models.UserLineMapping
	
	// หาข้อมูลว่าผูก LINE ไว้ไหม
	if err := database.DB.Where("user_id = ?", userID).First(&lineMapping).Error; err != nil {
		fmt.Println("⚠️ ผู้ดูแลยังไม่ได้ผูกบัญชี LINE OA")
		return
	}

	if lineMapping.LineUserID != "" {
		sendLineOAPushMessage(lineMapping.LineUserID, patientName, roomNumber)
	}
}

// 📞 ฟังก์ชันยิง API ไปหา LINE
func sendLineOAPushMessage(lineUserID string, patientName string, roomNumber string) {
	channelAccessToken := config.GetEnv("LINE_CHANNEL_TOKEN", "")
	if channelAccessToken == "" {
		fmt.Println("❌ ไม่พบ LINE_CHANNEL_TOKEN")
		return
	}

	apiURL := "https://api.line.me/v2/bot/message/push"
	msgText := fmt.Sprintf("🚨 แจ้งเตือนฉุกเฉิน 🚨\n\nพบเสียงร้องขอความช่วยเหลือ!\nผู้ป่วย: %s\nห้องพัก: %s\nเวลา: %s\n\nกรุณาเข้าตรวจสอบทันที!",
		patientName, roomNumber, time.Now().Format("15:04:05"),
	)

	requestBody := map[string]interface{}{
		"to": lineUserID,
		"messages": []map[string]string{
			{"type": "text", "text": msgText},
		},
	}

	jsonData, _ := json.Marshal(requestBody)
	req, _ := http.NewRequest("POST", apiURL, bytes.NewBuffer(jsonData))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+channelAccessToken)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Println("💥 ไม่สามารถเชื่อมต่อกับ LINE API ได้:", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == 200 {
		fmt.Println("✅ ส่งแจ้งเตือนเข้า LINE OA สำเร็จ!")
	} else {
		fmt.Printf("❌ ส่ง LINE OA ล้มเหลว (Status: %d)\n", resp.StatusCode)
	}
}