package routes

import (
	"github.com/gofiber/fiber/v2"
	"go_backend/controllers" // นำเข้า controllers ของเรา
)

func SetupRoutes(app *fiber.App) {
	// 🟢 เส้นทางเช็คสถานะ API (ไว้สำหรับเช็คว่า Server ล่มไหม)
	app.Get("/api/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok", "message": "Guardian AI API is running smoothly! 🚀"})
	})

	// ==========================================
	// 📍 หมวดหมู่ Auth (ระบบล็อกอิน/สมัครสมาชิก)
	// ==========================================
	authGroup := app.Group("/api/auth")
	{
		// ล็อกอินผ่าน Google (NextAuth)
		authGroup.Post("/google", controllers.GoogleLogin)
		
		// ล็อกอินด้วย Email/Password ธรรมดา (ย้าย Logic ไปไว้ใน Controller แล้ว)
		authGroup.Post("/login", controllers.LoginWithEmail)
		
		// สมัครสมาชิกใหม่
		authGroup.Post("/register", controllers.Register)
		
		// ออกจากระบบ
		authGroup.Post("/logout", controllers.Logout)
	}

	// ==========================================
	// 📍 หมวดหมู่ User (จัดการข้อมูลผู้ใช้งาน)
	// ==========================================
	userGroup := app.Group("/api/user")
	{
		// ดึงโปรไฟล์ (ดึงข้อมูลผู้ใช้ปัจจุบัน)
		userGroup.Get("/profile", controllers.GetProfile)
	}

	// ==========================================
	// 📍 หมวดหมู่ Patients (จัดการข้อมูลผู้ป่วย/คนชรา)
	// ==========================================
	patientGroup := app.Group("/api/patients")
	{
		patientGroup.Post("/", controllers.CreatePatient)
		patientGroup.Post("/register", controllers.RegisterPatientWithDevice)
	}

	// ==========================================
	// 📍 หมวดหมู่ Alerts (ระบบแจ้งเตือนเหตุฉุกเฉิน)
	// ==========================================
	alertGroup := app.Group("/api/alerts")
	{
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
        audioGroup.Post("/negative", controllers.SaveNegativeAudio) // เพิ่ม API สำหรับรับไฟล์เสียงที่ไม่ใช่เหตุฉุกเฉิน (เก็บไว้ใช้เทรนโมเดลในอนาคต)
		
		audioGroup.Get("/", controllers.ListAudioFiles)
		audioGroup.Get("/:filename", controllers.GetAudioFile)
		audioGroup.Delete("/:filename", controllers.DeleteAudioFile)
        
        
	}
}