package database

import (
	"fmt"
	"log"

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
		&models.HistoryResponse{},
	)
	if err != nil {
		log.Fatal("Failed to auto-migrate database tables:", err)
	}

	// if err := backfillDevicePatientDeviceID(db); err != nil {
	// 	log.Fatal("Failed to backfill device_id in device_patients:", err)
	// }

	if err := cleanupLegacyPatientDeviceMACConstraint(db); err != nil {
		log.Fatal("Failed to cleanup legacy patient device MAC constraint:", err)
	}

	DB = db
	fmt.Println("✅ Database connected & Tables migrated successfully!")
}

func backfillDevicePatientDeviceID(db *gorm.DB) error {
	if err := db.Exec(`
		UPDATE device_patients dp
		SET device_id = d.id
		FROM devices d
		WHERE dp.device_id IS NULL
		  AND UPPER(dp.mac_address) = UPPER(d.mac_address)
	`).Error; err != nil {
		return err
	}

	var unmatched int64
	if err := db.Raw(`
		SELECT COUNT(*)
		FROM device_patients
		WHERE device_id IS NULL
	`).Scan(&unmatched).Error; err != nil {
		return err
	}
	if unmatched > 0 {
		fmt.Printf("⚠️ Found %d device_patients rows with missing device_id after backfill\n", unmatched)
	}
	return nil
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

func SeedAdmin() {
	var count int64
	DB.Model(&models.User{}).Where("role = ?", "admin").Count(&count)

	// ถ้ายังไม่มี Admin ในระบบเลยสักคนเดียว
	if count == 0 {
		hashedPassword, _ := utils.HashPassword("kws_admin123") // รหัสผ่านเริ่มต้น

		admin := models.User{
			Name:       "Super Admin",
			Email:      "admin@evr.com",
			Password:   hashedPassword,
			Role:       "admin",
			IsVerified: true, // ตั้งให้เป็น true เลยจะได้ไม่ต้องกดยืนยันอีเมล
		}

		DB.Create(&admin)
		fmt.Println("บัญชี Admin เริ่มต้นถูกสร้างแล้ว! (Email: admin@evr.com | Pass: kws_admin123)")
	}
}
