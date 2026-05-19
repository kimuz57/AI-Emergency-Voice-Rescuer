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
#include "nvs.h"             
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_timer.h"
#include "esp_rom_gpio.h"
#include "esp_http_client.h" 
#include "esp_crt_bundle.h"  
#include "lwip/sockets.h"
#include "web_server.h"

static const char *TAG = "VOICE_RECORDER";
static int s_retry_num = 0;
#define WIFI_MAXIMUM_RETRY 5

#define I2S_PORT I2S_NUM_0
#define I2S_SAMPLE_RATE 16000
#define I2S_CHANNELS 1
#define I2S_BITS_PER_SAMPLE I2S_BITS_PER_SAMPLE_32BIT

#define I2S_SCK_PIN 26       
#define I2S_WS_PIN 25        
#define I2S_DIN_PIN 22       
#define I2S_DOUT_PIN -1      

#define STATUS_LED_PIN 2     
#define RECORD_LED_PIN 4     

#define AP_SSID        "SmartVoice-ESP32"
#define AP_PASSWORD    "smartvoice123"
#define AP_CHANNEL     1
#define AP_MAX_CONN    4

char mqtt_broker_uri_dynamic[128] = "mqtt://192.168.4.2:1883";
#define MQTT_DEVICE_CODE "ESP32_DEVICE_001"  

#define AUDIO_CHUNK_SAMPLES 2048    
#define I2S_DMA_BUF_LEN     1024   

static esp_mqtt_client_handle_t mqtt_client = NULL;
static bool client_connected = false;  
static bool mqtt_connected = false;
static esp_netif_t *sta_netif = NULL;
static esp_netif_t *ap_netif = NULL;

// ==========================================
// ระบบบันทึก/โหลด NVS (MQTT & Wi-Fi)
// ==========================================
void save_mqtt_uri_to_nvs(const char* uri) {
    nvs_handle_t my_handle;
    if (nvs_open("storage", NVS_READWRITE, &my_handle) == ESP_OK) {
        nvs_set_str(my_handle, "mqtt_uri", uri);
        nvs_commit(my_handle);
        nvs_close(my_handle);
        ESP_LOGI(TAG, "บันทึก MQTT URI ลง NVS สำเร็จ: %s", uri);
    }
}

void load_mqtt_uri_from_nvs() {
    nvs_handle_t my_handle;
    if (nvs_open("storage", NVS_READONLY, &my_handle) == ESP_OK) {
        size_t required_size = sizeof(mqtt_broker_uri_dynamic);
        if (nvs_get_str(my_handle, "mqtt_uri", mqtt_broker_uri_dynamic, &required_size) == ESP_OK) {
            ESP_LOGI(TAG, "โหลด MQTT URI จาก NVS: %s", mqtt_broker_uri_dynamic);
        }
        nvs_close(my_handle);
    }
}

// 🟢 เพิ่มระบบบันทึก Wi-Fi ลง NVS
void save_wifi_to_nvs(const char* ssid, const char* password) {
    nvs_handle_t my_handle;
    if (nvs_open("storage", NVS_READWRITE, &my_handle) == ESP_OK) {
        nvs_set_str(my_handle, "wifi_ssid", ssid);
        nvs_set_str(my_handle, "wifi_pass", password);
        nvs_commit(my_handle);
        nvs_close(my_handle);
        ESP_LOGI(TAG, "บันทึกข้อมูล Wi-Fi ลง NVS สำเร็จ (SSID: %s)", ssid);
    }
}

bool load_wifi_from_nvs(char* ssid, char* password, size_t max_len) {
    nvs_handle_t my_handle;
    bool found = false;
    if (nvs_open("storage", NVS_READONLY, &my_handle) == ESP_OK) {
        size_t len = max_len;
        if (nvs_get_str(my_handle, "wifi_ssid", ssid, &len) == ESP_OK) {
            len = max_len;
            if (nvs_get_str(my_handle, "wifi_pass", password, &len) == ESP_OK) {
                found = true;
                ESP_LOGI(TAG, "พบข้อมูล Wi-Fi เดิมในระบบ: %s", ssid);
            }
        }
        nvs_close(my_handle);
    }
    return found;
}

