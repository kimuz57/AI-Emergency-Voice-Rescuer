package models

import (
	"time"
)

// UserLineMapping คือโครงสร้างสำหรับสร้างตารางผูกบัญชี
type UserLineMapping struct {
	ID         uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID     uint      `gorm:"uniqueIndex;not null" json:"user_id"`         // ไอดีผู้ใช้จากระบบของคุณ
	LineUserID string    `gorm:"uniqueIndex;not null" json:"line_user_id"`    // ไอดีจาก LINE (ขึ้นต้นด้วย U)
	CreatedAt  time.Time `json:"created_at"`
}
