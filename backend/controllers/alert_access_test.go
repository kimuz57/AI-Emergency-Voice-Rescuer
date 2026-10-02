package controllers

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"

	"go_backend/utils"
)

func TestAudioFilePath(t *testing.T) {
	ok := []string{"emergency_123.wav", "a.b.wav"}
	for _, name := range ok {
		if _, valid := audioFilePath(name); !valid {
			t.Errorf("audioFilePath(%q) should be valid", name)
		}
	}

	bad := []string{
		"", ".", "..", "../secret.wav", "..\\secret.wav", "sub/a.wav", "sub\\a.wav",
		"C:a.wav", "/etc/passwd", "a.mp3", "a.WAV", ".wav", ".hidden.wav", "a.wav\x00.txt",
	}
	for _, name := range bad {
		if _, valid := audioFilePath(name); valid {
			t.Errorf("audioFilePath(%q) should be rejected", name)
		}
	}
}

func TestBuildAlertLink_RoundTrip(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret")
	t.Setenv("FRONTEND_URL", "https://example.test/")

	link := buildAlertLink(" aa:bb:cc:dd:ee:ff ")
	u, err := url.Parse(link)
	if err != nil {
		t.Fatalf("invalid link %q: %v", link, err)
	}
	if u.Scheme != "https" || u.Host != "example.test" || u.Path != "/alert" {
		t.Fatalf("unexpected link %q", link)
	}
	mac := u.Query().Get("mac")
	if mac != "AA:BB:CC:DD:EE:FF" {
		t.Fatalf("mac should be normalised, got %q", mac)
	}
	if !utils.VerifyAlertToken(mac, u.Query().Get("token")) {
		t.Fatalf("token in link does not verify for %s", mac)
	}
}

func TestBuildAlertLink_NoSecret(t *testing.T) {
	t.Setenv("JWT_SECRET", "")
	if link := buildAlertLink("AA:BB"); link != "" {
		t.Fatalf("expected empty link without JWT_SECRET, got %q", link)
	}
}

// token ผิด/ไม่มี ต้องโดน 401 ก่อนแตะ DB
func TestAlertLinkEndpoints_RejectBadToken(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret")
	app := fiber.New()
	app.Get("/api/alerts/device", GetAlertDeviceInfo)
	app.Post("/api/alerts/acknowledge", AcknowledgeAlert)

	otherMACToken, err := utils.SignAlertToken("11:22:33:44:55:66")
	if err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		name string
		req  *http.Request
	}{
		{"device no token", httptest.NewRequest("GET", "/api/alerts/device?mac=AA:BB", nil)},
		{"device garbage token", httptest.NewRequest("GET", "/api/alerts/device?mac=AA:BB&token=123.abc", nil)},
		{"device token of other mac", func() *http.Request {
			r := httptest.NewRequest("GET", "/api/alerts/device?mac=AA:BB", nil)
			r.Header.Set("X-Alert-Token", otherMACToken)
			return r
		}()},
		{"ack no token", func() *http.Request {
			r := httptest.NewRequest("POST", "/api/alerts/acknowledge", bytes.NewBufferString(`{"mac_address":"AA:BB"}`))
			r.Header.Set("Content-Type", "application/json")
			return r
		}()},
		{"ack body token of other mac", func() *http.Request {
			r := httptest.NewRequest("POST", "/api/alerts/acknowledge",
				strings.NewReader(`{"mac_address":"AA:BB","token":"`+otherMACToken+`"}`))
			r.Header.Set("Content-Type", "application/json")
			return r
		}()},
	}

	for _, tc := range cases {
		resp, err := app.Test(tc.req)
		if err != nil {
			t.Fatalf("%s: %v", tc.name, err)
		}
		if resp.StatusCode != fiber.StatusUnauthorized {
			t.Errorf("%s: expected 401, got %d", tc.name, resp.StatusCode)
		}
	}
}
