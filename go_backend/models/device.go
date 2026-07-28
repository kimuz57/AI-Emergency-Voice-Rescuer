package models

import "gorm.io/gorm"

// 1. ตารางผู้ป่วย
type Patient struct {
	gorm.Model
	Name             string `gorm:"not null"`
	Age              int
	Gender           string
	RoomNumber       string
	MedicalCondition string

	// ความสัมพันธ์ M:M ไปหา User (พยาบาล/ผู้ดูแล)
	Caregivers []User `gorm:"many2many:caregiver_patients;"`
	
	// 🟢 เปลี่ยนชื่อฟิลด์ให้สื่อความหมายว่าเป็นตารางกลางของการเชื่อมต่อ
	DeviceAssignments []Device_patient `gorm:"foreignKey:PatientID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	
	DetectionLogs []DetectionLog
}

// 2. ตารางเชื่อม (Junction Table) สำหรับเก็บว่า "อุปกรณ์ไหน ติดตั้งให้คนไข้คนไหน ที่จุดไหน"
type Device_patient struct {
	gorm.Model
	DeviceID   uint   `gorm:"not null;index" json:"device_id"`
	PatientID  uint   `gorm:"not null;index" json:"patient_id"`
	
	// ชื่อจุดติดตั้งเฉพาะของการผูกมัดครั้งนี้ (เช่น "ไมค์ห้องน้ำ", "ไมค์หัวเตียง")
	DeviceName string `gorm:"not null;default:'ไมค์หัวเตียง'" json:"device_name"` 

	// 🟢 เพิ่มความสัมพันธ์กลับไปยัง Struct หลัก เพื่อให้ GORM Preload ข้อมูลได้ง่าย
	Device  Device  `gorm:"foreignKey:DeviceID" json:"device"`
	Patient Patient `gorm:"foreignKey:PatientID" json:"-"`
}

// 3. ตารางอุปกรณ์ (ESP32)
type Device struct {
	gorm.Model
	MacAddress string `gorm:"uniqueIndex;not null" json:"mac_address"` // ใช้ uniqueIndex จะค้นหาเร็วกว่า
	IpAddress  string `json:"ip_address"`
	Status     string `gorm:"default:'offline'" json:"status"` // 🟢 ย้าย Status มาไว้ที่บอร์ด
	IsActive   bool   `gorm:"default:false" json:"is_active"`
	IsVerified bool   `gorm:"default:false" json:"is_verified"`

	// 🟢 ความสัมพันธ์กลับไปหาตารางกลาง
	Assignments []Device_patient `gorm:"foreignKey:DeviceID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-"`
}