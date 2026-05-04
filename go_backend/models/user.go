package models

type User struct {
	ID         uint   `gorm:"primaryKey"`
	Name       string `json:"name"`
	Email      string `json:"email" gorm:"unique"`
	IsVerified bool   `json:"is_verified" gorm:"default:false"` // เพิ่มเข้ามาเพื่อเช็คสถานะยืนยันตัวตน
}