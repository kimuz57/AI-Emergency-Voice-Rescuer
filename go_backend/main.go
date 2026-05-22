package main

import (
	"log"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/logger"

	"go_backend/config"
	"go_backend/database"
	"go_backend/middleware"
	"go_backend/routes"
)

    func main() {
        // 🟢 1. โหลดไฟล์ .env (เรียกใช้งานผ่าน Config ทีเดียวจบ)
        config.LoadConfig()

        
        // 🟢 2. ทดสอบระบบเซฟตี้!
        // ทริค: ใช้ _ (Blank Identifier) รับค่าแทน เพื่อไม่ให้ Go บ่นว่าประกาศตัวแปรแล้วไม่ได้ใช้
        _ = config.GetEnvRequired("JWT_SECRET")
        log.Println("✅ JWT Secret is loaded and ready.")

        // ดึงค่าพอร์ต ถ้าลืมตั้งใน .env ให้ใช้พอร์ต 8080 เป็นค่าเริ่มต้น
        port := config.GetEnv("PORT", "8080")

        // 🟢 3. เชื่อมต่อฐานข้อมูล PostgreSQL
        database.ConnectDB()

        // 🟢 4. สร้างแอป Fiber
        app := fiber.New()
        app.Use(middleware.SetupCORS())
        // 🟢 5. ตั้งค่า CORS (อนุญาตให้ Next.js จากพอร์ต 3000 และ IP ต่างๆ เข้าถึงได้)
        
        env := config.GetEnv("APP_ENV", "development")
        if env == "development" {
            log.Println("[MODE]: DEVELOPMENT - เปิดระบบพ่น Log (บันทึกทุก Request)")
            // ให้ Fiber พ่น Log ออกมาดูว่าใครยิง API อะไรมาบ้าง (GET, POST, สเตตัส 200)
            app.Use(logger.New(logger.Config{
                Format: "[${ip}]:${port} ${status} - ${method} ${path}\n",
            }))
        } else {
            log.Println("[MODE]: PRODUCTION - ปิดระบบพ่น Log เพื่อประหยัดทรัพยากรเซิร์ฟเวอร์")
            // ในโหมดนี้ไม่ต้องเรียก app.Use(logger.New()) ระบบก็จะเงียบกริบ ไม่รกหน้าจอ
        }
        // 🟢 6. โยนการจัดการเส้นทาง (API) ทั้งหมดไปให้โฟลเดอร์ routes
        routes.SetupRoutes(app)

        // 🟢 7. เริ่มระบบ MQTT สำหรับอุปกรณ์ ESP32
        //services.InitMQTT()

        // 🟢 8. รัน Backend โดยใช้ตัวแปร port จาก .env
        log.Printf("🚀 Server is running on port %s", port)
        log.Fatal(app.Listen(":" + port))
    }