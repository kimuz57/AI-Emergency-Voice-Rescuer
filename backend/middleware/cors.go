package middleware

import (
	"github.com/gofiber/fiber/v2"
)

// RequireAdmin ต้องวางต่อจาก RequireAuth เสมอ
// อ่าน role จาก Database ใหม่ทุกครั้ง (ไม่เชื่อค่าใน token หรือ localStorage)
func RequireAdmin(c *fiber.Ctx) error {
	// 1-2. ดึง user จาก JWT ที่ RequireAuth ฝากไว้ใน Locals แล้วโหลดจาก Database
	user, err := CurrentUser(c)
	if err != nil {
		return IdentityError(c, err)
	}

	// 🛑 3. ด่านสกัด: เช็คว่า Role เป็น admin หรือไม่
	if user.Role != "admin" {
		return c.Status(403).JSON(fiber.Map{
			"error": "Access Denied: คุณไม่มีสิทธิ์เข้าถึงส่วนผู้ดูแลระบบ",
		})
	}

	// ผ่านด่านได้ ให้ไปทำงานฟังก์ชันถัดไป
	return c.Next()
}
