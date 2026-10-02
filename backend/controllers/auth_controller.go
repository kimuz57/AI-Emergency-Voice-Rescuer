package controllers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"go_backend/config"
	"go_backend/database"
	"go_backend/models"
	"go_backend/utils"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// ==========================================
// 🛠️ Helpers สำหรับจัดการรหัสผ่าน (Hashing)
// ==========================================
func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 14)
	return string(bytes), err
}

func CheckPasswordHash(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

// dummyPasswordHash ใช้เทียบรหัสผ่านแทนตอนไม่พบอีเมล / บัญชีไม่มีรหัสผ่าน
// เพื่อให้เวลาตอบใกล้เคียงกับกรณีรหัสผิด (กัน user enumeration ด้วยการจับเวลา — S20)
var (
	dummyHashOnce sync.Once
	dummyHash     string
)

func dummyPasswordHash() string {
	dummyHashOnce.Do(func() {
		h, err := bcrypt.GenerateFromPassword([]byte("evr-dummy-password-for-timing"), 14)
		if err == nil {
			dummyHash = string(h)
		}
	})
	return dummyHash
}

// ข้อความกลางสำหรับ login ไม่สำเร็จ (ไม่บอกว่าอีเมลไม่มี หรือรหัสผิด — S20)
const msgInvalidCredentials = "อีเมลหรือรหัสผ่านไม่ถูกต้อง"

// ข้อความสำหรับบัญชีที่ถูก admin ลบ (soft delete) แล้วมีคนพยายามใช้อีเมลเดิม (B26)
const msgAccountDisabled = "บัญชีนี้ถูกปิดใช้งานแล้ว กรุณาติดต่อผู้ดูแลระบบ"

// findUserByEmailIncludingDeleted ค้นหา user ด้วยอีเมล "รวมแถวที่ถูก soft delete"
// เพราะ unique index ของ email ไม่สนใจ deleted_at — ถ้าใช้ First() ปกติจะมองไม่เห็นแถวนั้น
// แล้วไป Create ซ้ำจนได้ 500 (B26)
//
// เลือก "ไม่กู้คืน" บัญชีที่ถูกลบอัตโนมัติ: การลบเป็นการตัดสินใจของ admin (AdminDeleteUser)
// ถ้าให้สมัคร/ล็อกอิน Google แล้วกู้คืนเอง ผู้ใช้ที่ถูกถอดสิทธิ์จะกลับเข้ามาได้เองพร้อมข้อมูลเดิม
// จึงตอบ 409 ให้ติดต่อ admin แทน
func findUserByEmailIncludingDeleted(email string) (*models.User, error) {
	var user models.User
	if err := database.DB.Unscoped().Where("email = ?", email).First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

// ==========================================
// 🔒 ตรวจสอบ Google ID token (S7)
// ==========================================

// googleTokenInfoURL / googleHTTPClient เป็นตัวแปรเพื่อให้ test ชี้ไปที่ httptest server ได้
var (
	googleTokenInfoURL = "https://oauth2.googleapis.com/tokeninfo"
	googleHTTPClient   = &http.Client{Timeout: 10 * time.Second}
)

var (
	errGoogleTokenInvalid       = errors.New("invalid google id token")
	errGoogleUnavailable        = errors.New("google tokeninfo unavailable")
	errGoogleLoginNotConfigured = errors.New("GOOGLE_CLIENT_ID is not set")
)

// googleTokenInfo คือ response ของ tokeninfo endpoint (Google ส่งทุกค่าเป็น string)
type googleTokenInfo struct {
	Aud           string `json:"aud"`
	Iss           string `json:"iss"`
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified string `json:"email_verified"`
	Exp           string `json:"exp"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
}

// validateGoogleTokenInfo ตรวจ claim ของ ID token (pure function — ไม่มี I/O)
//   - aud ต้องเท่ากับ GOOGLE_CLIENT_ID ของเรา (กัน token ที่ออกให้แอปอื่น)
//   - iss ต้องเป็น accounts.google.com
//   - email_verified ต้องเป็น "true"
//   - exp ต้องยังไม่หมดอายุ
func validateGoogleTokenInfo(info googleTokenInfo, clientID string, now time.Time) error {
	if clientID == "" {
		return errGoogleLoginNotConfigured
	}
	if info.Aud != clientID {
		return fmt.Errorf("%w: aud mismatch", errGoogleTokenInvalid)
	}
	if info.Iss != "accounts.google.com" && info.Iss != "https://accounts.google.com" {
		return fmt.Errorf("%w: unexpected issuer", errGoogleTokenInvalid)
	}
	if info.EmailVerified != "true" {
		return fmt.Errorf("%w: email not verified", errGoogleTokenInvalid)
	}
	if strings.TrimSpace(info.Email) == "" {
		return fmt.Errorf("%w: missing email", errGoogleTokenInvalid)
	}
	exp, err := strconv.ParseInt(info.Exp, 10, 64)
	if err != nil {
		return fmt.Errorf("%w: invalid exp", errGoogleTokenInvalid)
	}
	if now.Unix() >= exp {
		return fmt.Errorf("%w: token expired", errGoogleTokenInvalid)
	}
	return nil
}

// fetchGoogleTokenInfo ถาม Google ว่า ID token นี้ถูกต้องไหม
// 🔒 ห้าม log URL / error ของ http client ตรงๆ เพราะมี id_token อยู่ใน query string
func fetchGoogleTokenInfo(ctx context.Context, idToken string) (*googleTokenInfo, error) {
	reqURL := googleTokenInfoURL + "?id_token=" + url.QueryEscape(idToken)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, errGoogleUnavailable
	}

	resp, err := googleHTTPClient.Do(req)
	if err != nil {
		return nil, errGoogleUnavailable
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 500 {
		return nil, errGoogleUnavailable
	}
	if resp.StatusCode != http.StatusOK {
		// Google ตอบ 400 เมื่อ token ปลอม / หมดอายุ / รูปแบบผิด
		return nil, fmt.Errorf("%w: tokeninfo status %d", errGoogleTokenInvalid, resp.StatusCode)
	}

	var info googleTokenInfo
	if err := json.NewDecoder(io.LimitReader(resp.Body, 64<<10)).Decode(&info); err != nil {
		return nil, fmt.Errorf("%w: cannot decode tokeninfo", errGoogleTokenInvalid)
	}
	return &info, nil
}

// verifyGoogleIDToken = fetch + validate คืนข้อมูลที่ "Google ยืนยันแล้ว" เท่านั้น
func verifyGoogleIDToken(ctx context.Context, idToken, clientID string) (*googleTokenInfo, error) {
	if clientID == "" {
		return nil, errGoogleLoginNotConfigured
	}
	info, err := fetchGoogleTokenInfo(ctx, idToken)
	if err != nil {
		return nil, err
	}
	if err := validateGoogleTokenInfo(*info, clientID, time.Now()); err != nil {
		return nil, err
	}
	return info, nil
}

// ==========================================
// 1. โครงสร้างสำหรับรับข้อมูลการล็อกอินจาก Next.js
// ==========================================
// 🔒 ใช้แค่ IDToken — email/name/profile ใน body ไม่ถูกเชื่อ (ใช้ค่าจาก token ที่ Google ยืนยันแล้วแทน)
type GoogleLoginInput struct {
	IDToken string `json:"id_token"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Profile string `json:"profile"`
}

// ==========================================
// 2. ฟังก์ชันจัดการการล็อกอินผ่าน Google (หลัก)
// ==========================================
func GoogleLogin(c *fiber.Ctx) error {
	input := new(GoogleLoginInput)

	if err := c.BodyParser(input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}

	clientID := config.GetEnv("GOOGLE_CLIENT_ID", "")
	if clientID == "" {
		log.Println("❌ GoogleLogin: GOOGLE_CLIENT_ID ไม่ได้ตั้งค่า")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Google login not configured"})
	}

	idToken := strings.TrimSpace(input.IDToken)
	if idToken == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ไม่พบ Google ID token (id_token)"})
	}

	info, err := verifyGoogleIDToken(c.UserContext(), idToken, clientID)
	if err != nil {
		if errors.Is(err, errGoogleUnavailable) {
			log.Println("⚠️ GoogleLogin: ติดต่อ Google tokeninfo ไม่สำเร็จ")
			return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "ไม่สามารถตรวจสอบกับ Google ได้ กรุณาลองใหม่อีกครั้ง"})
		}
		// err ไม่มี token/อีเมลอยู่ข้างใน log ได้
		log.Println("⚠️ GoogleLogin: Google ID token ไม่ผ่านการตรวจสอบ:", err)
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Google token ไม่ถูกต้องหรือหมดอายุ"})
	}

	email := strings.TrimSpace(info.Email)

	existing, err := findUserByEmailIncludingDeleted(email)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ไม่สามารถตรวจสอบบัญชีได้"})
	}

	var user models.User
	if existing == nil {
		user = models.User{
			Name:       info.Name,
			Email:      email,
			Profile:    info.Picture,
			IsVerified: true, // 🟢 ล็อกอินผ่าน Google (email_verified=true) ถือว่ายืนยันอีเมลแล้ว
		}

		if err := database.DB.Create(&user).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ไม่สามารถสร้างบัญชีได้"})
		}
	} else {
		if existing.DeletedAt.Valid {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": msgAccountDisabled})
		}
		user = *existing

		updates := map[string]interface{}{}
		if info.Picture != "" {
			updates["profile"] = info.Picture
		}
		// 🔒 บัญชีที่สมัครด้วยอีเมล/รหัสผ่านแต่ยังไม่ยืนยันอีเมล: รหัสผ่านนั้นอาจถูกคนอื่นตั้งไว้ล่วงหน้า
		// (สมัครด้วยอีเมลของเหยื่อ) เมื่อเจ้าของอีเมลตัวจริงพิสูจน์ผ่าน Google แล้ว จึงล้างรหัสผ่านเดิมทิ้ง
		// ก่อนตั้ง is_verified = true — ถ้าต้องการรหัสผ่านให้ใช้ "ลืมรหัสผ่าน"
		if !user.IsVerified {
			updates["is_verified"] = true
			updates["verification_token"] = ""
			updates["password"] = ""
		}
		if len(updates) > 0 {
			if err := database.DB.Model(&user).Updates(updates).Error; err != nil {
				fmt.Println("❌ อัปเดตข้อมูลบัญชี Google ลง Database ไม่สำเร็จ เกิดข้อผิดพลาด:", err)
			}
		}
	}

	tokenString, err := utils.GenerateToken(user.ID, user.Email)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ไม่สามารถสร้าง Token ได้"})
	}

	//isLocal := config.GetEnv("APP_ENV", "development") == "development"
	c.Cookie(&fiber.Cookie{
		Name:     "token",
		Value:    tokenString,
		Expires:  time.Now().Add(time.Hour * 72),
		Path:     "/",
		HTTPOnly: true,
		SameSite: "None",
		Secure:   true, // 🟢 ปรับเป็น false สำหรับ localhost (ไม่ใช่ HTTPS) แต่ถ้าเป็น Production ให้ตั้งเป็น true
	})

	return c.JSON(fiber.Map{
		"message": "ล็อกอินสำเร็จ",
		"user":    user,
		"token":   tokenString,
	})
}

