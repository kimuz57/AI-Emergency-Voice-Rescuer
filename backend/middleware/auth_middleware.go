package middleware

import (
	"fmt" // เพิ่ม fmt สำหรับ debug
	"strings"

	"go_backend/utils"
	"github.com/gofiber/fiber/v2"
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
// ลำดับการหา token: cookie "token" → Authorization: Bearer → ?token= (ให้ EventSource/SSE ใช้ได้)
func RequireAuth(c *fiber.Ctx) error {
    // 🟢 1. ดัก OPTIONS ไว้บนสุด! (Preflight Request จะได้ผ่านทันที)
    if c.Method() == "OPTIONS" {
        return c.Next()
    }

    // 2. ลองดึง Token จาก Cookie หรือ Header
    tokenString := ExtractToken(c)
    if tokenString == "" {
		tokenString = c.Query("token")
	}

    // ถ้าหาไม่เจอเลย แปลว่ายังไม่ได้ล็อกอิน
    if tokenString == "" {
        fmt.Println("❌ Middleware: ไม่พบ Token ใน Cookie และ Header")
        return c.Status(401).JSON(fiber.Map{"error": "Unauthorized: กรุณาเข้าสู่ระบบก่อน"})
    }

    // 3. ตรวจสอบความถูกต้องของ Token
    // 🔒 ไม่มี fallback secret แล้ว (S4) และรับเฉพาะ HS256 (S19) — ดู utils.ParseJWT
    token, err := utils.ParseJWT(tokenString)
    if err != nil {
        fmt.Println("❌ Middleware: Token หมดอายุหรือไม่ถูกต้อง")
        return c.Status(401).JSON(fiber.Map{"error": "Unauthorized: Token ไม่ถูกต้องหรือหมดอายุ"})
    }

    // 4. ถ้าผ่าน! ให้ฝากข้อมูล Token เอาไว้ในกระเป๋า c.Locals
    c.Locals("user", token)

    // อนุญาตให้ผ่านไปทำงานฟังก์ชันต่อไปได้
    return c.Next()
}

// OptionalAuth ใช้กับ route ที่มีทางเข้าได้มากกว่า JWT (เช่น GET /api/audio/:filename ที่หน้า /alert ใช้ alert token)
// หา token ตามลำดับเดียวกับ RequireAuth แล้วฝาก c.Locals("user") เฉพาะเมื่อ JWT ถูกต้องเท่านั้น
// ไม่ปฏิเสธ request เอง — handler ต้องตัดสินสิทธิ์ (middleware.CurrentUser คืน ErrUnauthorized เมื่อไม่มี user)
func OptionalAuth(c *fiber.Ctx) error {
    if c.Method() == "OPTIONS" {
        return c.Next()
    }

    tokenString := ExtractToken(c)
    if tokenString == "" {
        tokenString = c.Query("token")
    }
    if tokenString != "" {
        if token, err := utils.ParseJWT(tokenString); err == nil {
            c.Locals("user", token)
        }
    }

    return c.Next()
}
