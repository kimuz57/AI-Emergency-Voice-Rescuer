package controllers

import (
	"fmt"
	"go_backend/database"
	"go_backend/models"
	"strconv"
	"strings"
	"net/http"
	"bytes"
	"encoding/json"
	"github.com/gofiber/fiber/v2"
)

// 🟢 1. บันทึก Chat ID เพื่อเชื่อมต่อ (แมนนวล)
func ConnectTelegram(c *fiber.Ctx) error {
	type Request struct {
		UserID int    `json:"userId"`
		ChatID string `json:"chatId"`
	}
	var req Request
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid input"})
	}

	// ใช้เทคนิค Upsert (หา UserID ถ้าเจอให้อัปเดต ถ้าไม่เจอให้สร้างใหม่) ตาราง Mapping
	database.DB.Where(models.UserTelegramMapping{UserID: uint(req.UserID)}).
		Assign(models.UserTelegramMapping{
			TelegramChatID:      req.ChatID,
			IsTelegramConnected: true,
			NotifyTelegram:      true,
		}).
		FirstOrCreate(&models.UserTelegramMapping{})

	// 🟢 ซิงก์ข้อมูล: อัปเดตสถานะในตารางหลัก users ให้เป็น true ด้วย
	database.DB.Model(&models.User{}).Where("id = ?", req.UserID).Update("is_telegram_connected", true)

	return c.JSON(fiber.Map{"message": "เชื่อมต่อ Telegram สำเร็จ!"})
}

// 🟢 2. เปิด-ปิด การแจ้งเตือน Telegram
func ToggleTelegramNotify(c *fiber.Ctx) error {
	type Request struct {
		UserID int  `json:"userId"`
		Status bool `json:"status"`
	}
	var req Request
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid input"})
	}

	// อัปเดตเฉพาะฟิลด์ NotifyTelegram ในตาราง Mapping (ส่วนตารางหลักเก็บแค่สถานะการเชื่อมต่อ ไม่ต้องอัปเดตแจ้งเตือน)
	database.DB.Model(&models.UserTelegramMapping{}).
		Where("user_id = ?", req.UserID).
		Update("notify_telegram", req.Status)

	return c.JSON(fiber.Map{"message": "อัปเดตสถานะการแจ้งเตือนแล้ว"})
}

// 🟢 3. ยกเลิกการเชื่อมต่อ Telegram
func DisconnectTelegram(c *fiber.Ctx) error {
	type Request struct {
		UserID int `json:"userId"`
	}
	var req Request
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid input"})
	}

	// ลบ Chat ID และปิดแจ้งเตือนในตาราง Mapping
	database.DB.Model(&models.UserTelegramMapping{}).
		Where("user_id = ?", req.UserID).
		Updates(map[string]interface{}{
			"telegram_chat_id":      "",
			"is_telegram_connected": false,
			"notify_telegram":       false,
		})
	database.DB.Where("user_id = ?", req.UserID).Delete(&models.UserTelegramMapping{})
	// 🟢 ซิงก์ข้อมูล: สั่งอัปเดตสถานะในตารางหลัก users ให้กลับไปเป็น false
	database.DB.Model(&models.User{}).Where("id = ?", req.UserID).Update("is_telegram_connected", false)

	return c.JSON(fiber.Map{"message": "ยกเลิกการเชื่อมต่อ Telegram แล้ว"})
}

// โครงสร้างสำหรับรับข้อมูล JSON ที่ Telegram ส่งมาให้
type TelegramWebhookReq struct {
	Message struct {
		Text string `json:"text"`
		Chat struct {
			ID int64 `json:"id"`
		} `json:"chat"`
	} `json:"message"`
}

// 🟢 4. ฟังก์ชันรับ Webhook จาก Telegram (Deep Link)
func TelegramWebhook(c *fiber.Ctx) error {
	var req TelegramWebhookReq

	if err := c.BodyParser(&req); err != nil {
		return c.SendStatus(200)
	}

	text := req.Message.Text
	chatID := req.Message.Chat.ID
	fmt.Println("🔥 [WEBHOOK] ข้อความที่ Telegram ส่งมาจริงๆ คือ --->", text)
	
	// เช็กว่าข้อความที่ส่งมาคือคำสั่ง "/start " ตามด้วย ID หรือไม่
	if strings.HasPrefix(text, "/start ") {
		userIDStr := strings.TrimPrefix(text, "/start ")
		userID, err := strconv.Atoi(userIDStr)

		if err == nil && chatID != 0 {
			chatIdStr := fmt.Sprintf("%d", chatID)

			// 🟢 บันทึก Chat ID ลงตารางแยก (Upsert)
			database.DB.Where(models.UserTelegramMapping{UserID: uint(userID)}).
				Assign(models.UserTelegramMapping{
					TelegramChatID:      chatIdStr,
					IsTelegramConnected: true,
					NotifyTelegram:      true,
				}).
				FirstOrCreate(&models.UserTelegramMapping{})
			
			// 🟢 ซิงก์ข้อมูล: สั่งอัปเดตสถานะในตารางหลัก users ด้วย
			database.DB.Model(&models.User{}).Where("id = ?", userID).Update("is_telegram_connected", true)
			
			// (ออปชันเสริม) เรียกฟังก์ชันส่งข้อความกลับไปหาแอป Telegram
			// sendTelegramAlert(chatIdStr, "✅ เชื่อมต่อระบบ EVR สำเร็จ!")
		}
	}

	// ต้องตอบ 200 OK ให้ Telegram เสมอ
	return c.SendStatus(200)
}

func sendReplyWithBackButton(chatID string) {
	// ⚠️ เปลี่ยนใส่ Token ของบอทคุณตรงนี้
	botToken := "ใส่_TOKEN_ของบอท_ที่ได้จาก_BotFather_ตรงนี้"
	
	// ⚠️ เปลี่ยนเป็น URL หน้าเว็บ React ของคุณ (เช่น http://localhost:3000/profile หรือเว็บจริง)
	frontendURL := "http://localhost:3000/profile"

	url := "https://api.telegram.org/bot" + botToken + "/sendMessage"

	// สร้างโครงสร้างข้อมูลสำหรับปุ่มกด
	payload := map[string]interface{}{
		"chat_id": chatID,
		"text":    "✅ เชื่อมต่อระบบ EVR Alert สำเร็จเรียบร้อยแล้ว!\n\nระบบพร้อมแจ้งเตือนไปยังแชทนี้แล้วครับ คุณสามารถกลับไปที่หน้าเว็บเพื่อใช้งานต่อได้เลย 👇",
		"reply_markup": map[string]interface{}{
			"inline_keyboard": [][]*map[string]interface{}{
				{
					{
						"text": "🏠 กลับไปหน้าโปรไฟล์",
						"url":  frontendURL,
					},
				},
			},
		},
	}

	body, _ := json.Marshal(payload)
	http.Post(url, "application/json", bytes.NewBuffer(body))
}