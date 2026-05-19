package models

type User struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	Name       string    `json:"name"`
	Email      string    `json:"email" gorm:"unique"`
	Password   string    `json:"-" gorm:"not null"` // 🟢 เติมฟิลด์นี้กลับเข้ามา โดยใส่ json:"-" เพื่อไม่ให้ส่งรหัสผ่านหลุดออกไปทางหน้าเว็บ
	IsVerified bool      `json:"is_verified" gorm:"default:false"`
	Profile    string    `json:"profile"` // 🟢 คอลัมน์รูปภาพโปรไฟล์ที่คุณเพิ่งเพิ่ม
	Role       string    `json:"role" gorm:"default:'caregiver'"`
	Patients   []Patient `json:"patients" gorm:"many2many:caregiver_patients;"`
}