package controllers

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
	"fmt"
	"github.com/gofiber/fiber/v2"
	"go_backend/config"
	"go_backend/database"
	"go_backend/middleware"
	"go_backend/models"
)

// โครงสร้างสำหรับรับข้อมูลที่ Next.js ส่งมาให้
// 🟢 Email ไม่บังคับ: ผู้ใช้ระบุจาก token (email ของคนอื่นใช้ได้เฉพาะ admin)
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

	// 🟢 ระบุผู้ใช้จาก token ก่อนไปแลก code กับ LINE (ไม่เชื่อ email จาก body)
	user, err := middleware.ResolveTargetUser(c, req.Email)
	if err != nil {
		return middleware.IdentityError(c, err)
	}

	// 1. เตรียมข้อมูลไปขอ Access Token จาก LINE
	// 🟢 ใช้ GetEnv แทน GetEnvRequired: log.Fatalf ระหว่างรับ request จะฆ่าทั้ง process ถ้าลืมตั้งค่า
	clientID := config.GetEnv("LINE_LOGIN_CHANNEL_ID", "")
	clientSecret := config.GetEnv("LINE_LOGIN_CHANNEL_SECRET", "")
	redirectURI := config.GetEnv("LINE_LOGIN_CALLBACK_URL", "") // http://localhost:3000/line-callback
	if clientID == "" || clientSecret == "" || redirectURI == "" {
		fmt.Println("🚨 ยังไม่ได้ตั้งค่า LINE_LOGIN_CHANNEL_ID / LINE_LOGIN_CHANNEL_SECRET / LINE_LOGIN_CALLBACK_URL")
		return c.Status(500).JSON(fiber.Map{"error": "ระบบยังไม่ได้ตั้งค่าการเชื่อมต่อ LINE"})
	}

	tokenURL := "https://api.line.me/oauth2/v2.1/token"
	data := url.Values{}
	data.Set("grant_type", "authorization_code")
	data.Set("code", req.Code)
	data.Set("redirect_uri", redirectURI)
	data.Set("client_id", clientID)
	data.Set("client_secret", clientSecret)

	// ยิง API ไปหา LINE เพื่อแลก Token
	client := &http.Client{Timeout: 10 * time.Second} // 🟢 กัน request ค้างถ้า LINE ไม่ตอบ
	r, err := http.NewRequest("POST", tokenURL, strings.NewReader(data.Encode()))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "การเชื่อมต่อขัดข้อง"})
	}
	r.Header.Add("Content-Type", "application/x-www-form-urlencoded")

	resp, err := client.Do(r)
	if err != nil {
		fmt.Println("❌ Request failed:", err)
		return c.Status(500).JSON(fiber.Map{"error": "การเชื่อมต่อขัดข้อง"})
	}
	defer resp.Body.Close()

	// 🟢 ถ้า StatusCode ไม่ใช่ 200 ให้ปริ้นต์สิ่งที่ LINE ตอบกลับมาออกมาดู!
	if resp.StatusCode != 200 {
		errorBody, _ := io.ReadAll(resp.Body)
		fmt.Println("🚨 LINE ตอบกลับ Error มาว่า:", string(errorBody)) // << สำคัญมาก!
		return c.Status(500).JSON(fiber.Map{"error": "แลกเปลี่ยนรหัสกับ LINE ไม่สำเร็จ (Code อาจจะหมดอายุ)"})
	}

	// อ่านค่า Access Token ที่ LINE ส่งมา
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "อ่านข้อมูลจาก LINE ไม่สำเร็จ"})
	}
	var tokenResp map[string]interface{}
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		fmt.Println("🚨 แปลง token response จาก LINE ไม่สำเร็จ:", err)
		return c.Status(500).JSON(fiber.Map{"error": "ข้อมูลตอบกลับจาก LINE ไม่ถูกต้อง"})
	}
	// 🟢 เช็ค type assertion ก่อนใช้ ไม่งั้น panic ถ้า LINE ไม่ส่ง access_token มา
	accessToken, ok := tokenResp["access_token"].(string)
	if !ok || accessToken == "" {
		fmt.Println("🚨 LINE ไม่ได้ส่ง access_token มา")
		return c.Status(500).JSON(fiber.Map{"error": "ไม่ได้รับ Access Token จาก LINE"})
	}

	// 2. นำ Access Token ไปขอดูข้อมูลโปรไฟล์ (เพื่อดึง line_user_id)
	profileURL := "https://api.line.me/v2/profile"
	rProfile, err := http.NewRequest("GET", profileURL, nil)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "การเชื่อมต่อขัดข้อง"})
	}
	rProfile.Header.Add("Authorization", "Bearer "+accessToken)

	respProfile, err := client.Do(rProfile)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "ดึงข้อมูลโปรไฟล์จาก LINE ไม่สำเร็จ"})
	}
	defer respProfile.Body.Close()
	if respProfile.StatusCode != 200 {
		return c.Status(500).JSON(fiber.Map{"error": "ดึงข้อมูลโปรไฟล์จาก LINE ไม่สำเร็จ"})
	}

	bodyProfile, err := io.ReadAll(respProfile.Body)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "อ่านข้อมูลโปรไฟล์จาก LINE ไม่สำเร็จ"})
	}
	var profileResp map[string]interface{}
	if err := json.Unmarshal(bodyProfile, &profileResp); err != nil {
		fmt.Println("🚨 แปลง profile response จาก LINE ไม่สำเร็จ:", err)
		return c.Status(500).JSON(fiber.Map{"error": "ข้อมูลโปรไฟล์จาก LINE ไม่ถูกต้อง"})
	}

	// พระเอกของเราอยู่ตรงนี้ครับ! ไอดีที่ขึ้นต้นด้วย U
	lineUserID, ok := profileResp["userId"].(string)

	if !ok {
    	fmt.Println("🚨 LINE profile response ไม่มี userId")
    	return c.Status(500).JSON(fiber.Map{
        	"error": "ไม่พบ LINE userId",
    	})
	}
	// 3. บันทึกลงฐานข้อมูล PostgreSQL (user ระบุจาก token ไว้แล้วด้านบน)
	// เช็กว่าเคยผูกไปหรือยัง? ถ้าเคยแล้วให้อัปเดต ถ้ายังให้สร้างตารางจับคู่ใหม่
	var mapping models.UserLineMapping
	result := database.DB.Where("user_id = ?", user.ID).First(&mapping)
	
	if result.Error != nil {
		// สร้างข้อมูลใหม่
		mapping = models.UserLineMapping{
			UserID:     user.ID,
			LineUserID: lineUserID,
		}
		if err := database.DB.Create(&mapping).Error; err != nil {
			// 🟢 เช่น line_user_id ชน unique index เพราะบัญชี LINE นี้ผูกกับผู้ใช้อื่นอยู่แล้ว
			fmt.Println("❌ บันทึก LINE mapping ไม่สำเร็จ:", err)
			return c.Status(500).JSON(fiber.Map{"error": "บันทึกการผูกบัญชี LINE ไม่สำเร็จ (บัญชี LINE นี้อาจผูกกับผู้ใช้อื่นอยู่แล้ว)"})
		}
	} else {
		// อัปเดตข้อมูลเดิม (เผื่อผู้ใช้เปลี่ยนบัญชี LINE)
		mapping.LineUserID = lineUserID
		if err := database.DB.Save(&mapping).Error; err != nil {
			fmt.Println("❌ อัปเดต LINE mapping ไม่สำเร็จ:", err)
			return c.Status(500).JSON(fiber.Map{"error": "บันทึกการผูกบัญชี LINE ไม่สำเร็จ (บัญชี LINE นี้อาจผูกกับผู้ใช้อื่นอยู่แล้ว)"})
		}
	}

	if err := database.DB.Model(user).Update("is_linked_line", true).Error; err != nil {
		fmt.Println("❌ อัปเดตสถานะ is_linked_line ไม่สำเร็จ:", err)
		return c.Status(500).JSON(fiber.Map{"error": "อัปเดตสถานะการผูกบัญชี LINE ไม่สำเร็จ"})
	}

	return c.JSON(fiber.Map{
		"message": "ผูกบัญชี LINE สำเร็จ!",
		"line_user_id": lineUserID,
	})
}

