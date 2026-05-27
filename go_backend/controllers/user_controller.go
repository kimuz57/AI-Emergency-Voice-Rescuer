package controllers

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"go_backend/database"
	"go_backend/models"
	"github.com/gofiber/fiber/v2"
	"go_backend/config"
)
var BASE_URL = config.GetEnv("APP_BASE_URL", "http://localhost:8080") // 🟢 เพิ่มตัวแปร BASE_URL เพื่อใช้ในการสร้าง URL รูปภาพโปรไฟล์
// โครงสร้างรับข้อมูลที่หน้าเว็บจะส่งมา
type UpdateProfileRequest struct {
	Email string `json:"email"`
	Name  string `json:"name"`
	Phone string `json:"phone"`
}

// API: อัปเดตข้อมูลผู้ใช้งาน (ชื่อ, เบอร์โทร)
func UpdateUserProfile(c *fiber.Ctx) error {
	req := new(UpdateProfileRequest)
	
	// 1. รับข้อมูลจาก Body (JSON)
	if err := c.BodyParser(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "รูปแบบข้อมูลไม่ถูกต้อง",
		})
	}

	var user models.User
	
	// 2. ค้นหาผู้ใช้จากอีเมล
	if err := database.DB.Where("email = ?", req.Email).First(&user).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "ไม่พบข้อมูลผู้ใช้งาน",
		})
	}

	// 3. อัปเดตค่าใหม่
	user.Name = req.Name
	user.Phone = req.Phone

	// 4. บันทึกลงฐานข้อมูล
	if err := database.DB.Save(&user).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "ไม่สามารถอัปเดตข้อมูลได้",
		})
	}

	return c.JSON(fiber.Map{
		"message": "อัปเดตข้อมูลสำเร็จ!",
	})
}

// API: ดึงข้อมูลโปรไฟล์ผู้ใช้จาก Query Email
func GetUserProfile(c *fiber.Ctx) error {
	email := c.Query("email")
	if email == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "กรุณาระบุอีเมลผู้ใช้งาน",
		})
	}

	var user models.User
	// 1. ค้นหาในตาราง users ด้วยอีเมล
	if err := database.DB.Where("email = ?", email).First(&user).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "ไม่พบข้อมูลผู้ใช้งานในระบบ",
		})
	}
	// 🟢 3. ส่งข้อมูลกลับไปให้หน้าบ้าน (มีทั้งรูปภาพเดิม และสถานะ LINE ใหม่)
	return c.JSON(fiber.Map{
		"name":            user.Name,
		"email":           user.Email,
		"role":            user.Role,
		"phone":           user.Phone, // ถ้าหน้าเว็บมีการโชว์เบอร์โทรด้วย ให้แนบกลับไปแบบนี้ครับ
		"profileImage":    user.Profile, 
		"isLineConnected": user.IsLinkedLine, // 👈 เปลี่ยนเป็น I ใหญ่
		"notifyWeb":       true,
		"notifyLine":      user.IsLinkedLine, // 👈 เปลี่ยนเป็น I ใหญ่
	})
}

func UploadProfileImage(c *fiber.Ctx) error {
	// 1. รับค่าอีเมลจาก Form Data
	email := c.FormValue("email")
	if email == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ไม่พบข้อมูลอีเมล"})
	}

	// 2. ค้นหาผู้ใช้งานจาก Database
	var user models.User
	if err := database.DB.Where("email = ?", email).First(&user).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "ไม่พบผู้ใช้งานในระบบ"})
	}

	// 3. รับไฟล์จาก Form Data (ชื่อฟิลด์ "profile_image" ต้องตรงกับฝั่ง Next.js)
	file, err := c.FormFile("profile_image")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ไม่พบไฟล์รูปภาพที่อัปโหลดมา"})
	}

	// 4. สร้างโฟลเดอร์ ./profile (ถ้ายังไม่มีให้สร้างใหม่อัตโนมัติ)
	uploadDir := "./profile"
	if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ไม่สามารถสร้างโฟลเดอร์เก็บรูปได้"})
	}

	// 5. ตั้งชื่อไฟล์ใหม่ ป้องกันชื่อซ้ำกัน (เช่น 1_1710000000.jpg)
	ext := filepath.Ext(file.Filename)
	newFileName := fmt.Sprintf("%d_%d%s", user.ID, time.Now().Unix(), ext)
	savePath := fmt.Sprintf("%s/%s", uploadDir, newFileName)

	// 6. บันทึกไฟล์ลงในเครื่อง Backend
	if err := c.SaveFile(file, savePath); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "บันทึกไฟล์รูปภาพล้มเหลว"})
	}

	// 7. สร้าง URL สำหรับดึงรูปไปโชว์ที่หน้าเว็บ (ชี้มาที่พอร์ต 8080)
	imageUrl := fmt.Sprintf("%s/profile/%s", BASE_URL, newFileName)

	// 8. อัปเดตคอลัมน์ Profile ใน Database
	database.DB.Model(&user).Update("profile", imageUrl)

	return c.JSON(fiber.Map{
		"message":  "อัปโหลดรูปโปรไฟล์สำเร็จ",
		"imageUrl": imageUrl,
	})
}
