package controllers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"go_backend/config"
	"go_backend/database"
	"go_backend/models"
)

// 🟢 รับคำสั่งจาก Manager และเช็กเงื่อนไขก่อนส่ง Telegram
func TriggerTelegramAlert(userID uint, patientName string, roomNumber string) {
	var tgMapping models.UserTelegramMapping
	
	// เช็กว่าเชื่อมต่อแล้ว และกดสวิตช์อนุญาตแจ้งเตือนไว้
	if err := database.DB.Where("user_id = ? AND is_telegram_connected = ? AND notify_telegram = ?", userID, true, true).First(&tgMapping).Error; err != nil {
		fmt.Println("⚠️ ผู้ดูแลไม่ได้ผูก Telegram หรือปิดการแจ้งเตือนไว้")
		return
	}

	if tgMapping.TelegramChatID != "" {
		sendTelegramPushMessage(tgMapping.TelegramChatID, patientName, roomNumber)
	}
}

// 📞 ฟังก์ชันยิง API ไปหา Telegram
func sendTelegramPushMessage(chatID string, patientName string, roomNumber string) {
	botToken := config.GetEnv("TELEGRAM_BOT_TOKEN", "")
	if botToken == "" {
		fmt.Println("❌ ไม่พบ TELEGRAM_BOT_TOKEN")
		return
	}

	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", botToken)
	msgText := fmt.Sprintf("🚨 แจ้งเตือนฉุกเฉิน 🚨\n\nพบเสียงร้องขอความช่วยเหลือ!\nผู้ป่วย: %s\nห้องพัก: %s\nเวลา: %s\n\nกรุณาเข้าตรวจสอบทันที!",
		patientName, roomNumber, time.Now().Format("15:04:05"),
	)

	requestBody := map[string]interface{}{
		"chat_id": chatID,
		"text":    msgText,
	}

	jsonData, _ := json.Marshal(requestBody)
	resp, err := http.Post(apiURL, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		fmt.Println("💥 ไม่สามารถเชื่อมต่อกับ Telegram API ได้:", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == 200 {
		fmt.Println("✅ ส่งแจ้งเตือนเข้า Telegram สำเร็จ!")
	} else {
		fmt.Printf("❌ ส่ง Telegram ล้มเหลว (Status: %d)\n", resp.StatusCode)
	}
}