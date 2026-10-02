package controllers

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"go_backend/config"
	"go_backend/database"
	"go_backend/middleware"
	"go_backend/models"

	"github.com/gofiber/fiber/v2"
)
// 🟢 อ่าน API_BASE_URL ตอนรับ request (ไม่ใช่ตอน init package) เพราะ package-level var
// ถูกประเมินก่อน main() เรียก config.LoadConfig() ทำให้ค่าจาก .env ไม่ถูกอ่าน
func profileBaseURL() string {
	return config.GetEnv("API_BASE_URL", "http://localhost:8080")
}

// 🟢 ขนาดรูปโปรไฟล์สูงสุด (หมายเหตุ: Fiber จำกัด body ทั้ง request ที่ 4 MB โดย default ถ้าไม่ได้ตั้ง BodyLimit ใน main.go)
const maxProfileImageSize = 5 * 1024 * 1024

// 🟢 ชนิดไฟล์ที่อนุญาต (ตรวจจากเนื้อไฟล์จริงด้วย http.DetectContentType) → นามสกุลที่ใช้บันทึก
var allowedProfileImageTypes = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
}

// โครงสร้างรับข้อมูลที่หน้าเว็บจะส่งมา
// 🟢 Name/Phone เป็น pointer: ถ้าไม่ได้ส่งฟิลด์มา (เช่นหน้า settings/notifications ส่งแค่ notify*) จะไม่ไปล้างค่าเดิม
// 🟢 Email ไม่บังคับ: ถ้าไม่ส่งหรือเป็นของตัวเอง = แก้ของตัวเอง, ถ้าเป็นของคนอื่นต้องเป็น admin
type UpdateProfileRequest struct {
	Email string  `json:"email"`
	Name  *string `json:"name"`
	Phone *string `json:"phone"`
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

	// 2. ระบุผู้ใช้จาก token (ไม่เชื่อ email จาก body ถ้าไม่ใช่ admin)
	user, err := middleware.ResolveTargetUser(c, req.Email)
	if err != nil {
		return middleware.IdentityError(c, err)
	}

	// 3. อัปเดตเฉพาะฟิลด์ที่ส่งมาจริง
	// หมายเหตุ: notifyWeb/notifyLine/notifyTelegram ยังไม่มีคอลัมน์รองรับใน users จึงยังไม่ถูกบันทึก
	updates := map[string]interface{}{}
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.Phone != nil {
		updates["phone"] = *req.Phone
	}

	// 4. บันทึกลงฐานข้อมูล
	if len(updates) > 0 {
		if err := database.DB.Model(user).Updates(updates).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "ไม่สามารถอัปเดตข้อมูลได้",
			})
		}
	}

	return c.JSON(fiber.Map{
		"message": "อัปเดตข้อมูลสำเร็จ!",
	})
}

// API: ดึงข้อมูลโปรไฟล์ผู้ใช้ (ของตัวเองจาก token; ?email= ของคนอื่นได้เฉพาะ admin)
func GetUserProfile(c *fiber.Ctx) error {
	target, err := middleware.ResolveTargetUser(c, c.Query("email"))
	if err != nil {
		return middleware.IdentityError(c, err)
	}

	var user models.User
	// 1. โหลดข้อมูลผู้ใช้พร้อม Telegram mapping (query เดียว)
	if err := database.DB.Preload("TelegramMapping").First(&user, target.ID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "ไม่พบข้อมูลผู้ใช้งานในระบบ",
		})
	}
	// 🟢 3. ส่งข้อมูลกลับไปให้หน้าบ้าน (มีทั้งรูปภาพเดิม และสถานะ LINE ใหม่)
	return c.JSON(fiber.Map{
		"id":              user.ID,
		"name":            user.Name,
		"email":           user.Email,
		"role":            user.Role,
		"phone":           user.Phone, // ถ้าหน้าเว็บมีการโชว์เบอร์โทรด้วย ให้แนบกลับไปแบบนี้ครับ
		"profileImage":    user.Profile,
		"isLineConnected": user.IsLinkedLine, // 👈 เปลี่ยนเป็น I ใหญ่
		"notifyWeb":       true,
		"notifyLine":      user.IsLinkedLine, // 👈 เปลี่ยนเป็น I ใหญ่

		"isTelegramConnected": user.TelegramMapping.IsTelegramConnected,
		"notifyTelegram":      user.TelegramMapping.NotifyTelegram,
	})
}

