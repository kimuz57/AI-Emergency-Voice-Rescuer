package controllers

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"

	"go_backend/models"
)

const testGoogleClientID = "test-client.apps.googleusercontent.com"

func validGoogleInfo(now time.Time) googleTokenInfo {
	return googleTokenInfo{
		Aud:           testGoogleClientID,
		Iss:           "https://accounts.google.com",
		Sub:           "1234567890",
		Email:         "victim@example.com",
		EmailVerified: "true",
		Exp:           strconv.FormatInt(now.Add(time.Hour).Unix(), 10),
		Name:          "Victim",
		Picture:       "https://example.com/p.png",
	}
}

func TestValidateGoogleTokenInfo(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)

	if err := validateGoogleTokenInfo(validGoogleInfo(now), testGoogleClientID, now); err != nil {
		t.Fatalf("expected valid token info, got %v", err)
	}
	plainIss := validGoogleInfo(now)
	plainIss.Iss = "accounts.google.com"
	if err := validateGoogleTokenInfo(plainIss, testGoogleClientID, now); err != nil {
		t.Fatalf("expected iss without scheme to be accepted, got %v", err)
	}

	cases := map[string]func(*googleTokenInfo){
		"wrong aud":          func(i *googleTokenInfo) { i.Aud = "other-app" },
		"wrong iss":          func(i *googleTokenInfo) { i.Iss = "https://evil.example.com" },
		"email not verified": func(i *googleTokenInfo) { i.EmailVerified = "false" },
		"missing verified":   func(i *googleTokenInfo) { i.EmailVerified = "" },
		"missing email":      func(i *googleTokenInfo) { i.Email = "  " },
		"expired":            func(i *googleTokenInfo) { i.Exp = strconv.FormatInt(now.Add(-time.Second).Unix(), 10) },
		"exp equals now":     func(i *googleTokenInfo) { i.Exp = strconv.FormatInt(now.Unix(), 10) },
		"bad exp":            func(i *googleTokenInfo) { i.Exp = "soon" },
	}
	for name, mutate := range cases {
		info := validGoogleInfo(now)
		mutate(&info)
		err := validateGoogleTokenInfo(info, testGoogleClientID, now)
		if !errors.Is(err, errGoogleTokenInvalid) {
			t.Errorf("%s: expected errGoogleTokenInvalid, got %v", name, err)
		}
	}

	if err := validateGoogleTokenInfo(validGoogleInfo(now), "", now); !errors.Is(err, errGoogleLoginNotConfigured) {
		t.Fatalf("expected errGoogleLoginNotConfigured with empty client id, got %v", err)
	}
}

// fakeGoogle ชี้ googleTokenInfoURL ไปที่ httptest server ที่ตอบ info ให้ id_token "good"
func fakeGoogle(t *testing.T, info googleTokenInfo) {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("id_token") != "good" {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":"invalid_token"}`))
			return
		}
		_ = json.NewEncoder(w).Encode(info)
	}))
	t.Cleanup(srv.Close)

	oldURL := googleTokenInfoURL
	googleTokenInfoURL = srv.URL
	t.Cleanup(func() { googleTokenInfoURL = oldURL })
}

func postJSON(t *testing.T, app *fiber.App, path string, body any) (int, map[string]any) {
	t.Helper()
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewBuffer(b))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test error: %v", err)
	}
	raw, _ := io.ReadAll(resp.Body)
	out := map[string]any{}
	_ = json.Unmarshal(raw, &out)
	return resp.StatusCode, out
}

func newAuthApp() *fiber.App {
	app := fiber.New()
	app.Post("/google", GoogleLogin)
	app.Post("/register", Register)
	app.Post("/login", LoginWithEmail)
	app.Post("/reset", ResetPassword)
	return app
}