// ==========================================
// LED & API & MQTT (คงเดิม)
// ==========================================
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
        gpio_set_level(pin, 1); vTaskDelay(100 / portTICK_PERIOD_MS);
        gpio_set_level(pin, 0); vTaskDelay(100 / portTICK_PERIOD_MS);
    }
}

static void kwsapi_task(void *pvParameters) {
    char *ip_str = (char *)pvParameters; // รับค่า IP มา
    char url[128];
    
    snprintf(url, sizeof(url), "https://kwsapi.wattanapong.com?ip=%s", ip_str);
    
    esp_http_client_config_t config = {
        .url = url, 
        .method = HTTP_METHOD_GET, 
        .timeout_ms = 5000, 
        .crt_bundle_attach = esp_crt_bundle_attach,
    };
    
    esp_http_client_handle_t client = esp_http_client_init(&config);
    if (esp_http_client_perform(client) == ESP_OK) {
        ESP_LOGI(TAG, "✓ เรียก API สำเร็จ (ส่ง IP: %s)", ip_str);
    } else {
        ESP_LOGE(TAG, "❌ เรียก API ไม่สำเร็จ");
    }
    
    esp_http_client_cleanup(client);
    
    // คืนค่าหน่วยความจำ และสั่งปิด Task ตัวเองเมื่อทำงานเสร็จ
    free(ip_str); 
    vTaskDelete(NULL); 
}

// 2. แก้ไขฟังก์ชันเดิม ให้ทำหน้าที่แค่ "จ้าง" Task ใหม่ไปทำงานแทน
static void trigger_kwsapi_website(const char* ip_str) {
    // ก๊อปปี้ IP เก็บไว้ในหน่วยความจำชั่วคราว เพื่อส่งไปให้ Task
    char *ip_copy = strdup(ip_str);
    
    if (ip_copy != NULL) {
        // สร้าง Task ใหม่ชื่อ "kwsapi_task" ให้พื้นที่ Stack 4096 bytes
        xTaskCreate(kwsapi_task, "kwsapi_task", 4096, (void *)ip_copy, 5, NULL);
    }
}

static void mqtt_event_handler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data) {
    esp_mqtt_event_handle_t event = event_data;
    if (event->event_id == MQTT_EVENT_CONNECTED) {
        ESP_LOGI(TAG, "✓ MQTT Broker เชื่อมต่อแล้ว");
        mqtt_connected = true;
        blink_led(RECORD_LED_PIN, 3);
    } else if (event->event_id == MQTT_EVENT_DISCONNECTED) {
        ESP_LOGW(TAG, "MQTT Broker หลุดจากการเชื่อมต่อ");
        mqtt_connected = false;
        set_record_led(0);
    }
}

void restart_mqtt_client(void) {
    if (mqtt_client != NULL) {
        esp_mqtt_client_stop(mqtt_client);
        esp_mqtt_client_destroy(mqtt_client);
        mqtt_client = NULL;
    }
    const esp_mqtt_client_config_t mqtt_cfg = {
        .broker = { .address = { .uri = mqtt_broker_uri_dynamic } },
        .session = { .last_will = { .topic = "device/status/" MQTT_DEVICE_CODE, .msg = "offline", .qos = 1, .retain = 1 } },
    };
    mqtt_client = esp_mqtt_client_init(&mqtt_cfg);
    esp_mqtt_client_register_event(mqtt_client, ESP_EVENT_ANY_ID, mqtt_event_handler, NULL);
    esp_mqtt_client_start(mqtt_client);
}

void init_mqtt() { restart_mqtt_client(); }

