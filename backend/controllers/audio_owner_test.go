package controllers

import (
	"testing"

	"go_backend/database"
	"go_backend/models"
)

// GetAudioFile: ผู้ใช้ทั่วไปฟังได้เฉพาะไฟล์ของผู้ป่วยที่ผูกกับตัวเอง, admin ฟังได้ทุกไฟล์
// ไม่สร้างไฟล์จริง: ผ่านการเช็คสิทธิ์แล้วจะได้ 404 (ไม่มีไฟล์บนดิสก์), ไม่ผ่านได้ 403
func TestGetAudioFile_OwnershipCheck(t *testing.T) {
	f := setupAlertScopeDB(t)

	const name = "emergency_owner_test.wav"
	if err := database.DB.Model(&models.DetectionLog{}).Where("id = ?", f.aliceLog.ID).
		Update("audio_url", "/api/audio/"+name).Error; err != nil {
		t.Fatalf("set audio_url: %v", err)
	}

	app := newScopeApp()
	app.Get("/api/audio/:filename", GetAudioFile)

	cases := []struct {
		name string
		user uint
		want int
	}{
		{name, 0, 401},                        // ไม่มี token
		{name, f.bob.ID, 403},                 // ไฟล์ของผู้ป่วยคนอื่น
		{"emergency_nope.wav", f.bob.ID, 403}, // ไฟล์ที่ไม่มี log ก็ 403 เหมือนกัน (ไม่บอกว่ามีไฟล์หรือไม่)
		{name, f.alice.ID, 404},               // ผู้ดูแลที่ผูกอยู่ → ผ่านสิทธิ์ แต่ไม่มีไฟล์บนดิสก์
		{name, f.admin.ID, 404},               // admin → ผ่านสิทธิ์
		{"..%5Cx.wav", f.admin.ID, 400},       // path traversal
	}
	for _, tc := range cases {
		if code, body := doScopeReq(t, app, "GET", "/api/audio/"+tc.name, tc.user); code != tc.want {
			t.Errorf("%s user %d: got %d want %d (%s)", tc.name, tc.user, code, tc.want, body)
		}
	}
}
