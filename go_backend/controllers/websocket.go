package controllers

import (
	"log"
	"sync"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
)

var (
	// Clients เก็บการเชื่อมต่อ WebSocket ทั้งหมด
	Clients = make(map[*websocket.Conn]bool)
	// Mutex เพื่อป้องกันการเขียน/อ่าน map พร้อมกัน (Thread-safe)
	clientMutex sync.Mutex
)

// SetupWebsocketRoute ตั้งค่า Route สำหรับ WebSocket
func SetupWebsocketRoute(app *fiber.App) {
	// Middleware ป้องกันถ้าไม่ได้ส่ง Request แบบ WebSocket เข้ามา
	app.Use("/ws", func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			c.Locals("allowed", true)
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})

	app.Get("/ws/alerts", websocket.New(func(c *websocket.Conn) {
		// เมื่อมี Client ใหม่เชื่อมต่อเข้ามา
		clientMutex.Lock()
		Clients[c] = true
		clientMutex.Unlock()

		log.Println("✅ [WebSocket] Client Connected")

		// รอรับข้อความ (ในโปรเจคนี้อาจจะไม่ได้ใช้ฝั่งรับ แต่ต้องวนลูปไว้ไม่ให้ Connection ปิด)
		var (
			msgType int
			msg     []byte
			err     error
		)
		for {
			if msgType, msg, err = c.ReadMessage(); err != nil {
				log.Println("❌ [WebSocket] Client Disconnected:", err)
				break
			}
			log.Printf("[WebSocket] Received message type %d: %s", msgType, msg)
		}

		// เมื่อหลุดการเชื่อมต่อ ให้ลบออกจากระบบ
		clientMutex.Lock()
		delete(Clients, c)
		clientMutex.Unlock()
		c.Close()
	}))
}

// BroadcastAlert กระจายข้อความแจ้งเตือนไปยังทุกคนที่เชื่อมต่ออยู่
func BroadcastAlert(message interface{}) {
	clientMutex.Lock()
	defer clientMutex.Unlock()

	for client := range Clients {
		if err := client.WriteJSON(message); err != nil {
			log.Println("❌ [WebSocket] Broadcast error:", err)
			client.Close()
			delete(Clients, client)
		}
	}
}
