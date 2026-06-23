package middleware

import (
	"go_backend/config"
    "go_backend/database"
	"go_backend/models"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gofiber/fiber/v2/middleware/cors"
)

func RequireAdmin(c *fiber.Ctx) error {
	// 1. ดึงข้อมูล JWT จาก Locals (ที่ AuthMiddleware ตรวจสอบและฝากไว้ให้แล้ว)
	userToken, ok := c.Locals("user").(*jwt.Token)
	if !ok {
		return c.Status(401).JSON(fiber.Map{"error": "Unauthorized"})
	}

	claims := userToken.Claims.(jwt.MapClaims)

	// ดึง user_id อย่างปลอดภัย
    userIDClaim, ok := claims["user_id"].(float64)
    if !ok {
        return c.Status(401).JSON(fiber.Map{"error": "Unauthorized: Token ไม่สมบูรณ์แบบ"})
    }
    userID := uint(userIDClaim) // แปลงเป็น uint ถ้า Model User ของคุณใช้ GORM (ID เป็น uint)

	// 2. ไปค้นหา User ใน Database
	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบผู้ใช้งานในระบบ"})
	}

	// 🛑 3. ด่านสกัด: เช็คว่า Role เป็น admin หรือไม่
	if user.Role != "admin" {
		return c.Status(403).JSON(fiber.Map{
			"error": "Access Denied: คุณไม่มีสิทธิ์เข้าถึงส่วนผู้ดูแลระบบ",
		})
	}

	// ผ่านด่านได้ ให้ไปทำงานฟังก์ชันถัดไป
	return c.Next() 
}

// SetupCORS คืนค่า Middleware สำหรับจัดการ CORS
func SetupCORS() fiber.Handler {
    // 🟢 ดึงค่าจาก .env ถ้าลืมใส่หรือหาไม่เจอ จะใช้ localhost:3000 เป็นแผนสำรอง
    allowedOrigins := config.GetEnv("FRONTEND_URL", "http://localhost:3000")

    return cors.New(cors.Config{
        AllowOrigins:     allowedOrigins, // 🟢 นำตัวแปรมาใส่ตรงนี้แทนข้อความยาวๆ
        AllowCredentials: true,
        AllowHeaders:     "Origin, Content-Type, Accept, Authorization",
        AllowMethods:     "GET, POST, PUT, DELETE, OPTIONS",
    })
}