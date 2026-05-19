#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "driver/i2s.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include "esp_err.h"
#include "mqtt_client.h"
#include "esp_wifi.h"
#include "nvs_flash.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_timer.h"
#include "esp_rom_gpio.h"
#include "esp_http_client.h"  // เพิ่มสำหรับการทำ HTTP Request ไปที่เว็บปลายทาง

// ดึงตัวจัดการ Web Server เข้ามา
#include "web_server.h"

static const char *TAG = "VOICE_RECORDER";

// Configuration
#define I2S_PORT I2S_NUM_0
#define I2S_SAMPLE_RATE 16000
#define I2S_CHANNELS 1
#define I2S_BITS_PER_SAMPLE I2S_BITS_PER_SAMPLE_32BIT

// I2S Pin Configuration
#define I2S_SCK_PIN 26       
#define I2S_WS_PIN 25        
#define I2S_DIN_PIN 22       
#define I2S_DOUT_PIN -1      

// LED indicators
#define STATUS_LED_PIN 2     
#define RECORD_LED_PIN 4     

// Soft AP Configuration
#define AP_SSID        "SmartVoice-ESP32"
#define AP_PASSWORD    "smartvoice123"
#define AP_CHANNEL     1
#define AP_MAX_CONN    4

// เปลี่ยนค่าของ MQTT_BROKER_URI เป็นตัวแปร Global Dynamic ให้แก้ไขค่าได้ตลอดเวลา
char mqtt_broker_uri_dynamic[128] = "mqtt://192.168.4.2:1883";
#define MQTT_DEVICE_CODE "ESP32_DEVICE_001"  

// Audio recording parameters
#define AUDIO_CHUNK_SAMPLES 2048    
#define I2S_DMA_BUF_LEN     1024   

// Global variables
static esp_mqtt_client_handle_t mqtt_client = NULL;
static bool client_connected = false;  
static bool mqtt_connected = false;
static esp_netif_t *sta_netif = NULL;
static esp_netif_t *ap_netif = NULL;

// ฟังก์ชันควบคุมไฟสถานะ
void init_led() {
    esp_rom_gpio_pad_select_gpio(STATUS_LED_PIN);
    gpio_set_direction(STATUS_LED_PIN, GPIO_MODE_OUTPUT);
    esp_rom_gpio_pad_select_gpio(RECORD_LED_PIN);
    gpio_set_direction(RECORD_LED_PIN, GPIO_MODE_OUTPUT);
    gpio_set_level(STATUS_LED_PIN, 0);
    gpio_set_level(RECORD_LED_PIN, 0);
}

void set_status_led(int state) { gpio_set_level(STATUS_LED_PIN, state); }
void set_record_led(int state) { gpio_set_level(RECORD_LED_PIN, state); }
void blink_led(int pin, int count) {
    for (int i = 0; i < count; i++) {
        gpio_set_level(pin, 1);
        vTaskDelay(100 / portTICK_PERIOD_MS);
        gpio_set_level(pin, 0);
        vTaskDelay(100 / portTICK_PERIOD_MS);
    }
}

// ฟังก์ชันเรียกเว็บเป้าหมายด้วย HTTP GET แบบ background
static void trigger_kwsapi_website(const char* ip_str) {
    char url[128];
    snprintf(url, sizeof(url), "https://kwsapi.wattanapong.com?ip=%s", ip_str);
    ESP_LOGI(TAG, "กำลังเรียกหน้าเว็บ: %s", url);

    esp_http_client_config_t config = {
        .url = url,
        .method = HTTP_METHOD_GET,
        .timeout_ms = 5000,
        .crt_bundle_attach = esp_crt_bundle_attach, // ใช้ตัวจัดการ SSL Bundle ของ IDF เพื่อเข้า https
    };
    esp_http_client_handle_t client = esp_http_client_init(&config);
    esp_err_t err = esp_http_client_perform(client);
    if (err == ESP_OK) {
        ESP_LOGI(TAG, "เรียกเว็บสำเร็จ สถานะ HTTP: %d", esp_http_client_get_status_code(client));
    } else {
        ESP_LOGE(TAG, "เรียกเว็บล้มเหลว: %s", esp_err_to_name(err));
    }
    esp_http_client_cleanup(client);
}

