package models

import "time"

// โครงสร้างเฉพาะกิจสำหรับส่งข้อมูล DTO ให้หน้า Dashboard
type DetectionLogResponse struct {
	ID           uint      `json:"id"`
	CreatedAt    time.Time `json:"created_at"`
	DeviceMAC    string    `json:"device_mac"`
	EventType    string    `json:"event_type"`
	Confidence   float64   `json:"confidence"`
	DecibelLevel float64   `json:"decibel_level"`
	IsResolved   bool      `json:"is_resolved"`
	AudioURL     string    `json:"audio_url"`
	Status       string    `json:"status"`
	PatientName  string    `json:"patient_name"`
	RoomNumber   string    `json:"room_number"`
}