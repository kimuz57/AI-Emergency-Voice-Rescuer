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
	redirectURL := fmt.Sprintf(
		"https://%s/authorize?response_type=code&client_id=%s&redirect_uri=%s&scope=openid profile email",
		os.Getenv("AUTH0_DOMAIN"),
		os.Getenv("AUTH0_CLIENT_ID"),
		os.Getenv("AUTH0_CALLBACK_URL"),
	)
	return c.Redirect(redirectURL)
}

// Callback API (จุดที่ Auth0 จะส่งกลับมาหลัง Login/Register สำเร็จ)
func Callback(c *fiber.Ctx) error {
	code := c.Query("code")
	if code == "" {
		return c.Status(400).SendString("No code provided")
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

// Logout API
func Logout(c *fiber.Ctx) error {
	c.ClearCookie("token")
	logoutURL := fmt.Sprintf(
		"https://%s/v2/logout?client_id=%s&returnTo=http://localhost:3000",
		os.Getenv("AUTH0_DOMAIN"),
		os.Getenv("AUTH0_CLIENT_ID"),
	)
	return c.Redirect(logoutURL)
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