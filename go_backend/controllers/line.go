package controllers

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/gofiber/fiber/v2"
	"go_backend/config"
	"go_backend/database"
	"go_backend/models"
)

// โครงสร้างสำหรับรับข้อมูลที่ Next.js ส่งมาให้
type LinkLineRequest struct {
	Code  string `json:"code"`
	Email string `json:"email"`
}
type UnlinkLineRequest struct {
	Email string `json:"email"`
}

func LinkLineAccount(c *fiber.Ctx) error {
	req := new(LinkLineRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "รูปแบบข้อมูลไม่ถูกต้อง"})
	}

	// 1. เตรียมข้อมูลไปขอ Access Token จาก LINE
	clientID := config.GetEnvRequired("LINE_LOGIN_CHANNEL_ID")
	clientSecret := config.GetEnvRequired("LINE_LOGIN_CHANNEL_SECRET")
	redirectURI := config.GetEnvRequired("LINE_LOGIN_CALLBACK_URL") // http://localhost:3000/line-callback

	tokenURL := "https://api.line.me/oauth2/v2.1/token"
	data := url.Values{}
	data.Set("grant_type", "authorization_code")
	data.Set("code", req.Code)
	data.Set("redirect_uri", redirectURI)
	data.Set("client_id", clientID)
	data.Set("client_secret", clientSecret)

	// ยิง API ไปหา LINE เพื่อแลก Token
	client := &http.Client{}
	r, _ := http.NewRequest("POST", tokenURL, strings.NewReader(data.Encode()))
	r.Header.Add("Content-Type", "application/x-www-form-urlencoded")

	resp, err := client.Do(r)
	if err != nil || resp.StatusCode != 200 {
		return c.Status(500).JSON(fiber.Map{"error": "แลกเปลี่ยนรหัสกับ LINE ไม่สำเร็จ (Code อาจจะหมดอายุ)"})
	}
	defer resp.Body.Close()

	// อ่านค่า Access Token ที่ LINE ส่งมา
	body, _ := io.ReadAll(resp.Body)
	var tokenResp map[string]interface{}
	json.Unmarshal(body, &tokenResp)
	accessToken := tokenResp["access_token"].(string)

	// 2. นำ Access Token ไปขอดูข้อมูลโปรไฟล์ (เพื่อดึง line_user_id)
	profileURL := "https://api.line.me/v2/profile"
	rProfile, _ := http.NewRequest("GET", profileURL, nil)
	rProfile.Header.Add("Authorization", "Bearer "+accessToken)

	respProfile, err := client.Do(rProfile)
	if err != nil || respProfile.StatusCode != 200 {
		return c.Status(500).JSON(fiber.Map{"error": "ดึงข้อมูลโปรไฟล์จาก LINE ไม่สำเร็จ"})
	}
	defer respProfile.Body.Close()

	bodyProfile, _ := io.ReadAll(respProfile.Body)
	var profileResp map[string]interface{}
	json.Unmarshal(bodyProfile, &profileResp)
	
	// พระเอกของเราอยู่ตรงนี้ครับ! ไอดีที่ขึ้นต้นด้วย U
	lineUserID := profileResp["userId"].(string) 

	// 3. บันทึกลงฐานข้อมูล PostgreSQL
	// ค้นหาผู้ใช้งานจาก Email
	var user models.User
	if err := database.DB.Where("email = ?", req.Email).First(&user).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบผู้ใช้งานนี้ในระบบฐานข้อมูล"})
	}

	// เช็กว่าเคยผูกไปหรือยัง? ถ้าเคยแล้วให้อัปเดต ถ้ายังให้สร้างตารางจับคู่ใหม่
	var mapping models.UserLineMapping
	result := database.DB.Where("user_id = ?", user.ID).First(&mapping)
	
	if result.Error != nil {
		// สร้างข้อมูลใหม่
		mapping = models.UserLineMapping{
			UserID:     user.ID,
			LineUserID: lineUserID,
		}
		database.DB.Create(&mapping)
	} else {
		// อัปเดตข้อมูลเดิม (เผื่อผู้ใช้เปลี่ยนบัญชี LINE)
		mapping.LineUserID = lineUserID
		database.DB.Save(&mapping)
	}

	database.DB.Model(&user).Update("is_linked_line", true)

	return c.JSON(fiber.Map{
		"message": "ผูกบัญชี LINE สำเร็จ!",
		"line_user_id": lineUserID,
	})
}

func UnlinkLineAccount(c *fiber.Ctx) error {
	req := new(UnlinkLineRequest)
	if err := c.BodyParser(req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "รูปแบบข้อมูลไม่ถูกต้อง"})
	}

	// 1. ค้นหาผู้ใช้งานจากอีเมลก่อนเพื่อเอา User ID
	var user models.User
	if err := database.DB.Where("email = ?", req.Email).First(&user).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบผู้ใช้งานในระบบ"})
	}

	// 2. สั่งลบข้อมูลการผูกบัญชี LINE ของ User คนนี้ออกจากตาราง mapping
	// GORM จะอ้างอิงตาม user_id แล้วทำลายทิ้งทันที
	err := database.DB.Where("user_id = ?", user.ID).Delete(&models.UserLineMapping{}).Error
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "ไม่สามารถลบข้อมูลการผูกบัญชีได้"})
	}
	database.DB.Model(&user).Update("is_linked_line", false)
	return c.JSON(fiber.Map{
		"message": "ยกเลิกการเชื่อมต่อ LINE สำเร็จเรียบร้อยแล้ว",
	})
}
