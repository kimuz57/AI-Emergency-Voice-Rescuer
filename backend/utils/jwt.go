package utils

import (
	"errors"
	"fmt"
	"time"
	"go_backend/config"
	"github.com/golang-jwt/jwt/v5" // เช็คเวอร์ชัน JWT ที่ผู้กองใช้ใน go.mod ด้วยนะครับ (ส่วนใหญ่ตอนนี้เป็น v4 หรือ v5)
)

// GenerateToken ทำหน้าที่สร้าง JWT Token โดยรับ ID และ Email ของผู้ใช้
func GenerateToken(userID uint, email string) (string, error) {
	// ดึง JWT_SECRET จากไฟล์ .env ผ่าน config ที่เราทำไว้
	// 🟢 ไม่ใช้ GetEnvRequired ตรงนี้ เพราะ log.Fatalf ระหว่างรับ request จะฆ่าทั้ง process (main.go ตรวจไว้ตอน startup แล้ว)
	secret := config.GetEnv("JWT_SECRET", "")
	if secret == "" {
		return "", errors.New("JWT_SECRET is not set")
	}

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

// ParseJWT ตรวจลายเซ็นและวันหมดอายุของ token ที่ระบบออกให้เอง
// 🔒 pin ไว้ที่ HS256 เท่านั้น (ปฏิเสธ alg อื่น เช่น none / RS256 / HS512) และบังคับต้องมี exp
// ใช้ร่วมกันทั้ง middleware.RequireAuth และ ParseToken เพื่อให้กติกาอยู่ที่เดียว
func ParseJWT(tokenString string) (*jwt.Token, error) {
	// 🟢 ไม่มี fallback secret — main.go บังคับตั้ง JWT_SECRET ตั้งแต่ startup แล้ว
	secret := config.GetEnv("JWT_SECRET", "")
	if secret == "" {
		return nil, errors.New("JWT_SECRET is not set")
	}

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if token.Method == nil || token.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(secret), nil
	},
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, errors.New("invalid token")
	}
	return token, nil
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
	// 1-2. ตรวจลายเซ็น (HS256 เท่านั้น) และวันหมดอายุ
	token, err := ParseJWT(tokenString)
	if err != nil {
		return nil, err
	}

	// 3. แกะข้อมูลจาก MapClaims ที่เราฝังไว้ตอน Generate
	if claims, ok := token.Claims.(jwt.MapClaims); ok {
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
