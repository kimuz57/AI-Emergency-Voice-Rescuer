package middleware

import (
	"fmt" // เพิ่ม fmt สำหรับ debug
	"strings"

	"go_backend/config"
    "go_backend/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

func ExtractToken(c *fiber.Ctx) string {
    if tokenString := c.Cookies("token"); tokenString != "" {
        return tokenString
    }

    if authHeader := c.Get("Authorization"); authHeader != "" {
        if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
            return strings.TrimSpace(authHeader[7:])
        }
    }

    return ""
}

// RequireAuth เป็นด่านแรกสำหรับตรวจสอบว่าผู้ใช้ล็อกอิน (มี Token) หรือยัง
func RequireAuth(c *fiber.Ctx) error {
    // 🟢 1. ดัก OPTIONS ไว้บนสุด! (Preflight Request จะได้ผ่านทันที)
    if c.Method() == "OPTIONS" {
        return c.Next()
    }

    // 2. ลองดึง Token จาก Cookie หรือ Header
    tokenString := ExtractToken(c)

    // ถ้าหาไม่เจอเลย แปลว่ายังไม่ได้ล็อกอิน
    if tokenString == "" {
        fmt.Println("❌ Middleware: ไม่พบ Token ใน Cookie และ Header")
        return c.Status(401).JSON(fiber.Map{"error": "Unauthorized: กรุณาเข้าสู่ระบบก่อน"})
    }

    // 3. ตรวจสอบความถูกต้องของ Token
    secret := config.GetEnv("JWT_SECRET", "EVR_SECRET_KEY")
    token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
        return []byte(secret), nil
    })

    if err != nil || !token.Valid {
        fmt.Println("❌ Middleware: Token หมดอายุหรือไม่ถูกต้อง")
        return c.Status(401).JSON(fiber.Map{"error": "Unauthorized: Token ไม่ถูกต้องหรือหมดอายุ"})
    }

    // 4. ถ้าผ่าน! ให้ฝากข้อมูล Token เอาไว้ในกระเป๋า c.Locals 
    c.Locals("user", token)

    // อนุญาตให้ผ่านไปทำงานฟังก์ชันต่อไปได้
    return c.Next()
}

func AuthMiddleware(c *fiber.Ctx) error {
	// 1. ดึง Token จาก Header Authorization
	authHeader := c.Get("Authorization")
	if authHeader == "" {
		// ลองหาจาก Cookie เผื่อคุณส่งทาง Cookie (ถ้าไม่ใช้ ลบออกได้ครับ)
		authHeader = c.Cookies("jwt")
	}

	if authHeader == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized: กรุณาเข้าสู่ระบบ"})
	}

	// 2. ตัดคำว่า "Bearer " ออก
	tokenString := strings.Replace(authHeader, "Bearer ", "", 1)

	// 3. แปลง Token (ใช้ฟังก์ชัน ParseToken ใน utils ของคุณ)
	claims, err := utils.ParseToken(tokenString)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized: Token ไม่ถูกต้องหรือหมดอายุ"})
	}

	// 4. สร้าง jwt.Token รูปแบบมาตรฐาน เพื่อฝากไว้ใน Locals
	// ทำให้โค้ดใน RequireAdmin และ Controllers ของคุณใช้งาน c.Locals("user").(*jwt.Token) ได้ตามปกติ
	token := &jwt.Token{
		Claims: jwt.MapClaims{
			"user_id": float64(claims.UserID), // แปลงกลับเป็น float64 ให้ตรงมาตรฐาน jwt
			"email":   claims.Email,
		},
	}

	// 5. ฝากข้อมูลไว้ใน Locals
	c.Locals("user", token)

	// 6. ส่งต่อให้ฟังก์ชันถัดไปทำงาน
	return c.Next()
}