// ==========================================
// 3. ฟังก์ชันสำหรับออกจากระบบ (Logout)
// ==========================================
func Logout(c *fiber.Ctx) error {
	c.Cookie(&fiber.Cookie{
		Name:     "token",
		Value:    "",
		Path:     "/", // 🌟 [จุดสำคัญที่เติมเข้าไป] ต้องระบุ Path ให้ตรงกับตอนสร้าง
		MaxAge:   -1,  // 🌟 ใช้ MaxAge -1 ชัวร์กว่า Expires ในการสั่งลบทันที
		HTTPOnly: true,
		SameSite: "Lax", // ใช้ตามของเดิมคุณได้เลย
		Secure:   true, // ⚠️ โหมด Local ใช้ false (ถ้าเอาขึ้น Server จริงที่มี HTTPS ค่อยเปลี่ยนเป็น true)
	})

	return c.JSON(fiber.Map{
		"message": "ออกจากระบบสำเร็จและล้างคุกกี้เรียบร้อย",
	})
}

// ==========================================
// 5. สมัครสมาชิก (ด้วย Email/Password ปกติ)
// ==========================================
func Register(c *fiber.Ctx) error {
	var input struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}

	input.Email = strings.TrimSpace(input.Email)
	if input.Email == "" || !strings.Contains(input.Email, "@") {
		return c.Status(400).JSON(fiber.Map{"error": "อีเมลไม่ถูกต้อง"})
	}

	if input.Password == "" {
		return c.Status(400).JSON(fiber.Map{"error": "กรุณากรอกรหัสผ่าน"})
	}
	if len(input.Password) < 6 {
		return c.Status(400).JSON(fiber.Map{"error": "รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร"})
	}

	existingUser, err := findUserByEmailIncludingDeleted(input.Email)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return c.Status(500).JSON(fiber.Map{"error": "ไม่สามารถตรวจสอบอีเมลได้"})
	}

	if existingUser != nil {
		// B26: บัญชีถูก admin ลบ (soft delete) — ไม่กู้คืนเอง
		if existingUser.DeletedAt.Valid {
			return c.Status(409).JSON(fiber.Map{"error": msgAccountDisabled})
		}

		// เจออีเมลในระบบแล้ว
		if existingUser.Password != "" {
			return c.Status(400).JSON(fiber.Map{"error": "อีเมลนี้มีในระบบแล้ว กรุณาเข้าสู่ระบบ"})
		}

		// 🔒 S9: Password ว่าง = บัญชีที่สร้างผ่าน Google
		// ห้ามตั้งรหัสผ่านให้ตรงนี้ (ไม่มีการพิสูจน์ว่าเป็นเจ้าของอีเมล) ให้ล็อกอินด้วย Google หรือใช้ลืมรหัสผ่าน
		return c.Status(409).JSON(fiber.Map{
			"error": "อีเมลนี้ผูกกับบัญชี Google อยู่แล้ว กรุณาเข้าสู่ระบบด้วย Google หรือใช้ \"ลืมรหัสผ่าน\" เพื่อตั้งรหัสผ่านผ่านอีเมล",
		})
	}

	hashedPassword, err := HashPassword(input.Password)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "เข้ารหัสผ่านไม่สำเร็จ"})
	}

	// 🟢 ถ้ายังไม่เคยมีอีเมลในระบบ ก็สร้าง User ใหม่ และส่งอีเมลยืนยันตามปกติ
	verifyToken := utils.GenerateVerificationToken()

	user := models.User{
		Name:              input.Name,
		Email:             input.Email,
		Password:          hashedPassword,
		IsVerified:        false,       // 🟢 ให้สถานะเป็น False จนกว่าจะกดลิงก์
		VerificationToken: verifyToken, // 🟢 บันทึก Token ลง DB
	}

	createResult := database.DB.Create(&user)
	if createResult.Error != nil {
		return c.Status(500).JSON(fiber.Map{"error": "บันทึกข้อมูลไม่สำเร็จ"})
	}

	// 🟢 สั่งให้ส่งอีเมลทำงานเบื้องหลัง
	go utils.SendVerificationEmail(user.Email, user.Name, verifyToken)

	return c.Status(201).JSON(fiber.Map{
		"message": "สมัครสมาชิกสำเร็จ! กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชี",
		"email":   user.Email,
	})
}

