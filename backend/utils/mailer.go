package utils

import (
	"fmt"
	"log"
	"os"

	"gopkg.in/gomail.v2"
)

func SendPasswordResetEmail(toEmail, resetLink string) error {
	smtpHost := os.Getenv("SMTP_HOST")
	smtpPortStr := os.Getenv("SMTP_PORT")
	smtpUser := os.Getenv("SMTP_USER")
	smtpPass := os.Getenv("SMTP_PASSWORD")

	// Fallback to mock behavior if SMTP is not configured
	if smtpHost == "" || smtpUser == "" {
		log.Println("==================================================")
		log.Println("⚠️ SMTP is not configured. Mocking email delivery.")
		log.Printf("To: %s\n", toEmail)
		log.Printf("Subject: Password Reset Request\n")
		log.Printf("Body: Please click the following link to reset your password: %s\n", resetLink)
		log.Println("==================================================")
		return nil
	}

	var smtpPort int
	fmt.Sscanf(smtpPortStr, "%d", &smtpPort)
	if smtpPort == 0 {
		smtpPort = 587 // default TLS port
	}

	m := gomail.NewMessage()
	m.SetHeader("From", smtpUser)
	m.SetHeader("To", toEmail)
	m.SetHeader("Subject", "Password Reset Request")
	
	body := fmt.Sprintf(`
		<h2>Password Reset</h2>
		<p>You requested to reset your password. Click the link below to set a new password:</p>
		<p><a href="%s">%s</a></p>
		<p>This link will expire in 1 hour.</p>
		<p>If you did not request a password reset, please ignore this email.</p>
	`, resetLink, resetLink)
	
	m.SetBody("text/html", body)

	d := gomail.NewDialer(smtpHost, smtpPort, smtpUser, smtpPass)

	if err := d.DialAndSend(m); err != nil {
		log.Printf("Failed to send email to %s: %v", toEmail, err)
		return err
	}

	log.Printf("Password reset email sent successfully to %s", toEmail)
	return nil
}
