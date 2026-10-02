package controllers

import (
	"encoding/json"
	"io"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"go_backend/database"
	"go_backend/models"
)

type alertScopeFixture struct {
	admin, alice, bob models.User
	alicePat, bobPat  models.Patient
	aliceLog, bobLog  models.DetectionLog
	removedPat        models.Patient
	removedLog        models.DetectionLog
}

func setupAlertScopeDB(t *testing.T) *alertScopeFixture {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.SetupJoinTable(&models.Patient{}, "Caregivers", &models.CaregiverPatient{}); err != nil {
		t.Fatalf("setup join table: %v", err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.Patient{}, &models.CaregiverPatient{}, &models.DetectionLog{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	database.DB = db

	f := &alertScopeFixture{
		admin: models.User{Email: "admin@test", Role: "admin"},
		alice: models.User{Email: "alice@test", Role: "user"},
		bob:   models.User{Email: "bob@test", Role: "user"},
	}
	for _, u := range []*models.User{&f.admin, &f.alice, &f.bob} {
		if err := db.Create(u).Error; err != nil {
			t.Fatalf("create user: %v", err)
		}
	}
	f.alicePat = models.Patient{Name: "A"}
	f.bobPat = models.Patient{Name: "B"}
	f.removedPat = models.Patient{Name: "R"}
	for _, p := range []*models.Patient{&f.alicePat, &f.bobPat, &f.removedPat} {
		if err := db.Create(p).Error; err != nil {
			t.Fatalf("create patient: %v", err)
		}
	}
	links := []models.CaregiverPatient{
		{PatientID: f.alicePat.ID, UserID: f.alice.ID},
		{PatientID: f.bobPat.ID, UserID: f.bob.ID},
		{PatientID: f.removedPat.ID, UserID: f.alice.ID},
	}
	for i := range links {
		if err := db.Create(&links[i]).Error; err != nil {
			t.Fatalf("create link: %v", err)
		}
	}
	// alice ถูกถอดออกจากผู้ป่วย R (soft delete) → ต้องไม่เห็น/ปิด alert ของ R แล้ว
	if err := db.Where("patient_id = ? AND user_id = ?", f.removedPat.ID, f.alice.ID).Delete(&models.CaregiverPatient{}).Error; err != nil {
		t.Fatalf("soft delete link: %v", err)
	}

	f.aliceLog = models.DetectionLog{PatientID: &f.alicePat.ID, DeviceMAC: "AA", Status: "needs_help"}
	f.bobLog = models.DetectionLog{PatientID: &f.bobPat.ID, DeviceMAC: "BB", Status: "needs_help"}
	f.removedLog = models.DetectionLog{PatientID: &f.removedPat.ID, DeviceMAC: "RR", Status: "needs_help"}
	for _, l := range []*models.DetectionLog{&f.aliceLog, &f.bobLog, &f.removedLog} {
		if err := db.Create(l).Error; err != nil {
			t.Fatalf("create log: %v", err)
		}
	}
	return f
}

// newScopeApp จำลอง RequireAuth: ฝาก jwt.Token ที่มี user_id จาก header X-Test-User ไว้ใน Locals
func newScopeApp() *fiber.App {
	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error {
		if id := c.Get("X-Test-User"); id != "" {
			n, _ := strconv.Atoi(id)
			c.Locals("user", &jwt.Token{Claims: jwt.MapClaims{"user_id": float64(n)}})
		}
		return c.Next()
	})
	app.Get("/api/alerts/", GetActiveAlerts)
	app.Get("/api/alerts/history", GetHistoryAlerts)
	app.Put("/api/alerts/:id/resolve", ResolveAlert)
	app.Get("/api/audio/my-logs", GetMyDetectionLogs)
	return app
}

func doScopeReq(t *testing.T, app *fiber.App, method, target string, user uint) (int, []byte) {
	t.Helper()
	req := httptest.NewRequest(method, target, nil)
	if user != 0 {
		req.Header.Set("X-Test-User", strconv.Itoa(int(user)))
	}
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, target, err)
	}
	body, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, body
}

