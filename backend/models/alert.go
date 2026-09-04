package models

import "time"

// โครงสร้างสำหรับส่งออกไปให้หน้าเว็บ (Frontend)
type HistoryResponse struct {
	ID           uint      `json:"id"`
	CreatedAt    time.Time `json:"created_at"` // GORM จะแปลงเป็น ISO 8601 ให้อัตโนมัติ (เช่น 2026-07-26T11:10:59Z)
	DeviceMac    string    `json:"device_mac"`
	EventType    string    `json:"event_type"`
	Confidence   float64   `json:"confidence"`
	DecibelLevel float64   `json:"decibel_level"`
	IsResolved   bool      `json:"is_resolved"`
	AudioUrl     string    `json:"audio_url"`
	Status       string    `json:"status"`
	PatientName  string    `json:"patient_name"`
	RoomNumber   string    `json:"room_number"`
}
// 📊 โครงสร้างสำหรับกราฟรายวัน/รายชั่วโมง
type StatItem struct {
	Label string `json:"label"`
	Count int    `json:"count"`
}

// 📊 โครงสร้างสำหรับหน้าสถิติทั้งหมด (ต้องตรงกับฝั่ง React)
type StatsResponse struct {
	Daily   []StatItem `json:"daily"`
	Hourly  []StatItem `json:"hourly"`
	Monthly []StatItem `json:"monthly"`
	Summary struct {
		Today      int64 `json:"today"`
		ThisWeek   int64 `json:"this_week"`
		ThisMonth  int64 `json:"this_month"`
		Unresolved int64 `json:"unresolved"`
		Total      int64 `json:"total"`
	} `json:"summary"`
}