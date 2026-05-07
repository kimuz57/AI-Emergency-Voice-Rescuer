package routes

import (
    "path/filepath"

    "github.com/gofiber/fiber/v2"

    "go_backend/controllers"
    "go_backend/services"
)

func SetupRoutes(app *fiber.App) {
    app.Get("/login", controllers.Login)
    app.Get("/callback", controllers.Callback)
    app.Get("/logout", controllers.Logout)
    app.Get("/profile", controllers.GetProfile)

    app.Get("/test-ai", func(c *fiber.Ctx) error {
        audioPath := filepath.Join("..", "backend_ai", "samples", "help.wav")

        result, err := services.ProcessAudioFile(audioPath)
        if err != nil {
            return c.Status(500).JSON(fiber.Map{
                "success": false,
                "error":   err.Error(),
            })
        }

        return c.JSON(result)
    })
}
