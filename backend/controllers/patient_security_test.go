package controllers

import (
	"bytes"
	"fmt"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/gofiber/fiber/v2"

	"go_backend/models"
)

// :id ที่ไม่ใช่ตัวเลขต้องถูกปฏิเสธ ไม่งั้น GORM จะเอา string ไปต่อเป็น SQL ดิบใน First(&x, id)
func TestParseIDParam(t *testing.T) {
	cases := map[string]bool{
		"1":                    true,
		"42":                   true,
		"0":                    false,
		"-1":                   false,
		"id>0":                 false,
		"1=1":                  false,
		"1/**/OR/**/1=1":       false,
		"(select(1))":          false,
		"99999999999999999999": false,
	}
	for raw, want := range cases {
		app := fiber.New()
		var got bool
		app.Get("/x/:id", func(c *fiber.Ctx) error {
			_, got = parseIDParam(c)
			return nil
		})
		if _, err := app.Test(httptest.NewRequest("GET", "/x/"+url.PathEscape(raw), nil)); err != nil {
			t.Fatalf("app.Test(%q): %v", raw, err)
		}
		if got != want {
			t.Errorf("parseIDParam(%q) = %v, want %v", raw, got, want)
		}
	}
}

func TestDeletePatient_RejectsNonNumericID(t *testing.T) {
	db := setupPatientTestDB(t)
	admin := models.User{Name: "admin", Email: "admin@test.local", Role: "admin"}
	db.Create(&admin)
	p := models.Patient{Name: "victim"}
	db.Create(&p)

	app := fiber.New()
	app.Delete("/api/patients/:id", asUser(admin.ID), DeletePatient)
	resp, err := app.Test(httptest.NewRequest("DELETE", "/api/patients/id%3E0", nil), 5000)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if resp.StatusCode != 400 {
		t.Fatalf("status = %d, want 400", resp.StatusCode)
	}
	var count int64
	db.Model(&models.Patient{}).Count(&count)
	if count != 1 {
		t.Fatalf("patient was deleted through a non-numeric id")
	}
}

// CreatePatient ต้องไม่ยอมผูกบอร์ดที่ผูกกับผู้ป่วยของคนอื่นอยู่แล้ว
func TestCreatePatient_RejectsAlreadyBoundDevice(t *testing.T) {
	db := setupPatientTestDB(t)
	owner := models.User{Name: "owner", Email: "owner@test.local", Role: "user"}
	attacker := models.User{Name: "attacker", Email: "attacker@test.local", Role: "user"}
	db.Create(&owner)
	db.Create(&attacker)

	dev := models.Device{MacAddress: "AA:BB:CC:DD:EE:FF", IsActive: true}
	db.Create(&dev)
	victim := models.Patient{Name: "victim", Caregivers: []models.User{owner},
		DeviceAssignments: []models.Device_patient{{DeviceID: dev.ID, DeviceName: "bed"}}}
	if err := db.Create(&victim).Error; err != nil {
		t.Fatalf("create victim: %v", err)
	}

	app := fiber.New()
	app.Post("/api/patients", asUser(attacker.ID), CreatePatient)
	body := `{"name":"mine","devices":[{"mac_address":"aa:bb:cc:dd:ee:ff"}]}`
	req := httptest.NewRequest("POST", "/api/patients", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, 5000)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if resp.StatusCode != 409 {
		t.Fatalf("status = %d, want 409", resp.StatusCode)
	}
	var n int64
	db.Model(&models.Device_patient{}).Where("device_id = ?", dev.ID).Count(&n)
	if n != 1 {
		t.Fatalf("device_patients rows for device = %d, want 1", n)
	}
}

func TestIsValidTelegramLinkToken(t *testing.T) {
	tok, err := newTelegramLinkToken()
	if err != nil {
		t.Fatal(err)
	}
	if !isValidTelegramLinkToken(tok) {
		t.Fatalf("generated token %q rejected", tok)
	}
	for _, bad := range []string{"", "123", "abc", tok + "x", tok[:42] + "*", fmt.Sprintf("%043d", 0)[:42] + ":"} {
		if isValidTelegramLinkToken(bad) {
			t.Errorf("isValidTelegramLinkToken(%q) = true, want false", bad)
		}
	}
}
