package middleware

import (
	"go_backend/config"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
)

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