func UploadProfileImage(c *fiber.Ctx) error {
	// 1. ระบุผู้ใช้จาก token (email ใน form ไม่บังคับ และใช้แทนคนอื่นได้เฉพาะ admin)
	user, err := middleware.ResolveTargetUser(c, c.FormValue("email"))
	if err != nil {
		return middleware.IdentityError(c, err)
	}

	// 2. รับไฟล์จาก Form Data (ชื่อฟิลด์ "profile_image" ต้องตรงกับฝั่ง Next.js)
	file, err := c.FormFile("profile_image")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ไม่พบไฟล์รูปภาพที่อัปโหลดมา"})
	}
	if file.Size <= 0 || file.Size > maxProfileImageSize {
		return c.Status(fiber.StatusRequestEntityTooLarge).JSON(fiber.Map{"error": "ไฟล์รูปภาพต้องมีขนาดไม่เกิน 5 MB"})
	}

	// 3. ตรวจชนิดไฟล์จากเนื้อไฟล์จริง (ไม่เชื่อนามสกุล/Content-Type ที่ client ส่งมา)
	src, err := file.Open()
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "อ่านไฟล์รูปภาพไม่สำเร็จ"})
	}
	head := make([]byte, 512)
	n, _ := io.ReadFull(src, head)
	src.Close()
	ext, ok := allowedProfileImageTypes[http.DetectContentType(head[:n])]
	if !ok {
		return c.Status(fiber.StatusUnsupportedMediaType).JSON(fiber.Map{"error": "รองรับเฉพาะไฟล์ JPEG, PNG หรือ WebP เท่านั้น"})
	}

	// 4. สร้างโฟลเดอร์ ./profile (ถ้ายังไม่มีให้สร้างใหม่อัตโนมัติ)
	uploadDir := "profile" // เอา ./ ออก เพื่อป้องกัน Path เพี้ยนเวลา Service รันเบื้องหลัง
	if err := os.MkdirAll(uploadDir, 0755); err != nil { // ใช้ 0755 แทน os.ModePerm (0777)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ไม่สามารถสร้างโฟลเดอร์เก็บรูปได้"})
	}

	// 5. ตั้งชื่อไฟล์แบบสุ่ม (เดาไม่ได้) นามสกุลมาจากชนิดไฟล์ที่ตรวจได้ ไม่ใช่จากชื่อไฟล์ของ client
	randBytes := make([]byte, 16)
	if _, err := rand.Read(randBytes); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "บันทึกไฟล์รูปภาพล้มเหลว"})
	}
	newFileName := fmt.Sprintf("%d_%s%s", user.ID, hex.EncodeToString(randBytes), ext)
	savePath := filepath.Join(uploadDir, newFileName)

	// 6. บันทึกไฟล์ลงในเครื่อง Backend
	if err := c.SaveFile(file, savePath); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "บันทึกไฟล์รูปภาพล้มเหลว"})
	}

	// 7. สร้าง URL สำหรับดึงรูปไปโชว์ที่หน้าเว็บ (ชี้มาที่พอร์ต 8080)
	imageUrl := fmt.Sprintf("%s/profile/%s", profileBaseURL(), newFileName)

	// 8. อัปเดตคอลัมน์ Profile ใน Database
	if err := database.DB.Model(user).Update("profile", imageUrl).Error; err != nil {
		os.Remove(savePath)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "บันทึกข้อมูลรูปโปรไฟล์ไม่สำเร็จ"})
	}

	return c.JSON(fiber.Map{
		"message":  "อัปโหลดรูปโปรไฟล์สำเร็จ",
		"imageUrl": imageUrl,
	})
}
