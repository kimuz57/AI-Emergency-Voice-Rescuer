package controllers

import (
	"bytes"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"go_backend/config"
	"go_backend/database"
	"go_backend/middleware"
	"go_backend/models"

	"github.com/gofiber/fiber/v2"
)

// 🟢 อายุของ token สำหรับผูก Telegram ผ่าน deep link (t.me/<bot>?start=<token>)
const telegramLinkTokenTTL = 15 * time.Minute

// 🟢 parseOptionalBody อ่าน body ถ้ามีส่งมาเท่านั้น (DELETE ส่วนใหญ่ไม่มี body ซึ่งไม่ใช่ error)
func parseOptionalBody(c *fiber.Ctx, out interface{}) error {
	if len(c.Body()) == 0 {
		return nil
	}
	return c.BodyParser(out)
}

// (เดิมมี ConnectTelegram = POST /api/user/telegram/connect รับ chatId อะไรก็ได้จาก client → ชี้การแจ้งเตือนไปแชทคนอื่นได้
// ถอดออกแล้ว: การผูก Telegram ทำผ่าน deep link /start <token> เท่านั้น — ดู CreateTelegramLinkToken + TelegramWebhook)

// 🟢 2. เปิด-ปิด การแจ้งเตือน Telegram
func ToggleTelegramNotify(c *fiber.Ctx) error {
	type Request struct {
		Email  string `json:"email"`
		Status bool   `json:"status"`
	}
	var req Request
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid input"})
	}

	user, err := middleware.ResolveTargetUser(c, req.Email)
	if err != nil {
		return middleware.IdentityError(c, err)
	}

	// อัปเดตเฉพาะฟิลด์ NotifyTelegram ในตาราง Mapping (ส่วนตารางหลักเก็บแค่สถานะการเชื่อมต่อ ไม่ต้องอัปเดตแจ้งเตือน)
	if err := database.DB.Model(&models.UserTelegramMapping{}).
		Where("user_id = ?", user.ID).
		Update("notify_telegram", req.Status).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "อัปเดตสถานะการแจ้งเตือนไม่สำเร็จ"})
	}

	return c.JSON(fiber.Map{"message": "อัปเดตสถานะการแจ้งเตือนแล้ว"})
}

// 🟢 3. ยกเลิกการเชื่อมต่อ Telegram
func DisconnectTelegram(c *fiber.Ctx) error {
	type Request struct {
		Email string `json:"email"`
	}
	var req Request
	if err := parseOptionalBody(c, &req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid input"})
	}
	if req.Email == "" {
		req.Email = c.Query("email")
	}

	user, err := middleware.ResolveTargetUser(c, req.Email)
	if err != nil {
		return middleware.IdentityError(c, err)
	}

	// ลบแถว Mapping ทิ้ง (เดิม Updates ล้างค่าก่อนแล้วค่อยลบซ้ำ ซึ่งไม่จำเป็น)
	if err := database.DB.Where("user_id = ?", user.ID).Delete(&models.UserTelegramMapping{}).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "ยกเลิกการเชื่อมต่อ Telegram ไม่สำเร็จ"})
	}
	// 🟢 ซิงก์ข้อมูล: สั่งอัปเดตสถานะในตารางหลัก users ให้กลับไปเป็น false
	database.DB.Model(&models.User{}).Where("id = ?", user.ID).Update("is_telegram_connected", false)

	return c.JSON(fiber.Map{"message": "ยกเลิกการเชื่อมต่อ Telegram แล้ว"})
}

// 🟢 4. สร้าง token ใช้ครั้งเดียวสำหรับผูก Telegram (POST /api/user/telegram/link-token)
// หน้าเว็บเปิด deep_link → ผู้ใช้กด Start ใน Telegram → bot ได้รับ "/start <token>" แล้วผูก chat_id ให้ผู้ใช้คนนี้
func CreateTelegramLinkToken(c *fiber.Ctx) error {
	user, err := middleware.CurrentUser(c)
	if err != nil {
		return middleware.IdentityError(c, err)
	}

	token, err := newTelegramLinkToken()
	if err != nil {
		fmt.Println("❌ [Telegram] สร้าง link token ไม่สำเร็จ:", err)
		return c.Status(500).JSON(fiber.Map{"error": "ไม่สามารถสร้างลิงก์เชื่อมต่อ Telegram ได้"})
	}

	if err := database.SetJSON(database.KeyTelegramLink(token), user.ID, telegramLinkTokenTTL); err != nil {
		fmt.Println("❌ [Telegram] บันทึก link token ลง Redis ไม่สำเร็จ:", err)
		return c.Status(500).JSON(fiber.Map{"error": "ไม่สามารถสร้างลิงก์เชื่อมต่อ Telegram ได้"})
	}

	deepLink := ""
	if botUsername := strings.TrimPrefix(strings.TrimSpace(config.GetEnv("TELEGRAM_BOT_USERNAME", "")), "@"); botUsername != "" {
		deepLink = "https://t.me/" + botUsername + "?start=" + token
	}

	return c.JSON(fiber.Map{
		"token":      token,
		"deep_link":  deepLink,
		"expires_in": int(telegramLinkTokenTTL.Seconds()),
	})
}