// ==========================================
// Forgot Password - สร้าง token แล้วส่งอีเมล
// ==========================================
func ForgotPassword(c *fiber.Ctx) error {
	var input struct {
		Email string `json:"email"`
	}

	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}

	// Basic validation: non-empty + simple email format
	if input.Email == "" {
		return c.Status(400).JSON(fiber.Map{"error": "กรุณาระบุอีเมล"})
	}
	// rudimentary email check
	if len(input.Email) < 5 || !strings.Contains(input.Email, "@") {
		return c.Status(400).JSON(fiber.Map{"error": "อีเมลไม่ถูกต้อง"})
	}

	var user models.User
	if err := database.DB.Where("email = ?", input.Email).First(&user).Error; err != nil {
		// ไม่เปิดเผยว่ามีอีเมลในระบบไหม ส่งข้อความสำเร็จเสมอ
		return c.JSON(fiber.Map{"message": "ถ้าอีเมลอยู่ในระบบ เราได้ส่งลิงก์รีเซ็ตรหัสผ่านให้แล้ว"})
	}

	// สร้าง token และบันทึกลง DB พร้อม expiry (1 hour)
	token := utils.GenerateVerificationToken()
	expiry := time.Now().Add(time.Hour * 1)

	if err := database.DB.Model(&user).Updates(map[string]interface{}{
		"password_reset_token":  token,
		"password_reset_expiry": expiry,
	}).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "ไม่สามารถสร้างลิงก์รีเซ็ตได้"})
	}

	// ส่งอีเมลแบบ background
	go utils.SendResetPasswordEmail(user.Email, user.Name, token)

	return c.JSON(fiber.Map{"message": "ถ้าอีเมลอยู่ในระบบ เราได้ส่งลิงก์รีเซ็ตรหัสผ่านให้แล้ว"})
}

