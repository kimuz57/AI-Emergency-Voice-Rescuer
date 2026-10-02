package controllers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"regexp"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"go_backend/database"
	"go_backend/models"
)

// setupPatientTestDB เปิด sqlite in-memory พร้อมตารางที่ DeletePatient / TelegramWebhook ใช้
func setupPatientTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open sqlite in-memory: %v", err)
	}
	if err := db.SetupJoinTable(&models.User{}, "Patients", &models.CaregiverPatient{}); err != nil {
		t.Fatalf("setup join table: %v", err)
	}
	if err := db.SetupJoinTable(&models.Patient{}, "Caregivers", &models.CaregiverPatient{}); err != nil {
		t.Fatalf("setup join table: %v", err)
	}
	if err := db.AutoMigrate(
		&models.User{}, &models.UserTelegramMapping{}, &models.Patient{}, &models.Device{},
		&models.Device_patient{}, &models.CaregiverPatient{}, &models.DetectionLog{},
	); err != nil {
		t.Fatalf("auto migrate failed: %v", err)
	}
	database.DB = db
	return db
}

// asUser จำลอง RequireAuth: ฝาก jwt.Token ที่มี user_id ไว้ใน c.Locals("user")
func asUser(id uint) fiber.Handler {
	return func(c *fiber.Ctx) error {
		c.Locals("user", &jwt.Token{Claims: jwt.MapClaims{"user_id": float64(id)}, Valid: true})
		return c.Next()
	}
}

func TestDeletePatient_OwnershipRule(t *testing.T) {
	db := setupPatientTestDB(t)

	owner := models.User{Name: "owner", Email: "owner@test.local", Role: "user"}
	other := models.User{Name: "other", Email: "other@test.local", Role: "user"}
	admin := models.User{Name: "admin", Email: "admin@test.local", Role: "admin"}
	for _, u := range []*models.User{&owner, &other, &admin} {
		if err := db.Create(u).Error; err != nil {
			t.Fatalf("create user: %v", err)
		}
	}

	newPatient := func(name string) models.Patient {
		p := models.Patient{Name: name, Caregivers: []models.User{owner}}
		if err := db.Create(&p).Error; err != nil {
			t.Fatalf("create patient: %v", err)
		}
		return p
	}
	del := func(userID, patientID uint) int {
		app := fiber.New()
		app.Delete("/api/patients/:id", asUser(userID), DeletePatient)
		req := httptest.NewRequest("DELETE", fmt.Sprintf("/api/patients/%d", patientID), nil)
		resp, err := app.Test(req, 5000)
		if err != nil {
			t.Fatalf("app.Test error: %v", err)
		}
		return resp.StatusCode
	}

	p1 := newPatient("p1")
	if code := del(other.ID, p1.ID); code != http.StatusNotFound {
		t.Fatalf("unrelated caregiver should get 404, got %d", code)
	}
	var count int64
	db.Model(&models.Patient{}).Where("id = ?", p1.ID).Count(&count)
	if count != 1 {
		t.Fatalf("patient must not be deleted by unrelated caregiver")
	}

	if code := del(owner.ID, p1.ID); code != http.StatusOK {
		t.Fatalf("linked caregiver should be able to delete, got %d", code)
	}
	db.Model(&models.CaregiverPatient{}).Where("patient_id = ?", p1.ID).Count(&count)
	if count != 0 {
		t.Fatalf("caregiver link should be (soft) deleted, still %d", count)
	}

	p2 := newPatient("p2")
	if code := del(admin.ID, p2.ID); code != http.StatusOK {
		t.Fatalf("admin should be able to delete any patient, got %d", code)
	}
}

func TestTelegramWebhook_SecretAndLegacyStart(t *testing.T) {
	db := setupPatientTestDB(t)
	t.Setenv("TELEGRAM_WEBHOOK_SECRET", "hook-secret")
	t.Setenv("TELEGRAM_BOT_TOKEN", "") // ไม่ให้ goroutine ตอบกลับยิงออก network

	victim := models.User{Name: "victim", Email: "victim@test.local", Role: "user"}
	if err := db.Create(&victim).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	app := fiber.New()
	app.Post("/api/telegram/webhook", TelegramWebhook)
	send := func(secret, text string) int {
		body, _ := json.Marshal(map[string]interface{}{
			"message": map[string]interface{}{"text": text, "chat": map[string]interface{}{"id": 999}},
		})
		req := httptest.NewRequest("POST", "/api/telegram/webhook", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		if secret != "" {
			req.Header.Set("X-Telegram-Bot-Api-Secret-Token", secret)
		}
		resp, err := app.Test(req, 5000)
		if err != nil {
			t.Fatalf("app.Test error: %v", err)
		}
		return resp.StatusCode
	}

	start := fmt.Sprintf("/start %d", victim.ID)
	if code := send("", start); code != http.StatusUnauthorized {
		t.Fatalf("missing secret should be 401, got %d", code)
	}
	if code := send("wrong", start); code != http.StatusUnauthorized {
		t.Fatalf("wrong secret should be 401, got %d", code)
	}
	if code := send("hook-secret", start); code != http.StatusOK {
		t.Fatalf("valid secret should be 200, got %d", code)
	}

	// flow เก่า "/start <userId>" ต้องไม่ผูกอะไรเลย
	var count int64
	db.Model(&models.UserTelegramMapping{}).Where("user_id = ?", victim.ID).Count(&count)
	if count != 0 {
		t.Fatalf("legacy /start <userId> must not link a chat")
	}
}

func TestNewTelegramLinkToken(t *testing.T) {
	re := regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)
	a, err := newTelegramLinkToken()
	if err != nil {
		t.Fatalf("newTelegramLinkToken: %v", err)
	}
	b, _ := newTelegramLinkToken()
	if !re.MatchString(a) || !re.MatchString(b) {
		t.Fatalf("token must be 43 base64url chars (Telegram start param), got %q / %q", a, b)
	}
	if a == b {
		t.Fatalf("tokens must be random")
	}
}

func TestIsAllDigits(t *testing.T) {
	cases := map[string]bool{"": false, "12": true, "007": true, "1a": false, "abc-_": false}
	for in, want := range cases {
		if got := isAllDigits(in); got != want {
			t.Errorf("isAllDigits(%q) = %v, want %v", in, got, want)
		}
	}
}
