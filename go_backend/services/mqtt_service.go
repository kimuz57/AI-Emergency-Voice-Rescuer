package services

import (
	"encoding/binary"
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

// สร้างตัวแปรถังพักน้ำ และตัวล็อกเพื่อป้องกันข้อมูลชนกัน
var (
	audioBuffer []byte
	bufferMutex sync.Mutex
	// 1 วินาที = 32,000 bytes (16kHz, 16-bit, Mono)
	// ตั้งเป้าเซฟไฟล์ละ 5 วินาที = 160,000 bytes
	maxBufferSize = 160000 
	// เปลี่ยนที่เซฟให้ตรงกับที่ Controller หน้าเว็บไปดึงข้อมูล
	saveDir = "./audio_recordings" 
)

// ฟังก์ชันสำหรับสร้าง "หัวไฟล์" WAV (WAV Header)
func createWAVHeader(dataSize uint32) []byte {
	header := make([]byte, 44)
	sampleRate := uint32(16000) // ตรงกับ I2S_SAMPLE_RATE ใน ESP32
	numChannels := uint16(1)    // Mono
	bitsPerSample := uint16(16) // 16-bit
	byteRate := sampleRate * uint32(numChannels) * uint32(bitsPerSample/8)
	blockAlign := numChannels * (bitsPerSample / 8)

	copy(header[0:4], "RIFF")
	binary.LittleEndian.PutUint32(header[4:8], dataSize+36)
	copy(header[8:12], "WAVE")
	copy(header[12:16], "fmt ")
	binary.LittleEndian.PutUint32(header[16:20], 16)
	binary.LittleEndian.PutUint16(header[20:22], 1)
	binary.LittleEndian.PutUint16(header[22:24], numChannels)
	binary.LittleEndian.PutUint32(header[24:28], sampleRate)
	binary.LittleEndian.PutUint32(header[28:32], byteRate)
	binary.LittleEndian.PutUint16(header[32:34], blockAlign)
	binary.LittleEndian.PutUint16(header[34:36], bitsPerSample)
	copy(header[36:40], "data")
	binary.LittleEndian.PutUint32(header[40:44], dataSize)

	return header
}

// ฟังก์ชันนี้จะทำงานอัตโนมัติเมื่อมีเสียงส่งมาจาก ESP32
var messagePubHandler mqtt.MessageHandler = func(client mqtt.Client, msg mqtt.Message) {
	payload := msg.Payload()

	// ล็อกถังพักน้ำก่อนเติม เพื่อไม่ให้ข้อมูลจากหลายๆ message ตีกัน
	bufferMutex.Lock()
	defer bufferMutex.Unlock()

	// 1. เทเศษเสียงลงถังพัก
	audioBuffer = append(audioBuffer, payload...)

	// 2. เช็คว่าถังเต็มหรือยัง (ครบ 5 วินาทีหรือยัง?)
	if len(audioBuffer) >= maxBufferSize {
		os.MkdirAll(saveDir, os.ModePerm)
		
		filename := fmt.Sprintf("%s/audio_%d.wav", saveDir, time.Now().Unix())
		dataSize := uint32(len(audioBuffer))
		wavHeader := createWAVHeader(dataSize)

		// นำ Header มาต่อกับข้อมูลเสียงทั้งก้อน
		fullWavData := append(wavHeader, audioBuffer...)

		// บันทึกเป็นไฟล์ .wav (เซฟแค่ 1 ครั้ง ได้เสียงยาว 5 วินาที)
		err := os.WriteFile(filename, fullWavData, 0644)
		if err != nil {
			log.Println("❌ บันทึกไฟล์เสียงไม่สำเร็จ:", err)
		} else {
			fmt.Printf("✅ บันทึกไฟล์เสียงสำเร็จ 1 ไฟล์ (ความยาว 5 วินาที): %s\n", filename)
		}

		// 3. เทน้ำทิ้ง (ล้างถัง) เพื่อรอรับเศษเสียงรอบต่อไป
		audioBuffer = nil
	}
}

// ฟังก์ชันสำหรับเปิดการเชื่อมต่อ MQTT
func InitMQTT() {
	opts := mqtt.NewClientOptions()
	opts.AddBroker("tcp://localhost:1883") 
	opts.SetClientID("Go_Backend_AI_Listener")
	opts.SetDefaultPublishHandler(messagePubHandler)

	client := mqtt.NewClient(opts)
	if token := client.Connect(); token.Wait() && token.Error() != nil {
		log.Println("เชื่อมต่อ MQTT Broker ไม่สำเร็จ:", token.Error())
		return
	}
	fmt.Println("✅ Backend เชื่อมต่อ MQTT Broker สำเร็จแล้ว")

	topic := "voice/audio/#"
	if token := client.Subscribe(topic, 1, nil); token.Wait() && token.Error() != nil {
		log.Fatal(token.Error())
	}
	fmt.Printf("🎧 กำลังดักฟังข้อมูลเสียงที่ Topic: %s (และจะตัดไฟล์ทุกๆ 5 วินาที)\n", topic)
}