// newTelegramLinkToken สุ่ม 32 bytes แล้วเข้ารหัส base64url (43 ตัวอักษร)
// อยู่ในชุดอักขระที่ Telegram อนุญาตใน start parameter ([A-Za-z0-9_-], ไม่เกิน 64 ตัว)
func newTelegramLinkToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// linkTelegramChat ผูก chat_id เข้ากับผู้ใช้ (upsert ตาราง mapping + ซิงก์ users.is_telegram_connected)
func linkTelegramChat(userID uint, chatID string) error {
	if err := database.DB.Where(models.UserTelegramMapping{UserID: userID}).
		Assign(models.UserTelegramMapping{
			TelegramChatID:      chatID,
			IsTelegramConnected: true,
			NotifyTelegram:      true,
		}).
		FirstOrCreate(&models.UserTelegramMapping{}).Error; err != nil {
		fmt.Printf("❌ [DB ERROR] บันทึก Telegram Mapping ของ user %d ไม่สำเร็จ: %v\n", userID, err)
		return err
	}

	if err := database.DB.Model(&models.User{}).Where("id = ?", userID).Update("is_telegram_connected", true).Error; err != nil {
		fmt.Printf("❌ [DB ERROR] อัปเดตตาราง users ของ user %d ไม่สำเร็จ: %v\n", userID, err)
		return err
	}
	return nil
}

type TelegramWebhookReq struct {
	Message struct {
		Text string `json:"text"`
		Chat struct {
			ID int64 `json:"id"`
		} `json:"chat"`
	} `json:"message"`
}

// isValidTelegramLinkToken ตรวจรูปแบบ token จาก newTelegramLinkToken (base64url ไม่มี padding ยาว 43 ตัว)
func isValidTelegramLinkToken(s string) bool {
	if len(s) != base64.RawURLEncoding.EncodedLen(32) {
		return false
	}
	for _, r := range s {
		if !(r >= 'A' && r <= 'Z' || r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '-' || r == '_') {
			return false
		}
	}
	return true
}

// isAllDigits ใช้แยก "/start <userId>" แบบเก่า (เลขล้วน) ออกจาก token ใหม่
func isAllDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// 🟢 ฟังก์ชันรับ Webhook จาก Telegram
// - ถ้าตั้ง TELEGRAM_WEBHOOK_SECRET ไว้ ต้องมี header X-Telegram-Bot-Api-Secret-Token ตรงกัน (ตั้งผ่าน setWebhook secret_token)
// - "/start <token>" เท่านั้นที่ผูกบัญชีได้ (token มาจาก POST /api/user/telegram/link-token ใช้ได้ครั้งเดียว)
// - ไม่ log body/ข้อความดิบ เพราะมี token และข้อความส่วนตัวของผู้ใช้
func TelegramWebhook(c *fiber.Ctx) error {
	if secret := config.GetEnv("TELEGRAM_WEBHOOK_SECRET", ""); secret != "" {
		got := c.Get("X-Telegram-Bot-Api-Secret-Token")
		if subtle.ConstantTimeCompare([]byte(got), []byte(secret)) != 1 {
			fmt.Println("❌ [WEBHOOK] secret token ไม่ถูกต้อง ปฏิเสธ request")
			return c.SendStatus(fiber.StatusUnauthorized)
		}
	}

	var req TelegramWebhookReq
	if err := json.Unmarshal(c.Body(), &req); err != nil {
		fmt.Println("❌ [WEBHOOK ERROR] อ่าน body ไม่สำเร็จ")
		return c.SendStatus(200) // ส่ง 200 ให้ Telegram เลิกส่งซ้ำ
	}

	text := strings.TrimSpace(req.Message.Text)
	chatID := req.Message.Chat.ID
	if chatID == 0 {
		return c.SendStatus(200)
	}
	chatIDStr := strconv.FormatInt(chatID, 10)

	// เช็กคำสั่ง /start (รองรับทั้ง "/start" เปล่าๆ และ "/start <payload>")
	if text != "/start" && !strings.HasPrefix(text, "/start ") {
		return c.SendStatus(200)
	}
	payload := strings.TrimSpace(strings.TrimPrefix(text, "/start"))

	switch {
	case payload == "":
		go sendTelegramText(chatIDStr, "กรุณาเชื่อมต่อ Telegram จากหน้าโปรไฟล์บนเว็บไซต์ แล้วกดลิงก์ที่ระบบสร้างให้ครับ")
		return c.SendStatus(200)

	case isAllDigits(payload):
		// ❌ flow เก่า "/start <userId>" ใครก็ใส่เลขของคนอื่นได้ ห้ามผูกให้เด็ดขาด
		fmt.Println("⚠️ [WEBHOOK] ได้รับ /start แบบเลข user id (flow เก่า) ไม่ผูกบัญชี")
		go sendTelegramText(chatIDStr, "⚠️ ลิงก์นี้เป็นรูปแบบเก่าและไม่รองรับแล้ว\n\nกรุณาไปที่หน้าโปรไฟล์บนเว็บไซต์ กด \"เชื่อมต่อ Telegram\" แล้วใช้ลิงก์ใหม่ที่ระบบสร้างให้ครับ")
		return c.SendStatus(200)
	}

	// 🟢 token ที่เราออกให้เป็น base64url 43 ตัวเสมอ อย่างอื่นไม่ต้องไปถาม Redis (กันใส่ key แปลกๆ)
	if !isValidTelegramLinkToken(payload) {
		go sendTelegramText(chatIDStr, "⚠️ ลิงก์เชื่อมต่อไม่ถูกต้อง\n\nกรุณาสร้างลิงก์ใหม่จากหน้าโปรไฟล์บนเว็บไซต์ครับ")
		return c.SendStatus(200)
	}

	val, found, err := database.GetDel(database.KeyTelegramLink(payload))
	if err != nil {
		fmt.Println("❌ [WEBHOOK] อ่าน link token จาก Redis ไม่สำเร็จ:", err)
		go sendTelegramText(chatIDStr, "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งครับ")
		return c.SendStatus(200)
	}
	if !found {
		go sendTelegramText(chatIDStr, "⚠️ ลิงก์เชื่อมต่อหมดอายุหรือถูกใช้ไปแล้ว\n\nกรุณาสร้างลิงก์ใหม่จากหน้าโปรไฟล์บนเว็บไซต์ครับ")
		return c.SendStatus(200)
	}

	userID, err := strconv.ParseUint(strings.Trim(val, "\""), 10, 64)
	if err != nil || userID == 0 {
		fmt.Println("❌ [WEBHOOK] ค่า link token ใน Redis ไม่ถูกต้อง")
		return c.SendStatus(200)
	}

	var user models.User
	if err := database.DB.Select("id").First(&user, uint(userID)).Error; err != nil {
		fmt.Printf("❌ [WEBHOOK] ไม่พบผู้ใช้ %d ที่ผูกกับ link token\n", userID)
		return c.SendStatus(200)
	}

	if err := linkTelegramChat(user.ID, chatIDStr); err != nil {
		go sendTelegramText(chatIDStr, "บันทึกการเชื่อมต่อไม่สำเร็จ กรุณาลองใหม่อีกครั้งครับ")
		return c.SendStatus(200)
	}
	fmt.Printf("✅ [WEBHOOK] ผูก Telegram ให้ user %d สำเร็จ\n", user.ID)

	// ส่งข้อความตอบกลับ
	go sendReplyWithBackButton(chatIDStr)

	return c.SendStatus(200)
}

