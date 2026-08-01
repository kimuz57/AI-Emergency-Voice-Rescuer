package routes

import (
	"go_backend/controllers"
	"go_backend/middleware"

	"github.com/gofiber/fiber/v2"

)

func SetupRoutes(app *fiber.App) {
	// 🟢 1. ตั้งค่า Static Files (ย้ายมาไว้บนสุดให้เห็นชัดเจน)
	api := app.Group("/api")
	app.Static("/profile", "./profile")
	app.Post("/api/webhook", controllers.TelegramWebhook)
	api.Get("/devices", middleware.AuthMiddleware, controllers.GetDashboardDevices)
	api.Post("/devices", middleware.AuthMiddleware, controllers.RegisterDevice)
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

		patientGroup.Get("/stream", controllers.StreamPatients)
	}

	deviceGroup := app.Group("/api/device")
	{
		// ให้ Python ยิงมาถามสถานะ Activation ของบอร์ดที่นี่
		deviceGroup.Get("/checkin", controllers.CheckinDeviceIP)
		deviceGroup.Get("/check-activation", controllers.CheckDeviceActivation)
		deviceGroup.Post("/status", controllers.UpdateDevices)

		deviceGroup.Get("/stream", controllers.StreamDevices)
	}

	alertGroup := app.Group("/api/alerts")
	{
    	alertGroup.Post("/ai", controllers.CreateAlert)
    	alertGroup.Post("/", controllers.CreateAlert)
    	alertGroup.Get("/", controllers.GetActiveAlerts)
    	alertGroup.Get("/history", controllers.GetHistoryAlerts)
    	alertGroup.Put("/:id/resolve", controllers.ResolveAlert) // API สำหรับ Dashboard (id)
    	alertGroup.Get("/stats", controllers.GetAlertStats)
    	alertGroup.Get("/stream", controllers.StreamAlerts)

    // 🌟 API สำหรับหน้า /alert จาก LINE
    	alertGroup.Get("/device", controllers.GetAlertDeviceInfo)
    	alertGroup.Post("/acknowledge", controllers.AcknowledgeAlert)
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
