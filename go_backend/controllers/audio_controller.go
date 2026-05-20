package controllers

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync" // 🟢 เพิ่ม sync เพื่อสร้างแม่กุญแจล็อคคิว
	"time"

	"github.com/gofiber/fiber/v2"
)

// 🟢 สร้างแม่กุญแจสำหรับล็อคคิวจัดการไฟล์ (กันแย่งกันลบ)
var cleanupMutex sync.Mutex

// โครงสร้างข้อมูลไฟล์เสียงที่ส่งกลับไปให้หน้าเว็บ
type AudioFileInfo struct {
	Filename  string    `json:"filename"`
	Size      int64     `json:"size_bytes"`
	CreatedAt time.Time `json:"created_at"`
	URL       string    `json:"url"`
}

// ⚠️ สำคัญ: กำหนด Path โฟลเดอร์ที่ Python เซฟไฟล์เสียงไว้
const audioDir = "./audio_recordings"

// 1. API: ดึงรายชื่อไฟล์เสียง .wav ทั้งหมด
func ListAudioFiles(c *fiber.Ctx) error {
	files, err := os.ReadDir(audioDir)
	if err != nil {
		if os.IsNotExist(err) {
			return c.JSON([]AudioFileInfo{})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "ไม่สามารถอ่านโฟลเดอร์ไฟล์เสียงได้",
		})
	}

	var audioList []AudioFileInfo

	for _, file := range files {
		if !file.IsDir() && filepath.Ext(file.Name()) == ".wav" {
			info, err := file.Info()
			if err != nil {
				continue
			}

			audioList = append(audioList, AudioFileInfo{
				Filename:  file.Name(),
				Size:      info.Size(),
				CreatedAt: info.ModTime(),
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

	if filepath.Clean(filePath) != filePath {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "พาธไฟล์ไม่ถูกต้อง"})
	}

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "ไม่พบไฟล์เสียงที่ระบุ"})
	}

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

// 🚨 ฟังก์ชันสำหรับรับไฟล์เสียงฉุกเฉินจาก Python AI มาบันทึกเก็บไว้
func SaveEmergencyAudio(c *fiber.Ctx) error {
	file, err := c.FormFile("sound")
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ไม่พบไฟล์เสียงฉุกเฉิน"})
	}

	saveDir := "./audio_recordings"
	os.MkdirAll(saveDir, os.ModePerm)

	filename := fmt.Sprintf("%s/emergency_%d.wav", saveDir, time.Now().Unix())

	if err := c.SaveFile(file, filename); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "เซฟไฟล์เสียงฉุกเฉินลงดิสก์ไม่สำเร็จ"})
	}

	fmt.Printf("🚨 [GO BACKEND] ตรวจพบเหตุฉุกเฉิน! บันทึกไฟล์เสียงเรียบร้อย: %s\n", filename)
	return c.JSON(fiber.Map{"status": "success", "message": "Saved emergency audio successfully"})
}

// ⚪ ฟังก์ชันสำหรับรับไฟล์เสียงปกติ (Negative) มาบันทึกแยกไว้ในโฟลเดอร์สำหรับทดสอบ
func SaveNegativeAudio(c *fiber.Ctx) error {
	file, err := c.FormFile("sound")
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "ไม่พบไฟล์เสียง"})
	}

	saveDir := "./negative"
	os.MkdirAll(saveDir, os.ModePerm)

	// บันทึกไฟล์ใหม่โดยใช้ UnixMilli() ป้องกันชื่อไฟล์ซ้ำในระดับเสี้ยววินาที
	filename := fmt.Sprintf("%s/negative_%d.wav", saveDir, time.Now().UnixMilli())
	if err := c.SaveFile(file, filename); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "เซฟไฟล์เสียงปกติลงดิสก์ไม่สำเร็จ"})
	}
	
	fmt.Printf("⚪ [GO] ได้รับไฟล์ Negative ใหม่ -> ")

	// เรียกฟังก์ชันเคลียร์ไฟล์ (ตั้งโควตาไว้ที่ 10 ไฟล์)
	cleanupOldNegativeFiles(saveDir, 10)

	return c.JSON(fiber.Map{"status": "success", "message": "Saved negative audio and optimized storage"})
}

// 🕵️‍♂️ ฟังก์ชันทำความสะอาด (เวอร์ชันติดล็อคแม่กุญแจ)
func cleanupOldNegativeFiles(dir string, maxFiles int) {
	// 🟢 ล็อคคิวทันที! ใครมาพร้อมกันต้องยืนรอ
	cleanupMutex.Lock()
	defer cleanupMutex.Unlock()

	files, err := os.ReadDir(dir)
	if err != nil {
		fmt.Println("❌ อ่านโฟลเดอร์ล้มเหลว:", err)
		return
	}

	var fileList []os.DirEntry
	for _, f := range files {
		if !f.IsDir() {
			fileList = append(fileList, f)
		}
	}

	fmt.Printf("ยอดรวมปัจจุบัน: %d/%d ไฟล์ ", len(fileList), maxFiles)
	fmt.Println()

	// 🟢 จัดเรียงลำดับไฟล์ตาม "ชื่อไฟล์" (แม่นยำกว่าการดึงเวลา OS)
	sort.Slice(fileList, func(i, j int) bool {
		return fileList[i].Name() < fileList[j].Name()
	})

	filesToDelete := len(fileList) - maxFiles
	for i := 0; i < filesToDelete; i++ {
		targetDeletePath := filepath.Join(dir, fileList[i].Name())
		err := os.Remove(targetDeletePath)
		if err != nil {
			fmt.Printf("ลบพลาด (%s): %v\n", fileList[i].Name(), err)
		} else {
			fmt.Printf("ลบทิ้งไฟล์เก่า: %s\n", fileList[i].Name())
		}
	}
}