// Command seed ใส่ข้อมูลตัวอย่างลงฐานข้อมูล สำหรับตอนพัฒนาเท่านั้น
//
//	cd backend
//	go run ./cmd/seed              # สร้างเฉพาะสิ่งที่ยังไม่มี รันซ้ำได้
//	go run ./cmd/seed -reset-logs  # ลบ detection_logs ตัวอย่างเดิมแล้วสร้างใหม่ย้อนหลังจากวันนี้
//
// server (main.go) ไม่เรียกโปรแกรมนี้ ต้องรันเองเท่านั้น วิธีใช้เต็มอยู่ใน backend/README.md
package main

import (
	"encoding/binary"
	"errors"
	"flag"
	"fmt"
	"log"
	"math"
	"math/rand/v2"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"go_backend/config"
	"go_backend/database"
	"go_backend/models"
	"go_backend/utils"

	"gorm.io/gorm"
)

const (
	historyDays = 30

	// ไฟล์เสียงและ audio_url ของข้อมูลตัวอย่างขึ้นต้นด้วย seed- เสมอ ใช้แยกจากข้อมูลจริงตอน -reset-logs
	seedAudioPrefix = "seed-"
	audioDir        = "./audio_recordings" // ที่เดียวกับ controllers/audio_controller.go

	sampleRate  = 8000 // ตรงกับ firmware และ api/ (8 kHz mono 16-bit)
	clipSeconds = 2
)

type patientSeed struct {
	Name, Gender, Room, Condition string
	Age                           int
}

type deviceSeed struct {
	MAC, IP, Status string
	Active          bool
	Location        string // device_patients.device_name
	Patient         int    // index ใน seedPatients
}

// ชื่อสมมติทั้งหมด ไม่ใช่ผู้ป่วยจริง
var seedPatients = []patientSeed{
	{Name: "นายบุญมี ศรีสุข", Age: 78, Gender: "ชาย", Room: "101", Condition: "ความดันโลหิตสูง"},
	{Name: "นางสมพร แก้วใส", Age: 84, Gender: "หญิง", Room: "102", Condition: "เบาหวานชนิดที่ 2"},
	{Name: "นายเฉลิม ทองดี", Age: 71, Gender: "ชาย", Room: "103", Condition: "โรคหลอดเลือดสมอง (อ่อนแรงซีกซ้าย)"},
	{Name: "นางลำดวน บุญมา", Age: 89, Gender: "หญิง", Room: "104", Condition: "ภาวะสมองเสื่อมระยะเริ่มต้น"},
}

// MAC แบบ locally administered (02:...) จึงไม่ชนกับบอร์ด ESP32 จริง
var seedDevices = []deviceSeed{
	{MAC: "02:5E:ED:00:00:01", IP: "192.168.1.101", Status: "online", Active: true, Location: "ไมค์หัวเตียง", Patient: 0},
	{MAC: "02:5E:ED:00:00:02", IP: "192.168.1.102", Status: "online", Active: true, Location: "ไมค์ทางเดินห้องน้ำ", Patient: 1},
	{MAC: "02:5E:ED:00:00:03", IP: "192.168.1.103", Status: "offline", Active: true, Location: "ไมค์มุมห้องนั่งเล่น", Patient: 2},
	{MAC: "02:5E:ED:00:00:04", IP: "", Status: "offline", Active: false, Location: "ไมค์หัวเตียง", Patient: 3},
}