// sendTelegramText ส่งข้อความธรรมดากลับไปยังแชท (ใช้ตอบกรณีผูกบัญชีไม่สำเร็จ)
func sendTelegramText(chatID string, text string) {
	postTelegramMessage(map[string]interface{}{
		"chat_id": chatID,
		"text":    text,
	})
}

func sendReplyWithBackButton(chatID string) {
	frontendURL := config.GetEnv("FRONTEND_URL", "http://localhost:3000") + "/profile"

	// สร้างโครงสร้างข้อมูลสำหรับปุ่มกด
	postTelegramMessage(map[string]interface{}{
		"chat_id": chatID,
		"text":    "✅ เชื่อมต่อระบบ EVR Alert สำเร็จเรียบร้อยแล้ว!\n\nระบบพร้อมแจ้งเตือนไปยังแชทนี้แล้วครับ คุณสามารถกลับไปที่หน้าเว็บเพื่อใช้งานต่อได้เลย 👇",
		"reply_markup": map[string]interface{}{
			"inline_keyboard": [][]map[string]interface{}{
				{
					{
						"text": "กลับไปหน้าโปรไฟล์",
						"url":  frontendURL,
					},
				},
			},
		},
	})
}

// postTelegramMessage ยิง sendMessage ไปที่ Telegram API (ไม่ log URL เพราะมี bot token อยู่ใน path)
func postTelegramMessage(payload map[string]interface{}) {
	// 🟢 ใช้ GetEnv แทน GetEnvRequired: log.Fatalf ใน goroutine นี้จะฆ่าทั้ง process ถ้าลืมตั้งค่า
	botToken := config.GetEnv("TELEGRAM_BOT_TOKEN", "")
	if botToken == "" {
		fmt.Println("❌ ไม่พบ TELEGRAM_BOT_TOKEN ข้ามการส่งข้อความตอบกลับ")
		return
	}

	apiURL := "https://api.telegram.org/bot" + botToken + "/sendMessage"

	body, _ := json.Marshal(payload)
	resp, err := telegramHTTPClient.Post(apiURL, "application/json", bytes.NewBuffer(body))
	if err != nil {
		fmt.Println("💥 ส่งข้อความตอบกลับ Telegram ไม่สำเร็จ:", redactTelegramErr(err))
		return
	}
	resp.Body.Close()
}
