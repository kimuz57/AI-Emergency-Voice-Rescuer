package services

import (
    "encoding/binary"
    "fmt"
    "log"
    "os"
    "time"

    mqtt "github.com/eclipse/paho.mqtt.golang"
)

func createWAVHeader(dataSize uint32) []byte {
    header := make([]byte, 44)
    sampleRate := uint32(16000)
    numChannels := uint16(1)
    bitsPerSample := uint16(16)
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

func ProcessAudioFile(audioPath string) (DetectResult, error) {
    result, err := RunDetect(audioPath)
    if err != nil {
        return DetectResult{}, err
    }

    log.Printf(
        "AI result => success=%v isAlert=%d keyword=%s level=%d confidence=%.2f text=%q",
        result.Success,
        result.IsAlert,
        result.Keyword,
        result.Level,
        result.Confidence,
        result.TranscribedText,
    )

    return result, nil
}

var messagePubHandler mqtt.MessageHandler = func(client mqtt.Client, msg mqtt.Message) {
    topic := msg.Topic()
    payload := msg.Payload()

    fmt.Printf("ได้รับเสียงจาก Topic: %s (ขนาด: %d bytes)\n", topic, len(payload))

    err := os.MkdirAll("uploads/audio", os.ModePerm)
    if err != nil {
        log.Println("สร้างโฟลเดอร์ uploads/audio ไม่สำเร็จ:", err)
        return
    }

    filename := fmt.Sprintf("uploads/audio/audio_%d.wav", time.Now().Unix())

    dataSize := uint32(len(payload))
    wavHeader := createWAVHeader(dataSize)
    fullWavData := append(wavHeader, payload...)

    err = os.WriteFile(filename, fullWavData, 0644)
    if err != nil {
        log.Println("บันทึกไฟล์เสียงไม่สำเร็จ:", err)
        return
    }
    fmt.Println("บันทึกไฟล์เสียงสำเร็จ:", filename)

    result, err := ProcessAudioFile(filename)
    if err != nil {
        log.Println("วิเคราะห์เสียงด้วย AI ไม่สำเร็จ:", err)
        return
    }

    log.Printf(
        "วิเคราะห์เสียงสำเร็จจาก MQTT => alert=%d keyword=%s level=%d",
        result.IsAlert,
        result.Keyword,
        result.Level,
    )
}

func InitMQTT() {
    opts := mqtt.NewClientOptions()
    opts.AddBroker("tcp://localhost:1883")
    opts.SetClientID("Go_Backend_AI_Listener")
    opts.SetDefaultPublishHandler(messagePubHandler)

    client := mqtt.NewClient(opts)
    if token := client.Connect(); token.Wait() && token.Error() != nil {
        log.Println("เชื่อมต่อ MQTT Broker ไม่สำเร็จ (ข้ามการทำงานส่วนนี้ไปก่อน):", token.Error())
        return
    }
    fmt.Println("Backend เชื่อมต่อ MQTT Broker สำเร็จแล้ว")

    topic := "voice/audio/#"
    if token := client.Subscribe(topic, 1, nil); token.Wait() && token.Error() != nil {
        log.Fatal(token.Error())
    }
    fmt.Printf("กำลังดักฟังข้อมูลเสียงที่ Topic: %s\n", topic)
}