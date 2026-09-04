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
	"go_backend/config"
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

type TelegramWebhookReq struct {
	Message struct {
		Text string `json:"text"`
		Chat struct {
			ID int64 `json:"id"`
		} `json:"chat"`
	} `json:"message"`
}

// 🟢 ฟังก์ชันรับ Webhook พร้อมระบบ Debug Log
func TelegramWebhook(c *fiber.Ctx) error {
	// 1. ปริ้นท์ Body ดิบๆ ที่ Telegram ส่งมาดูก่อนเลย (เช็กว่า Telegram ยิงมาถึงจริงไหม)
	rawBody := c.Body()
	fmt.Printf("📥 [WEBHOOK RAW]: %s\n", string(rawBody))

	var req TelegramWebhookReq
	if err := c.BodyParser(&req); err != nil {
		fmt.Printf("❌ [WEBHOOK ERROR] BodyParser พัง: %v\n", err)
		return c.SendStatus(200) // ส่ง 200 ให้ Telegram เลิกส่งซ้ำ
	}

	text := req.Message.Text
	chatID := req.Message.Chat.ID
	fmt.Printf("🔥 [WEBHOOK PARSED] ข้อความ: '%s' | ChatID: %d\n", text, chatID)
	
	// เช็กคำสั่ง /start
	if strings.HasPrefix(text, "/start ") {
		userIDStr := strings.TrimPrefix(text, "/start ")
		userID, err := strconv.Atoi(userIDStr)

		if err != nil {
			fmt.Printf("❌ [WEBHOOK ERROR] แปลง UserID ไม่ได้ ('%s'): %v\n", userIDStr, err)
		} else if chatID == 0 {
			fmt.Println("❌ [WEBHOOK ERROR] ChatID เป็น 0")
		} else {
			chatIdStr := fmt.Sprintf("%d", chatID)
			fmt.Printf("🔍 [DB] กำลังบันทึก UserID: %d กับ ChatID: %s\n", userID, chatIdStr)

			var mapping models.UserTelegramMapping
			result := database.DB.Where("user_id = ?", userID).First(&mapping)

			if result.Error != nil {
				// สร้างใหม่
				newMapping := models.UserTelegramMapping{
					UserID:              uint(userID),
					TelegramChatID:      chatIdStr,
					IsTelegramConnected: true,
					NotifyTelegram:      true,
				}
				if createErr := database.DB.Create(&newMapping).Error; createErr != nil {
					fmt.Printf("❌ [DB ERROR] สร้าง Mapping ไม่สำเร็จ: %v\n", createErr)
				} else {
					fmt.Println("✅ [DB] สร้างข้อมูล Telegram Mapping ใหม่สำเร็จ!")
				}
			} else {
				// อัปเดต
				updateErr := database.DB.Model(&mapping).Updates(models.UserTelegramMapping{
					TelegramChatID:      chatIdStr,
					IsTelegramConnected: true,
					NotifyTelegram:      true,
				}).Error
				if updateErr != nil {
					fmt.Printf("❌ [DB ERROR] อัปเดต Mapping ไม่สำเร็จ: %v\n", updateErr)
				} else {
					fmt.Println("✅ [DB] อัปเดตข้อมูล Telegram Mapping สำเร็จ!")
				}
			}
			
			// ซิงก์ตารางหลัก users
			userUpdateErr := database.DB.Model(&models.User{}).Where("id = ?", userID).Update("is_telegram_connected", true).Error
			if userUpdateErr != nil {
				fmt.Printf("❌ [DB ERROR] อัปเดตตาราง users ไม่สำเร็จ: %v\n", userUpdateErr)
			} else {
				fmt.Println("✅ [DB] ซิงก์ตาราง users สำเร็จ!")
			}
			
			// ส่งข้อความตอบกลับ
			go sendReplyWithBackButton(chatIdStr)
		}
	}

	return c.SendStatus(200)
}

func sendReplyWithBackButton(chatID string) {
    // 🌟 ดึง Token และ URL จากไฟล์ .env ผ่าน config
    botToken := config.GetEnvRequired("TELEGRAM_BOT_TOKEN")
    frontendURL := config.GetEnv("FRONTEND_URL", "http://localhost:3000") + "/profile"

    url := "https://api.telegram.org/bot" + botToken + "/sendMessage"

    // สร้างโครงสร้างข้อมูลสำหรับปุ่มกด
    payload := map[string]interface{}{
        "chat_id": chatID,
        "text":    "✅ เชื่อมต่อระบบ EVR Alert สำเร็จเรียบร้อยแล้ว!\n\nระบบพร้อมแจ้งเตือนไปยังแชทนี้แล้วครับ คุณสามารถกลับไปที่หน้าเว็บเพื่อใช้งานต่อได้เลย 👇",
        "reply_markup": map[string]interface{}{
            "inline_keyboard": [][]*map[string]interface{}{
                {
                    {
                        "text": "กลับไปหน้าโปรไฟล์",
                        "url":  frontendURL,
                    },
                },
            },
        },
    }

    body, _ := json.Marshal(payload)
    http.Post(url, "application/json", bytes.NewBuffer(body))
}