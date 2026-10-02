package controllers

import (
	"go_backend/database"
	"go_backend/models"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// 1. ดึงข้อมูล User ทั้งหมด
func AdminGetAllUsers(c *fiber.Ctx) error {
	var users []models.User
	if err := database.DB.Find(&users).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "ไม่สามารถดึงข้อมูลผู้ใช้ได้"})
	}
	return c.JSON(users)
}

// 2. ลบ User
func AdminDeleteUser(c *fiber.Ctx) error {
	id, ok := parseIDParam(c)
	if !ok {
		return c.Status(400).JSON(fiber.Map{"error": "รหัสผู้ใช้งานไม่ถูกต้อง"})
	}
	var user models.User

	if err := database.DB.First(&user, id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบผู้ใช้งานรายนี้"})
	}

	if err := database.DB.Delete(&user).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "ลบข้อมูลไม่สำเร็จ"})
	}
	return c.JSON(fiber.Map{"message": "ลบผู้ใช้งานสำเร็จ"})
}

// 3. แก้ไขข้อมูล User (ชื่อ, อีเมล, สิทธิ์, สถานะยืนยัน, ยกเลิกการเชื่อมต่อ)
func AdminUpdateUser(c *fiber.Ctx) error {
	id, ok := parseIDParam(c)
	if !ok {
		return c.Status(400).JSON(fiber.Map{"error": "รหัสผู้ใช้งานไม่ถูกต้อง"})
	}
	
	// รับข้อมูลที่จะแก้ไขจากหน้าเว็บ
	var input struct {
		Name                string `json:"name"`
		Email               string `json:"email"`
		Role                string `json:"role"`
		IsVerified          bool   `json:"is_verified"`
		IsLinkedLine        bool   `json:"is_linked_line"`
		IsTelegramConnected bool   `json:"is_telegram_connected"`
	}

	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "รูปแบบข้อมูลไม่ถูกต้อง"})
	}

	var user models.User
	if err := database.DB.First(&user, id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบผู้ใช้งานรายนี้"})
	}

	// อัปเดตข้อมูลใหม่ทับของเดิม
	user.Name = input.Name
	user.Email = input.Email
	user.Role = input.Role
	user.IsVerified = input.IsVerified
	user.IsLinkedLine = input.IsLinkedLine
	user.IsTelegramConnected = input.IsTelegramConnected

	if err := database.DB.Save(&user).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "อัปเดตข้อมูลไม่สำเร็จ"})
	}

	return c.JSON(fiber.Map{"message": "อัปเดตข้อมูลสำเร็จ", "user": user})
}


func AdminGetAllPatients(c *fiber.Ctx) error {
    var patients []models.Patient
    
	// 🟢 ดึงความสัมพันธ์ที่มีอยู่จริงบน Patient
	if err := database.DB.
		Preload("Caregivers").
		Preload("DeviceAssignments").
		Preload("DeviceAssignments.Device").
		Find(&patients).Error; err != nil {
        return c.Status(500).JSON(fiber.Map{"error": "ดึงข้อมูลล้มเหลว"})
    }
    
    return c.JSON(patients)
}