func TestGoogleLogin_RequiresVerifiedIDToken(t *testing.T) {
	db := setupTestDB(t)
	t.Setenv("JWT_SECRET", "test-secret-for-unit-tests-only")
	t.Setenv("GOOGLE_CLIENT_ID", testGoogleClientID)
	fakeGoogle(t, validGoogleInfo(time.Now()))
	app := newAuthApp()

	// ไม่มี id_token → 400 แม้จะส่ง email มา
	if code, _ := postJSON(t, app, "/google", map[string]string{"email": "admin@evr.com"}); code != http.StatusBadRequest {
		t.Fatalf("expected 400 without id_token, got %d", code)
	}
	// id_token ปลอม → 401
	if code, _ := postJSON(t, app, "/google", map[string]string{"id_token": "forged", "email": "admin@evr.com"}); code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for forged id_token, got %d", code)
	}
	// id_token ถูก → ใช้อีเมลจาก token ไม่ใช่จาก body
	code, _ := postJSON(t, app, "/google", map[string]string{"id_token": "good", "email": "admin@evr.com"})
	if code != http.StatusOK {
		t.Fatalf("expected 200 for valid id_token, got %d", code)
	}
	var n int64
	db.Model(&models.User{}).Where("email = ?", "admin@evr.com").Count(&n)
	if n != 0 {
		t.Fatal("body email must be ignored")
	}
	db.Model(&models.User{}).Where("email = ?", "victim@example.com").Count(&n)
	if n != 1 {
		t.Fatal("expected account for the verified token email")
	}
}

func TestGoogleLogin_NotConfigured(t *testing.T) {
	setupTestDB(t)
	t.Setenv("GOOGLE_CLIENT_ID", "")
	if code, out := postJSON(t, newAuthApp(), "/google", map[string]string{"id_token": "good"}); code != http.StatusInternalServerError || out["error"] != "Google login not configured" {
		t.Fatalf("expected 500 Google login not configured, got %d %v", code, out)
	}
}

func TestGoogleLogin_ClearsUnverifiedPasswordAndRejectsDeleted(t *testing.T) {
	db := setupTestDB(t)
	t.Setenv("JWT_SECRET", "test-secret-for-unit-tests-only")
	t.Setenv("GOOGLE_CLIENT_ID", testGoogleClientID)
	fakeGoogle(t, validGoogleInfo(time.Now()))
	app := newAuthApp()

	// มีคนสมัครอีเมลของเหยื่อไว้ก่อน (ยังไม่ยืนยัน)
	db.Create(&models.User{Email: "victim@example.com", Password: "attacker-hash", IsVerified: false})
	if code, _ := postJSON(t, app, "/google", map[string]string{"id_token": "good"}); code != http.StatusOK {
		t.Fatalf("expected 200, got %d", code)
	}
	var got models.User
	db.Where("email = ?", "victim@example.com").First(&got)
	if !got.IsVerified || got.Password != "" {
		t.Fatalf("expected verified account with pre-set password cleared, got verified=%v password=%q", got.IsVerified, got.Password)
	}

	// B26: บัญชีถูก soft delete → 409 ไม่ใช่ 500
	db.Delete(&got)
	if code, _ := postJSON(t, app, "/google", map[string]string{"id_token": "good"}); code != http.StatusConflict {
		t.Fatalf("expected 409 for soft-deleted account, got %d", code)
	}
}

func TestRegister_DoesNotTakeOverGoogleOrDeletedAccount(t *testing.T) {
	db := setupTestDB(t)
	app := newAuthApp()

	db.Create(&models.User{Email: "g@example.com", Password: "", IsVerified: true})
	code, _ := postJSON(t, app, "/register", map[string]string{"email": "g@example.com", "password": "attacker1"})
	if code != http.StatusConflict {
		t.Fatalf("expected 409 for Google account, got %d", code)
	}
	var got models.User
	db.Where("email = ?", "g@example.com").First(&got)
	if got.Password != "" {
		t.Fatal("password must not be set on a Google account via register")
	}

	deleted := models.User{Email: "d@example.com", Password: "x"}
	db.Create(&deleted)
	db.Delete(&deleted)
	if code, _ := postJSON(t, app, "/register", map[string]string{"email": "d@example.com", "password": "secret12"}); code != http.StatusConflict {
		t.Fatalf("expected 409 for soft-deleted account, got %d", code)
	}
}

