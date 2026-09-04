package utils

import (
	"errors"
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

// =========================================
// เพิ่มโค้ดส่วนนี้ต่อท้ายไฟล์ utils/jwt.go
// =========================================

// สร้างโครงสร้างเพื่อส่งข้อมูลกลับไปให้ Controller ใช้งานได้ง่ายๆ
type TokenData struct {
	UserID uint
	Email  string
}

// ParseToken ทำหน้าที่ถอดรหัส Token และดึง Email / UserID ออกมา
func ParseToken(tokenString string) (*TokenData, error) {
	// 1. ดึง JWT_SECRET แบบเดียวกับตอนสร้าง
	secret := config.GetEnvRequired("JWT_SECRET")

	// 2. ถอดรหัส Token
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		return []byte(secret), nil
	})

	if err != nil {
		return nil, err
	}

	// 3. แกะข้อมูลจาก MapClaims ที่เราฝังไว้ตอน Generate
	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		email, _ := claims["email"].(string)
		
		// หมายเหตุ: ตัวเลขที่ถูกถอดจาก JSON JWT จะกลายเป็น float64 เสมอ จึงต้องแปลงกลับเป็น uint
		var userID uint
		if idFloat, ok := claims["user_id"].(float64); ok {
			userID = uint(idFloat)
		}

		return &TokenData{
			UserID: userID,
			Email:  email,
		}, nil
	}

	return nil, errors.New("invalid token")
}