// ==========================================
// Wi-Fi (AP + STA Coexistence)
// ==========================================
// 🟢 แก้ไขให้ฟังก์ชันนี้บันทึก Wi-Fi ลง NVS ด้วย
void connect_to_sta(const char* ssid, const char* password) {
    esp_wifi_set_mode(WIFI_MODE_APSTA);

    wifi_config_t wifi_sta_config = {0};
    strncpy((char*)wifi_sta_config.sta.ssid, ssid, sizeof(wifi_sta_config.sta.ssid) - 1);
    strncpy((char*)wifi_sta_config.sta.password, password, sizeof(wifi_sta_config.sta.password) - 1);

    wifi_sta_config.sta.threshold.authmode = WIFI_AUTH_WPA_WPA2_PSK;
    
    ESP_LOGI(TAG, "กำลังพยายามเชื่อมต่อ WiFi: %s", ssid);
    
    esp_wifi_disconnect();
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_sta_config));

    s_retry_num = 0; // รีเซ็ตตัวนับการพยายามเชื่อมต่อ
    esp_wifi_connect();
    
    // บันทึกลง NVS
    save_wifi_to_nvs(ssid, password);
}

// 🟢 เพิ่มฟังก์ชันสำหรับให้หน้าเว็บสั่ง Reconnect
void trigger_wifi_reconnect(void) {
    char saved_ssid[64] = {0};
    char saved_pass[64] = {0};
    
    // โหลดรหัส Wi-Fi ล่าสุดที่เคยเซฟไว้ในบอร์ด (NVS)
    if (load_wifi_from_nvs(saved_ssid, saved_pass, sizeof(saved_pass))) {
        ESP_LOGI(TAG, "กำลังพยายามเชื่อมต่อ %s อีกครั้งตามคำสั่งจากหน้าเว็บ...", saved_ssid);
        // เรียกใช้ฟังก์ชันเดิม ซึ่งมันจะเปิดโหมด AP+STA และรีเซ็ตจำนวนครั้งให้เป็น 0 อัตโนมัติ
        connect_to_sta(saved_ssid, saved_pass);
    } else {
        ESP_LOGW(TAG, "ไม่พบประวัติ Wi-Fi ในระบบ ไม่สามารถ Reconnect ได้");
    }
}

static void wifi_event_handler(void* arg, esp_event_base_t event_base, int32_t event_id, void* event_data) {
    if (event_base == WIFI_EVENT) {
        switch (event_id) {
            case WIFI_EVENT_AP_START: ESP_LOGI(TAG, "✓ Soft AP เริ่มทำงานสำเร็จ"); set_status_led(1); break;
            case WIFI_EVENT_AP_STACONNECTED: client_connected = true; blink_led(STATUS_LED_PIN, 3); break;
            case WIFI_EVENT_AP_STADISCONNECTED: client_connected = false; mqtt_connected = false; set_record_led(0); break;
            case WIFI_EVENT_STA_START: ESP_LOGI(TAG, "WiFi Station Mode เริ่มต้นระบบแล้ว"); break;
            case WIFI_EVENT_STA_DISCONNECTED: 
                if (s_retry_num < WIFI_MAXIMUM_RETRY) {
                    esp_wifi_connect();
                    s_retry_num++;
                    ESP_LOGW(TAG, "เชื่อมต่อ Wi-Fi บ้านไม่สำเร็จ กำลังลองใหม่ครั้งที่ %d...", s_retry_num);
                } else {
                    ESP_LOGE(TAG, "หา Wi-Fi ไม่เจอ! หยุดค้นหาและสลับกลับเป็นโหมดฮอตสปอต (AP) อย่างเดียว");
                    
                    // 🟢 ปิดโหมด STA ทิ้ง เพื่อให้เสาอากาศกลับมาปล่อยฮอตสปอตได้นิ่ง 100%
                    esp_wifi_set_mode(WIFI_MODE_AP); 
                } 
                break;
        }
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t* event = (ip_event_got_ip_t*) event_data;
        char ip_str[16];
        esp_ip4addr_ntoa(&event->ip_info.ip, ip_str, sizeof(ip_str));
        ESP_LOGI(TAG, "✓ ได้รับ IP จาก Wi-Fi บ้านเรียบร้อยแล้ว: %s", ip_str);
        trigger_kwsapi_website(ip_str);
        restart_mqtt_client();
    }
}

