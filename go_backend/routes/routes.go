package routes

import (
	"github.com/gofiber/fiber/v2"
	"go_backend/controllers"
)

func SetupRoutes(app *fiber.App) {
	// ... โค้ด route เดิมของคุณ ...

	app.Get("/login", controllers.Login)
	app.Get("/callback", controllers.Callback)
	app.Get("/logout", controllers.Logout)
	
	app.Get("/profile", controllers.GetProfile)

	// 📍 เพิ่มเส้นทางนี้เข้าไป เพื่อให้ Next.js ดึงข้อมูลได้
	app.Get("/profile", func(c *fiber.Ctx) error {
		// เช็คว่ามี Cookie (JWT) ส่งมาด้วยไหม
		token := c.Cookies("token")
		if token == "" {
			return c.Status(401).SendString("กรุณาล็อกอินก่อน (ไม่มี Token)")
		}

		// ถ้ามี Token ถือว่าผ่านการ Login มาแล้ว
		// (เดี๋ยวเราค่อยมาเขียนระบบถอดรหัส JWT เพื่อดึงชื่อผู้ใช้ทีหลัง)
		return c.SendString("นี่คือข้อมูลส่วนตัวจาก Backend! คุณได้รับสิทธิ์ให้เข้าถึงหน้า Dashboard")
	})
}