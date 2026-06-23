package main

import (
	"log"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/adaptor/v2" // เพิ่มตัว Adaptor
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/logger"
	
	"go_backend/config"
	"go_backend/database"
	"go_backend/linebot"
	"go_backend/routes"
)

func main() {
	config.LoadConfig()
	app := fiber.New()

	// ✅ ตั้ง CORS แค่ครั้งเดียว และใส่ OPTIONS ด้วย
	app.Use(cors.New(cors.Config{
		AllowOrigins:     config.GetEnv("FRONTEND_URL", "http://localhost:3000"),
		AllowCredentials: true,
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization",
		AllowMethods:     "GET, POST, PUT, DELETE, OPTIONS", // ✅ OPTIONS สำคัญมาก
	}))

	channelSecret := config.GetEnvRequired("LINE_CHANNEL_SECRET")
	channelToken  := config.GetEnvRequired("LINE_CHANNEL_TOKEN")
	linebot.InitBot(channelSecret, channelToken)

	_ = config.GetEnvRequired("JWT_SECRET")
	log.Println("✅ JWT Secret is loaded and ready.")

	// ✅ เปลี่ยน default port เป็น 8080 ให้ตรงกับ Frontend
	port := config.GetEnv("PORT", "8080")

	database.ConnectDB()
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