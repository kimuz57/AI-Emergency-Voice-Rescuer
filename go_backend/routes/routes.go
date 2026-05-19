package routes

import (
    "time"
    "fmt"
    "github.com/gofiber/fiber/v2"
    "github.com/golang-jwt/jwt/v5"
    "golang.org/x/crypto/bcrypt"
    "go_backend/database"
    "go_backend/controllers"
    "go_backend/models"

)

// ---------------------------------------------------------
// 1. โครงสร้างข้อมูลและฟังก์ชันเข้ารหัสผ่าน
// ---------------------------------------------------------
type User struct {
    ID       uint   `gorm:"primaryKey" json:"id"`
    Name     string `json:"name"`
    Email    string `gorm:"unique" json:"email"`
    Password string `json:"password"`
}

func HashPassword(password string) (string, error) {
    bytes, err := bcrypt.GenerateFromPassword([]byte(password), 14)
    return string(bytes), err
}

func CheckPasswordHash(password, hash string) bool {
    err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
    return err == nil
}

// ---------------------------------------------------------
// 🟢 เพิ่มฟังก์ชันสำหรับรับข้อมูลจาก Google Login ตรงนี้
// ---------------------------------------------------------
type GoogleLoginInput struct {
    Email string `json:"email"`
    Name  string `json:"name"`
    Profile string `json:"profile"` // 🟢 เพิ่มฟิลด์นี้เพื่อรับ URL รูปภาพโปรไฟล์จาก Next.js
}

func GoogleLogin(c *fiber.Ctx) error {
	input := new(GoogleLoginInput)
	
	// แกะข้อมูลที่ Next.js ส่งมา
	if err := c.BodyParser(input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
	}

	var user models.User // 💡 (ถ้าไฟล์นี้แยกอยู่คนละโฟลเดอร์กับ models อย่าลืมเปลี่ยนเป็น models.User นะครับ)
	// ค้นหาในฐานข้อมูล
	result := database.DB.Where("email = ?", input.Email).First(&user)

	if result.Error != nil {
		// 🟢 1. กรณีไม่พบสมาชิกเก่า (สมัครใหม่): สร้าง User พร้อมบันทึกรูปโปรไฟล์ลง DB ทันที
		user = models.User{
			Name:    input.Name,
			Email:   input.Email,
			Profile: input.Profile, // ⭐ เพิ่มบรรทัดนี้เพื่อเก็บ URL รูปภาพตอนสมัครครั้งแรก
		}
		if err := database.DB.Create(&user).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "ไม่สามารถสร้างบัญชีได้"})
		}
	} else {
		// 🟢 2. กรณีมีบัญชีอยู่แล้ว: บังคับอัปเดต URL รูปโปรไฟล์ล่าสุดลงคอลัมน์ profile
		// 💡 ใช้ UpdateColumn เพื่อเจาะจงเฉพาะคอลัมน์ ป้องกัน GORM ปัดตกเงียบๆ จากกฎ Validation อื่น (เช่น password เป็นค่าว่าง)
		if err := database.DB.Model(&user).UpdateColumn("profile", input.Profile).Error; err != nil {
			fmt.Println("❌ ไม่สามารถอัปเดตรูปโปรไฟล์ลง Database ได้เกิดจาก:", err)
		}
	}

	// สร้าง Token
	claims := jwt.MapClaims{
		"user_id": user.ID,
		"exp":     time.Now().Add(time.Hour * 24).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	
	// เซ็น Token ด้วยกุญแจลับ (ใช้คำว่า "my_secret_key" ให้ตรงกับระบบ Login เดิมของคุณ)
	tokenString, err := token.SignedString([]byte("my_secret_key"))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "สร้าง Token ไม่สำเร็จ"})
	}

	// เซ็ต Cookie
	c.Cookie(&fiber.Cookie{
		Name:     "token",
		Value:    tokenString,
		Expires:  time.Now().Add(24 * time.Hour),
		HTTPOnly: true,
		SameSite: "Lax",
	})

	return c.JSON(fiber.Map{
		"message": "ล็อกอินสำเร็จ",
		"user": fiber.Map{
			"name":    user.Name,
			"email":   user.Email,
			"profile": user.Profile, // ⭐ ส่งค่า profile กลับไปให้หน้าบ้าน (Next.js) เอาไปแสดงผลต่อได้ทันที
		},
	})
}

