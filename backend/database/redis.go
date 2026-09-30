package database

import (
	"context"
	"fmt"
	"log"
	"time"

	"go_backend/config"

	"github.com/redis/go-redis/v9"
)

// RDB คือ Redis client ระดับ package — เรียกใช้ได้จากทุก package ที่ import "go_backend/database"
var RDB *redis.Client

// Ctx ใช้คู่กับ RDB สำหรับทุก Redis operation
var Ctx = context.Background()

// ConnectRedis เชื่อมต่อ Redis ตอนที่ระบบเริ่มทำงาน
// เรียกใน main.go ต่อจาก database.ConnectDB()
func ConnectRedis() {
	host := config.GetEnv("REDIS_HOST", "localhost")
	port := config.GetEnv("REDIS_PORT", "6379")
	password := config.GetEnv("REDIS_PASSWORD", "") // ถ้าไม่ได้ตั้ง password ปล่อยว่างได้
	addr := fmt.Sprintf("%s:%s", host, port)

	RDB = redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password,
		DB:       0, // ใช้ Redis DB index 0 (default)

		// connection pool
		PoolSize:    10,
		DialTimeout: 5 * time.Second,
		ReadTimeout: 3 * time.Second,
	})

	// ทดสอบ ping ทันที — ถ้าต่อไม่ได้จะ fatal ออกเลย เหมือนกับ ConnectDB
	if err := RDB.Ping(Ctx).Err(); err != nil {
		log.Fatal("❌ Failed to connect to Redis:", err)
	}

	fmt.Println("✅ Redis connected successfully!")
}
