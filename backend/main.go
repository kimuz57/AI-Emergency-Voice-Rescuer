package main

import (
	"log"

	"github.com/gofiber/adaptor/v2" // เพิ่มตัว Adaptor
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"

	"go_backend/config"
	"go_backend/database"
	"go_backend/linebot"
	"go_backend/routes"
	// "go_backend/controllers"
	// "go_backend/middleware"
	// "go_backend/handlers"
)

func main() {
	config.LoadConfig()
	app := fiber.New()

	// ✅ ตั้ง CORS แค่ครั้งเดียว และใส่ OPTIONS ด้วย
	// 🟢 ต้องลงทะเบียนก่อน route อื่นทั้งหมด (รวม GET /api/audio/:filename ที่ wavesurfer fetch พร้อม header Authorization)
	app.Use(cors.New(cors.Config{
		AllowOrigins:     config.GetEnv("FRONTEND_URL", "http://localhost:3000"),
		AllowCredentials: true,
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization, X-Alert-Token", // X-Alert-Token: หน้า /alert จากลิงก์ LINE/Telegram
		AllowMethods:     "GET, POST, PUT, DELETE, OPTIONS", // ✅ OPTIONS สำคัญมาก
	}))

	// 🔒 ไม่มี app.Static("/api/audio") แล้ว — ไฟล์เสียงเสิร์ฟผ่าน GET /api/audio/:filename (controllers.GetAudioFile)
	// ซึ่งตรวจสิทธิ์ทุกครั้ง (admin / ผู้ดูแลที่ผูกกับผู้ป่วย / alert token ของหน้า /alert)

	channelSecret := config.GetEnvRequired("LINE_CHANNEL_SECRET")
	channelToken := config.GetEnvRequired("LINE_CHANNEL_TOKEN")
	linebot.InitBot(channelSecret, channelToken)

	jwtSecret := config.GetEnvRequired("JWT_SECRET")
	if len(jwtSecret) < 32 {
		log.Println("⚠️ Warning: JWT_SECRET สั้นกว่า 32 ตัวอักษร ควรใช้ค่าสุ่มที่ยาวกว่านี้ (ใช้ลงลายเซ็นทั้ง JWT และ alert token)")
	}
	log.Println("✅ JWT Secret is loaded and ready.")

	// 🟢 ค่าที่ handler อ่านตอนรับ request (ไม่ปิดระบบถ้าไม่มี แต่เตือนไว้ตั้งแต่ startup)
	config.WarnIfMissing(
		"LINE_LOGIN_CHANNEL_ID",
		"LINE_LOGIN_CHANNEL_SECRET",
		"LINE_LOGIN_CALLBACK_URL",
		"TELEGRAM_BOT_TOKEN",
		"API_BASE_URL",
	)

	// 🔒 ค่าความปลอดภัยที่เพิ่มในรอบนี้ (ไม่ปิดระบบ แต่บอกผลกระทบให้ชัด)
	config.WarnMissing("INTERNAL_API_KEY", "route ภายใน (/api/audio/emergency, /api/audio/negative, /api/alerts, /api/device/status, /api/device/check-activation) จะตอบ 503 ทุกครั้ง — ต้องตั้งค่าเดียวกันทั้งฝั่ง Go และ Python")
	config.WarnMissing("GOOGLE_CLIENT_ID", "POST /api/auth/google จะตอบ 500 \"Google login not configured\"")
	config.WarnMissing("TELEGRAM_WEBHOOK_SECRET", "Telegram webhook จะรับ request โดยไม่ตรวจ header X-Telegram-Bot-Api-Secret-Token")
	config.WarnMissing("TELEGRAM_BOT_USERNAME", "POST /api/user/telegram/link-token จะคืน deep_link เป็นค่าว่าง")
	config.WarnMissing("FRONTEND_URL", "CORS และลิงก์ /alert จะใช้ค่า default http://localhost:3000")
	if config.GetEnv("ADMIN_PASSWORD", "") == "" {
		log.Println("ℹ️ ADMIN_PASSWORD ไม่ได้ตั้งค่า: ถ้ายังไม่มี admin ในระบบ จะไม่สร้างบัญชี admin เริ่มต้นให้ (ตั้ง ADMIN_EMAIL / ADMIN_PASSWORD แล้ว restart)")
	}

	// ✅ เปลี่ยน default port เป็น 8080 ให้ตรงกับ Frontend
	port := config.GetEnv("PORT", "8080")

	database.ConnectDB()
	database.ConnectRedis()
	database.SeedAdmin()
	// ✅ ลบ middleware.SetupCORS() ออก (ซ้ำซ้อน)

	env := config.GetEnv("APP_ENV", "development")
	if env == "development" {
		log.Println("[MODE]: DEVELOPMENT - เปิดระบบพ่น Log")
		app.Use(logger.New(logger.Config{
			Format: "[${ip}]:${port} ${status} - ${method} ${path}\n",
		}))
	}

	routes.SetupRoutes(app)
	app.Post("/webhook", adaptor.HTTPHandlerFunc(linebot.WebhookHandler))

	log.Printf("🚀 Server is running on port %s", port)
	if err := app.Listen(":" + port); err != nil {
		log.Fatal("เซิร์ฟเวอร์ Fiber มีปัญหา: ", err)
	}
}
