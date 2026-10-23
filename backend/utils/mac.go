package utils

import (
	"regexp"
	"strings"
)

// macPattern = 6 คู่เลขฐาน 16 คั่นด้วย ":" (รูปแบบที่ firmware ใช้ใน topic และ check-in เช่น 1C:C3:AB:B3:B9:18)
var macPattern = regexp.MustCompile(`^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$`)

// ParseMAC ตัดช่องว่างหัวท้าย ตรวจรูปแบบ แล้วคืน MAC ตัวพิมพ์ใหญ่ — ok=false ถ้าว่างหรือผิดรูปแบบ
func ParseMAC(raw string) (mac string, ok bool) {
	s := strings.TrimSpace(raw)
	if !macPattern.MatchString(s) {
		return "", false
	}
	return strings.ToUpper(s), true
}
