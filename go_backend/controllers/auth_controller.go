package controllers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"go_backend/database"
	"go_backend/models"
)

// Helper: แลก code เป็น access_token จาก Auth0
func exchangeCodeForToken(code string) (string, error) {
	body := map[string]string{
		"grant_type":    "authorization_code",
		"client_id":     os.Getenv("AUTH0_CLIENT_ID"),
		"client_secret": os.Getenv("AUTH0_CLIENT_SECRET"),
		"code":          code,
		"redirect_uri":  os.Getenv("AUTH0_CALLBACK_URL"),
	}
	jsonBody, _ := json.Marshal(body)

	resp, err := http.Post(
		"https://"+os.Getenv("AUTH0_DOMAIN")+"/oauth/token",
		"application/json",
		bytes.NewBuffer(jsonBody),
	)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	data, _ := io.ReadAll(resp.Body)
	json.Unmarshal(data, &result)

	token, ok := result["id_token"].(string)
	if !ok {
		return "", fmt.Errorf("no id_token in response")
	}
	return token, nil
}

// Helper: ดึงข้อมูล user จาก Auth0
func getUserInfo(accessToken string) (map[string]interface{}, error) {
	req, _ := http.NewRequest("GET", "https://"+os.Getenv("AUTH0_DOMAIN")+"/userinfo", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var userInfo map[string]interface{}
	data, _ := io.ReadAll(resp.Body)
	json.Unmarshal(data, &userInfo)
	return userInfo, nil
}

// Helper: สร้าง JWT Token ของเราเอง
func createJWT(email string, name string) (string, error) {
	claims := jwt.MapClaims{
		"email": email,
		"name":  name,
		"exp":   time.Now().Add(24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(os.Getenv("JWT_SECRET")))
}

// ---------------- Handlers ----------------

// Login API
func Login(c *fiber.Ctx) error {
    // 1. สร้าง URL โดยดึงค่าจาก .env และเติม &prompt=login เข้าไปท้ายสุด
    auth0URL := fmt.Sprintf(
        "https://%s/authorize?response_type=code&client_id=%s&redirect_uri=%s&scope=openid profile email&prompt=login",
        os.Getenv("AUTH0_DOMAIN"),
        os.Getenv("AUTH0_CLIENT_ID"),
        os.Getenv("AUTH0_CALLBACK_URL"),
    )

    // 2. สั่ง Redirect ไปที่ URL นั้นตัวเดียวเลย (Status 302 คือ Found/Temporary Redirect)
    return c.Redirect(auth0URL, 302)
}

// Callback API (จุดที่ Auth0 จะส่งกลับมาหลัง Login/Register สำเร็จ)
func Callback(c *fiber.Ctx) error {

	authError := c.Query("error")
	if authError != "" {
		// ถ้ามี Error (เช่น access_denied) ให้ Redirect กลับไปหน้าเว็บ React
		// พร้อมแนบข้อความเตือนไปที่ URL เผื่อให้ React เอาไปโชว์ต่อได้
		return c.Redirect("http://localhost:3000/?error=access_denied", 302)
	}

	// 🚨 2. ดึงค่า Code และเช็คความว่างเปล่า (เผื่อคนพิมพ์เข้า URL นี้ตรงๆ)
	code := c.Query("code")
	if code == "" {
		return c.Redirect("http://localhost:3000/?error=no_code", 302)
	}

	idToken, err := exchangeCodeForToken(code)
	if err != nil {
		return c.Status(500).SendString("Failed to exchange token")
	}

	userInfo, err := getUserInfo(idToken)
	if err != nil {
		return c.Status(500).SendString("Failed to get user info")
	}

	email := fmt.Sprintf("%v", userInfo["email"])
	name := fmt.Sprintf("%v", userInfo["name"])

	var user models.User
	result := database.DB.Where("email = ?", email).First(&user)

	if result.Error != nil {
		// สมาชิกใหม่: บันทึกลง DB และให้ Verified เป็น true ทันทีเพื่อทดสอบ
		user = models.User{
			Email:      email,
			Name:       name,
			IsVerified: true, 
		}
		database.DB.Create(&user)
	}

	// สร้าง JWT โดยใช้ฟังก์ชัน createJWT (เช็คชื่อให้ตรงกัน)
	jwtToken, err := createJWT(user.Email, user.Name)
	if err != nil {
		return c.Status(500).SendString("Could not generate token")
	}

	c.Cookie(&fiber.Cookie{
		Name:     "token",
		Value:    jwtToken,
		Expires:  time.Now().Add(24 * time.Hour),
		HTTPOnly: true,
		SameSite: "Lax",
	})

	return c.Redirect("http://localhost:3000/dashboard")
}

func Logout(c *fiber.Ctx) error {
	// 1. สั่งล้างคุกกี้ชื่อ "token" (หรือชื่ออื่นๆ ที่ผู้กองใช้ตอน Login)
	c.Cookie(&fiber.Cookie{
		Name:     "token",
		Value:    "",
		Expires:  time.Now().Add(-time.Hour), // สั่งให้หมดอายุย้อนหลัง (เบราว์เซอร์จะลบทิ้งทันที)
		HTTPOnly: true,
	})

	// 2. ส่งข้อความกลับไปบอกหน้าเว็บว่าเคลียร์เรียบร้อยแล้ว
	return c.JSON(fiber.Map{
		"message": "ออกจากระบบสำเร็จ",
	})
}

func GetProfile(c *fiber.Ctx) error {
    // 1. ดึงค่าจาก Cookie ที่ชื่อว่า "token"
    tokenString := c.Cookies("token")

	fmt.Println("🔍 ตรวจสอบ Cookie: ", tokenString)

    // 2. ถ้าไม่มี Cookie แปลว่าไม่ได้ล็อกอินมา
    if tokenString == "" {
        return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
            "message": "กรุณาล็อกอินก่อน (ไม่มี Token)",
        })
    }

    // 3. (Optional) ตรวจสอบความถูกต้องของ JWT ตรงนี้
    // แต่ในช่วงทดสอบ คุณสามารถข้ามไปคืนค่า User เลยก็ได้ครับ

    return c.JSON(fiber.Map{
        "status": "success",
        "email":  "user@example.com", // ในอนาคตต้องดึงจาก Token จริง
        "name":   "Suphakit",
    })
}

