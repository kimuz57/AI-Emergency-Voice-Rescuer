package utils

import (
	"time"
	"go_backend/config"
	"github.com/golang-jwt/jwt/v5" // เช็คเวอร์ชัน JWT ที่ผู้กองใช้ใน go.mod ด้วยนะครับ (ส่วนใหญ่ตอนนี้เป็น v4 หรือ v5)
)

// GenerateToken ทำหน้าที่สร้าง JWT Token โดยรับ ID และ Email ของผู้ใช้
func GenerateToken(userID uint, email string) (string, error) {
	// ดึง JWT_SECRET จากไฟล์ .env ผ่าน config ที่เราทำไว้
	secret := config.GetEnvRequired("JWT_SECRET")

	// ตั้งค่าข้อมูลที่จะฝังลงไปใน Token (Claims)
	claims := jwt.MapClaims{
		"user_id": userID,
		"email":   email,
		"exp":     time.Now().Add(time.Hour * 72).Unix(), // หมดอายุใน 3 วัน
	}

	// สร้าง Token และเข้ารหัสด้วย Secret
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}