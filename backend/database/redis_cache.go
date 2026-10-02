package database

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

// ─────────────────────────────────────────────
//  Key helpers — ชื่อ key มาตรฐานทั้งระบบ
// ─────────────────────────────────────────────

func KeyDeviceStatus(deviceID uint) string { return fmt.Sprintf("device:%d:status", deviceID) }

// KeyTelegramLink token ใช้ครั้งเดียวสำหรับผูก Telegram (ค่า = user ID, TTL 15 นาที)
func KeyTelegramLink(token string) string { return fmt.Sprintf("telegram:link:%s", token) }

// ─────────────────────────────────────────────
//  Generic helpers
// ─────────────────────────────────────────────

// SetJSON บันทึก struct ใดก็ได้เป็น JSON string ลง Redis พร้อม TTL
func SetJSON(key string, value any, ttl time.Duration) error {
	b, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("redis SetJSON marshal: %w", err)
	}
	return RDB.Set(Ctx, key, b, ttl).Err()
}

// GetJSON ดึงค่าจาก Redis แล้ว unmarshal กลับเป็น struct
// คืน false (cache miss) เมื่อ key ไม่มีอยู่, error เมื่อเกิดปัญหาอื่น
func GetJSON(key string, dest any) (bool, error) {
	val, err := RDB.Get(Ctx, key).Result()
	if err != nil {
		// redis.Nil = key ไม่มี → cache miss (ไม่ใช่ error จริง)
		if isRedisNil(err) {
			return false, nil
		}
		return false, fmt.Errorf("redis GetJSON get: %w", err)
	}
	if err := json.Unmarshal([]byte(val), dest); err != nil {
		return false, fmt.Errorf("redis GetJSON unmarshal: %w", err)
	}
	return true, nil
}

// SetNX ตั้งค่า key พร้อม TTL เฉพาะเมื่อ key ยังไม่มีอยู่ (atomic)
// คืน true เมื่อตั้งค่าสำเร็จ (ยังไม่เคยมี key) และ false เมื่อมี key อยู่แล้ว — ใช้ทำ throttle
func SetNX(key string, value any, ttl time.Duration) (bool, error) {
	b, err := json.Marshal(value)
	if err != nil {
		return false, fmt.Errorf("redis SetNX marshal: %w", err)
	}
	// จำกัดเวลา: ใช้ในเส้นทางแจ้งเหตุฉุกเฉิน ถ้า Redis ค้างต้อง fail open ให้เร็ว ไม่ใช่รอ dial/retry หลายวินาที
	ctx, cancel := context.WithTimeout(Ctx, 2*time.Second)
	defer cancel()
	ok, err := RDB.SetNX(ctx, key, b, ttl).Result()
	if err != nil {
		return false, fmt.Errorf("redis SetNX: %w", err)
	}
	return ok, nil
}

// GetDel อ่านค่าแล้วลบ key ทิ้งในคำสั่งเดียว (atomic, ต้องใช้ Redis >= 6.2)
// ใช้กับ token ที่ใช้ได้ครั้งเดียว คืน found=false เมื่อ key ไม่มี (หมดอายุหรือถูกใช้ไปแล้ว)
func GetDel(key string) (string, bool, error) {
	ctx, cancel := context.WithTimeout(Ctx, 2*time.Second)
	defer cancel()
	val, err := RDB.GetDel(ctx, key).Result()
	if isRedisNil(err) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("redis GetDel: %w", err)
	}
	return val, true, nil
}

// Del ลบ key หนึ่งตัวหรือหลายตัว (ใช้ตอน logout หรือข้อมูลเปลี่ยน)
func Del(keys ...string) error {
	return RDB.Del(Ctx, keys...).Err()
}

// ─────────────────────────────────────────────
//  Device status helpers
// ─────────────────────────────────────────────

// SetDeviceOnline บันทึกสถานะ online ของ device พร้อม TTL สั้น
// ESP32 ต้อง heartbeat มาทุก ๆ interval มิฉะนั้น key จะหมดอายุ = offline
// SetDeviceOnline บันทึกสถานะ online ของ device ลง Redis โดยใช้ deviceID (uint)
func SetDeviceOnline(deviceID uint, ttl time.Duration) error {
	return RDB.Set(Ctx, KeyDeviceStatus(deviceID), "online", ttl).Err()
}

// ─────────────────────────────────────────────
//  Internal
// ─────────────────────────────────────────────

func isRedisNil(err error) bool {
	return err != nil && err.Error() == "redis: nil"
}