func countIDs(t *testing.T, body []byte) map[uint]bool {
	t.Helper()
	var rows []struct {
		ID uint `json:"id"`
	}
	if err := json.Unmarshal(body, &rows); err != nil {
		// DetectionLog (gorm.Model) serialises ID as "ID"
		var logs []models.DetectionLog
		if err2 := json.Unmarshal(body, &logs); err2 != nil {
			t.Fatalf("decode %s: %v", body, err)
		}
		out := map[uint]bool{}
		for _, l := range logs {
			out[l.ID] = true
		}
		return out
	}
	out := map[uint]bool{}
	for _, r := range rows {
		out[r.ID] = true
	}
	return out
}

func TestAlertScope_HistoryAndActive(t *testing.T) {
	f := setupAlertScopeDB(t)
	app := newScopeApp()

	for _, path := range []string{"/api/alerts/history", "/api/alerts/"} {
		// ไม่ล็อกอิน → 401
		if code, _ := doScopeReq(t, app, "GET", path, 0); code != 401 {
			t.Errorf("%s anonymous: expected 401, got %d", path, code)
		}

		// ผู้ดูแลไม่ส่ง email → เห็นเฉพาะของตัวเอง (ไม่รวมผู้ป่วยที่ถูกถอดออก)
		code, body := doScopeReq(t, app, "GET", path, f.alice.ID)
		ids := countIDs(t, body)
		if code != 200 || len(ids) != 1 || !ids[f.aliceLog.ID] {
			t.Errorf("%s alice: expected only her log, got %d %s", path, code, body)
		}

		// ผู้ดูแลขอ email คนอื่น → 403
		if code, _ := doScopeReq(t, app, "GET", path+"?email=bob@test", f.alice.ID); code != 403 {
			t.Errorf("%s alice→bob: expected 403, got %d", path, code)
		}

		// admin ไม่ส่ง email → เห็นทั้งหมด
		code, body = doScopeReq(t, app, "GET", path, f.admin.ID)
		if ids := countIDs(t, body); code != 200 || len(ids) != 3 {
			t.Errorf("%s admin: expected all 3 logs, got %d %s", path, code, body)
		}

		// admin ระบุ email ของ bob → เฉพาะของ bob
		code, body = doScopeReq(t, app, "GET", path+"?email=bob@test", f.admin.ID)
		if ids := countIDs(t, body); code != 200 || len(ids) != 1 || !ids[f.bobLog.ID] {
			t.Errorf("%s admin→bob: expected only bob's log, got %d %s", path, code, body)
		}
	}
}

func TestResolveAlert_Ownership(t *testing.T) {
	f := setupAlertScopeDB(t)
	app := newScopeApp()
	url := func(id uint) string { return "/api/alerts/" + strconv.Itoa(int(id)) + "/resolve" }

	if code, _ := doScopeReq(t, app, "PUT", url(f.bobLog.ID), f.alice.ID); code != 403 {
		t.Errorf("alice resolving bob's alert: expected 403, got %d", code)
	}
	if code, _ := doScopeReq(t, app, "PUT", url(f.removedLog.ID), f.alice.ID); code != 403 {
		t.Errorf("alice resolving alert of removed patient: expected 403, got %d", code)
	}
	if code, _ := doScopeReq(t, app, "PUT", url(f.aliceLog.ID), f.alice.ID); code != 200 {
		t.Errorf("alice resolving own alert: expected 200, got %d", code)
	}
	if code, _ := doScopeReq(t, app, "PUT", url(f.bobLog.ID), f.admin.ID); code != 200 {
		t.Errorf("admin resolving any alert: expected 200, got %d", code)
	}

	var bobLog models.DetectionLog
	database.DB.First(&bobLog, f.bobLog.ID)
	if !bobLog.IsResolved || bobLog.Status != "resolved" {
		t.Errorf("bob's alert should be resolved by admin, got %+v", bobLog)
	}
}

func TestGetMyDetectionLogs_ThroughCaregiverPatients(t *testing.T) {
	f := setupAlertScopeDB(t)
	app := newScopeApp()

	if code, _ := doScopeReq(t, app, "GET", "/api/audio/my-logs", 0); code != 401 {
		t.Errorf("anonymous: expected 401, got %d", code)
	}
	code, body := doScopeReq(t, app, "GET", "/api/audio/my-logs", f.bob.ID)
	ids := countIDs(t, body)
	if code != 200 || len(ids) != 1 || !ids[f.bobLog.ID] {
		t.Errorf("bob: expected only his log, got %d %s", code, body)
	}
}