// 1. สร้าง Struct สำหรับรับข้อมูลจาก Next.js
type GoogleLoginInput struct {
	Email string `json:"email"`
	Name  string `json:"name"`
	Profile string `json:"profile"` // 🟢 เพิ่มฟิลด์นี้เพื่อรับ URL รูปภาพโปรไฟล์จาก Next.js
}

// 2. ฟังก์ชันจัดการการล็อกอินผ่าน Google
func GoogleLogin(c *fiber.Ctx) error {
	input := new(GoogleLoginInput)

	// ดึงข้อมูลที่ Next.js ส่งมา
	if err := c.BodyParser(input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}

	fmt.Println("รับรูปมาจาก Next.js:", input.Profile)

	var user models.User // เปลี่ยน models.User ตามชื่อ Struct Database ของคุณ

	// ค้นหาว่ามี User คนนี้ในระบบหรือยัง?
	result := database.DB.Where("email = ?", input.Email).First(&user) // เปลี่ยน db.DB ตามตัวแปร GORM ของคุณ

	if result.Error != nil {
		// ถ้าไม่เจอ (Error Record Not Found) แปลว่าเป็นคนใหม่ ให้สร้าง User ใหม่เลย!
		user = models.User{
			Name:  input.Name,
			Email: input.Email,
			Profile: input.Profile, // 🟢 ใส่ URL รูปภาพโปรไฟล์ที่ได้รับจาก Next.js ลงไปใน Database ด้วย
			// หมายเหตุ: กรณีล็อกอินผ่าน Google เราจะไม่มีรหัสผ่าน (Password)
			// คุณอาจจะปล่อยว่างไว้ หรือเก็บค่าสุ่มยาวๆ ไว้เพื่อความปลอดภัยก็ได้ครับ
		}

		// บันทึกลง Database
		if err := database.DB.Create(&user).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ไม่สามารถสร้างบัญชีได้"})
		}
	} else {
		fmt.Println("กำลังจะอัปเดตรูปให้ email:", user.Email, "ด้วย URL:", input.Profile)

		// 🟢 2. ท่าไม้ตาย บังคับอัปเดตเฉพาะคอลัมน์ profile อย่างเดียว (UpdateColumn จะทะลวงผ่านกฎทุกอย่าง)
		err := database.DB.Model(&user).UpdateColumn("profile", input.Profile).Error
		
		// 🟢 3. ดักฟัง Error จาก Database
		if err != nil {
			fmt.Println("❌ เซฟรูปลง Database ไม่สำเร็จ เกิดข้อผิดพลาด:", err)
		} else {
			fmt.Println("✅ เซฟรูปลง Database สำเร็จร้อยเปอร์เซ็นต์!")
		}
	}

	// ---------------------------------------------------------
	// 🟢 ส่วนสำคัญ: สร้าง JWT Token ให้เหมือนกับการ Login ปกติ
	// ---------------------------------------------------------
	token := jwt.New(jwt.SigningMethodHS256)
	claims := token.Claims.(jwt.MapClaims)
	claims["user_id"] = user.ID
	claims["exp"] = time.Now().Add(time.Hour * 24).Unix() // Token หมดอายุใน 24 ชั่วโมง

	// เซ็น Token ด้วยรหัสลับของคุณ (แก้ "secret" ให้ตรงกับที่คุณใช้ในฟังก์ชัน Login เดิม)
	t, err := token.SignedString([]byte("secret"))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ไม่สามารถสร้าง Token ได้"})
	}

	// สร้าง Cookie ชื่อ "token" เพื่อให้ Middleware ของ Next.js เอาไปใช้งาน
	c.Cookie(&fiber.Cookie{
		Name:     "token",
		Value:    t,
		Expires:  time.Now().Add(time.Hour * 24),
		HTTPOnly: true, // ป้องกันการถูกขโมยด้วย JavaScript
		// Secure: true, // (เปิดใช้ตอนขึ้นเซิร์ฟเวอร์จริงที่มี https)
		SameSite: "Lax",
	})

	// ส่งข้อมูลกลับไปบอก Next.js ว่าเรียบร้อย!
	return c.JSON(fiber.Map{
		"message": "ล็อกอินสำเร็จ",
		"user":    user,
	})
}
