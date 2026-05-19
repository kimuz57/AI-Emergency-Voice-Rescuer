package database

import (
	"fmt"
	"log"
	"go_backend/models" // อ้างอิงตามชื่อ module ของคุณใน go.mod
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB

func ConnectDB() {
	dsn := "host=localhost user=postgres password=postgres dbname=godb port=5433 sslmode=disable"
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	
	// 🟢 เพิ่ม Models เข้าไปให้ GORM รู้จักและสร้างตารางให้ครบ!
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