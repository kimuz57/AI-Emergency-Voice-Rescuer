package controllers

import (
	"fmt"
	"go_backend/config"
	"go_backend/database"
	"go_backend/middleware"
	"go_backend/models"
	"go_backend/utils"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
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

// ระยะเวลาขั้นต่ำระหว่างการแจ้งเตือน LINE/Telegram ของอุปกรณ์เดียวกัน (key: alert:notify:{MAC})
const notifyThrottleTTL = 60 * time.Second

// 1. API: ดึงรายชื่อไฟล์เสียง .wav ทั้งหมด (admin เท่านั้น — บังคับที่ routes)
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

// audioFilePath ตรวจชื่อไฟล์เสียงแบบเข้ม (S13) แล้วคืน path ภายใน audioDir
// ต้องเป็นชื่อไฟล์เดี่ยว (filepath.Base ต้องเท่ากับ input) ไม่มีตัวคั่น path / ไดรฟ์ และนามสกุล .wav เท่านั้น
// (เดิมเช็ค filepath.Clean หลัง filepath.Join ซึ่ง Join clean ให้แล้วเสมอ เงื่อนไขจึงไม่เคยเป็นจริง)
func audioFilePath(filename string) (string, bool) {
	if filename == "" || filename == "." || filename == ".." {
		return "", false
	}
	if strings.ContainsAny(filename, "/\\:\x00") || filepath.Base(filename) != filename {
		return "", false
	}
	if filepath.Ext(filename) != ".wav" || strings.HasPrefix(filename, ".") {
		return "", false
	}
	return filepath.Join(audioDir, filename), true
}

// 2. API: สตรีมมิ่งเล่นไฟล์เสียง (route ใช้ middleware.OptionalAuth — handler นี้ตัดสินสิทธิ์เองทั้งหมด)
// ทางเข้าที่อนุญาต:
//   - JWT (cookie / Bearer / ?token=): admin ฟังได้ทุกไฟล์, ผู้ดูแลฟังได้เฉพาะไฟล์ของผู้ป่วยที่ผูกกับตัวเอง
//   - alert token ของหน้า /alert (?mac=&alert_token= หรือ header X-Alert-Token): เฉพาะไฟล์ที่ detection_logs ของ MAC นั้นอ้างถึง
//
// ไม่มีทั้งสองอย่าง → 401, มีแต่ไม่มีสิทธิ์ในไฟล์นี้ → 403
func GetAudioFile(c *fiber.Ctx) error {
	filePath, ok := audioFilePath(c.Params("filename"))
	if !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "พาธไฟล์ไม่ถูกต้อง"})
	}
	audioURL := "/api/audio/" + filepath.Base(filePath)

	// เช็คสิทธิ์ก่อน os.Stat จึงไม่บอกว่าไฟล์มีอยู่จริงหรือไม่ (ชื่อที่ไม่มีอยู่ก็ได้ 401/403 เหมือนกัน)
	allowed, status := false, fiber.StatusUnauthorized

	// ไม่มี JWT ที่ถูกต้อง (OptionalAuth ไม่ได้ตั้ง Locals) หรือ user หาไม่เจอใน DB → คง 401 และยังลองทาง alert token ด้านล่างได้
	if me, err := middleware.CurrentUser(c); err == nil {
		if me.Role == "admin" {
			allowed = true
		} else {
			var count int64
			if err := database.DB.Model(&models.DetectionLog{}).
				Where("detection_logs.audio_url = ?", audioURL).
				Scopes(linkedPatientsScope(me.ID)).
				Count(&count).Error; err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "เกิดข้อผิดพลาดกับฐานข้อมูล"})
			}
			allowed = count > 0
			status = fiber.StatusForbidden
		}
	}

	// ทางเข้าจากหน้า /alert (เปิดจากลิงก์ LINE/Telegram โดยไม่ได้ล็อกอิน) — URL นี้สร้างโดย GetAlertDeviceInfo
	if !allowed {
		mac := normalizeMAC(c.Query("mac"))
		alertToken := strings.TrimSpace(c.Get("X-Alert-Token"))
		if alertToken == "" {
			alertToken = strings.TrimSpace(c.Query("alert_token"))
		}
		// token ผิด/หมดอายุ ถือว่าไม่มี credential นี้ (คง status เดิม: 401 ถ้าไม่มี JWT ด้วย)
		if mac != "" && alertToken != "" && utils.VerifyAlertToken(mac, alertToken) {
			var count int64
			if err := database.DB.Model(&models.DetectionLog{}).
				Where("detection_logs.audio_url = ? AND UPPER(detection_logs.device_mac) = ?", audioURL, mac).
				Count(&count).Error; err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "เกิดข้อผิดพลาดกับฐานข้อมูล"})
			}
			allowed = count > 0
			status = fiber.StatusForbidden
		}
	}

	if !allowed {
		if status == fiber.StatusUnauthorized {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized: กรุณาเข้าสู่ระบบก่อน"})
		}
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "คุณไม่มีสิทธิ์เข้าถึงไฟล์เสียงนี้"})
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

