package main

import (
	"log"

	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/adaptor/v2" // เพิ่มตัว Adaptor
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/logger"

	"go_backend/config"
	"go_backend/controllers"
	"go_backend/database"
	"go_backend/linebot"
	"go_backend/middleware"
	"go_backend/routes"
)

func SetupServer() *fiber.App {
	// 🟢 1. โหลดไฟล์ .env
	config.LoadConfig()
	app := fiber.New()

	app.Use(cors.New(cors.Config{
        AllowOrigins: config.GetEnv("FRONTEND_URL", "http://localhost:3000") + ", http://127.0.0.1:5555, http://localhost:5555",
		AllowCredentials: true,
        AllowHeaders: "Origin, Content-Type, Accept, Authorization",
        AllowMethods: "GET, POST, PUT, DELETE",
    }))

	channelSecret := config.GetEnvRequired("LINE_CHANNEL_SECRET")
	channelToken := config.GetEnvRequired("LINE_CHANNEL_TOKEN")

	// ตั้งค่าบอท
	linebot.InitBot(channelSecret, channelToken)

	// 🟢 2. ทดสอบระบบเซฟตี้!
	_ = config.GetEnvRequired("JWT_SECRET")
	log.Println("✅ JWT Secret is loaded and ready.")

	// 🟢 3. เชื่อมต่อฐานข้อมูล PostgreSQL
	database.ConnectDB()

	// 🟢 4. ตั้งค่า Middleware & Routes
	app.Use(middleware.SetupCORS())

	// 🟢 5. ตั้งค่า Log
	env := config.GetEnv("APP_ENV", "development")
	if env == "development" {
		log.Println("[MODE]: DEVELOPMENT - เปิดระบบพ่น Log")
		app.Use(logger.New(logger.Config{
			Format: "[${ip}]:${port} ${status} - ${method} ${path}\n",
		}))
	}

	// 🟢 5.5 ตั้งค่า WebSocket Route (ตั้งก่อน Routes อื่นเพื่อหลีกเลี่ยง Conflict)
	controllers.SetupWebsocketRoute(app)

	// 🟢 6. โยนการจัดการเส้นทาง (API) ทั่วไปให้ routes
	routes.SetupRoutes(app)

	// 🟢 7. เชื่อม LINE Webhook เข้ากับ Fiber (ใช้ app.Post และ Adaptor)
	app.Post("/webhook", adaptor.HTTPHandlerFunc(linebot.WebhookHandler))

	return app
}

func main() {
	app := SetupServer()
	port := config.GetEnv("PORT", "8081")

	log.Printf("🚀 Server is running on port %s", port)

	if err := app.Listen(":" + port); err != nil {
		log.Fatal("เซิร์ฟเวอร์ Fiber มีปัญหา: ", err)
	}
}