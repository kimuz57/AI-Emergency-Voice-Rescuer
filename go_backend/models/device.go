package models

import (
	"gorm.io/gorm"
)

type Device struct {
	gorm.Model
	MacAddress string           `gorm:"unique" json:"mac_address"`
	IpAddress  string           `json:"ip_address"`
	IsActive   bool             `gorm:"default:false" json:"is_active"`
	IsVerified bool             `gorm:"default:false" json:"is_verified"`
	Patients   []Device_patient `gorm:"foreignKey:DeviceID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-"`
}
