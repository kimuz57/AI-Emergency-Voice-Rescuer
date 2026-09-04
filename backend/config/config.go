package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

// LoadConfig ทำหน้าที่โหลดไฟล์ .env ขึ้นมาไว้ในหน่วยความจำ
func LoadConfig() {
	err := godotenv.Load()
	if err != nil {
		// ถ้าหาไฟล์ .env ไม่เจอ (เช่น ตอนเอาขึ้น Docker/Server จริง) จะแค่เตือน แต่ไม่พัง
		log.Println("⚠️ Warning: No .env file found. Reading configuration from system environment variables.")
	} else {
		log.Println("✅ Environment variables loaded successfully from .env file.")
	}
}

// GetEnv ใช้ดึงค่าจาก .env แบบมี "ค่าสำรอง (Fallback)" ถ้าลืมใส่
func GetEnv(key string, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}

// GetEnvRequired ใช้ดึงค่า "ตัวตึง" ที่ระบบขาดไม่ได้ ถ้าลืมใส่ ระบบจะแจ้งเตือนและปิดตัวเองทันที (ป้องกันบั๊กเงียบ)
func GetEnvRequired(key string) string {
	value, exists := os.LookupEnv(key)
	if !exists || value == "" {
		log.Fatalf("🚨 CRITICAL ERROR: Environment variable '%s' is not set! Please check your .env file.", key)
	}
	return value
}