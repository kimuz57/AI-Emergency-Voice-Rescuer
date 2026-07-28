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
	Devices []Device_patient `gorm:"foreignKey:PatientID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	// 1 ผู้ป่วย มีประวัติเสียงร้องขอความช่วยเหลือหลายครั้ง
	DetectionLogs []DetectionLog
}

//  3. ตารางเชื่อม Device กับ Patient
//     ให้ Device_patient เป็นตารางกลางสำหรับอุปกรณ์ที่ผูกกับคนไข้
type Device_patient struct {
	gorm.Model
	DeviceID   uint   `gorm:"index" json:"device_id"`
	Device     Device `gorm:"foreignKey:DeviceID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-"`
	PatientID  uint   `gorm:"not null;index" json:"patient_id"`
	MACAddress string `gorm:"not null" json:"board_id"`
	Name       string `json:"deviceName"`
	Status     string `gorm:"default:'offline'" json:"status"`
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

// 5. ตารางเชื่อม Many-to-Many ระหว่าง Caregiver (User) และ Patient
type CaregiverPatient struct {
	PatientID uint           `gorm:"primaryKey"`
	UserID    uint           `gorm:"primaryKey"`
	CreatedAt time.Time      `json:"created_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}
