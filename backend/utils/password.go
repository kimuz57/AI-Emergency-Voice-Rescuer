package utils

import "golang.org/x/crypto/bcrypt"

// HashPassword ทำการเข้ารหัสรหัสผ่าน (ใช้ตอนสมัครสมาชิก หรือตอน Seeder)
func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 14)
	return string(bytes), err
}

// CheckPasswordHash ตรวจสอบความถูกต้องของรหัสผ่าน (ใช้ตอน Login)
func CheckPasswordHash(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}