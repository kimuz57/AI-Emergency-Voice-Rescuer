package utils

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"go_backend/config"

	"gopkg.in/gomail.v2"
)

// สร้าง Token สุ่มความยาว 32 ตัวอักษร
func GenerateVerificationToken() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// ฟังก์ชันส่งอีเมล
func SendVerificationEmail(toEmail, name, token string) error {
	m := gomail.NewMessage()
	
	senderEmail := config.GetEnv("SMTP_EMAIL", "email@gmail.com")
	senderPass := config.GetEnv("SMTP_PASSWORD", "AppPassword")
	frontendURL := config.GetEnv("FRONTEND_URL", "http://localhost:3000")

	m.SetHeader("From", senderEmail)
	m.SetHeader("To", toEmail)
	m.SetHeader("Subject", "ยืนยันการสมัครสมาชิก Emergency Voice Rescuer")

	// ลิงก์สำหรับยืนยัน
	verifyLink := fmt.Sprintf("%s/verify?token=%s", frontendURL, token)

	body := fmt.Sprintf(`
		<div style="max-width: 600px; margin: 0 auto; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; padding: 40px 20px; border-radius: 12px;">
			<div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); text-align: center;">
				<h2 style="color: #4f46e5; margin-top: 0; font-size: 24px;">ยืนยันที่อยู่อีเมลของคุณ</h2>
				<p style="color: #64748b; font-size: 16px; line-height: 1.6; text-align: left;">
					สวัสดีคุณ <b>%s</b>,<br><br>
					ขอบคุณที่สมัครสมาชิกกับระบบ <b>Emergency Voice Rescuer</b> กรุณาคลิกที่ปุ่มด้านล่างเพื่อยืนยันที่อยู่อีเมลของคุณและเปิดใช้งานบัญชี:
				</p>
				<div style="margin: 35px 0;">
					<a href="%s" style="background-color: #4f46e5; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">✅ ยืนยันอีเมลของฉัน</a>
				</div>
				<p style="color: #94a3b8; font-size: 14px; text-align: left;">
					หรือหากปุ่มใช้งานไม่ได้ คุณสามารถคัดลอกลิงก์นี้ไปวางในเบราว์เซอร์:<br>
					<a href="%s" style="color: #6366f1; word-break: break-all;">%s</a>
				</p>
				<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
				<p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">
					หากคุณไม่ได้ทำการสมัครสมาชิกนี้ กรุณาเพิกเฉยต่ออีเมลฉบับนี้<br>
					© 2026 Emergency Voice Rescuer
				</p>
			</div>
		</div>
	`, name, verifyLink, verifyLink, verifyLink)

	m.SetBody("text/html", body)

	d := gomail.NewDialer("smtp.gmail.com", 587, senderEmail, senderPass)

	return d.DialAndSend(m)
}

// ฟังก์ชันส่งลิงก์รีเซ็ตรหัสผ่าน
func SendResetPasswordEmail(toEmail, name, token string) error {
	// Allow tests or dev to disable actual SMTP sending by setting SMTP_DISABLE=true
	if config.GetEnv("SMTP_DISABLE", "false") == "true" {
		return nil
	}

	m := gomail.NewMessage()

	senderEmail := config.GetEnv("SMTP_EMAIL", "email@gmail.com")
	senderPass := config.GetEnv("SMTP_PASSWORD", "AppPassword")
	frontendURL := config.GetEnv("FRONTEND_URL", "http://localhost:3000")

	m.SetHeader("From", senderEmail)
	m.SetHeader("To", toEmail)
	m.SetHeader("Subject", "รีเซ็ตรหัสผ่าน Emergency Voice Rescuer")

	resetLink := fmt.Sprintf("%s/reset-password?token=%s", frontendURL, token)

	body := fmt.Sprintf(`
		<div style="max-width: 600px; margin: 0 auto; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; padding: 40px 20px; border-radius: 12px;">
			<div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); text-align: center;">
				<h2 style="color: #4f46e5; margin-top: 0; font-size: 24px;">รีเซ็ตรหัสผ่านของคุณ</h2>
				<p style="color: #64748b; font-size: 16px; line-height: 1.6; text-align: left;">
					สวัสดีคุณ <b>%s</b>,<br><br>
					คุณได้ร้องขอการรีเซ็ตรหัสผ่าน กรุณาคลิกที่ปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่:
				</p>
				<div style="margin: 35px 0;">
					<a href="%s" style="background-color: #4f46e5; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">🔒 ตั้งรหัสผ่านใหม่</a>
				</div>
				<p style="color: #94a3b8; font-size: 14px; text-align: left;">
					หรือหากปุ่มใช้งานไม่ได้ คุณสามารถคัดลอกลิงก์นี้ไปวางในเบราว์เซอร์:<br>
					<a href="%s" style="color: #6366f1; word-break: break-all;">%s</a>
				</p>
				<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
				<p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">
					หากคุณไม่ได้ขอรีเซ็ตรหัสผ่านนี้ กรุณาเพิกเฉยต่ออีเมลฉบับนี้<br>
					© 2026 Emergency Voice Rescuer
				</p>
			</div>
		</div>
	`, name, resetLink, resetLink, resetLink)

	m.SetBody("text/html", body)

	d := gomail.NewDialer("smtp.gmail.com", 587, senderEmail, senderPass)

	return d.DialAndSend(m)
}