func main() {
	resetLogs := flag.Bool("reset-logs", false, "ลบ detection_logs และไฟล์เสียงตัวอย่างเดิม แล้วสร้างใหม่ย้อนหลังจากวันนี้")
	allowRemoteDB := flag.Bool("allow-remote-db", false, "ยอมให้ DB_HOST ไม่ใช่เครื่องตัวเอง (เช่น postgres บนเครื่องทีม)")
	flag.Parse()

	config.LoadConfig()

	if strings.EqualFold(config.GetEnv("APP_ENV", "development"), "production") {
		log.Fatal("❌ APP_ENV=production: seed ใช้เฉพาะตอนพัฒนา ไม่รันบน production")
	}
	if host := config.GetEnv("DB_HOST", ""); !*allowRemoteDB && !isLocalDBHost(host) {
		log.Fatalf("❌ DB_HOST=%q ไม่ใช่เครื่องตัวเอง ถ้าตั้งใจจริงให้เพิ่ม -allow-remote-db", host)
	}

	// รหัสผ่านอ่านจาก env เท่านั้น และไม่ log ค่าออกมา
	adminPassword := requirePassword("SEED_ADMIN_PASSWORD")
	caregiverPassword := requirePassword("SEED_CAREGIVER_PASSWORD")
	adminEmail := seedEmail("SEED_ADMIN_EMAIL", "admin.seed@example.com")
	caregiverEmail := seedEmail("SEED_CAREGIVER_EMAIL", "caregiver.seed@example.com")
	if adminEmail == caregiverEmail {
		log.Fatal("❌ SEED_ADMIN_EMAIL กับ SEED_CAREGIVER_EMAIL ต้องไม่ซ้ำกัน")
	}

	// ConnectDB ใช้แค่ PostgreSQL (และ AutoMigrate ให้) — seed ไม่ต้องใช้ Redis
	database.ConnectDB()
	db := database.DB

	ensureUser(db, "SEED_ADMIN_EMAIL", adminEmail, "ผู้ดูแลระบบ (ตัวอย่าง)", "admin", adminPassword)
	caregiver := ensureUser(db, "SEED_CAREGIVER_EMAIL", caregiverEmail, "ผู้ดูแล (ตัวอย่าง)", "caregiver", caregiverPassword)

	patients := make([]models.Patient, len(seedPatients))
	for i, p := range seedPatients {
		patients[i] = ensurePatient(db, p)
		ensureCaregiverLink(db, caregiver.ID, patients[i].ID)
	}

	devices := make([]models.Device, len(seedDevices))
	for i, d := range seedDevices {
		devices[i] = ensureDevice(db, d)
		ensureAssignment(db, devices[i].ID, patients[d.Patient].ID, d.Location)
	}

	seedDetectionLogs(db, patients, *resetLogs)

	log.Println("✅ seed เสร็จแล้ว")
	log.Printf("   แอดมิน : %s", adminEmail)
	log.Printf("   ผู้ดูแล : %s (ผูกกับผู้ป่วยตัวอย่างทั้ง %d คน)", caregiverEmail, len(patients))
}

func isLocalDBHost(host string) bool {
	switch strings.ToLower(strings.TrimSpace(host)) {
	case "localhost", "127.0.0.1", "::1", "postgres": // postgres = ชื่อ service ใน docker-compose.yml
		return true
	}
	return false
}

func requirePassword(key string) string {
	v := os.Getenv(key)
	if len(v) < 8 {
		log.Fatalf("❌ ต้องตั้ง %s (อย่างน้อย 8 ตัวอักษร) ใน backend/.env หรือ environment ก่อนรัน seed", key)
	}
	return v
}

// seedEmail คืนค่า default เมื่อ env ไม่ได้ตั้งหรือเป็นค่าว่าง (.env.example มี key ว่างไว้)
func seedEmail(key, fallback string) string {
	email := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	if email == "" {
		return fallback
	}
	if !strings.Contains(email, "@") {
		log.Fatalf("❌ %s ไม่ใช่อีเมล", key)
	}
	return email
}

