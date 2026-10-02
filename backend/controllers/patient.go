package controllers

import (
	"errors" // 🟢 อย่าลืม import errors
	"go_backend/database"
	"go_backend/middleware"
	"go_backend/models"
	"strings"

	"gorm.io/gorm"

	"github.com/gofiber/fiber/v2"
)

// 🟢 สร้าง Struct สำหรับรับข้อมูล JSON ป้องกันปัญหาเมื่อ Model ไม่มีฟิลด์ MACAddress แล้ว
type CreatePatientInput struct {
	Name             string `json:"name"`
	Age              int    `json:"age"`
	Gender           string `json:"gender"`
	RoomNumber       string `json:"room_number"`
	MedicalCondition string `json:"medical_condition"`
	Devices          []struct {
		MACAddress string `json:"mac_address"` // รับ MAC จากหน้าเว็บเพื่อใช้ค้นหา
		DeviceName string `json:"device_name"` // จุดติดตั้ง เช่น "ไมค์ห้องน้ำ"
	} `json:"devices"`
}

// CreatePatient รับข้อมูลจากหน้าเว็บและบันทึกลงตาราง Patients พร้อมผูกผู้ดูแลอัตโนมัติ
func CreatePatient(c *fiber.Ctx) error {
	var input CreatePatientInput

	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "รูปแบบข้อมูลไม่ถูกต้อง",
		})
	}

	// 1-3. ผู้ดูแล = เจ้าของ token ที่ RequireAuth ตรวจแล้ว (โหลดจาก DB ด้วย user_id ใน token)
	user, err := middleware.CurrentUser(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Unauthorized: ไม่พบข้อมูลการเข้าสู่ระบบ",
		})
	}

	// 4. ตรวจสอบว่าส่งข้อมูลอุปกรณ์มาหรือไม่
	if len(input.Devices) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "กรุณาส่งข้อมูลอุปกรณ์อย่างน้อย 1 เครื่องมาด้วย",
		})
	}

	// เตรียม Object ผู้ป่วย
	patient := models.Patient{
		Name:             input.Name,
		Age:              input.Age,
		Gender:           input.Gender,
		RoomNumber:       input.RoomNumber,
		MedicalCondition: input.MedicalCondition,
		Caregivers:       []models.User{*user}, // ผูกผู้ดูแลทันที
	}

	var validDevices []models.Device_patient
	var activatedMACs []string // 🟢 MAC ที่ตั้ง is_active=true เพื่อล้าง cache หลัง commit

	// ⭐ ทำงานผ่าน Transaction เพื่อให้บันทึกและอัปเดตไปพร้อมกัน
	txErr := database.DB.Transaction(func(tx *gorm.DB) error {
		for _, dev := range input.Devices {
			mac := strings.TrimSpace(strings.ToUpper(dev.MACAddress))
			if mac == "" {
				return fiber.NewError(fiber.StatusBadRequest, "MAC Address ของอุปกรณ์ต้องไม่เป็นค่าว่าง")
			}

			var hardware models.Device
			result := tx.Where("UPPER(mac_address) = ?", mac).First(&hardware)
			if result.Error != nil {
				if errors.Is(result.Error, gorm.ErrRecordNotFound) {
					return fiber.NewError(fiber.StatusBadRequest, "ไม่พบอุปกรณ์ MAC Address: "+dev.MACAddress+" ในระบบ กรุณาเสียบอุปกรณ์ให้ทำงานก่อน")
				}
				return fiber.NewError(fiber.StatusInternalServerError, "เกิดข้อผิดพลาดในการตรวจสอบอุปกรณ์ในฐานข้อมูล")
			}

			// 🟢 ห้ามผูกบอร์ดที่ถูกผูกกับผู้ป่วยรายอื่นอยู่แล้ว (กฎเดียวกับ RegisterPatientWithDevice)
			// ไม่งั้นผู้ใช้คนไหนก็ได้สามารถดึงบอร์ดของคนอื่นมาผูกกับผู้ป่วยของตัวเองแล้วรับแจ้งเตือนของเขาได้
			var boundCount int64
			if err := tx.Model(&models.Device_patient{}).Where("device_id = ?", hardware.ID).Count(&boundCount).Error; err != nil {
				return fiber.NewError(fiber.StatusInternalServerError, "เกิดข้อผิดพลาดในการตรวจสอบอุปกรณ์ในฐานข้อมูล")
			}
			if boundCount > 0 {
				return fiber.NewError(fiber.StatusConflict, "อุปกรณ์ MAC Address: "+mac+" ถูกลงทะเบียนให้ผู้ป่วยรายอื่นในระบบแล้ว")
			}

			deviceName := strings.TrimSpace(dev.DeviceName)
			if deviceName == "" {
				deviceName = "ไมค์หัวเตียง" // ค่าเริ่มต้นหากไม่ได้ส่งมา
			}

			// 🟢 นำเข้าตารางกลางด้วยโครงสร้างใหม่ (ตัด MACAddress และ Status ออกแล้ว)
			validDevices = append(validDevices, models.Device_patient{
				DeviceID:   hardware.ID,
				DeviceName: deviceName,
			})

			// 🟢 อัปเดตสถานะของอุปกรณ์นั้นให้พร้อมใช้งาน (IsActive)
			if err := tx.Model(&hardware).Update("is_active", true).Error; err != nil {
				return fiber.NewError(fiber.StatusInternalServerError, "ไม่สามารถอัปเดตสถานะอุปกรณ์ได้")
			}
			activatedMACs = append(activatedMACs, hardware.MacAddress)
		}

		// 🟢 กำหนดค่าไปยัง Field ความสัมพันธ์ใหม่ (DeviceAssignments)
		patient.DeviceAssignments = validDevices

		// 6. บันทึกลง Database (GORM จะเซฟข้อมูลทั้งหมดให้เรียงตามความสัมพันธ์)
		if err := tx.Create(&patient).Error; err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, "ไม่สามารถบันทึกข้อมูลผู้ป่วยได้")
		}

		return nil
	})

	// 7. จัดการ Error ที่เด้งมาจาก Transaction
	if txErr != nil {
		var fiberErr *fiber.Error
		if errors.As(txErr, &fiberErr) {
			return c.Status(fiberErr.Code).JSON(fiber.Map{"error": fiberErr.Message})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "เกิดข้อผิดพลาดภายในระบบบันทึกข้อมูล"})
	}

	// 🟢 ล้าง cache device:activation หลัง commit แล้วเท่านั้น (B27)
	for _, mac := range activatedMACs {
		InvalidateDeviceCache(mac)
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "เพิ่มข้อมูลผู้ป่วยและผูกอุปกรณ์สำเร็จ",
		"patient": patient,
	})
}