func TestResetPassword_RejectsEmptyTokenAndZeroExpiry(t *testing.T) {
	db := setupTestDB(t)
	app := newAuthApp()

	// ผู้ใช้ที่ไม่เคยขอ reset: token "" และ expiry เป็น zero
	db.Create(&models.User{Email: "never@example.com", Password: "old"})
	for _, tok := range []string{"", "   "} {
		if code, _ := postJSON(t, app, "/reset", map[string]string{"token": tok, "new_password": "hacked1"}); code != http.StatusBadRequest {
			t.Fatalf("expected 400 for token %q, got %d", tok, code)
		}
	}

	// token มีค่า แต่ expiry เป็น zero → ต้องถือว่าหมดอายุ
	db.Create(&models.User{Email: "zero@example.com", Password: "old", PasswordResetToken: "zerotoken"})
	if code, _ := postJSON(t, app, "/reset", map[string]string{"token": "zerotoken", "new_password": "hacked1"}); code != http.StatusBadRequest {
		t.Fatalf("expected 400 for zero expiry, got %d", code)
	}

	var got models.User
	db.Where("email = ?", "never@example.com").First(&got)
	if got.Password != "old" {
		t.Fatal("password must not change")
	}
}

func TestLogin_GenericErrorForUnknownEmailAndWrongPassword(t *testing.T) {
	db := setupTestDB(t)
	app := newAuthApp()

	hash, _ := HashPassword("correct-password")
	db.Create(&models.User{Email: "u@example.com", Password: hash, IsVerified: true})

	code1, out1 := postJSON(t, app, "/login", map[string]string{"email": "nobody@example.com", "password": "whatever"})
	code2, out2 := postJSON(t, app, "/login", map[string]string{"email": "u@example.com", "password": "wrong-password"})
	if code1 != http.StatusUnauthorized || code2 != http.StatusUnauthorized {
		t.Fatalf("expected 401/401, got %d/%d", code1, code2)
	}
	if out1["error"] != out2["error"] {
		t.Fatalf("expected identical error messages, got %q vs %q", out1["error"], out2["error"])
	}
}

func TestResetPassword_SingleUseAndVerifiesAccount(t *testing.T) {
	db := setupTestDB(t)
	app := newAuthApp()

	// บัญชีที่มีคนสมัครด้วยอีเมลนี้ไว้ก่อน (ยังไม่ยืนยัน) แล้วเจ้าของอีเมลตัวจริงใช้ลิงก์รีเซ็ต
	db.Create(&models.User{
		Email:               "pre@example.com",
		Password:            "attacker-hash",
		VerificationToken:   "verifytok",
		PasswordResetToken:  "goodtoken",
		PasswordResetExpiry: time.Now().Add(time.Hour),
	})

	if code, _ := postJSON(t, app, "/reset", map[string]string{"token": "goodtoken", "new_password": "newpass1"}); code != http.StatusOK {
		t.Fatalf("expected 200 for valid reset, got %d", code)
	}
	var got models.User
	db.Where("email = ?", "pre@example.com").First(&got)
	if got.Password == "attacker-hash" || !CheckPasswordHash("newpass1", got.Password) {
		t.Fatal("password must be replaced")
	}
	if got.PasswordResetToken != "" || !got.PasswordResetExpiry.IsZero() {
		t.Fatal("reset token/expiry must be cleared after use")
	}
	if !got.IsVerified || got.VerificationToken != "" {
		t.Fatal("reset via email link should mark the account verified")
	}

	// ใช้ token เดิมซ้ำไม่ได้
	if code, _ := postJSON(t, app, "/reset", map[string]string{"token": "goodtoken", "new_password": "again12"}); code != http.StatusBadRequest {
		t.Fatalf("expected 400 on token reuse, got %d", code)
	}
}
