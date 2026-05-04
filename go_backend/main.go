package main

import (
	"log"
	"github.com/gofiber/fiber/v2"
	"github.com/joho/godotenv"
	"github.com/gofiber/fiber/v2/middleware/cors"

	"go_backend/database"
	"go_backend/routes"
	"go_backend/services"
)

func main() {
	err := godotenv.Load()
	if err != nil {
		log.Println("No .env file found or error loading it")
	}

	database.ConnectDB()

	app := fiber.New()
	app.Use(cors.New(cors.Config{
    	AllowOrigins:     "http://localhost:3000",
    	AllowCredentials: true, // 📍 ต้องเป็น true
    	AllowHeaders:     "Origin, Content-Type, Accept, Authorization",
    	AllowMethods:     "GET, POST, PUT, DELETE, OPTIONS",
	}))

	// แยก Route ไปจัดการที่อื่น
	routes.SetupRoutes(app)
	services.InitMQTT()
	log.Fatal(app.Listen(":8080")) // Backend รันพอร์ต 8080 เพื่อไม่ให้ชนกับ Next.js (3000)
}
