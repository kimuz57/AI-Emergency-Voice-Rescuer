package controllers

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync" // 🟢 เพิ่ม sync เพื่อสร้างแม่กุญแจล็อคคิว
	"strconv"
	"time"
	"strings"
	"github.com/gofiber/fiber/v2"
	"go_backend/database"
	"go_backend/models"
	"go_backend/config"
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

	baseURL := os.Getenv("API_BASE_URL")
	if baseURL == "" {
		baseURL = "http://localhost:8080"
	}

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
				URL:       fmt.Sprintf("%s/api/audio/%s", baseURL, file.Name()),
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
	// 1. บอกหน้าเว็บว่านี่คือไฟล์เสียงประเภท WAV
	c.Set("Content-Type", "audio/wav")
	// 2. บอกหน้าเว็บว่า "อนุญาตให้ดึงข้อมูลเป็นช่วงๆ ได้" (ทำให้กดกรอแถบเวลาได้)
	c.Set("Accept-Ranges", "bytes")

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
	// รับไฟล์เสียงจาก Python (.wav)
	file, err := c.FormFile("audio")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Missing audio file"})
	}

	// 🟢 1. รับค่า MAC Address แล้วแปลงเป็น "ตัวพิมพ์ใหญ่" ทั้งหมด เพื่อให้ตรงกับในฐานข้อมูล
	rawMac := c.FormValue("device_mac")
	macAddress := strings.ToUpper(rawMac)

	// รับค่าสถิติต่างๆ ที่ Python ส่งแนบมาด้วย
	eventType := c.FormValue("event_type", "emergency")
	confidence, _ := strconv.ParseFloat(c.FormValue("confidence", "0.0"), 64)
	decibelLevel, _ := strconv.ParseFloat(c.FormValue("decibel_level", "0.0"), 64)

	// 🟢 2. เปลี่ยนชื่อโฟลเดอร์ให้ตรงกับตอนเปิด Static Route (เก็บไว้ที่เดียวกับระบบ)
	uploadDir := "./audio_recordings"

	// 🟢 3. ใช้ os.MkdirAll เพื่อรับประกันว่าสร้างโฟลเดอร์สำเร็จแน่นอนไม่ว่าจะซ้อนกี่ชั้น
	if _, err := os.Stat(uploadDir); os.IsNotExist(err) {
		if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
			fmt.Println("❌ สร้างโฟลเดอร์ไม่สำเร็จ:", err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create directory"})
		}
	}

	// ตั้งชื่อไฟล์เสียงไม่ให้ซ้ำกัน (ใช้เวลาปัจจุบันมาต่อท้าย)
	filename := fmt.Sprintf("emergency_%d%s", time.Now().UnixNano(), filepath.Ext(file.Filename))

	// 🟢 4. เปลี่ยนชื่อตัวแปรจาก filepath เป็น savePath เพื่อไม่ให้ชื่อชนกับ package filepath
	savePath := filepath.Join(uploadDir, filename)

	// เซฟไฟล์ลงในเครื่อง Server หลังบ้าน
	if err := c.SaveFile(file, savePath); err != nil {
		fmt.Println("❌ เซฟไฟล์ไม่สำเร็จ:", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save file"})
	}

	// 🔍 ลอจิกค้นหาในตาราง Devices ด้วย MACAddress ที่แปลงเป็นพิมพ์ใหญ่แล้ว
	var device models.Device
	var patientID *uint = nil

	// 🟢 แก้ไข: ใช้ UPPER() ทั้งสองฝั่ง เพื่อให้หาเจอแน่นอน ไม่ว่าในฐานข้อมูลหรือ Python จะส่งมาเป็นพิมพ์เล็กหรือใหญ่
	if err := database.DB.Where("UPPER(mac_address) = UPPER(?)", rawMac).First(&device).Error; err == nil {
		if device.PatientID != 0 {
			patientID = &device.PatientID // ถ้าเจอ ผูก ID ผู้ป่วยทันที
			fmt.Printf("✅ เจออุปกรณ์แล้ว! ผูกกับ PatientID: %d\n", *patientID)
		}
	} else {
		// 🔴 เพิ่ม Log ให้ชัดเจนว่าหาไม่เจอเพราะอะไร และค่าที่รับมาคืออะไร
		fmt.Printf("⚠️ [WARN] ค้นหาอุปกรณ์ไม่เจอ! MAC ที่รับมาคือ: '%s', สาเหตุ: %v\n", rawMac, err)
	}

	// บันทึกลงตารางประวัติ DetectionLog แบบคลีนๆ
	log := models.DetectionLog{
		PatientID:    patientID,
		DeviceMAC:    macAddress,
		EventType:    eventType,
		Confidence:   confidence,
		DecibelLevel: decibelLevel,
		AudioURL:     fmt.Sprintf("/api/audio/%s", filename), // ส่ง URL กลับไปให้หน้าเว็บ
		Status:       "needs_help",
		IsResolved:   false, // 🟢 ย้ำสถานะเป็น false ให้ชัดเจนไปเลยว่า "ยังไม่ได้รับการช่วยเหลือ"
	}

	// สั่ง Create พร้อมเช็ค Error
	if err := database.DB.Create(&log).Error; err != nil {
		fmt.Println("❌ บันทึกลง Database ไม่สำเร็จ:", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create detection log"})
	}

	fmt.Println("✅ [GO] บันทึกเหตุฉุกเฉินลงฐานข้อมูลสำเร็จ! ไฟล์:", filename, "ผูกกับผู้ป่วย ID:", log.PatientID)

	// ==========================================
	// 🚀 ระบบแจ้งเตือน LINE OA (ทำงานต่อจากตรงนี้)
	// ==========================================
	if patientID != nil {
		var patientData models.Patient
		// 1. ดึงข้อมูลผู้ป่วยเพื่อเอา UserID (คนดูแล), ชื่อผู้ป่วย และห้องพัก
		if err := database.DB.First(&patientData, *patientID).Error; err == nil {
			
			// 2. ไปเช็คว่า UserID (คนดูแล) คนนี้ ผูกไลน์ไว้ไหมในตาราง UserLineMapping
			var lineMapping models.UserLineMapping
			if err := database.DB.Where("user_id = ?", patientData.UserID).First(&lineMapping).Error; err == nil {
				fmt.Println("👉 [LINE] เจอคนผูกไลน์แล้ว! เตรียมยิงไปที่ LineUserID:", lineMapping.LineUserID)
				
				// 3. สั่งเรียกฟังก์ชันส่ง LINE OA (ทำงานเป็น Background จะได้ไม่รอ)
				go sendLineOAPushMessage(lineMapping.LineUserID, patientData.Name, patientData.RoomNumber)
			} else {
				fmt.Println("⚠️ [LINE] คนดูแล ID", patientData.UserID, "ยังไม่ได้ผูกบัญชี LINE OA")
			}
			
		} else {
			fmt.Println("❌ [LINE] ดึงข้อมูลผู้ป่วยไม่สำเร็จ ไม่สามารถส่งแจ้งเตือนได้")
		}
	} else {
		fmt.Println("⚠️ [LINE] อุปกรณ์นี้ยังไม่ได้ผูกกับผู้ป่วย เลยไม่มีเป้าหมายให้แจ้งเตือนผ่าน LINE")
	}
	// ==========================================

	return c.JSON(fiber.Map{
		"success": true,
		"message": "บันทึกเหตุฉุกเฉินและผูกประวัติผู้ป่วยเรียบร้อย!",
		"log_id":  log.ID,
	})
}

func GetMyDetectionLogs(c *fiber.Ctx) error {
	// ดึงค่า UserID จาก JWT Token ที่ผ่าน Middleware มา (สมมติว่าผู้กองเก็บไว้ใน Local ชื่อ "user_id")
	// หากยังไม่มีระบบ JWT สามารถส่งผ่านมาทาง Query parameter ชั่วคราวก่อนได้ครับ
	userID := c.Locals("user_id") 
	if userID == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "สิทธิ์การเข้าถึงไม่ถูกต้อง"})
	}

	var logs []models.DetectionLog

	// 🔍 ลอจิกคัดกรอง: ดึงเฉพาะข้อมูลเสียงที่ PatientID นั้น มี UserID ของผู้ดูแลตรงกับคนที่กำลังเปิดดูหน้าเว็บอยู่
	err := database.DB.Joins("JOIN patients ON patients.id = detection_logs.patient_id").
		Where("patients.user_id = ?", userID).
		Order("detection_logs.created_at DESC").
		Find(&logs).Error

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ดึงข้อมูลล้มเหลว"})
	}

	return c.JSON(logs)
}

// ⚪ ฟังก์ชันสำหรับรับไฟล์เสียงปกติ (Negative) มาบันทึกแยกไว้ในโฟลเดอร์สำหรับทดสอบ
func SaveNegativeAudio(c *fiber.Ctx) error {
	file, err := c.FormFile("audio")
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
	
	env := config.GetEnv("APP_ENV", "development")
    if env == "development" {
        fmt.Printf("[GO] ได้รับไฟล์ Negative ใหม่ -> ")
    }

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
	var appEnv string
	appEnv = config.GetEnv("APP_ENV", "development")

    if appEnv == "development" {
        fmt.Printf("ยอดรวมปัจจุบัน: %d/%d ไฟล์ ", len(fileList), maxFiles)
        fmt.Println()
    }

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
			if appEnv == "development" {
				fmt.Printf("ลบทิ้งไฟล์เก่า: %s\n", fileList[i].Name())
			}
		}
	}
}