package linebot

import (
	"fmt"
	"log"
	"net/http"

	"github.com/line/line-bot-sdk-go/v7/linebot"
)

// สร้างตัวแปรระดับ package เก็บ instance ของบอท เพื่อให้ฟังก์ชันอื่นเรียกใช้ได้
var botClient *linebot.Client

// InitBot ทำหน้าที่ตั้งค่าบอทตอนที่ระบบเริ่มทำงาน
func InitBot(secret, token string) {
	var err error
	botClient, err = linebot.New(secret, token)
	if err != nil {
		log.Fatal("สร้างตัวบอทไม่สำเร็จ: ", err)
	}
}

// WebhookHandler เป็นฟังก์ชันสำหรับรับ Request จาก LINE
func WebhookHandler(w http.ResponseWriter, req *http.Request) {
	// ป้องกัน Error กรณีลืม InitBot
	if botClient == nil {
		w.WriteHeader(500)
		return
	}

	events, err := botClient.ParseRequest(req)
	if err != nil {
		if err == linebot.ErrInvalidSignature {
			w.WriteHeader(400)
		} else {
			w.WriteHeader(500)
		}
		return
	}

	for _, event := range events {
		if event.Type == linebot.EventTypeMessage {
			switch message := event.Message.(type) {
			case *linebot.TextMessage:
				
				userText := message.Text
				fmt.Println("มีคนทักมาว่า:", userText)
				
				replyText := fmt.Sprintf("คุณพิมพ์มาว่า: %s", userText)
				
				if _, err = botClient.ReplyMessage(event.ReplyToken, linebot.NewTextMessage(replyText)).Do(); err != nil {
					log.Println("ตอบกลับไม่สำเร็จ: ", err)
				}
			}
		}
	}
}