// ensureUser สร้างบัญชีถ้ายังไม่มี ถ้ามีอยู่แล้วจะไม่แตะรหัสผ่านหรือ role
func ensureUser(db *gorm.DB, envKey, email, name, role, password string) models.User {
	var u models.User
	err := db.Unscoped().Where("email = ?", email).First(&u).Error
	if err == nil {
		if u.DeletedAt.Valid {
			log.Fatalf("❌ บัญชี %s ถูกลบ (soft delete) อยู่ ให้ตั้ง %s เป็นอีเมลอื่น", email, envKey)
		}
		if u.Role != role {
			log.Printf("⚠️  %s มีอยู่แล้วแต่ role = %q (seed ต้องการ %q) — ไม่แก้ให้", email, u.Role, role)
		}
		log.Printf("•  ผู้ใช้ %s มีอยู่แล้ว (ไม่เปลี่ยนรหัสผ่าน)", email)
		return u
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		log.Fatalf("❌ ค้นหาผู้ใช้ %s ไม่สำเร็จ: %v", email, err)
	}

	hash, err := utils.HashPassword(password)
	if err != nil {
		log.Fatalf("❌ เข้ารหัสรหัสผ่านไม่สำเร็จ: %v", err)
	}
	u = models.User{Name: name, Email: email, Password: hash, Role: role, IsVerified: true}
	if err := db.Create(&u).Error; err != nil {
		log.Fatalf("❌ สร้างผู้ใช้ %s ไม่สำเร็จ: %v", email, err)
	}
	log.Printf("+  สร้างผู้ใช้ %s (%s)", email, role)
	return u
}

// ensurePatient ใช้ชื่อ + ห้อง เป็นตัวระบุผู้ป่วยตัวอย่าง
func ensurePatient(db *gorm.DB, p patientSeed) models.Patient {
	var patient models.Patient
	res := db.Where("name = ? AND room_number = ?", p.Name, p.Room).
		Attrs(models.Patient{Age: p.Age, Gender: p.Gender, MedicalCondition: p.Condition}).
		FirstOrCreate(&patient, models.Patient{Name: p.Name, RoomNumber: p.Room})
	if res.Error != nil {
		log.Fatalf("❌ สร้างผู้ป่วย %s ไม่สำเร็จ: %v", p.Name, res.Error)
	}
	logResult(res.RowsAffected, "ผู้ป่วย "+p.Name+" ห้อง "+p.Room)
	return patient
}

// caregiver_patients เป็น soft delete join (PK = patient_id + user_id) แถวที่ถูกลบไว้จึงต้องกู้คืนแทนการสร้างใหม่
func ensureCaregiverLink(db *gorm.DB, userID, patientID uint) {
	var link models.CaregiverPatient
	err := db.Unscoped().Where("user_id = ? AND patient_id = ?", userID, patientID).First(&link).Error
	switch {
	case err == nil && link.DeletedAt.Valid:
		if err := db.Unscoped().Model(&models.CaregiverPatient{}).
			Where("user_id = ? AND patient_id = ?", userID, patientID).
			Update("deleted_at", nil).Error; err != nil {
			log.Fatalf("❌ กู้คืนการผูกผู้ดูแลกับผู้ป่วย %d ไม่สำเร็จ: %v", patientID, err)
		}
	case err == nil:
		return
	case errors.Is(err, gorm.ErrRecordNotFound):
		if err := db.Create(&models.CaregiverPatient{UserID: userID, PatientID: patientID}).Error; err != nil {
			log.Fatalf("❌ ผูกผู้ดูแลกับผู้ป่วย %d ไม่สำเร็จ: %v", patientID, err)
		}
	default:
		log.Fatalf("❌ ค้นหา caregiver_patients ไม่สำเร็จ: %v", err)
	}
}

