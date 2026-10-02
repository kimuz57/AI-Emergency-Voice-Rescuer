package utils

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strconv"
	"strings"
	"time"

	"go_backend/config"
)

// AlertTokenTTL อายุของลิงก์ /alert?mac=...&token=... ที่ส่งไปทาง LINE / Telegram
const AlertTokenTTL = 24 * time.Hour

func alertTokenMAC(mac string) string {
	return strings.ToUpper(strings.TrimSpace(mac))
}

func alertTokenSig(secret, mac string, exp int64) string {
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte("alert:" + alertTokenMAC(mac) + ":" + strconv.FormatInt(exp, 10)))
	return base64.RawURLEncoding.EncodeToString(h.Sum(nil))
}

// SignAlertToken สร้าง token รูปแบบ "<exp>.<sig>" ผูกกับ MAC ของบอร์ด
// ใช้ JWT_SECRET เป็น key (ถูกบังคับตั้งค่าตอน startup ใน main.go)
func SignAlertToken(mac string) (string, error) {
	secret := config.GetEnv("JWT_SECRET", "")
	if secret == "" {
		return "", errors.New("JWT_SECRET is not set")
	}
	exp := time.Now().Add(AlertTokenTTL).Unix()
	return strconv.FormatInt(exp, 10) + "." + alertTokenSig(secret, mac, exp), nil
}

// VerifyAlertToken ตรวจว่า token ถูกสร้างจาก MAC นี้และยังไม่หมดอายุ
func VerifyAlertToken(mac, token string) bool {
	secret := config.GetEnv("JWT_SECRET", "")
	if secret == "" || mac == "" || token == "" {
		return false
	}

	expStr, sig, ok := strings.Cut(token, ".")
	if !ok {
		return false
	}
	exp, err := strconv.ParseInt(expStr, 10, 64)
	if err != nil || time.Now().Unix() > exp {
		return false
	}
	return hmac.Equal([]byte(sig), []byte(alertTokenSig(secret, mac, exp)))
}
