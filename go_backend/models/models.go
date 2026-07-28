package models

import (
	"time"

	"gorm.io/gorm"
)

// (ถ้าด้านบนมี type User struct { ... } อยู่ ห้ามลบนะครับ ปล่อยไว้เหมือนเดิม)

// 2. ตารางผู้ป่วย (Patients)


// 4. ตารางเก็บประวัติการตรวจจับเสียง (Detection Logs)
type DetectionLog struct {
	gorm.Model
	// โครงสร้างเดิมที่คุณผู้กองมี (เก็บไว้เผื่ออนาคตทำระบบเชื่อมตารางผู้ป่วย)
	PatientID    *uint
	DeviceMAC    string `json:"device_mac"`
	EventType    string
	Confidence   float64
	DecibelLevel float64
	IsResolved   bool `gorm:"default:false"`
	ResolvedAt   *time.Time

	AudioURL string `json:"audio_url"`
	Status   string `gorm:"default:'needs_help'" json:"status"`
}

// 5. ตารางเชื่อม Many-to-Many ระหว่าง Caregiver (User) และ Patient
type CaregiverPatient struct {
	PatientID uint           `gorm:"primaryKey"`
	UserID    uint           `gorm:"primaryKey"`
	CreatedAt time.Time      `json:"created_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}
