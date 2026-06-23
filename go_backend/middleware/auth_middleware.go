package middleware

import (
    "go_backend/config"
    "fmt" // เพิ่ม fmt สำหรับ debug

    "github.com/gofiber/fiber/v2"
    "github.com/golang-jwt/jwt/v5"
)

// RequireAuth เป็นด่านแรกสำหรับตรวจสอบว่าผู้ใช้ล็อกอิน (มี Token) หรือยัง
func RequireAuth(c *fiber.Ctx) error {
    // 🟢 1. ดัก OPTIONS ไว้บนสุด! (Preflight Request จะได้ผ่านทันที)
    if c.Method() == "OPTIONS" {
        return c.Next()
    }

    // 2. ลองดึง Token จาก Cookie ที่เราแนบไปตอน Login
    tokenString := c.Cookies("token")

    // ถ้าไม่มีใน Cookie ลองหาใน Header (Authorization: Bearer <token>) เผื่อไว้
    if tokenString == "" {
        authHeader := c.Get("Authorization")
        if len(authHeader) > 7 && authHeader[:7] == "Bearer " {
            tokenString = authHeader[7:]
        }
    }

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