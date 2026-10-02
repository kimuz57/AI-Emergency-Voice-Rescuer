package routes

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"go_backend/utils"

	"github.com/gofiber/fiber/v2"
)

// ตรวจว่า route ที่ต้องป้องกันถูกครอบด้วย middleware จริง (ทุกเคสถูกปฏิเสธก่อนถึง DB)
func TestRoutesAreProtected(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-for-unit-tests-only")
	t.Setenv("INTERNAL_API_KEY", "internal-test-key")

	app := fiber.New()
	SetupRoutes(app)

	cases := []struct {
		method, path string
		want         int
	}{
		// INTERNAL: ไม่มี X-Internal-Key → 401
		{http.MethodPost, "/api/audio/emergency", http.StatusUnauthorized},
		{http.MethodPost, "/api/audio/negative", http.StatusUnauthorized},
		{http.MethodGet, "/api/device/check-activation?mac=AA", http.StatusUnauthorized},
		{http.MethodPost, "/api/device/status", http.StatusUnauthorized},
		{http.MethodPost, "/api/alerts", http.StatusUnauthorized},
		{http.MethodPost, "/api/alerts/ai", http.StatusUnauthorized},

		// AUTH: ไม่มี token → 401
		{http.MethodGet, "/api/user/profile", http.StatusUnauthorized},
		{http.MethodPut, "/api/user/profile", http.StatusUnauthorized},
		{http.MethodPost, "/api/user/upload-profile", http.StatusUnauthorized},
		{http.MethodPost, "/api/user/link-line", http.StatusUnauthorized},
		{http.MethodDelete, "/api/user/unlink-line", http.StatusUnauthorized},
		{http.MethodPost, "/api/user/telegram/toggle", http.StatusUnauthorized},
		{http.MethodDelete, "/api/user/telegram/disconnect", http.StatusUnauthorized},
		{http.MethodPost, "/api/user/telegram/link-token", http.StatusUnauthorized},
		{http.MethodGet, "/api/alerts", http.StatusUnauthorized},
		{http.MethodGet, "/api/alerts/history", http.StatusUnauthorized},
		{http.MethodGet, "/api/alerts/stats", http.StatusUnauthorized},
		{http.MethodGet, "/api/alerts/stream", http.StatusUnauthorized},
		{http.MethodPut, "/api/alerts/1/resolve", http.StatusUnauthorized},
		{http.MethodGet, "/api/device/stream", http.StatusUnauthorized},
		{http.MethodGet, "/api/devices", http.StatusUnauthorized},
		{http.MethodGet, "/api/audio/my-logs", http.StatusUnauthorized},
		// OptionalAuth + GetAudioFile: ไม่มี JWT/alert token → handler ตอบ 401 (ก่อนแตะ DB)
		{http.MethodGet, "/api/audio/x.wav", http.StatusUnauthorized},
		{http.MethodGet, "/api/audio/x.wav?token=not-a-jwt", http.StatusUnauthorized},
		{http.MethodGet, "/api/audio/x.wav?mac=AA:BB&alert_token=1.forged", http.StatusUnauthorized},
		{http.MethodGet, "/api/patients", http.StatusUnauthorized},

		// ADMIN: ไม่มี token → 401 (RequireAuth มาก่อน RequireAdmin)
		{http.MethodPost, "/api/devices", http.StatusUnauthorized},
		{http.MethodGet, "/api/audio", http.StatusUnauthorized},
		{http.MethodDelete, "/api/audio/x.wav", http.StatusUnauthorized},
		{http.MethodGet, "/api/admin/users", http.StatusUnauthorized},
	}

	for _, tc := range cases {
		req := httptest.NewRequest(tc.method, tc.path, nil)
		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatalf("%s %s: %v", tc.method, tc.path, err)
		}
		if resp.StatusCode != tc.want {
			t.Errorf("%s %s: expected %d, got %d", tc.method, tc.path, tc.want, resp.StatusCode)
		}
	}

	// token ที่ลงลายเซ็นผิด → 401 เช่นกัน
	req := httptest.NewRequest(http.MethodGet, "/api/alerts/stream?token=not-a-jwt", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("forged ?token=: expected 401, got %d", resp.StatusCode)
	}
}

func TestInternalRoutesFailClosedWithoutKey(t *testing.T) {
	t.Setenv("INTERNAL_API_KEY", "")
	app := fiber.New()
	SetupRoutes(app)

	req := httptest.NewRequest(http.MethodPost, "/api/audio/emergency", nil)
	req.Header.Set("X-Internal-Key", "")
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 when INTERNAL_API_KEY is unset, got %d", resp.StatusCode)
	}
}

// POST /api/user/telegram/connect ถูกถอดออก (รับ chatId ของใครก็ได้) — token ถูกต้องผ่าน RequireAuth แล้วต้องไม่เจอ route
func TestTelegramConnectRouteRemoved(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-for-unit-tests-only")
	app := fiber.New()
	SetupRoutes(app)

	token, err := utils.GenerateToken(1, "user@example.com")
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/user/telegram/connect", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 for removed route, got %d", resp.StatusCode)
	}
}
