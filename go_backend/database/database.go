package database

import (
	"fmt"
	"log"

	"go_backend/config"
	"go_backend/models"

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
		&models.Device{},
		&models.DetectionLog{}, // 👈 พระเอกของเรามาแล้ว
	)
	if err != nil {
		log.Fatal("Failed to auto-migrate database tables:", err)
	}

	DB = db
	fmt.Println("✅ Database connected & Tables migrated successfully!")
}