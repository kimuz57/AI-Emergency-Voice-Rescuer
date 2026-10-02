package middleware

import (
	"crypto/subtle"
	"errors"
	"log"
	"strings"

	"go_backend/config"
	"go_backend/database"
	"go_backend/models"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

var (
	ErrUnauthorized = errors.New("unauthorized")
	ErrForbidden    = errors.New("forbidden")
	ErrUserNotFound = errors.New("user not found")
)

// CurrentUser คืน user เจ้าของ token ที่ RequireAuth ฝากไว้ใน c.Locals("user")
// โดยอ่านจาก DB ใหม่ทุกครั้ง (role ใน DB คือของจริง ไม่เชื่อค่าใน token)
func CurrentUser(c *fiber.Ctx) (*models.User, error) {
	token, ok := c.Locals("user").(*jwt.Token)
	if !ok || token == nil {
		return nil, ErrUnauthorized
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, ErrUnauthorized
	}
	idClaim, ok := claims["user_id"].(float64)
	if !ok {
		return nil, ErrUnauthorized
	}

	var user models.User
	if err := database.DB.First(&user, uint(idClaim)).Error; err != nil {
		return nil, ErrUnauthorized
	}
	return &user, nil
}

// ResolveTargetUser ใช้กับ endpoint ที่รับ ?email= หรือ email ใน body
//   - email ว่าง หรือเป็นของตัวเอง → คืนผู้ใช้ปัจจุบัน
//   - email ของคนอื่น → อนุญาตเฉพาะ admin เท่านั้น นอกนั้นคืน ErrForbidden
func ResolveTargetUser(c *fiber.Ctx, email string) (*models.User, error) {
	me, err := CurrentUser(c)
	if err != nil {
		return nil, err
	}

	email = strings.TrimSpace(email)
	if email == "" || strings.EqualFold(email, me.Email) {
		return me, nil
	}
	if me.Role != "admin" {
		return nil, ErrForbidden
	}

	var target models.User
	if err := database.DB.Where("LOWER(email) = LOWER(?)", email).First(&target).Error; err != nil {
		return nil, ErrUserNotFound
	}
	return &target, nil
}

// IdentityError แปลง error จาก CurrentUser / ResolveTargetUser เป็น HTTP response
func IdentityError(c *fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, ErrForbidden):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Access Denied"})
	case errors.Is(err, ErrUserNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "ไม่พบผู้ใช้งานในระบบ"})
	default:
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
	}
}

// RequireInternalKey ใช้กับ endpoint ที่ service ภายใน (Python receiver) เรียกเท่านั้น
// ต้องส่ง header X-Internal-Key ให้ตรงกับ env INTERNAL_API_KEY
// ถ้าไม่ได้ตั้ง INTERNAL_API_KEY จะปฏิเสธทุก request (fail closed)
func RequireInternalKey(c *fiber.Ctx) error {
	expected := config.GetEnv("INTERNAL_API_KEY", "")
	if expected == "" {
		log.Println("❌ INTERNAL_API_KEY ไม่ได้ตั้งค่า ปฏิเสธ request ภายในทั้งหมด")
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "internal API is not configured"})
	}

	got := c.Get("X-Internal-Key")
	if subtle.ConstantTimeCompare([]byte(got), []byte(expected)) != 1 {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
	}
	return c.Next()
}