// ensureDevice สร้างอุปกรณ์ถ้ายังไม่มี ถ้ามีแล้วคงสถานะเดิมไว้ (เผื่อกดเปิด/ปิดระหว่างทดสอบ)
func ensureDevice(db *gorm.DB, d deviceSeed) models.Device {
	var dev models.Device
	err := db.Unscoped().Where("mac_address = ?", d.MAC).First(&dev).Error
	if err == nil {
		if dev.DeletedAt.Valid {
			if err := db.Unscoped().Model(&dev).Update("deleted_at", nil).Error; err != nil {
				log.Fatalf("❌ กู้คืนอุปกรณ์ %s ไม่สำเร็จ: %v", d.MAC, err)
			}
			log.Printf("+  กู้คืนอุปกรณ์ %s", d.MAC)
		} else {
			log.Printf("•  อุปกรณ์ %s มีอยู่แล้ว", d.MAC)
		}
		return dev
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		log.Fatalf("❌ ค้นหาอุปกรณ์ %s ไม่สำเร็จ: %v", d.MAC, err)
	}

	dev = models.Device{MacAddress: d.MAC, IpAddress: d.IP, Status: d.Status, IsActive: d.Active, IsVerified: true}
	if err := db.Create(&dev).Error; err != nil {
		log.Fatalf("❌ สร้างอุปกรณ์ %s ไม่สำเร็จ: %v", d.MAC, err)
	}
	state := "ยังไม่เปิดใช้งาน"
	if d.Active {
		state = "เปิดใช้งาน"
	}
	log.Printf("+  สร้างอุปกรณ์ %s (%s)", d.MAC, state)
	return dev
}

func ensureAssignment(db *gorm.DB, deviceID, patientID uint, location string) {
	var a models.Device_patient
	res := db.Where("device_id = ? AND patient_id = ?", deviceID, patientID).
		Attrs(models.Device_patient{DeviceName: location}).
		FirstOrCreate(&a, models.Device_patient{DeviceID: deviceID, PatientID: patientID})
	if res.Error != nil {
		log.Fatalf("❌ ผูกอุปกรณ์ %d กับผู้ป่วย %d ไม่สำเร็จ: %v", deviceID, patientID, res.Error)
	}
}

func logResult(created int64, what string) {
	if created > 0 {
		log.Printf("+  สร้าง%s", what)
	} else {
		log.Printf("•  %s มีอยู่แล้ว", what)
	}
}

// ---------------------------------------------------------------------------
// detection_logs ย้อนหลัง 30 วัน
// ---------------------------------------------------------------------------

// น้ำหนักของแต่ละชั่วโมง (0-23 น.) — กลางคืนกับช่วงเช้า/ค่ำเกิดเหตุบ่อยกว่ากลางวัน ให้กราฟรายชั่วโมงมีรูปร่าง
var hourWeights = [24]int{3, 3, 3, 3, 2, 2, 3, 3, 2, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 3, 3, 2, 2, 3}

type seedEvent struct {
	at      time.Time
	patient int // index ใน seedPatients
	device  int // index ใน seedDevices
}