// 🟢 ปรับปรุง init_wifi ให้ดึงค่าจาก NVS อัตโนมัติ
void init_wifi() {
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    ap_netif = esp_netif_create_default_wifi_ap();
    sta_netif = esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

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

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_APSTA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &wifi_ap_config));

    // เช็คว่าเคยมี Wi-Fi บ้านบันทึกไว้ไหม
    char saved_ssid[32] = {0};
    char saved_pass[64] = {0};
    if (load_wifi_from_nvs(saved_ssid, saved_pass, sizeof(saved_pass))) {
        wifi_config_t wifi_sta_config = {0};
        strncpy((char*)wifi_sta_config.sta.ssid, saved_ssid, sizeof(wifi_sta_config.sta.ssid)-1);
        strncpy((char*)wifi_sta_config.sta.password, saved_pass, sizeof(wifi_sta_config.sta.password)-1);
        wifi_sta_config.sta.threshold.authmode = WIFI_AUTH_WPA_WPA2_PSK;
        
        ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_sta_config));
    }

    ESP_ERROR_CHECK(esp_wifi_start());
    
    // สั่งเชื่อมต่ออัตโนมัติถ้ามีชื่อ Wi-Fi
    if (strlen(saved_ssid) > 0) {
        esp_wifi_connect();
    }
}

// ==========================================
// I2S & Task & Main (คงเดิม)
// ==========================================
void init_i2s_audio() {
    i2s_config_t i2s_config = {
        .mode = I2S_MODE_MASTER | I2S_MODE_RX, .sample_rate = I2S_SAMPLE_RATE, .bits_per_sample = I2S_BITS_PER_SAMPLE,
        .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT, .communication_format = I2S_COMM_FORMAT_I2S_MSB,
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1, .dma_buf_count = 8, .dma_buf_len = I2S_DMA_BUF_LEN,
        .use_apll = true, .tx_desc_auto_clear = false, .fixed_mclk = 0
    };
    i2s_pin_config_t pin_config = { .bck_io_num = I2S_SCK_PIN, .ws_io_num = I2S_WS_PIN, .data_out_num = I2S_DOUT_PIN, .data_in_num = I2S_DIN_PIN };
    ESP_ERROR_CHECK(i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL));
    ESP_ERROR_CHECK(i2s_set_pin(I2S_PORT, &pin_config));
}

void audio_record_task(void *pvParameters) {
    size_t bytes_read = 0;
    int16_t *chunk_buf = (int16_t *)malloc(AUDIO_CHUNK_SAMPLES * sizeof(int16_t));
    int32_t *raw_buf  = (int32_t *)malloc(AUDIO_CHUNK_SAMPLES * sizeof(int32_t));
    
    if (!chunk_buf || !raw_buf) { free(chunk_buf); free(raw_buf); vTaskDelete(NULL); return; }
    
    char mqtt_topic[100]; char status_topic[100];
    snprintf(mqtt_topic, sizeof(mqtt_topic), "voice/audio/%s", MQTT_DEVICE_CODE);
    snprintf(status_topic, sizeof(status_topic), "device/status/%s", MQTT_DEVICE_CODE);
    uint32_t chunk_seq = 0;

    while (1) {
        set_record_led(1);
        esp_err_t ret = i2s_read(I2S_PORT, raw_buf, AUDIO_CHUNK_SAMPLES * sizeof(int32_t), &bytes_read, portMAX_DELAY);
        set_record_led(0);
        if (ret == ESP_OK && bytes_read > 0 && mqtt_connected) {
            int num_samples = (int)(bytes_read / sizeof(int32_t));
            for (int i = 0; i < num_samples; i++) { chunk_buf[i] = (int16_t)(raw_buf[i] >> 16); }
            esp_mqtt_client_publish(mqtt_client, mqtt_topic, (const char *)chunk_buf, num_samples * sizeof(int16_t), 0, 0);
            chunk_seq++;
            if (chunk_seq % 50 == 0) { esp_mqtt_client_publish(mqtt_client, status_topic, "online", 6, 1, 1); }
        }
    }
}

