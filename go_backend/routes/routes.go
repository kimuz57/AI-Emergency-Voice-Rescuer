package routes

import (
	"go_backend/controllers"
	"go_backend/middleware"

	"github.com/gofiber/fiber/v2"
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
		authGroup.Post("/forgot-password", controllers.ForgotPassword)
		authGroup.Post("/reset-password", controllers.ResetPassword)
		authGroup.Post("/logout", controllers.Logout)
		authGroup.Get("/verify-email", controllers.VerifyEmail)
	}

	adminGroup := app.Group("/api/admin", middleware.RequireAuth, middleware.RequireAdmin)
	{
		adminGroup.Get("/users", controllers.AdminGetAllUsers)
    	adminGroup.Delete("/users/:id", controllers.AdminDeleteUser)
    	adminGroup.Put("/users/:id", controllers.AdminUpdateUser)

		adminGroup.Get("/patients", controllers.AdminGetAllPatients)
        adminGroup.Delete("/patients/:id", controllers.AdminDeletePatient)
        adminGroup.Put("/patients/:id", controllers.AdminUpdatePatient)
		
	}
	adminGroup.Get("/test", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"message": "ยินดีต้อนรับเข้าสู่โซน Admin!",
		})
	})
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
	patientGroup := app.Group("/api/patients", middleware.RequireAuth)
	{
		patientGroup.Get("/", controllers.GetPatientsByCaretaker) // ย้ายจากข้างบนมารวมกลุ่ม
		patientGroup.Post("/", controllers.CreatePatient)
		patientGroup.Post("/register", controllers.RegisterPatientWithDevice)
		patientGroup.Delete("/:id", controllers.DeletePatient)
	}

	deviceGroup := app.Group("/api/device")
	{
		// ให้ Python ยิงมาถามสถานะ Activation ของบอร์ดที่นี่
		deviceGroup.Get("/checkin", controllers.CheckinDeviceIP)
		deviceGroup.Get("/check-activation", controllers.CheckDeviceActivation)
	}
	
	alertGroup := app.Group("/api/alerts")
	{
		// 🟢 รับข้อมูลจาก ESP32 / AI
		alertGroup.Post("/ai", controllers.CreateAlert) 
		
		// 🟢 รับข้อมูลการแจ้งเตือนทั่วไป 
		alertGroup.Post("/", controllers.CreateAlert)

		// 🟢 ดึงข้อมูลการแจ้งเตือน (ที่ยังไม่ resolve)
		alertGroup.Get("/", controllers.GetActiveAlerts)

		// 🟢 ดึงประวัติและสถิติสำหรับหน้าปฏิทิน
		alertGroup.Get("/history", controllers.GetHistoryAlerts)

		// 🟢 อัปเดตสถานะรับทราบและช่วยเหลือ (ลบบรรทัดที่ซ้ำออกแล้ว)
		alertGroup.Put("/:id/resolve", controllers.ResolveAlert)

		alertGroup.Get("/stats", controllers.GetAlertStats)
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