func seedDetectionLogs(db *gorm.DB, patients []models.Patient, reset bool) {
	seedURLPattern := "/api/audio/" + seedAudioPrefix + "%"

	if reset {
		res := db.Unscoped().Where("audio_url LIKE ?", seedURLPattern).Delete(&models.DetectionLog{})
		if res.Error != nil {
			log.Fatalf("❌ ลบ detection_logs ตัวอย่างไม่สำเร็จ: %v", res.Error)
		}
		files, _ := filepath.Glob(filepath.Join(audioDir, seedAudioPrefix+"*.wav"))
		for _, f := range files {
			_ = os.Remove(f)
		}
		log.Printf("-  ลบ detection_logs ตัวอย่าง %d แถว และไฟล์เสียง %d ไฟล์", res.RowsAffected, len(files))
	} else {
		var existing int64
		if err := db.Model(&models.DetectionLog{}).Unscoped().Where("audio_url LIKE ?", seedURLPattern).Count(&existing).Error; err != nil {
			log.Fatalf("❌ นับ detection_logs ตัวอย่างไม่สำเร็จ: %v", err)
		}
		if existing > 0 {
			log.Printf("•  มี detection_logs ตัวอย่างอยู่แล้ว %d แถว — ข้าม (ใช้ -reset-logs ถ้าต้องการสร้างใหม่ให้ตรงกับวันนี้)", existing)
			return
		}
	}

	// เฉพาะอุปกรณ์ที่เปิดใช้งาน — อุปกรณ์ที่ยังไม่เปิด receiver จะไม่ส่งเสียงไปให้ backend อยู่แล้ว
	var active []int
	for i, d := range seedDevices {
		if d.Active {
			active = append(active, i)
		}
	}

	// seed คงที่: รันกี่ครั้งก็ได้รูปแบบเดิม (เลื่อนตามวันที่รัน)
	rng := rand.New(rand.NewPCG(2569, 30))
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	pick := func() seedEvent {
		dev := active[rng.IntN(len(active))]
		return seedEvent{device: dev, patient: seedDevices[dev].Patient}
	}

	var events []seedEvent
	for d := historyDays - 1; d >= 0; d-- {
		day := today.AddDate(0, 0, -d)
		for k := eventsPerDay(rng); k > 0; k-- {
			ev := pick()
			ev.at = day.Add(randomTimeOfDay(rng))
			if ev.at.After(now) {
				continue
			}
			events = append(events, ev)
		}
	}
	// เหตุล่าสุดเมื่อไม่ถึงชั่วโมงครึ่งก่อน ให้แดชบอร์ดมีการแจ้งเตือนค้างและตัวเลข "วันนี้" ไม่เป็น 0
	recent := pick()
	recent.at = now.Add(-time.Duration(20+rng.IntN(70)) * time.Minute)
	events = append(events, recent)
	sort.Slice(events, func(i, j int) bool { return events[i].at.Before(events[j].at) })

	const unresolvedCount = 2 // เหตุล่าสุด 2 รายการยังไม่ปิด ที่เหลือปิดแล้ว
	logs := make([]models.DetectionLog, len(events))
	for i, ev := range events {
		patientID := patients[ev.patient].ID
		filename := fmt.Sprintf("%s%s-%02d.wav", seedAudioPrefix, ev.at.Format("20060102-150405"), i)
		entry := models.DetectionLog{
			PatientID:    &patientID,
			DeviceMAC:    seedDevices[ev.device].MAC,
			EventType:    "needs_help", // ค่าเดียวกับที่ api/mqtt_audio_receiver.py ส่งมาเมื่อโมเดลตอบ yes
			Confidence:   math.Round((0.62+rng.Float64()*0.37)*10000) / 10000,
			DecibelLevel: math.Round((55+rng.Float64()*30)*10) / 10,
			AudioURL:     "/api/audio/" + filename,
			Status:       "needs_help",
		}
		entry.CreatedAt = ev.at
		entry.UpdatedAt = ev.at

		if i < len(events)-unresolvedCount {
			resolvedAt := ev.at.Add(time.Duration(60+rng.IntN(25*60)) * time.Second) // ปิดภายใน 1-25 นาที
			if resolvedAt.After(now) {
				resolvedAt = now
			}
			entry.Status = "resolved"
			entry.IsResolved = true
			entry.ResolvedAt = &resolvedAt
			entry.UpdatedAt = resolvedAt
		}
		logs[i] = entry
	}

	if err := db.Transaction(func(tx *gorm.DB) error {
		return tx.CreateInBatches(&logs, 100).Error
	}); err != nil {
		log.Fatalf("❌ สร้าง detection_logs ไม่สำเร็จ: %v", err)
	}
	log.Printf("+  สร้าง detection_logs %d แถว ย้อนหลัง %d วัน (ยังไม่ปิด %d)", len(logs), historyDays, unresolvedCount)

	// ไฟล์เสียงสังเคราะห์ ให้ปุ่มเล่นเสียงในหน้าประวัติทำงานได้ (ไม่ใช่เสียงคนจริง)
	if err := os.MkdirAll(audioDir, 0o755); err != nil {
		log.Printf("⚠️  สร้างโฟลเดอร์ %s ไม่สำเร็จ: %v (ข้ามไฟล์เสียง)", audioDir, err)
		return
	}
	written := 0
	for _, l := range logs {
		path := filepath.Join(audioDir, strings.TrimPrefix(l.AudioURL, "/api/audio/"))
		if _, err := os.Stat(path); err == nil {
			continue
		}
		if err := writeSeedWAV(path, rng); err != nil {
			log.Printf("⚠️  เขียน %s ไม่สำเร็จ: %v", path, err)
			continue
		}
		written++
	}
	log.Printf("+  เขียนไฟล์เสียงตัวอย่าง %d ไฟล์ใน %s", written, audioDir)
}