func AdminDeletePatient(c *fiber.Ctx) error {
    id, ok := parseIDParam(c)
    if !ok {
        return c.Status(400).JSON(fiber.Map{"error": "รหัสผู้ป่วยไม่ถูกต้อง"})
    }

    // 1. ค้นหาผู้ป่วยใน DB
    var patient models.Patient
    if err := database.DB.Preload("DeviceAssignments").First(&patient, id).Error; err != nil {
        return c.Status(404).JSON(fiber.Map{"error": "ไม่พบผู้ป่วยรายนี้"})
    }

    // 2. ลบออกจาก Database พร้อมยกเลิกการผูกอุปกรณ์ (แบบเดียวกับ DeletePatient)
    // 🟢 ถ้าไม่ลบแถว device_patients บอร์ดจะลงทะเบียนให้ผู้ป่วยใหม่ไม่ได้ (409) และยังถูกนับว่า active
    var deactivatedMACs []string
    txErr := database.DB.Transaction(func(tx *gorm.DB) error {
        // 🟢 ล้างการผูกผู้ดูแล (caregiver_patients ถูก soft delete ผ่าน join model) เหมือน DeletePatient
        if err := tx.Model(&patient).Association("Caregivers").Clear(); err != nil {
            return err
        }

        if len(patient.DeviceAssignments) > 0 {
            if err := tx.Where("patient_id = ?", patient.ID).Delete(&models.Device_patient{}).Error; err != nil {
                return err
            }

            deviceIDs := make([]uint, 0, len(patient.DeviceAssignments))
            for _, a := range patient.DeviceAssignments {
                deviceIDs = append(deviceIDs, a.DeviceID)
            }
            macs, err := deactivateUnboundDevices(tx, deviceIDs)
            if err != nil {
                return err
            }
            deactivatedMACs = macs
        }

        return tx.Delete(&patient).Error
    })
    if txErr != nil {
        return c.Status(500).JSON(fiber.Map{"error": "ลบข้อมูลไม่สำเร็จ"})
    }

    // 🟢 ล้าง cache สถานะ activation หลัง commit
    for _, mac := range deactivatedMACs {
        InvalidateDeviceCache(mac)
    }

    return c.JSON(fiber.Map{"message": "ลบข้อมูลสำเร็จ"})
}

// แก้ไขข้อมูลผู้ป่วย (Admin)
func AdminUpdatePatient(c *fiber.Ctx) error {
	id, ok := parseIDParam(c)
	if !ok {
		return c.Status(400).JSON(fiber.Map{"error": "รหัสผู้ป่วยไม่ถูกต้อง"})
	}

	// 1. รับข้อมูลจากฟอร์มหน้าเว็บ (เพิ่ม CaregiverIDs)
	var input struct {
		Name             string `json:"name"`
		Age              int    `json:"age"`
		RoomNumber       string `json:"room_number"`
		MedicalCondition string `json:"medical_condition"`
		CaregiverIDs     []uint `json:"caregiver_ids"` // 🟢 รับ Array ของ ID ผู้ดูแล
	}

	if err := c.BodyParser(&input); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "รูปแบบข้อมูลไม่ถูกต้อง"})
	}

	var patient models.Patient
	if err := database.DB.First(&patient, id).Error; err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "ไม่พบข้อมูลผู้ป่วย"})
	}

	// 2. อัปเดตข้อมูลพื้นฐาน
	patient.Name = input.Name
	patient.Age = input.Age
	patient.RoomNumber = input.RoomNumber
	patient.MedicalCondition = input.MedicalCondition

	if err := database.DB.Save(&patient).Error; err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "อัปเดตข้อมูลไม่สำเร็จ"})
	}

	// 🟢 3. จัดการอัปเดตผู้ดูแล (อัปเดตตาราง caregiver_patients อัตโนมัติ)
	var caregivers []models.User
	if len(input.CaregiverIDs) > 0 {
		// ค้นหา User ที่มี ID ตรงกับที่ส่งมา
		database.DB.Where("id IN ?", input.CaregiverIDs).Find(&caregivers)
	}
	
	// ใช้ Association ของ GORM (คำสั่ง Replace จะลบคนเก่าออกและใส่คนใหม่เข้าไปให้เอง!)
	err := database.DB.Model(&patient).Association("Caregivers").Replace(caregivers)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "อัปเดตผู้ดูแลไม่สำเร็จ"})
	}

	// 4. โหลดข้อมูลผู้ป่วยใหม่พร้อมรายชื่อผู้ดูแล เพื่อส่งกลับไปให้หน้าเว็บแสดงผล
	database.DB.Preload("Caregivers").First(&patient, id)

	return c.JSON(fiber.Map{"message": "อัปเดตข้อมูลสำเร็จ", "patient": patient})
}