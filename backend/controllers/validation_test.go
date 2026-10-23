package controllers

import (
	"bytes"
	"encoding/binary"
	"mime/multipart"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
)

// เส้นทางในไฟล์นี้ต้องตอบ 400 ก่อนแตะฐานข้อมูล จึงทดสอบได้โดยไม่ต้องมี DB

func TestCheckinRejectsMalformedMAC(t *testing.T) {
	app := fiber.New()
	app.Get("/checkin", CheckinDeviceIP)
	app.Get("/check-activation", CheckDeviceActivation)

	for _, mac := range []string{"not-a-mac", "1CC3ABB3B918", "1C-C3-AB-B3-B9-18", "1C:C3:AB:B3:B9"} {
		q := url.Values{"mac": {mac}, "ip": {"192.168.1.10"}}.Encode()
		for _, path := range []string{"/checkin?", "/check-activation?"} {
			resp, err := app.Test(httptest.NewRequest("GET", path+q, nil))
			if err != nil {
				t.Fatal(err)
			}
			if resp.StatusCode != fiber.StatusBadRequest {
				t.Errorf("GET %s mac=%q: status %d, want 400", path, mac, resp.StatusCode)
			}
		}
	}
}

func TestRegisterDeviceAndStatusRejectMalformedMAC(t *testing.T) {
	app := fiber.New()
	app.Post("/devices", RegisterDevice)
	app.Post("/status", UpdateDevices)

	cases := map[string]string{
		"/devices": `{"mac_address":"12345","status":"offline"}`,
		"/status":  `{"mac":"zz:zz:zz:zz:zz:zz","status":"online"}`,
	}
	for path, body := range cases {
		req := httptest.NewRequest("POST", path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		resp, err := app.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		if resp.StatusCode != fiber.StatusBadRequest {
			t.Errorf("POST %s: status %d, want 400", path, resp.StatusCode)
		}
	}
}

func emergencyUpload(t *testing.T, filename string, content []byte) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	w.WriteField("device_mac", "02:00:00:00:00:01")
	part, _ := w.CreateFormFile("audio", filename)
	part.Write(content)
	w.Close()

	app := fiber.New()
	app.Post("/emergency", SaveEmergencyAudio)
	req := httptest.NewRequest("POST", "/emergency", &body)
	req.Header.Set("Content-Type", w.FormDataContentType())
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	rec.Code = resp.StatusCode
	return rec
}

func TestSaveEmergencyAudioRejectsNonWAV(t *testing.T) {
	eightBit := []byte("RIFF\x00\x00\x00\x00WAVEfmt \x10\x00\x00\x00")
	tail := make([]byte, 16)
	binary.LittleEndian.PutUint16(tail[0:2], 1)    // PCM
	binary.LittleEndian.PutUint16(tail[2:4], 1)    // mono
	binary.LittleEndian.PutUint32(tail[4:8], 8000) // Hz
	binary.LittleEndian.PutUint16(tail[14:16], 8)  // 8 บิต
	eightBit = append(append(eightBit, tail...), []byte("data\x00\x00\x00\x00")...)

	cases := map[string][]byte{
		"page.html":  []byte("<html>not audio</html>"),
		"fake.wav":   []byte("RIFF\x00\x00\x00\x00AVI LIST"),
		"8bit.wav":   eightBit,
		"empty.wav":  {},
		"toobig.wav": append([]byte("RIFF\x00\x00\x00\x00WAVE"), make([]byte, maxEmergencyAudioSize)...),
	}
	for name, content := range cases {
		if rec := emergencyUpload(t, name, content); rec.Code != fiber.StatusBadRequest {
			t.Errorf("%s: status %d, want 400", name, rec.Code)
		}
	}
}

func TestLogoutExpiresTokenCookie(t *testing.T) {
	app := fiber.New()
	app.Post("/logout", Logout)
	resp, err := app.Test(httptest.NewRequest("POST", "/logout", nil))
	if err != nil {
		t.Fatal(err)
	}
	cookie := resp.Header.Get("Set-Cookie")
	if !strings.HasPrefix(cookie, "token=;") || !strings.Contains(cookie, "expires=Thu, 01 Jan 1970 00:00:00 GMT") {
		t.Errorf("Set-Cookie = %q, want an empty token cookie that expired in 1970", cookie)
	}
}