// เปลี่ยนแปลง หรือ Restart ระบบ MQTT client แบบ Dynamic
void restart_mqtt_client(void) {
    if (mqtt_client != NULL) {
        ESP_LOGI(TAG, "กำลังปิด MQTT Instance ตัวเก่า...");
        esp_mqtt_client_stop(mqtt_client);
        esp_mqtt_client_destroy(mqtt_client);
        mqtt_client = NULL;
    }
    
    const esp_mqtt_client_config_t mqtt_cfg = {
        .broker = { .address = { .uri = mqtt_broker_uri_dynamic } },
        .session = {
            .last_will = {
                .topic = "device/status/" MQTT_DEVICE_CODE,
                .msg   = "offline",
                .qos   = 1,
                .retain = 1,
            },
        },
    };
    
    mqtt_client = esp_mqtt_client_init(&mqtt_cfg);
    esp_mqtt_client_register_event(mqtt_client, ESP_EVENT_ANY_ID, (void*)esp_event_handler_run, NULL);
    esp_mqtt_client_start(mqtt_client);
    ESP_LOGI(TAG, "เริ่มโครงสร้าง MQTT Client ใหม่ ชี้ไปที่ -> %s", mqtt_broker_uri_dynamic);
}

// ฟังก์ชันสั่งเชื่อมต่อ Wi-Fi ฝั่ง Station (STA)
void connect_to_sta(const char* ssid, const char* password) {
    wifi_config_t wifi_sta_config = {0};
    strncpy((char*)wifi_sta_config.sta.ssid, ssid, sizeof(wifi_sta_config.sta.ssid));
    strncpy((char*)wifi_sta_config.sta.password, password, sizeof(wifi_sta_config.sta.password));
    
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_sta_config));
    esp_wifi_connect();
}

// Integrated WiFi Event Handler รองรับทั้ง AP และ STA
static void wifi_event_handler(void* arg, esp_event_base_t event_base,
                               int32_t event_id, void* event_data) {
    if (event_base == WIFI_EVENT) {
        switch (event_id) {
            case WIFI_EVENT_AP_START:
                ESP_LOGI(TAG, "✓ Soft AP เริ่มทำงานสำเร็จ");
                set_status_led(1);
                break;
            case WIFI_EVENT_AP_STACONNECTED:
                client_connected = true;
                blink_led(STATUS_LED_PIN, 3);
                break;
            case WIFI_EVENT_AP_STADISCONNECTED:
                client_connected = false;
                mqtt_connected = false;
                set_record_led(0);
                break;
            case WIFI_EVENT_STA_START:
                ESP_LOGI(TAG, "WiFi Station Mode เริ่มต้นระบบแล้ว");
                break;
            case WIFI_EVENT_STA_DISCONNECTED:
                ESP_LOGW(TAG, "ตัดการเชื่อมต่อจาก Wi-Fi บ้านหลัก หรือรหัสผ่านผิดพลาด กำลังเชื่อมต่อใหม่...");
                esp_wifi_connect(); // สั่ง Auto re-connect
                break;
        }
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t* event = (ip_event_got_ip_t*) event_data;
        char ip_str[16];
        esp_ip4addr_ntoa(&event->ip_info.ip, ip_str, sizeof(ip_str));
        ESP_LOGI(TAG, "✓ ได้รับ IP จาก Wi-Fi บ้านเรียบร้อยแล้ว: %s", ip_str);
        
        // เมื่อต่อ Internet ได้เรียบร้อย ทำการ Trigger ไปที่เว็บเป้าหมายทันที
        trigger_kwsapi_website(ip_str);
        
        // ทำการเชื่อมต่อ/รีสตาร์ท MQTT เข้าหากันอีกครั้ง
        restart_mqtt_client();
    }
}

// เริ่มต้นโครงสร้าง WiFi โหมด AP + STA ร่วมกัน (Coexistence)
void init_wifi() {
    ESP_ERROR_CHECK(nvs_flash_init());
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    // สร้างทั้ง AP และ STA ในตัวเดียว
    ap_netif = esp_netif_create_default_wifi_ap();
    sta_netif = esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    // ลงทะเบียนตรวจสอบ Event ทั้งฝั่ง Wi-Fi และ IP Event
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL));

    wifi_config_t wifi_ap_config = {
        .ap = {
            .ssid = AP_SSID,
            .ssid_len = strlen(AP_SSID),
            .channel = AP_CHANNEL,
            .password = AP_PASSWORD,
            .max_connection = AP_MAX_CONN,
            .authmode = WIFI_AUTH_WPA2_PSK,
        },
    };

    // เปิดใช้งานแบบผสม (AP + Station)
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_APSTA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &wifi_ap_config));
    ESP_ERROR_CHECK(esp_wifi_start());

    ESP_LOGI(TAG, "เสร็จสิ้นการตั้งค่าโหมด Wi-Fi AP + STA");
}

// ส่วนของ I2S Audio 
void init_i2s_audio() {
    i2s_config_t i2s_config = {
        .mode = I2S_MODE_MASTER | I2S_MODE_RX,
        .sample_rate = I2S_SAMPLE_RATE,
        .bits_per_sample = I2S_BITS_PER_SAMPLE,
        .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
        .communication_format = I2S_COMM_FORMAT_I2S_MSB,
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count = 8,
        .dma_buf_len = I2S_DMA_BUF_LEN,
        .use_apll = true,
        .tx_desc_auto_clear = false,
        .fixed_mclk = 0
    };

    i2s_pin_config_t pin_config = {
        .bck_io_num = I2S_SCK_PIN,
        .ws_io_num = I2S_WS_PIN,
        .data_out_num = I2S_DOUT_PIN,
        .data_in_num = I2S_DIN_PIN
    };

    ESP_ERROR_CHECK(i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL));
    ESP_ERROR_CHECK(i2s_set_pin(I2S_PORT, &pin_config));
    ESP_LOGI(TAG, "✓ เริ่มระบบประมวลผล I2S เรียบร้อย");
}