func UnlinkLineAccount(c *fiber.Ctx) error {
	req := new(UnlinkLineRequest)
	// 🟢 DELETE อาจไม่มี body เลย (ใช้ผู้ใช้จาก token)
	if err := parseOptionalBody(c, req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "รูปแบบข้อมูลไม่ถูกต้อง"})
	}
	if req.Email == "" {
		req.Email = c.Query("email")
	}

	// 1. ระบุผู้ใช้จาก token (email ของคนอื่นใช้ได้เฉพาะ admin)
	user, err := middleware.ResolveTargetUser(c, req.Email)
	if err != nil {
		return middleware.IdentityError(c, err)
	}

	// 2. สั่งลบข้อมูลการผูกบัญชี LINE ของ User คนนี้ออกจากตาราง mapping
	// GORM จะอ้างอิงตาม user_id แล้วทำลายทิ้งทันที
	if err := database.DB.Where("user_id = ?", user.ID).Delete(&models.UserLineMapping{}).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "ไม่สามารถลบข้อมูลการผูกบัญชีได้"})
	}
	database.DB.Model(user).Update("is_linked_line", false)
	return c.JSON(fiber.Map{
		"message": "ยกเลิกการเชื่อมต่อ LINE สำเร็จเรียบร้อยแล้ว",
	})
}