// ---------------------------------------------------------
// 2. ตั้งค่าเส้นทางทั้งหมด
// ---------------------------------------------------------
func SetupRoutes(app *fiber.App) {
    // 📍 ระบบล็อกอินด้วย Auth0
    app.Get("/login", controllers.Login)
    app.Get("/callback", controllers.Callback)
    app.Get("/logout", controllers.Logout)

    // 📍 ดึงข้อมูลโปรไฟล์
    app.Get("/profile", func(c *fiber.Ctx) error {
        token := c.Cookies("token")
        if token == "" {
            return c.Status(401).SendString("กรุณาล็อกอินก่อน (ไม่มี Token)")
        }
        return c.SendString("นี่คือข้อมูลส่วนตัวจาก Backend! คุณได้รับสิทธิ์ให้เข้าถึงหน้า Dashboard")
    })

    // 📍 ระบบสมัครสมาชิก
    app.Post("/api/register", func(c *fiber.Ctx) error {
        user := new(User)
        if err := c.BodyParser(user); err != nil {
            return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
        }
        hashedPassword, err := HashPassword(user.Password)
        if err != nil {
            return c.Status(500).JSON(fiber.Map{"error": "เข้ารหัสผ่านไม่สำเร็จ"})
        }
        user.Password = hashedPassword

        result := database.DB.Create(&user)
        if result.Error != nil {
            return c.Status(500).JSON(fiber.Map{"error": "อีเมลนี้มีในระบบแล้ว หรือบันทึกไม่สำเร็จ"})
        }

        return c.Status(201).JSON(fiber.Map{
            "message": "สมัครสมาชิกสำเร็จ!",
            "email":   user.Email,
        })
    })

    // 📍 ระบบ Login แบบปกติ
    app.Post("/api/login", func(c *fiber.Ctx) error {
        var input struct {
            Email    string `json:"email"`
            Password string `json:"password"`
        }
        if err := c.BodyParser(&input); err != nil {
            return c.Status(400).JSON(fiber.Map{"error": "ข้อมูลไม่ถูกต้อง"})
        }

        var user User
        result := database.DB.Where("email = ?", input.Email).First(&user)
        if result.Error != nil {
            return c.Status(401).JSON(fiber.Map{"error": "ไม่พบอีเมลนี้ในระบบ"})
        }

        if !CheckPasswordHash(input.Password, user.Password) {
            return c.Status(401).JSON(fiber.Map{"error": "รหัสผ่านไม่ถูกต้อง"})
        }

        claims := jwt.MapClaims{
            "user_id": user.ID,
            "exp":     time.Now().Add(time.Hour * 24).Unix(),
        }
        token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
        
        tokenString, err := token.SignedString([]byte("my_secret_key"))
        if err != nil {
            return c.Status(500).JSON(fiber.Map{"error": "สร้าง Token ไม่สำเร็จ"})
        }

        c.Cookie(&fiber.Cookie{
            Name:     "token",
            Value:    tokenString,
            Expires:  time.Now().Add(24 * time.Hour),
            HTTPOnly: true,
        })

        return c.Status(200).JSON(fiber.Map{
            "message": "เข้าสู่ระบบสำเร็จ",
            "user": fiber.Map{
                "name":  user.Name,
                "email": user.Email,
            },
        })
    })
    
    app.Get("/logout", controllers.Logout)
    app.Post("/api/patients", controllers.CreatePatient)
    
    // 🟢 เส้นทางนี้จะวิ่งไปหาฟังก์ชัน GoogleLogin ที่เราเพิ่งสร้างด้านบนแล้วครับ!
    app.Post("/api/auth/google", GoogleLogin)

    audioGroup := app.Group("/api/audio")
	{
		audioGroup.Get("/", controllers.ListAudioFiles)
		audioGroup.Get("/:filename", controllers.GetAudioFile)
		audioGroup.Delete("/:filename", controllers.DeleteAudioFile)
	}
    // เส้นทางสำหรับระบบจัดการเหตุฉุกเฉินเชื่อม DB จริง
    app.Post("/api/alerts", controllers.CreateAlert)
	app.Get("/api/alerts", controllers.GetActiveAlerts)
	app.Put("/api/alerts/:id/resolve", controllers.ResolveAlert)
    app.Post("/api/patients/register", controllers.RegisterPatientWithDevice)
    app.Get("/api/user/profile", controllers.GetUserProfile)
}