// ==========================================
// Reset Password - ตรวจ token แล้วเซ็ตพาสใหม่
// ==========================================
func ResetPassword(c *fiber.Ctx) error {
	var input struct {
		Token       string `json:"token"`
		NewPassword string `json:"new_password"`
	}

	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}

	// 🔒 S8: token ว่าง / มีแต่ช่องว่าง ต้องถูกปฏิเสธ
	// (ไม่งั้น WHERE password_reset_token = '' จะเจอผู้ใช้ที่ไม่เคยขอ reset)
	token := strings.TrimSpace(input.Token)
	if token == "" {
		return c.Status(400).JSON(fiber.Map{"error": "ลิงก์ไม่ถูกต้องหรือหมดอายุ"})
	}

	if input.NewPassword == "" || len(input.NewPassword) < 6 {
		return c.Status(400).JSON(fiber.Map{"error": "รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร"})
	}

	var user models.User
	if err := database.DB.Where("password_reset_token = ? AND password_reset_token <> ''", token).First(&user).Error; err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ลิงก์ไม่ถูกต้องหรือหมดอายุ"})
	}

	// เช็ค expiry: ต้องมีค่า (ไม่ใช่ zero) และยังไม่หมดอายุ
	if user.PasswordResetExpiry.IsZero() || !time.Now().Before(user.PasswordResetExpiry) {
		return c.Status(400).JSON(fiber.Map{"error": "ลิงก์รีเซ็ตหมดอายุ"})
	}

	hashed, err := HashPassword(input.NewPassword)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "ไม่สามารถเข้ารหัสรหัสผ่านใหม่ได้"})
	}

	// 🟢 ใช้ได้ครั้งเดียว: อัปเดตเฉพาะแถวที่ token ยังตรงอยู่ แล้วล้าง token ทิ้งในคำสั่งเดียวกัน
	// (ถ้ามี 2 request ใช้ token เดียวกันพร้อมกัน จะมีแค่ตัวเดียวที่สำเร็จ)
	result := database.DB.Model(&models.User{}).
		Where("id = ? AND password_reset_token = ?", user.ID, token).
		Updates(map[string]interface{}{
			"password":              hashed,
			"password_reset_token":  "",
			"password_reset_expiry": time.Time{},
			// ลิงก์รีเซ็ตส่งไปที่อีเมล = พิสูจน์ว่าเป็นเจ้าของอีเมลแล้ว จึงยืนยันบัญชีไปด้วย
			// (บัญชีที่มีคนสมัครด้วยอีเมลเราไว้ก่อน: รหัสของผู้สมัครปลอมถูกแทนที่ และไม่ติดวน 403 "ยังไม่ยืนยันอีเมล")
			"is_verified":        true,
			"verification_token": "",
		})
	if result.Error != nil {
		return c.Status(500).JSON(fiber.Map{"error": "ไม่สามารถบันทึกรหัสผ่านใหม่ได้"})
	}
	if result.RowsAffected == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "ลิงก์ไม่ถูกต้องหรือหมดอายุ"})
	}

	return c.JSON(fiber.Map{"message": "รีเซ็ตรหัสผ่านสำเร็จ"})
}

