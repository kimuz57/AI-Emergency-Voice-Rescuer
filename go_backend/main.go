package main

import (
    "log"

    "github.com/gofiber/fiber/v2"
    "github.com/gofiber/fiber/v2/middleware/cors"
    "github.com/joho/godotenv"

    "go_backend/routes"
    "go_backend/services"
)

func main() {
    err := godotenv.Load()
    if err != nil {
        log.Println("No .env file found or error loading it")
    }

    app := fiber.New()
    app.Use(cors.New(cors.Config{
        AllowOrigins:     "http://localhost:3000",
        AllowCredentials: true,
        AllowHeaders:     "Origin, Content-Type, Accept, Authorization",
        AllowMethods:     "GET, POST, PUT, DELETE, OPTIONS",
    }))

    routes.SetupRoutes(app)
    services.InitMQTT()

    log.Fatal(app.Listen(":3001"))
}