// 3. API: ลบไฟล์เสียง (admin เท่านั้น — บังคับที่ routes)
func DeleteAudioFile(c *fiber.Ctx) error {
	filePath, ok := audioFilePath(c.Params("filename"))
	if !ok {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "พาธไฟล์ไม่ถูกต้อง"})
	}

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

	// 🟢 2. เก็บไว้ที่เดียวกับ audioDir ที่ GetAudioFile เสิร์ฟ (ต้องตรงกัน)
	uploadDir := "./audio_recordings"

	// 🟢 3. ใช้ os.MkdirAll เพื่อรับประกันว่าสร้างโฟลเดอร์สำเร็จแน่นอนไม่ว่าจะซ้อนกี่ชั้น
	if _, err := os.Stat(uploadDir); os.IsNotExist(err) {
		if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
			fmt.Println("❌ สร้างโฟลเดอร์ไม่สำเร็จ:", err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create directory"})
		}
	}

	// ตั้งชื่อไฟล์เสียงไม่ให้ซ้ำกัน (ใช้เวลาปัจจุบันมาต่อท้าย)
	// นามสกุลบังคับเป็น .wav เสมอ (ไม่ใช้ filepath.Ext(file.Filename) ของ client — เดิมโฟลเดอร์นี้ถูกเสิร์ฟแบบ static
	// ถ้ารับ .html/.svg ได้จะกลายเป็น stored XSS บน origin ของ backend และ GetAudioFile ก็รับแค่ .wav อยู่แล้ว)
	filename := fmt.Sprintf("emergency_%d.wav", time.Now().UnixNano())

	// 🟢 4. เปลี่ยนชื่อตัวแปรจาก filepath เป็น savePath เพื่อไม่ให้ชื่อชนกับ package filepath
	savePath := filepath.Join(uploadDir, filename)

	// เซฟไฟล์ลงในเครื่อง Server หลังบ้าน
	if err := c.SaveFile(file, savePath); err != nil {
		fmt.Println("❌ เซฟไฟล์ไม่สำเร็จ:", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save file"})
	}

	// 🔍 ลอจิกค้นหาในตาราง Devices ด้วย MACAddress ที่แปลงเป็นพิมพ์ใหญ่แล้ว
	var sourceDevice models.Device
	var patientID *uint = nil

	// 🟢 แก้ไข: ใช้ UPPER() ทั้งสองฝั่ง เพื่อให้หาเจอแน่นอน ไม่ว่าในฐานข้อมูลหรือ Python จะส่งมาเป็นพิมพ์เล็กหรือใหญ่
	if err := database.DB.Where("UPPER(mac_address) = UPPER(?)", rawMac).First(&sourceDevice).Error; err == nil {
		var deviceRelation models.Device_patient
		if err := database.DB.Where("device_id = ?", sourceDevice.ID).First(&deviceRelation).Error; err == nil {
			if deviceRelation.PatientID != 0 {
				patientID = &deviceRelation.PatientID // ถ้าเจอผูก ID ผู้ป่วยทันที
				fmt.Printf("✅ เจออุปกรณ์แล้ว! ผูกกับ PatientID: %d\n", *patientID)
			}
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
	// 🚀 ระบบแจ้งเตือน (LINE และ Telegram)
	// ==========================================
	// 🟢 Throttle ต่ออุปกรณ์: Python ส่ง "yes" มาได้ทุก ~2 วินาที จึงแจ้ง LINE/Telegram ไม่เกิน 1 ครั้งต่อ notifyThrottleTTL
	// (ไฟล์เสียงและ detection_logs ยังบันทึกทุกครั้งตามเดิม)
	shouldNotify := true
	notifyKey := fmt.Sprintf("alert:notify:%s", normalizeMAC(rawMac))
	if patientID != nil {
		first, err := database.SetNX(notifyKey, true, notifyThrottleTTL)
		if err != nil {
			// Redis มีปัญหา → fail open ยังแจ้งเตือนต่อ ดีกว่าเงียบในเหตุฉุกเฉิน
			fmt.Printf("⚠️ [Throttle] เช็ค Redis ไม่สำเร็จ (%v) แจ้งเตือนต่อโดยไม่ throttle\n", err)
		} else if !first {
			shouldNotify = false
			fmt.Printf("⏳ [Throttle] MAC %s เพิ่งแจ้งเตือนไปไม่ถึง %v ข้ามการส่ง LINE/Telegram\n", macAddress, notifyThrottleTTL)
		}
	}

	if patientID != nil && shouldNotify {
		var patientData models.Patient
		// 🟢 1. ดึงข้อมูลผู้ป่วย พร้อมโหลดข้อมูลผู้ดูแล (Caregivers)
		if err := database.DB.Preload("Caregivers").First(&patientData, *patientID).Error; err == nil {

			// 🟢 2. วนลูปรายชื่อผู้ดูแลทุกคน
			for _, caregiver := range patientData.Caregivers {

				// --- แผนก LINE OA ---
				var lineMapping models.UserLineMapping
				// เปลี่ยนมาใช้ caregiver.ID แทน patientData.UserID
				if err := database.DB.Where("user_id = ?", caregiver.ID).First(&lineMapping).Error; err == nil {
					fmt.Println("👉 [LINE] เจอคนผูกไลน์แล้ว! เตรียมยิงไปที่ LineUserID:", lineMapping.LineUserID)
					go sendLineOAPushMessage(lineMapping.LineUserID, patientData.Name, patientData.RoomNumber, macAddress)
				} else {
					fmt.Printf("⚠️ [LINE] คนดูแล ID %d ยังไม่ได้ผูกบัญชี LINE OA\n", caregiver.ID)
				}

				// --- แผนก Telegram ---
				var tgMapping models.UserTelegramMapping
				// เปลี่ยนมาใช้ caregiver.ID แทน patientData.UserID
				if err := database.DB.Where("user_id = ? AND is_telegram_connected = ? AND notify_telegram = ?", caregiver.ID, true, true).First(&tgMapping).Error; err == nil {
					fmt.Println("👉 [TELEGRAM] เจอคนผูก Telegram แล้ว! เตรียมยิงไปที่ ChatID:", tgMapping.TelegramChatID)
					go sendTelegramPushMessage(tgMapping.TelegramChatID, patientData.Name, patientData.RoomNumber, macAddress)
				} else {
					fmt.Printf("⚠️ [TELEGRAM] ผู้ดูแล ID %d ไม่ได้ผูก Telegram หรือปิดแจ้งเตือนไว้\n", caregiver.ID)
				}
			}

		} else {
			fmt.Println("❌ ดึงข้อมูลผู้ป่วยไม่สำเร็จ ไม่สามารถส่งแจ้งเตือนได้")
			// ยังไม่ได้แจ้งใคร → ปลด throttle เพื่อให้ window ถัดไปลองแจ้งใหม่ได้ทันที
			if err := database.Del(notifyKey); err != nil {
				fmt.Printf("⚠️ [Throttle] ลบ key %s ไม่สำเร็จ: %v\n", notifyKey, err)
			}
		}
	} else if patientID == nil {
		fmt.Println("⚠️ อุปกรณ์นี้ยังไม่ได้ผูกกับผู้ป่วย เลยไม่มีเป้าหมายให้แจ้งเตือนผ่านแอป")
	}
	// ==========================================

	return c.JSON(fiber.Map{
		"success": true,
		"message": "บันทึกเหตุฉุกเฉินและผูกประวัติผู้ป่วยเรียบร้อย!",
		"log_id":  log.ID,
	})
}

// GET /api/audio/my-logs — ประวัติของผู้ป่วยที่ผูกกับผู้ใช้ปัจจุบัน (B19)
// เดิมอ่าน c.Locals("user_id") ที่ไม่มีใครตั้ง และ query patients.user_id ที่ไม่มีอยู่จริง
func GetMyDetectionLogs(c *fiber.Ctx) error {
	me, err := middleware.CurrentUser(c)
	if err != nil {
		return middleware.IdentityError(c, err)
	}

	logs := make([]models.DetectionLog, 0)

	// ใช้ subquery แทน JOIN caregiver_patients เพื่อไม่ให้ log ซ้ำเมื่อมีแถวผูกซ้ำกันหลายแถว
	err = database.DB.
		Joins("JOIN patients ON patients.id = detection_logs.patient_id AND patients.deleted_at IS NULL").
		Scopes(linkedPatientsScope(me.ID)).
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

	filename := fmt.Sprintf("%s/negative_%d.wav", saveDir, time.Now().UnixMilli())
	if err := c.SaveFile(file, filename); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "เซฟไฟล์เสียงปกติลงดิสก์ไม่สำเร็จ"})
	}

	env := config.GetEnv("APP_ENV", "development")
	if env == "development" {
		fmt.Printf("[GO] ได้รับไฟล์ Negative ใหม่ -> ")
	}

	cleanupOldNegativeFiles(saveDir, 10)

	return c.JSON(fiber.Map{"status": "success", "message": "Saved negative audio and optimized storage"})
}

// 🕵️‍♂️ ฟังก์ชันทำความสะอาด (เวอร์ชันติดล็อคแม่กุญแจ)
func cleanupOldNegativeFiles(dir string, maxFiles int) {
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
