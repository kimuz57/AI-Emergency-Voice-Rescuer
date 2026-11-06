package utils

import (
	"strings"
	"testing"
)

// ชื่อผู้สมัครต้องไม่กลายเป็น HTML ในอีเมล (เดิมใส่ลงไปตรง ๆ จึงแทรกลิงก์/ฟอร์มปลอมได้)
func TestEmailBodiesEscapeName(t *testing.T) {
	name := `<a href="https://evil.example">คลิก</a><script>alert(1)</script>`
	link := "https://kws.example/verify?token=abc&next=1"

	for label, body := range map[string]string{
		"verify": verificationEmailBody(name, link),
		"reset":  resetPasswordEmailBody(name, link),
	} {
		if strings.Contains(body, "<script>") || strings.Contains(body, `href="https://evil.example"`) {
			t.Errorf("%s: name was inserted as raw HTML", label)
		}
		if !strings.Contains(body, "&lt;script&gt;") {
			t.Errorf("%s: escaped name not found in body", label)
		}
		if !strings.Contains(body, `href="https://kws.example/verify?token=abc&amp;next=1"`) {
			t.Errorf("%s: link missing or not escaped for the href attribute", label)
		}
	}
}
