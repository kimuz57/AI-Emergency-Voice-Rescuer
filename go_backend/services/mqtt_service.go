package services

import (
	"encoding/binary"
	"fmt"
	"log"
	"os"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

// ฟังก์ชันสำหรับสร้าง "หัวไฟล์" WAV (WAV Header) เพื่อให้โปรแกรมเล่นเพลงรู้จัก
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

// ฟังก์ชันนี้จะทำงานอัตโนมัติทุกครั้งที่มีเสียงส่งมาจาก ESP32
var messagePubHandler mqtt.MessageHandler = func(client mqtt.Client, msg mqtt.Message) {
	topic := msg.Topic()
	payload := msg.Payload()

	fmt.Printf("ได้รับเสียงจาก Topic: %s (ขนาด: %d bytes)\n", topic, len(payload))

	//1. สั่งให้สร้างโฟลเดอร์ uploads/audio (ถ้ายืนยันว่ายังไม่มีระบบจะสร้างให้)
	os.MkdirAll("uploads/audio", os.ModePerm)

	//2. เติมชื่อโฟลเดอร์เข้าไปข้างหน้าชื่อไฟล์
	filename := fmt.Sprintf("uploads/audio/audio_%d.wav", time.Now().Unix())

	// เตรียมข้อมูล WAV Header
	dataSize := uint32(len(payload))
	wavHeader := createWAVHeader(dataSize)

	// นำ Header มาต่อกับข้อมูลเสียงที่ได้จาก ESP32
	fullWavData := append(wavHeader, payload...)

	// บันทึกเป็นไฟล์ .wav
	err := os.WriteFile(filename, fullWavData, 0644)
	if err != nil {
		log.Println("บันทึกไฟล์เสียงไม่สำเร็จ:", err)
		return
	}
	fmt.Println("บันทึกไฟล์เสียงสำเร็จ:", filename)
}


// ฟังก์ชันสำหรับเปิดการเชื่อมต่อ MQTT
func InitMQTT() {
	opts := mqtt.NewClientOptions()
	// เปลี่ยน IP ตรงนี้ให้เป็น IP ของ MQTT Broker
	opts.AddBroker("tcp://localhost:1883") 
	opts.SetClientID("Go_Backend_AI_Listener")
	opts.SetDefaultPublishHandler(messagePubHandler)

	client := mqtt.NewClient(opts)
	if token := client.Connect(); token.Wait() && token.Error() != nil {
		log.Println("เชื่อมต่อ MQTT Broker ไม่สำเร็จ (ข้ามการทำงานส่วนนี้ไปก่อน):", token.Error())
		return
	}
	fmt.Println("Backend เชื่อมต่อ MQTT Broker สำเร็จแล้ว")

	// ดักฟัง Topic ที่ขึ้นต้นด้วย voice/audio/
	topic := "voice/audio/#"
	if token := client.Subscribe(topic, 1, nil); token.Wait() && token.Error() != nil {
		log.Fatal(token.Error())
	}
	fmt.Printf("🎧 กำลังดักฟังข้อมูลเสียงที่ Topic: %s\n", topic)
}