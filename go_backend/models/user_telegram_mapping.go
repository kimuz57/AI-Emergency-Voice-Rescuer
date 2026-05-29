package models // เปลี่ยนชื่อตามโฟลเดอร์ของคุณ (เช่น models, entities)

// UserTelegramMapping เก็บข้อมูลการเชื่อมต่อและตั้งค่า Telegram
type UserTelegramMapping struct {
	ID                  uint   `gorm:"primaryKey"`
	UserID              uint   `gorm:"uniqueIndex;not null"` // 🟢 บังคับว่าต้องมี UserID เสมอ
	TelegramChatID      string `gorm:"type:varchar(255)"`
	IsTelegramConnected bool   `gorm:"default:false"`
	NotifyTelegram      bool   `gorm:"default:false"`
}

// 🟢 ทริคพิเศษ: บังคับให้ GORM สร้างชื่อตารางว่า "user_telegram_mapping" เป๊ะๆ 
// (ถ้าไม่ใส่ GORM จะเติมตัว 's' ต่อท้ายให้อัตโนมัติเป็น user_telegram_mappings)
func (UserTelegramMapping) TableName() string {
	return "user_telegram_mapping"
}