// verificationResendTTL ส่งอีเมลยืนยันซ้ำได้ไม่เกิน 1 ครั้งต่อ 10 นาทีต่ออีเมล (S20)
const verificationResendTTL = 10 * time.Minute

// allowVerificationResend คืน true ถ้ายังไม่เคยส่งอีเมลยืนยันให้อีเมลนี้ภายใน 10 นาที
// Redis มีปัญหา → อนุญาต (fail open) เพราะมาถึงจุดนี้ได้ต้องรู้รหัสผ่านที่ถูกต้องแล้ว
func allowVerificationResend(email string) bool {
	if database.RDB == nil {
		return true
	}
	ok, err := database.SetNX("verify:resend:"+strings.ToLower(email), 1, verificationResendTTL)
	if err != nil {
		log.Println("⚠️ ตรวจ throttle การส่งอีเมลยืนยันไม่สำเร็จ (Redis):", err)
		return true
	}
	return ok
}

// ==========================================
// 6. เข้าสู่ระบบ (ด้วย Email/Password ปกติ)
// ==========================================
func LoginWithEmail(c *fiber.Ctx) error {
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}
	input.Email = strings.TrimSpace(input.Email)

	var user models.User
	result := database.DB.Where("email = ?", input.Email).First(&user)
	found := result.Error == nil

	// 🔒 S20: ตรวจรหัสผ่านก่อนเสมอ และตอบข้อความเดียวกันทั้ง "ไม่พบอีเมล" และ "รหัสผิด"
	// ใช้ hash หลอกเมื่อไม่พบอีเมล / บัญชี Google ที่ไม่มีรหัสผ่าน เพื่อให้เวลาตอบใกล้เคียงกัน
	hash := dummyPasswordHash()
	hasPassword := found && user.Password != ""
	if hasPassword {
		hash = user.Password
	}
	passwordOK := CheckPasswordHash(input.Password, hash)
	if !hasPassword || !passwordOK || input.Password == "" {
		return c.Status(401).JSON(fiber.Map{"error": msgInvalidCredentials})
	}

	// 🟢 2. รหัสผ่านถูกแล้ว ค่อยเช็คว่ายืนยันอีเมลหรือยัง
	if !user.IsVerified {
		// 🟢 2.1 ส่งอีเมลยืนยันซ้ำได้ไม่เกิน 1 ครั้งต่อ 10 นาที
		if allowVerificationResend(user.Email) {
			// 🟢 2.2 สร้าง Token ยืนยันตัวใหม่ แล้วอัปเดตลงฐานข้อมูลแทนของเดิม
			newToken := utils.GenerateVerificationToken()
			database.DB.Model(&user).Update("verification_token", newToken)

			// 🟢 2.3 สั่งให้ระบบส่งอีเมลยืนยันไปใหม่อีกรอบ (ทำงานเบื้องหลัง)
			go utils.SendVerificationEmail(user.Email, user.Name, newToken)

			// 🟢 2.4 ส่ง Status 403 กลับไป พร้อมเปลี่ยนข้อความให้ผู้ใช้รู้ว่าส่งเมลไปให้ใหม่แล้ว
			return c.Status(403).JSON(fiber.Map{
				"error": "คุณยังไม่ได้ยืนยันอีเมล ระบบได้ส่งลิงก์ใหม่ไปให้แล้ว กรุณาตรวจสอบกล่องข้อความอีกครั้ง",
			})
		}

		return c.Status(403).JSON(fiber.Map{
			"error": "คุณยังไม่ได้ยืนยันอีเมล กรุณาตรวจสอบกล่องข้อความ (ระบบส่งลิงก์ใหม่ได้ทุก 10 นาที)",
		})
	}

	tokenString, err := utils.GenerateToken(user.ID, user.Email)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "สร้าง Token ไม่สำเร็จ"})
	}

	c.Cookie(&fiber.Cookie{
		Name:     "token",
		Value:    tokenString,
		Expires:  time.Now().Add(time.Hour * 72),
		Path:     "/",
		HTTPOnly: true,
		SameSite: "Lax",
	})

	return c.Status(200).JSON(fiber.Map{
		"message": "เข้าสู่ระบบสำเร็จ",
		"user": fiber.Map{
			"name":  user.Name,
			"email": user.Email,
			"role":  user.Role,
		},
		"token": tokenString,
	})
}

// ==========================================
// 7. ฟังก์ชันยืนยันอีเมล (Verify Email) 🟢 (เพิ่มใหม่)
// ==========================================
func VerifyEmail(c *fiber.Ctx) error {
	token := c.Query("token")
	if token == "" {
		return c.Status(400).JSON(fiber.Map{"error": "ไม่พบข้อมูล Token"})
	}

	var user models.User
	// ค้นหา User ที่มี Token ตรงกับที่ส่งมาใน URL
	if err := database.DB.Where("verification_token = ?", token).First(&user).Error; err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ลิงก์ไม่ถูกต้อง หรืออีเมลนี้ได้รับการยืนยันไปแล้ว"})
	}

	// อัปเดตให้ IsVerified เป็น true และล้างค่า Token เดิมทิ้ง
	database.DB.Model(&user).Updates(map[string]interface{}{
		"is_verified":        true,
		"verification_token": "",
	})

	return c.JSON(fiber.Map{"message": "ยืนยันอีเมลสำเร็จ! บัญชีของคุณพร้อมใช้งานแล้ว"})
}
