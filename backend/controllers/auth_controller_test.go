package controllers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"go_backend/database"
	"go_backend/models"
)

func setupTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open sqlite in-memory: %v", err)
	}

	if err := db.AutoMigrate(&models.User{}); err != nil {
		t.Fatalf("auto migrate failed: %v", err)
	}

	// assign global DB used by handlers
	database.DB = db
	return db
}

func newApp() *fiber.App {
	app := fiber.New()
	app.Post("/api/auth/forgot-password", ForgotPassword)
	app.Post("/api/auth/reset-password", ResetPassword)
	return app
}

func TestForgotPassword_EmptyOrInvalidEmail(t *testing.T) {
	setupTestDB(t)
	app := newApp()

	// invalid body
	req := httptest.NewRequest("POST", "/api/auth/forgot-password", bytes.NewBuffer([]byte("notjson")))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	if err != nil {
		t.Fatalf("app.Test error: %v", err)
	}
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for bad body, got %d", resp.StatusCode)
	}

	// missing email field
	body, _ := json.Marshal(map[string]string{})
	req = httptest.NewRequest("POST", "/api/auth/forgot-password", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err = app.Test(req, 5000)
	if err != nil {
		t.Fatalf("app.Test error: %v", err)
	}
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing email, got %d", resp.StatusCode)
	}
}

func TestForgotPassword_NonExistingEmail_Returns200(t *testing.T) {
	setupTestDB(t)
	app := newApp()

	// disable SMTP sending
	os.Setenv("SMTP_DISABLE", "true")
	defer os.Unsetenv("SMTP_DISABLE")

	body, _ := json.Marshal(map[string]string{"email": "noexist@example.com"})
	req := httptest.NewRequest("POST", "/api/auth/forgot-password", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	if err != nil {
		t.Fatalf("app.Test error: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestForgotPassword_ExistingUser_SetsToken(t *testing.T) {
	db := setupTestDB(t)
	app := newApp()
	os.Setenv("SMTP_DISABLE", "true")
	defer os.Unsetenv("SMTP_DISABLE")

	user := models.User{Name: "T", Email: "t@example.com", Password: "x"}
	db.Create(&user)

	body, _ := json.Marshal(map[string]string{"email": "t@example.com"})
	req := httptest.NewRequest("POST", "/api/auth/forgot-password", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	if err != nil {
		t.Fatalf("app.Test error: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var got models.User
	db.Where("email = ?", "t@example.com").First(&got)
	if got.PasswordResetToken == "" {
		t.Fatalf("expected password_reset_token to be set")
	}
	if got.PasswordResetExpiry.Before(time.Now()) {
		t.Fatalf("expected expiry in the future")
	}
}

func TestResetPassword_InvalidPayloadOrToken(t *testing.T) {
	setupTestDB(t)
	app := newApp()

	// bad body
	req := httptest.NewRequest("POST", "/api/auth/reset-password", bytes.NewBuffer([]byte("bad")))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	if err != nil {
		t.Fatalf("app.Test error: %v", err)
	}
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for bad body, got %d", resp.StatusCode)
	}

	// invalid token
	body, _ := json.Marshal(map[string]string{"token": "no", "new_password": "123456"})
	req = httptest.NewRequest("POST", "/api/auth/reset-password", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err = app.Test(req, 5000)
	if err != nil {
		t.Fatalf("app.Test error: %v", err)
	}
	if resp.StatusCode == http.StatusOK {
		t.Fatalf("expected non-200 for invalid token")
	}
}

func TestResetPassword_Success(t *testing.T) {
	db := setupTestDB(t)
	app := newApp()

	// create user with token
	token := "abcd1234abcd1234abcd1234abcd1234"
	user := models.User{Name: "U", Email: "u@ex.com", Password: "old", PasswordResetToken: token, PasswordResetExpiry: time.Now().Add(time.Hour)}
	db.Create(&user)

	body, _ := json.Marshal(map[string]string{"token": token, "new_password": "newpassword"})
	req := httptest.NewRequest("POST", "/api/auth/reset-password", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	if err != nil {
		t.Fatalf("app.Test error: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var got models.User
	db.Where("email = ?", "u@ex.com").First(&got)
	if got.Password == "old" {
		t.Fatalf("expected password to be updated")
	}
	if got.PasswordResetToken != "" {
		t.Fatalf("expected token to be cleared")
	}
}
