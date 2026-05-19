package controllers

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/gofiber/fiber/v2"
)

// โครงสร้างข้อมูลไฟล์เสียงที่ส่งกลับไปให้หน้าเว็บ
type AudioFileInfo struct {
	Filename  string    `json:"filename"`
	Size      int64     `json:"size_bytes"`
	CreatedAt time.Time `json:"created_at"`
	URL       string    `json:"url"`
}

// ⚠️ สำคัญ: กำหนด Path โฟลเดอร์ที่ Python เซฟไฟล์เสียงไว้
// ถ้า Go กับ Python อยู่คนละที่ แนะนำให้เปลี่ยนเป็น Absolute Path (เช่น "D:/backend_golang/audio_recordings")
const audioDir = "./audio_recordings"

// 1. API: ดึงรายชื่อไฟล์เสียง .wav ทั้งหมด
func ListAudioFiles(c *fiber.Ctx) error {
	files, err := os.ReadDir(audioDir)
	if err != nil {
		// ถ้ายังไม่มีโฟลเดอร์ ให้ส่ง Array ว่างกลับไป (ไม่ให้ระบบพัง)
		if os.IsNotExist(err) {
			return c.JSON([]AudioFileInfo{})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "ไม่สามารถอ่านโฟลเดอร์ไฟล์เสียงได้",
		})
	}

	var audioList []AudioFileInfo

	for _, file := range files {
		// กรองเอาเฉพาะไฟล์ .wav
		if !file.IsDir() && filepath.Ext(file.Name()) == ".wav" {
			info, err := file.Info()
			if err != nil {
				continue
			}

			audioList = append(audioList, AudioFileInfo{
				Filename:  file.Name(),
				Size:      info.Size(),
				CreatedAt: info.ModTime(),
				// สร้าง URL สำหรับให้หน้าเว็บเรียกมาฟัง
				URL:       fmt.Sprintf("http://localhost:8080/api/audio/%s", file.Name()), 
			})
		}
	}

	return c.JSON(audioList)
}

// 2. API: สตรีมมิ่งเล่นไฟล์เสียง
func GetAudioFile(c *fiber.Ctx) error {
	filename := c.Params("filename")
	filePath := filepath.Join(audioDir, filename)

	// ป้องกันคนแฮกใส่ชื่อไฟล์แปลกๆ (Directory Traversal)
	if filepath.Clean(filePath) != filePath {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "พาธไฟล์ไม่ถูกต้อง"})
	}

	// เช็คว่ามีไฟล์จริงไหม
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "ไม่พบไฟล์เสียงที่ระบุ"})
	}

	// ส่งไฟล์กลับไป Fiber จะทำ Header เป็น audio/wav ให้เอง ทำให้กด Play บนเว็บได้เลย!
	return c.SendFile(filePath)
}

// 3. API: ลบไฟล์เสียง
func DeleteAudioFile(c *fiber.Ctx) error {
	filename := c.Params("filename")
	filePath := filepath.Join(audioDir, filename)

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "ไม่พบไฟล์เสียงที่ระบุ"})
	}

	if err := os.Remove(filePath); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ไม่สามารถลบไฟล์เสียงได้"})
	}

	return c.JSON(fiber.Map{
		"message": "ลบไฟล์เสียงสำเร็จ",
	})
}