// eventsPerDay: 0 ครั้ง 25%, 1 ครั้ง 35%, 2 ครั้ง 25%, 3 ครั้ง 10%, 4 ครั้ง 5%
func eventsPerDay(rng *rand.Rand) int {
	r := rng.IntN(100)
	switch {
	case r < 25:
		return 0
	case r < 60:
		return 1
	case r < 85:
		return 2
	case r < 95:
		return 3
	default:
		return 4
	}
}

func randomTimeOfDay(rng *rand.Rand) time.Duration {
	total := 0
	for _, w := range hourWeights {
		total += w
	}
	r := rng.IntN(total)
	hour := 0
	for h, w := range hourWeights {
		if r < w {
			hour = h
			break
		}
		r -= w
	}
	return time.Duration(hour)*time.Hour +
		time.Duration(rng.IntN(60))*time.Minute +
		time.Duration(rng.IntN(60))*time.Second
}

// writeSeedWAV เขียน WAV 8 kHz mono 16-bit ยาว 2 วินาที: เสียงสังเคราะห์ 2-3 พยางค์ (harmonic + glide) บนพื้นเสียงรบกวนเบาๆ
func writeSeedWAV(path string, rng *rand.Rand) error {
	n := sampleRate * clipSeconds
	buf := make([]float64, n)

	f0 := 170 + rng.Float64()*90
	syllables := 2 + rng.IntN(2)
	for s := range syllables {
		start := int((0.15 + float64(s)*0.55 + rng.Float64()*0.1) * sampleRate)
		length := int((0.3 + rng.Float64()*0.15) * sampleRate)
		phase := 0.0
		for i := 0; i < length && start+i < n; i++ {
			p := float64(i) / float64(length)
			f := f0 * (1 + 0.15*p) // ขึ้นเสียงปลายพยางค์ คล้ายการตะโกน
			phase += 2 * math.Pi * f / sampleRate
			v := 0.0
			for h := 1; h <= 5; h++ {
				v += math.Sin(float64(h)*phase) / float64(h)
			}
			buf[start+i] += math.Sin(math.Pi*p) * v
		}
	}

	pcm := make([]int16, n)
	for i, v := range buf {
		s := v*9000 + rng.NormFloat64()*250
		pcm[i] = int16(math.Max(math.MinInt16, math.Min(math.MaxInt16, s)))
	}

	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	dataSize := uint32(n * 2)
	header := []any{
		[4]byte{'R', 'I', 'F', 'F'}, 36 + dataSize, [4]byte{'W', 'A', 'V', 'E'},
		[4]byte{'f', 'm', 't', ' '}, uint32(16), uint16(1), uint16(1),
		uint32(sampleRate), uint32(sampleRate * 2), uint16(2), uint16(16),
		[4]byte{'d', 'a', 't', 'a'}, dataSize,
	}
	for _, v := range header {
		if err := binary.Write(f, binary.LittleEndian, v); err != nil {
			return err
		}
	}
	return binary.Write(f, binary.LittleEndian, pcm)
}
