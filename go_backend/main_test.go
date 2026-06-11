package main

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"go_backend/routes"
)

func TestHealthRoute(t *testing.T) {
	// สร้าง Fiber App แบบ Clean สำหรับทดสอบ Route นี้โดยเฉพาะ (ไม่ต่อ DB)
	app := fiber.New()
	routes.SetupRoutes(app)

	// สร้าง Request ไปที่ /api/health
	req := httptest.NewRequest("GET", "/api/health", nil)

	// ยิง Request เข้า App
	resp, err := app.Test(req)

	// ตรวจสอบผลลัพธ์
	assert.Nil(t, err)
	assert.Equal(t, 200, resp.StatusCode)
}
