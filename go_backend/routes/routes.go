package routes

import (
	"github.com/gofiber/fiber/v2"
	"go_backend/controllers"
)

func SetupRoutes(app *fiber.App) {
	// 🟢 1. ตั้งค่า Static Files (ย้ายมาไว้บนสุดให้เห็นชัดเจน)
	app.Static("/profile", "./profile")
	app.Post("/api/webhook", controllers.TelegramWebhook)
	
	app.Post("/api/line/webhook", controllers.LineWebhook)
	app.Delete("/api/user/telegram/disconnect", controllers.DisconnectTelegram)
	// 🟢 2. เส้นทางเช็คสถานะ API
	app.Get("/api/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok", "message": "Guardian AI API is running smoothly! 🚀"})
	})

	// ==========================================
	// 📍 หมวดหมู่ Auth (ระบบล็อกอิน/สมัครสมาชิก)
	// ==========================================
	authGroup := app.Group("/api/auth")
	{
		authGroup.Post("/google", controllers.GoogleLogin)
		authGroup.Post("/login", controllers.LoginWithEmail) // รวบมาไว้ที่นี่หมดแล้ว
		authGroup.Post("/register", controllers.Register)
		authGroup.Post("/logout", controllers.Logout)
	}

	// ==========================================
	// 📍 หมวดหมู่ User (จัดการข้อมูลผู้ใช้งาน)
	// ==========================================
	userGroup := app.Group("/api/user")
	{
		userGroup.Get("/profile", controllers.GetUserProfile)
		userGroup.Put("/profile", controllers.UpdateUserProfile)
		userGroup.Post("/upload-profile", controllers.UploadProfileImage)
		
		userGroup.Post("/link-line", controllers.LinkLineAccount)
		userGroup.Delete("/unlink-line", controllers.UnlinkLineAccount)
		userGroup.Post("/telegram/connect", controllers.ConnectTelegram)
		userGroup.Post("/telegram/toggle", controllers.ToggleTelegramNotify)
	}
	// ==========================================
	// 📍 หมวดหมู่ Patients (จัดการข้อมูลผู้ป่วย/คนชรา)
	// ==========================================
	patientGroup := app.Group("/api/patients")
	{
		patientGroup.Get("/", controllers.GetPatientsByCaretaker) // ย้ายจากข้างบนมารวมกลุ่ม
		patientGroup.Post("/", controllers.CreatePatient)
		patientGroup.Post("/register", controllers.RegisterPatientWithDevice)
	}

	// ==========================================
	// 📍 หมวดหมู่ Alerts (ระบบแจ้งเตือนเหตุฉุกเฉิน)
	// ==========================================
	alertGroup := app.Group("/api/alerts")
	{
		// 🟢 แก้ Error: เปลี่ยนจาก api.Post เป็น alertGroup.Post
		// และเปลี่ยน path เป็น "/ai" เพื่อไม่ให้ชนกับ "/" ของ CreateAlert ด่านล่าง
		alertGroup.Post("/ai", controllers.CreateAlert) // จุดรับข้อมูลจาก ESP32 (บันทึกลง DB และกระจายงานไป LINE/Telegram)
		
		alertGroup.Post("/", controllers.CreateAlert)
		alertGroup.Get("/", controllers.GetActiveAlerts)
		alertGroup.Put("/:id/resolve", controllers.ResolveAlert)
	}

	// ==========================================
	// 📍 หมวดหมู่ Audio (จัดการไฟล์เสียงที่บันทึก)
	// ==========================================
	audioGroup := app.Group("/api/audio")
	{
		audioGroup.Post("/emergency", controllers.SaveEmergencyAudio)
		audioGroup.Post("/negative", controllers.SaveNegativeAudio)
		audioGroup.Get("/my-logs", controllers.GetMyDetectionLogs)

		audioGroup.Get("/", controllers.ListAudioFiles)
		audioGroup.Get("/:filename", controllers.GetAudioFile)
		audioGroup.Delete("/:filename", controllers.DeleteAudioFile)
	}
}