void system_monitor_task(void *pvParameters) {
    while (1) {
        vTaskDelay(30000 / portTICK_PERIOD_MS);
    }
}

// 🟢 Task สำหรับทำ Captive Portal (ดักจับ DNS และชี้เป้ามาที่ 192.168.4.1)
static void captive_dns_task(void *pvParameters) {
    struct sockaddr_in dest_addr;
    dest_addr.sin_addr.s_addr = htonl(INADDR_ANY);
    dest_addr.sin_family = AF_INET;
    dest_addr.sin_port = htons(53); // พอร์ตมาตรฐานของ DNS คือ 53

    int sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_IP);
    if (sock < 0) { vTaskDelete(NULL); return; }
    bind(sock, (struct sockaddr *)&dest_addr, sizeof(dest_addr));

    char rx_buffer[128];
    while (1) {
        struct sockaddr_in source_addr;
        socklen_t socklen = sizeof(source_addr);
        int len = recvfrom(sock, rx_buffer, sizeof(rx_buffer) - 1, 0, (struct sockaddr *)&source_addr, &socklen);
        
        // ถ้าได้รับคำขอให้ค้นหาชื่อเว็บ และขนาด Packet ถูกต้อง
        if (len > 12 && len < 100) {
            char tx_buffer[150];
            memcpy(tx_buffer, rx_buffer, len);
            
            tx_buffer[2] = 0x81; // แจ้งว่าเป็น Response
            tx_buffer[3] = 0x80; // ไม่พบ Error
            tx_buffer[6] = 0x00; tx_buffer[7] = 0x01; // ตอบกลับ 1 คำตอบ
            
            char *ans = tx_buffer + len;
            *ans++ = 0xC0; *ans++ = 0x0C; // อ้างอิงกลับไปที่ชื่อโดเมนเดิมที่ถามมา
            *ans++ = 0x00; *ans++ = 0x01; // Type A (IP Address)
            *ans++ = 0x00; *ans++ = 0x01; // Class IN
            *ans++ = 0x00; *ans++ = 0x00; *ans++ = 0x00; *ans++ = 0x3C; // อายุข้อมูล (TTL) 60 วินาที
            *ans++ = 0x00; *ans++ = 0x04; // ความยาวข้อมูล 4 Bytes
            *ans++ = 192;  *ans++ = 168;  *ans++ = 4;   *ans++ = 1;     // 🎯 ชี้เป้าไปที่ IP บอร์ดของเรา!
            
            sendto(sock, tx_buffer, ans - tx_buffer, 0, (struct sockaddr *)&source_addr, sizeof(source_addr));
        }
        vTaskDelay(pdMS_TO_TICKS(10)); // ป้องกัน CPU ทำงานหนักเกินไป
    }
}

void app_main(void) {
    ESP_LOGI(TAG, "=================================");
    ESP_LOGI(TAG, "  Guardian AI Voice Recorder (V2)");
    ESP_LOGI(TAG, "=================================");
    
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
      ESP_ERROR_CHECK(nvs_flash_erase());
      ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    load_mqtt_uri_from_nvs();

    init_led();
    init_i2s_audio();
    init_wifi();

    vTaskDelay(1000 / portTICK_PERIOD_MS);
    start_web_server();

    xTaskCreate(captive_dns_task, "captive_dns", 2048, NULL, 5, NULL);
    
    init_mqtt();
    
    xTaskCreate(audio_record_task, "audio_record", 4096, NULL, 10, NULL);
    xTaskCreate(system_monitor_task, "monitor", 2048, NULL, 5, NULL);
}