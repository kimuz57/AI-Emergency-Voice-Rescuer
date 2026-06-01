package models

import (
	"time"

	"gorm.io/gorm"
)

// (ถ้าด้านบนมี type User struct { ... } อยู่ ห้ามลบนะครับ ปล่อยไว้เหมือนเดิม)

// 2. ตารางผู้ป่วย (Patients)
type Patient struct {
	gorm.Model
	Name             string `gorm:"not null"`
	Age              int
	Gender           string
	RoomNumber       string
	MedicalCondition string // โรคประจำตัว หรือ ข้อมูลการแพทย์เบื้องต้น

	// ความสัมพันธ์แบบ Many-to-Many กลับไปหา User
	Caregivers []User `gorm:"many2many:caregiver_patients;"`
	// 1 ผู้ป่วย สามารถมีหลายอุปกรณ์ (เช่น ไมค์ห้องน้ำ, ไมค์หัวเตียง)
	Devices []Device
	// 1 ผู้ป่วย มีประวัติเสียงร้องขอความช่วยเหลือหลายครั้ง
	DetectionLogs []DetectionLog
	DeviceMAC     *string `json:"device_mac,omitempty"`
	UserID        uint    `json:"user_id"`
}

// 3. ตารางอุปกรณ์ IoT / ESP32 (Devices)
type Device struct {
	gorm.Model
	// 🟢 เติม json:"board_id" ไว้ข้างหลัง เพื่อบอก Go ว่า "ถ้าส่ง board_id มา ให้เอามาใส่คอลัมน์นี้ใน DB นะ"
	MACAddress string `gorm:"unique;not null" json:"board_id"`
	Name       string `json:"deviceName"` // เช่น "ไมค์ห้องนั่งเล่น", "เซนเซอร์ห้องน้ำ"
	Status     string `gorm:"default:'offline'" json:"status"`

	// Foreign Key เชื่อมกับผู้ป่วย (อุปกรณ์นี้เป็นของใคร/อยู่ห้องใคร)
	PatientID uint `json:"patientId"`
}

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
