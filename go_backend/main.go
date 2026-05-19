package main

import (
	"log"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/joho/godotenv"
	
	"go_backend/database"
	"go_backend/routes"
	"go_backend/services"
)

func main() {
	// 1. โหลดไฟล์ .env
	err := godotenv.Load()
	if err != nil {
		log.Println("No .env file found or error loading it")
	}

	// 2. เชื่อมต่อฐานข้อมูล PostgreSQL
	database.ConnectDB()

	// 3. สร้างแอป Fiber
	app := fiber.New()

	// 4. ตั้งค่า CORS (อนุญาตให้ Next.js จากพอร์ต 3000 และ IP ต่างๆ เข้าถึงได้)
	app.Use(cors.New(cors.Config{
		AllowOrigins:     "http://localhost:3000, http://192.168.1.108:3000, http://26.161.225.127:3000",
		AllowCredentials: true, 
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization",
		AllowMethods:     "GET, POST, PUT, DELETE, OPTIONS",
	}))
	
	// 5. โยนการจัดการเส้นทาง (API) ทั้งหมดไปให้โฟลเดอร์ routes
	routes.SetupRoutes(app)

	// 6. เริ่มระบบ MQTT สำหรับอุปกรณ์ ESP32
	services.InitMQTT()

	// 7. รัน Backend
	log.Printf("🚀 Server is running on port 8080")
	log.Fatal(app.Listen(":8080"))
	

}