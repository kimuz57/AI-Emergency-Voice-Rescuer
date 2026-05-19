# ========================================
# ESP32 Voice Recorder - Build Instructions
# ========================================

## Requirements
- ESP-IDF v4.4 or later
- Python 3.7+
- ESP32 DevKit V1
- INMP441 Microphone Module

## Hardware Connections

### INMP441 Microphone to ESP32:
| INMP441 | ESP32 DevKit V1 |
|---------|-----------------|
| CLK     | GPIO26 (SCK)    |
| WS      | GPIO25 (WS)     |
| SD      | GPIO22 (DIN)    |
| GND     | GND             |
| VCC     | 3.3V            |
| L/R     | GND (mono)      |

### LEDs (optional):
| LED     | GPIO            | Purpose        |
|---------|-----------------|----------------|
| Blue    | GPIO2           | WiFi Status    |
| Red     | GPIO4           | Recording LED  |

## Setup Instructions

1. Clone or copy this directory
2. Set up ESP-IDF environment:
   ```bash
   export IDF_PATH=/path/to/esp-idf
   . $IDF_PATH/export.sh
   ```

3. Configure WiFi and MQTT:
   ```bash
   idf.py menuconfig
   ```
   - WiFi SSID: Configure in your router/AP
   - WiFi Password: Your WiFi password
   - MQTT Broker: IP address and port
   
   OR edit `main/voice_recorder.c` directly:
   ```c
   #define WIFI_SSID "YOUR_SSID"
   #define WIFI_PASSWORD "YOUR_PASSWORD"
   #define MQTT_BROKER_URI "mqtt://192.168.1.100:1883"
   #define MQTT_DEVICE_CODE "ESP32_DEVICE_001"
   ```

4. Build the project:
   ```bash
   idf.py build
   ```

5. Flash to ESP32:
   ```bash
   idf.py -p /dev/ttyUSB0 flash monitor
   ```

   On Windows:
   ```bash
   idf.py -p COM3 flash monitor
   ```

6. Monitor logs:
   ```bash
   idf.py monitor
   ```

## Configuration

### Device Code
Each device should have a unique device code for MQTT topic:
```c
#define MQTT_DEVICE_CODE "ESP32_DEVICE_001"
```

### Audio Settings
- Sample Rate: 16000 Hz (standard for speech recognition)
- Channels: 1 (Mono)
- Bits per Sample: 16-bit
- Recording Duration: 5 seconds per clip
- Chunk Size: 2048 samples

### MQTT Topics
- Publishing: `voice/audio/<device_code>`
- Status: `device/status/<device_code>`

## Testing

1. **Check WiFi Connection:**
   ```
   [WiFi] WiFi connecting...
   [WiFi] WiFi connected, IP: 192.168.1.xxx
   ```

2. **Check MQTT Connection:**
   ```
   [MQTT] MQTT connected
   [MQTT] Audio published to MQTT
   ```

3. **Monitor with MQTT Client:**
   ```bash
   mosquitto_sub -h 192.168.1.100 -t "voice/audio/ESP32_DEVICE_001" -v
   ```

4. **Subscribe to Status:**
   ```bash
   mosquitto_sub -h 192.168.1.100 -t "device/status/ESP32_DEVICE_001" -v
   ```

## Troubleshooting

### "WiFi disconnected"
- Check SSID and password match router credentials
- Check router is broadcasting SSID
- Verify 2.4GHz band support (ESP32 doesn't support 5GHz)

### "MQTT disconnected"
- Verify MQTT broker IP address is correct
- Check MQTT port (default 1883)
- Ensure Mosquitto broker is running:
  ```bash
  mosquitto -v
  ```
- Test connectivity:
  ```bash
  nc -zv 192.168.1.100 1883
  ```

### "No/Low Audio"
- Check I2S pin connections
- Verify INMP441 power supply (3.3V)
- Check L/R pin connection (should be GND for mono)
- Verify INMP441 is working with test code

### Memory Issues
- Check heap memory allocation
- Monitor with: `idf.py monitor` and look for panic messages

## Performance Notes

- Recording takes ~5 seconds per clip
- Audio data sent via MQTT is approximately 160KB per 5-second clip (16-bit, 16kHz mono)
- Consider WiFi/MQTT bandwidth limitations for multiple devices

## Next Steps

1. Create database entries for this device
2. Configure backend to accept audio from this device code
3. Set up Python AI service to process audio
4. Configure LINE Notify for alerts
5. Deploy to production with proper WiFi AP coverage
