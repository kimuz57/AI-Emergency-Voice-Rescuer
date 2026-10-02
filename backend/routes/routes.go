package routes

import (
	"go_backend/controllers"
	"go_backend/middleware"

	"github.com/gofiber/fiber/v2"

)

// SetupRoutes ลงทะเบียน route ทั้งหมด แบ่งเป็น 4 ระดับสิทธิ์:
//   - PUBLIC   : ไม่ต้องล็อกอิน (auth, webhook, ลิงก์ /alert ที่มี alert token)
//   - INTERNAL : middleware.RequireInternalKey (header X-Internal-Key) — เรียกจาก api/mqtt_audio_receiver.py เท่านั้น
//   - AUTH     : middleware.RequireAuth (cookie token / Bearer / ?token= สำหรับ SSE)
//   - ADMIN    : RequireAuth + RequireAdmin (อ่าน role จาก DB ทุกครั้ง)
//
// ⚠️ static /profile ยังเป็น public อยู่ในรอบนี้ (ไฟล์เสียงไม่มี static แล้ว — ผ่าน GET /api/audio/:filename เท่านั้น)
func SetupRoutes(app *fiber.App) {
	// 🟢 1. ตั้งค่า Static Files (ย้ายมาไว้บนสุดให้เห็นชัดเจน)
	api := app.Group("/api")
	app.Static("/profile", "./profile")

	// 🟢 Webhook ของ Telegram (PUBLIC — ตรวจ header X-Telegram-Bot-Api-Secret-Token ใน handler เมื่อตั้ง TELEGRAM_WEBHOOK_SECRET)
	app.Post("/api/telegram/webhook", controllers.TelegramWebhook)
	app.Post("/api/webhook", controllers.TelegramWebhook)
	app.Post("/api/line/webhook", controllers.LineWebhook)

	// 🟢 2. เส้นทางเช็คสถานะ API
	app.Get("/api/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok", "message": "Guardian AI API is running smoothly! 🚀"})
	})

	// ==========================================
	// 📍 หมวดหมู่ Auth (ระบบล็อกอิน/สมัครสมาชิก) — PUBLIC
	// ==========================================
	authGroup := app.Group("/api/auth")
	{
		authGroup.Post("/google", controllers.GoogleLogin) // ต้องส่ง id_token ของ Google มาด้วย
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
	// 📍 หมวดหมู่ User (จัดการข้อมูลผู้ใช้งาน) — AUTH
	// ==========================================
	userGroup := app.Group("/api/user", middleware.RequireAuth)
	{
		userGroup.Get("/profile", controllers.GetUserProfile)
		userGroup.Put("/profile", controllers.UpdateUserProfile)
		userGroup.Post("/upload-profile", controllers.UploadProfileImage)

		userGroup.Post("/link-line", controllers.LinkLineAccount)
		userGroup.Delete("/unlink-line", controllers.UnlinkLineAccount)
		userGroup.Post("/telegram/toggle", controllers.ToggleTelegramNotify)
		userGroup.Delete("/telegram/disconnect", controllers.DisconnectTelegram)
		userGroup.Post("/telegram/link-token", controllers.CreateTelegramLinkToken) // 🟢 ออก token สำหรับ deep link /start <token>
	}
	// ==========================================
	// 📍 หมวดหมู่ Patients (จัดการข้อมูลผู้ป่วย/คนชรา) — AUTH
	// ==========================================
	patientGroup := app.Group("/api/patients", middleware.RequireAuth)
	{
		patientGroup.Get("/", controllers.GetPatientsByCaretaker) // ย้ายจากข้างบนมารวมกลุ่ม
		patientGroup.Post("/", controllers.CreatePatient)
		patientGroup.Post("/register", controllers.RegisterPatientWithDevice)
		patientGroup.Put("/:id", controllers.UpdatePatient) // 🟢 เพิ่มใหม่: แก้ไขข้อมูลผู้ป่วย (เจ้าของ/แอดมิน)
		patientGroup.Delete("/:id", controllers.DeletePatient)

		patientGroup.Get("/stream", controllers.StreamPatients)
	}

	// ==========================================
	// 📍 หมวดหมู่ Devices (รายการบอร์ดบน Dashboard)
	// ==========================================
	api.Get("/devices", middleware.RequireAuth, controllers.GetDashboardDevices)
	api.Post("/devices", middleware.RequireAuth, middleware.RequireAdmin, controllers.RegisterDevice)

	deviceGroup := app.Group("/api/device")
	{
		// ⚠️ PUBLIC: firmware ESP32 ยังส่ง key ไม่ได้ (ความเสี่ยงที่ยังเหลืออยู่)
		deviceGroup.Get("/checkin", controllers.CheckinDeviceIP)

		// INTERNAL: ให้ Python ยิงมาถามสถานะ Activation / อัปเดตสถานะบอร์ดที่นี่
		deviceGroup.Get("/check-activation", middleware.RequireInternalKey, controllers.CheckDeviceActivation)
		deviceGroup.Post("/status", middleware.RequireInternalKey, controllers.UpdateDevices)

		// AUTH: SSE (EventSource ส่ง ?token= มาได้)
		deviceGroup.Get("/stream", middleware.RequireAuth, controllers.StreamDevices)
	}

	alertGroup := app.Group("/api/alerts")
	{
		// INTERNAL: Python AI แจ้งเหตุเข้ามา
		alertGroup.Post("/ai", middleware.RequireInternalKey, controllers.CreateAlert)
		alertGroup.Post("/", middleware.RequireInternalKey, controllers.CreateAlert)

		// AUTH: Dashboard
		alertGroup.Get("/", middleware.RequireAuth, controllers.GetActiveAlerts)
		alertGroup.Get("/history", middleware.RequireAuth, controllers.GetHistoryAlerts)
		alertGroup.Put("/:id/resolve", middleware.RequireAuth, controllers.ResolveAlert) // API สำหรับ Dashboard (id)
		alertGroup.Get("/stats", middleware.RequireAuth, controllers.GetAlertStats)
		alertGroup.Get("/stream", middleware.RequireAuth, controllers.StreamAlerts)

		// 🌟 PUBLIC: API สำหรับหน้า /alert จาก LINE / Telegram — handler ตรวจ alert token (X-Alert-Token / ?token= / body token)
		alertGroup.Get("/device", controllers.GetAlertDeviceInfo)
		alertGroup.Post("/acknowledge", controllers.AcknowledgeAlert)
	}

	// ==========================================
	// 📍 หมวดหมู่ Audio (จัดการไฟล์เสียงที่บันทึก)
	// ==========================================
	audioGroup := app.Group("/api/audio")
	{
		// INTERNAL: Python AI ส่งไฟล์เสียงเข้ามา
		audioGroup.Post("/emergency", middleware.RequireInternalKey, controllers.SaveEmergencyAudio)
		audioGroup.Post("/negative", middleware.RequireInternalKey, controllers.SaveNegativeAudio)

		// AUTH
		audioGroup.Get("/my-logs", middleware.RequireAuth, controllers.GetMyDetectionLogs)

		// ⚠️ ลำดับสำคัญ: "/" (list) ต้องมาก่อน "/:filename"
		audioGroup.Get("/", middleware.RequireAuth, middleware.RequireAdmin, controllers.ListAudioFiles)
		// OptionalAuth: ไม่ปฏิเสธเอง — GetAudioFile ตัดสินสิทธิ์ (JWT admin/ผู้ดูแลที่ผูกอยู่ หรือ ?mac=&alert_token= จากหน้า /alert)
		audioGroup.Get("/:filename", middleware.OptionalAuth, controllers.GetAudioFile)
		audioGroup.Delete("/:filename", middleware.RequireAuth, middleware.RequireAdmin, controllers.DeleteAudioFile)
	}

}
