package database

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// ─────────────────────────────────────────────
//  Key helpers — ชื่อ key มาตรฐานทั้งระบบ
// ─────────────────────────────────────────────

func KeySession(userID uint) string      { return fmt.Sprintf("session:%d", userID) }
func KeyDeviceStatus(deviceID uint) string { return fmt.Sprintf("device:%d:status", deviceID) }
func KeyDeviceCache(deviceID uint) string  { return fmt.Sprintf("device:%d:data", deviceID) }
func KeyPatientCache(patientID uint) string { return fmt.Sprintf("patient:%d:data", patientID) }
func KeyRateLimit(ip string) string       { return fmt.Sprintf("ratelimit:%s", ip) }

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

// Del ลบ key หนึ่งตัวหรือหลายตัว (ใช้ตอน logout หรือข้อมูลเปลี่ยน)
func Del(keys ...string) error {
	return RDB.Del(Ctx, keys...).Err()
}

// ─────────────────────────────────────────────
//  Session helpers
// ─────────────────────────────────────────────

// SetSession เก็บข้อมูล user session (userID → struct ใดก็ได้)
// TTL ปกติ = 24 ชั่วโมง
func SetSession(userID uint, data any, ttl time.Duration) error {
	return SetJSON(KeySession(userID), data, ttl)
}

// GetSession ดึง session กลับมา คืน false เมื่อ session หมดอายุหรือไม่มี
func GetSession(userID uint, dest any) (bool, error) {
	return GetJSON(KeySession(userID), dest)
}

// DeleteSession ลบ session ทันที (ใช้ตอน logout)
func DeleteSession(userID uint) error {
	return Del(KeySession(userID))
}

// ─────────────────────────────────────────────
//  Device status helpers
// ─────────────────────────────────────────────

// SetDeviceOnline บันทึกสถานะ online ของ device พร้อม TTL สั้น
// ESP32 ต้อง heartbeat มาทุก ๆ interval มิฉะนั้น key จะหมดอายุ = offline
func SetDeviceOnline(deviceID uint, ttl time.Duration) error {
	return RDB.Set(Ctx, KeyDeviceStatus(deviceID), "online", ttl).Err()
}

// IsDeviceOnline ตรวจสอบว่า device ยัง online อยู่ไหม
func IsDeviceOnline(deviceID uint) (bool, error) {
	val, err := RDB.Get(Ctx, KeyDeviceStatus(deviceID)).Result()
	if isRedisNil(err) {
		return false, nil // key หมดอายุ = offline
	}
	if err != nil {
		return false, err
	}
	return val == "online", nil
}

// ─────────────────────────────────────────────
//  Rate limit helpers
// ─────────────────────────────────────────────

// IncrRateLimit เพิ่ม counter สำหรับ IP นี้ คืนจำนวนครั้งปัจจุบัน
// ครั้งแรกที่เรียกจะตั้ง TTL ให้อัตโนมัติ
func IncrRateLimit(ip string, window time.Duration) (int64, error) {
	key := KeyRateLimit(ip)
	pipe := RDB.Pipeline()
	incr := pipe.Incr(Ctx, key)
	pipe.Expire(Ctx, key, window)
	if _, err := pipe.Exec(Ctx); err != nil {
		return 0, err
	}
	return incr.Val(), nil
}

// ─────────────────────────────────────────────
//  Pub/Sub helpers
// ─────────────────────────────────────────────

// PublishEmergency ส่ง emergency alert เข้า Redis channel
// ให้ subscriber (เช่น WebSocket hub) รับและ broadcast ต่อให้ client
func PublishEmergency(deviceID uint, payload any) error {
	b, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("PublishEmergency marshal: %w", err)
	}
	channel := fmt.Sprintf("emergency:%d", deviceID)
	return RDB.Publish(Ctx, channel, b).Err()
}

// SubscribeEmergency subscribe channel ของ device นั้น
// คืน *redis.PubSub ให้ caller ไป .ReceiveMessage() ใน goroutine ของตัวเอง
func SubscribeEmergency(deviceID uint) *redis.PubSub {
	channel := fmt.Sprintf("emergency:%d", deviceID)
	return RDB.Subscribe(Ctx, channel)
}

// ─────────────────────────────────────────────
//  Internal
// ─────────────────────────────────────────────

func isRedisNil(err error) bool {
	return err != nil && err.Error() == "redis: nil"
}