// MQTT Event Handler 
static void mqtt_event_handler(void *handler_args, esp_event_base_t base,
                               int32_t event_id, void *event_data) {
    esp_mqtt_event_handle_t event = event_data;
    switch (event->event_id) {
        case MQTT_EVENT_CONNECTED:
            ESP_LOGI(TAG, "✓ MQTT Broker เชื่อมต่อแล้ว");
            mqtt_connected = true;
            blink_led(RECORD_LED_PIN, 3);
            break;
        case MQTT_EVENT_DISCONNECTED:
            ESP_LOGW(TAG, "MQTT Broker หลุดจากการเชื่อมต่อ");
            mqtt_connected = false;
            set_record_led(0);
            break;
        default:
            break;
    }
}

void init_mqtt() {
    restart_mqtt_client(); // เรียกฟังก์ชัน Dynamic มาสร้างแทน
}

// Audio Recording Task
void audio_record_task(void *pvParameters) {
    size_t bytes_read = 0;
    int16_t *chunk_buf = (int16_t *)malloc(AUDIO_CHUNK_SAMPLES * sizeof(int16_t));
    int32_t *raw_buf  = (int32_t *)malloc(AUDIO_CHUNK_SAMPLES * sizeof(int32_t));
    if (!chunk_buf || !raw_buf) {
        free(chunk_buf); free(raw_buf); vTaskDelete(NULL); return;
    }
    char mqtt_topic[100];
    char status_topic[100];
    snprintf(mqtt_topic, sizeof(mqtt_topic), "voice/audio/%s", MQTT_DEVICE_CODE);
    snprintf(status_topic, sizeof(status_topic), "device/status/%s", MQTT_DEVICE_CODE);

    uint32_t chunk_seq = 0;

    while (1) {
        if (!mqtt_connected) {
            vTaskDelay(2000 / portTICK_PERIOD_MS);
            continue;
        }

        set_record_led(1);
        esp_err_t ret = i2s_read(I2S_PORT, raw_buf, AUDIO_CHUNK_SAMPLES * sizeof(int32_t), &bytes_read, portMAX_DELAY);
        set_record_led(0);

        if (ret == ESP_OK && bytes_read > 0 && mqtt_connected) {
            int num_samples = (int)(bytes_read / sizeof(int32_t));
            for (int i = 0; i < num_samples; i++) {
                chunk_buf[i] = (int16_t)(raw_buf[i] >> 16);
            }
            int publish_bytes = num_samples * sizeof(int16_t);

            esp_mqtt_client_publish(mqtt_client, mqtt_topic, (const char *)chunk_buf, publish_bytes, 0, 0);
            chunk_seq++;

            if (chunk_seq % 50 == 0) {
                esp_mqtt_client_publish(mqtt_client, status_topic, "online", 6, 1, 1);
            }
        }
    }
}

void system_monitor_task(void *pvParameters) {
    while (1) {
        ESP_LOGI(TAG, "=== ตรวจสอบสถานะการทำงาน ===");
        ESP_LOGI(TAG, "โฮสต์ MQTT ปัจจุบัน: %s", mqtt_broker_uri_dynamic);
        ESP_LOGI(TAG, "MQTT State: %s", mqtt_connected ? "Connected" : "Disconnected");
        ESP_LOGI(TAG, "Free Memory: %lu bytes", esp_get_free_heap_size());
        vTaskDelay(30000 / portTICK_PERIOD_MS);
    }
}

// Application Main Entrance
void app_main(void) {
    ESP_LOGI(TAG, "=================================");
    ESP_LOGI(TAG, "  Guardian AI Voice Recorder (WebConfig)");
    ESP_LOGI(TAG, "=================================");
    
    init_led();
    init_i2s_audio();
    init_wifi();

    // รอแป๊บหนึ่งให้ AP พร้อมใช้งาน จากนั้นเริ่มระบบ Web Server คอนฟิก
    vTaskDelay(1000 / portTICK_PERIOD_MS);
    start_web_server();

    // เริ่มทำงาน MQTT Client เริ่มแรก
    init_mqtt();
    
    // สร้างแอปพลิเคชัน Task
    xTaskCreate(audio_record_task, "audio_record", 4096, NULL, 10, NULL);
    xTaskCreate(system_monitor_task, "monitor", 2048, NULL, 5, NULL);
}