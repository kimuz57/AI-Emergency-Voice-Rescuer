package database

import (
	"fmt"
	"log"
	"strings"

	"go_backend/config"
	"go_backend/models"
	"go_backend/utils"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB

func ConnectDB() {
	// 🟢 1. ดึงค่าจาก .env (ถ้าลืมตั้งค่าตัวไหน ระบบจะแจ้งเตือนและปิดตัวเองทันที)
	dbHost := config.GetEnvRequired("DB_HOST")
	dbUser := config.GetEnvRequired("DB_USER")
	dbPassword := config.GetEnvRequired("DB_PASSWORD")
	dbName := config.GetEnvRequired("DB_NAME")
	dbPort := config.GetEnv("DB_PORT", "5433") // ผู้กองใช้พอร์ต 5433 สำหรับ Postgres

	// 🟢 2. ประกอบร่าง DSN จากตัวแปร
	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=disable",
		dbHost, dbUser, dbPassword, dbName, dbPort)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	// 🟢 บังคับเลือก schema ก่อน AutoMigrate กัน error: no schema has been selected to create in
	if err := db.Exec("SET search_path TO public").Error; err != nil {
		log.Fatal("Failed to set PostgreSQL search_path:", err)
	}

	// 🟢 บอก GORM ให้รู้ว่าตาราง caregiver_patients คือ join table จริงของความสัมพันธ์ User <-> Patient
	if err := db.SetupJoinTable(&models.User{}, "Patients", &models.CaregiverPatient{}); err != nil {
		log.Fatal("Failed to setup join table for User.Patients:", err)
	}
	if err := db.SetupJoinTable(&models.Patient{}, "Caregivers", &models.CaregiverPatient{}); err != nil {
		log.Fatal("Failed to setup join table for Patient.Caregivers:", err)
	}

	// 🟢 3. เพิ่ม Models เข้าไปให้ GORM รู้จักและสร้างตารางให้ครบ!
	err = db.AutoMigrate(
		&models.User{},
		&models.Patient{},
		&models.CaregiverPatient{},
		&models.Device{},
		&models.Device_patient{},
		&models.DetectionLog{},
		&models.UserLineMapping{},
		&models.UserTelegramMapping{},
	)
	if err != nil {
		log.Fatal("Failed to auto-migrate database tables:", err)
	}

	if err := cleanupLegacyPatientDeviceMACConstraint(db); err != nil {
		log.Fatal("Failed to cleanup legacy patient device MAC constraint:", err)
	}

	DB = db
	fmt.Println("✅ Database connected & Tables migrated successfully!")
}

func cleanupLegacyPatientDeviceMACConstraint(db *gorm.DB) error {
	statements := []string{
		`DROP INDEX IF EXISTS idx_patients_device_mac`,
		`ALTER TABLE patients DROP CONSTRAINT IF EXISTS uni_patients_device_mac`,
	}

	for _, statement := range statements {
		if err := db.Exec(statement).Error; err != nil {
			return err
		}
	}

	return nil
}

// SeedAdmin สร้างบัญชี admin เริ่มต้น "เฉพาะ" ตอนที่ยังไม่มี admin ในระบบเลย และตั้ง ADMIN_PASSWORD ไว้
//   - ไม่มีรหัสผ่าน hardcode และไม่พิมพ์รหัสผ่านลง log (S3)
//   - ADMIN_EMAIL ไม่ตั้ง → ใช้ admin@evr.com
//   - มี admin อยู่แล้ว → ไม่แตะอะไรเลย
//   - อีเมลนี้มีบัญชีอยู่แล้ว (รวมที่ถูก soft delete) → ข้าม ไม่ยกสิทธิ์บัญชีเดิมเป็น admin
//     (กันกรณีมีคนสมัครอีเมลนั้นไว้ก่อนแล้วรอให้ระบบยกเป็น admin ให้)
func SeedAdmin() {
	var count int64
	if err := DB.Model(&models.User{}).Where("role = ?", "admin").Count(&count).Error; err != nil {
		log.Println("⚠️ SeedAdmin: ตรวจจำนวน admin ไม่สำเร็จ ข้ามการสร้าง admin เริ่มต้น:", err)
		return
	}
	if count > 0 {
		return
	}

	password := config.GetEnv("ADMIN_PASSWORD", "")
	if strings.TrimSpace(password) == "" {
		log.Println("⚠️ SeedAdmin: ยังไม่มี admin ในระบบ แต่ไม่ได้ตั้ง ADMIN_PASSWORD จึงไม่สร้างบัญชี admin เริ่มต้น")
		return
	}
	if len(password) < 12 {
		log.Println("⚠️ SeedAdmin: ADMIN_PASSWORD สั้นกว่า 12 ตัวอักษร ควรเปลี่ยนเป็นรหัสที่ยาวกว่านี้")
	}

	email := strings.TrimSpace(config.GetEnv("ADMIN_EMAIL", ""))
	if email == "" {
		email = "admin@evr.com"
	}

	var existing int64
	if err := DB.Unscoped().Model(&models.User{}).Where("email = ?", email).Count(&existing).Error; err != nil {
		log.Println("⚠️ SeedAdmin: ตรวจอีเมล admin ไม่สำเร็จ ข้ามการสร้าง admin เริ่มต้น:", err)
		return
	}
	if existing > 0 {
		log.Printf("⚠️ SeedAdmin: มีบัญชีอีเมล %s อยู่แล้ว (ไม่ใช่ admin) จึงไม่สร้าง/ไม่ยกสิทธิ์ให้ — ตั้ง ADMIN_EMAIL เป็นอีเมลอื่น หรือกำหนด role ใน DB เอง", email)
		return
	}

	hashedPassword, err := utils.HashPassword(password)
	if err != nil {
		log.Println("⚠️ SeedAdmin: เข้ารหัส ADMIN_PASSWORD ไม่สำเร็จ ข้ามการสร้าง admin เริ่มต้น")
		return
	}

	admin := models.User{
		Name:       "Super Admin",
		Email:      email,
		Password:   hashedPassword,
		Role:       "admin",
		IsVerified: true, // ตั้งให้เป็น true เลยจะได้ไม่ต้องกดยืนยันอีเมล
	}

	if err := DB.Create(&admin).Error; err != nil {
		log.Println("⚠️ SeedAdmin: สร้างบัญชี admin เริ่มต้นไม่สำเร็จ:", err)
		return
	}
	log.Printf("✅ สร้างบัญชี Admin เริ่มต้นแล้ว (Email: %s) — รหัสผ่านมาจาก ADMIN_PASSWORD", email)
}
