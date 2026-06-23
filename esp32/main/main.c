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
#define SOFTAP_LED_PIN 16   // 🟢 ไฟดวงใหม่สำหรับสถานะ Soft AP
#define STATUS_BORD_PIN 14

#define AP_SSID        "SmartVoice-ESP32"
#define AP_PASSWORD    "smartvoice123"
#define AP_CHANNEL     1
#define AP_MAX_CONN    4

#define RESET_BUTTON_PIN 13

char mqtt_topic_dynamic[128] = "voice/audio/";
char status_topic_dynamic[128] = "device/status/";
char mqtt_broker_uri_dynamic[128] = "wss://mqtt.wattanapong.com/mqtt";
  
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
// LED & API & MQTT
// ==========================================
void init_led() {
    esp_rom_gpio_pad_select_gpio(STATUS_LED_PIN);
    gpio_set_direction(STATUS_LED_PIN, GPIO_MODE_OUTPUT);
    esp_rom_gpio_pad_select_gpio(RECORD_LED_PIN);
    gpio_set_direction(RECORD_LED_PIN, GPIO_MODE_OUTPUT);
    
    // 🟢 กำหนดค่าเริ่มต้นให้ไฟสถานะ Soft AP
    esp_rom_gpio_pad_select_gpio(SOFTAP_LED_PIN);
    gpio_set_direction(SOFTAP_LED_PIN, GPIO_MODE_OUTPUT);

    esp_rom_gpio_pad_select_gpio(STATUS_BORD_PIN);
    gpio_set_direction(STATUS_BORD_PIN, GPIO_MODE_OUTPUT);
    
    gpio_set_level(STATUS_LED_PIN, 0);
    gpio_set_level(RECORD_LED_PIN, 0);
    gpio_set_level(SOFTAP_LED_PIN, 0); // ปิดไว้ก่อน
    gpio_set_level(STATUS_BORD_PIN, 1);
}

void set_status_led(int state) { gpio_set_level(STATUS_LED_PIN, state); }
void set_record_led(int state) { gpio_set_level(RECORD_LED_PIN, state); }
void set_softap_led(int state) { gpio_set_level(SOFTAP_LED_PIN, state); } // 🟢 เพิ่มฟังก์ชันควบคุมไฟ SoftAP

void blink_led(int pin, int count) {
    for (int i = 0; i < count; i++) {
        gpio_set_level(pin, 1); vTaskDelay(300 / portTICK_PERIOD_MS);
        gpio_set_level(pin, 0); vTaskDelay(300 / portTICK_PERIOD_MS);
    }
}

static void kwsapi_task(void *pvParameters) {
    char *ip_str = (char *)pvParameters;
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
    
    free(ip_str); 
    vTaskDelete(NULL); 
}

static void trigger_kwsapi_website(const char* ip_str) {
    char *ip_copy = strdup(ip_str);
    if (ip_copy != NULL) {
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
        .broker = {
            .address = {
                // 🟢 บังคับพิมพ์ URL ตรงๆ ไว้ตรงนี้เลย เพื่อป้องกัน NVS ดึงค่าเก่ามาหลอก!
                .uri = "wss://mqtt.wattanapong.com:443/mqtt", 
            },
            .verification = {
                .skip_cert_common_name_check = true,       
                .use_global_ca_store = false,             
                .crt_bundle_attach = esp_crt_bundle_attach, 
            },
        },
        .credentials = {
            .username = "kws",
            .authentication = {
                .password = "31J6LEg4T$4dtwCf",
            },
        },
        .session = { 
            .last_will = { 
                .topic = status_topic_dynamic, 
                .msg = "offline", 
                .qos = 1, 
                .retain = 1 
            } 
        },
    };

    mqtt_client = esp_mqtt_client_init(&mqtt_cfg);
    esp_mqtt_client_register_event(mqtt_client, ESP_EVENT_ANY_ID, mqtt_event_handler, NULL);
    esp_mqtt_client_start(mqtt_client);
}

void init_mqtt() { restart_mqtt_client(); }

// ==========================================
// Wi-Fi (AP + STA Coexistence)
// ==========================================
void connect_to_sta(const char* ssid, const char* password) {
    esp_wifi_set_mode(WIFI_MODE_APSTA);

    wifi_config_t wifi_sta_config = {0};
    strncpy((char*)wifi_sta_config.sta.ssid, ssid, sizeof(wifi_sta_config.sta.ssid) - 1);
    strncpy((char*)wifi_sta_config.sta.password, password, sizeof(wifi_sta_config.sta.password) - 1);

    wifi_sta_config.sta.threshold.authmode = WIFI_AUTH_WPA_WPA2_PSK;
    
    ESP_LOGI(TAG, "กำลังพยายามเชื่อมต่อ WiFi: %s", ssid);
    
    esp_wifi_disconnect();
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_sta_config));

    s_retry_num = 0; 
    esp_wifi_connect();
    
    save_wifi_to_nvs(ssid, password);
}

void trigger_wifi_reconnect(void) {
    char saved_ssid[64] = {0};
    char saved_pass[64] = {0};
    
    if (load_wifi_from_nvs(saved_ssid, saved_pass, sizeof(saved_pass))) {
        ESP_LOGI(TAG, "กำลังพยายามเชื่อมต่อ %s อีกครั้งตามคำสั่งจากหน้าเว็บ...", saved_ssid);
        connect_to_sta(saved_ssid, saved_pass);
    } else {
        ESP_LOGW(TAG, "ไม่พบประวัติ Wi-Fi ในระบบ ไม่สามารถ Reconnect ได้");
    }
}

static void wifi_event_handler(void* arg, esp_event_base_t event_base, int32_t event_id, void* event_data) {
    if (event_base == WIFI_EVENT) {
        switch (event_id) {
            case WIFI_EVENT_AP_START: 
                ESP_LOGI(TAG, "✓ Soft AP เริ่มทำงานสำเร็จ"); 
                // 🟢 เปิดไฟโชว์ว่าบอร์ดปล่อยฮอตสปอตแล้ว รอคนมาตั้งค่า
                set_softap_led(1); 
                set_status_led(0); // ปิดไฟสถานะปกติ
                break;
            case WIFI_EVENT_AP_STACONNECTED: 
                client_connected = true; 
                blink_led(SOFTAP_LED_PIN, 3);
                set_softap_led(1); // 🟢 ให้ไฟ AP กระพริบดีใจเวลามีคนเอามือถือมาเชื่อม
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
                if (s_retry_num < WIFI_MAXIMUM_RETRY) {
                    esp_wifi_connect();
                    s_retry_num++;
                    ESP_LOGW(TAG, "เชื่อมต่อ Wi-Fi บ้านไม่สำเร็จ กำลังลองใหม่ครั้งที่ %d...", s_retry_num);
                } else {
                    ESP_LOGE(TAG, "หา Wi-Fi ไม่เจอ! หยุดค้นหาและสลับกลับเป็นโหมดฮอตสปอต (AP) อย่างเดียว");
                    esp_wifi_set_mode(WIFI_MODE_AP); 
                    // 🟢 เมื่อกลับมา AP อย่างเดียว ให้เปิดไฟ SoftAP ค้างไว้
                    set_softap_led(1);
                    set_status_led(0);
                } 
                break;
        }
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t* event = (ip_event_got_ip_t*) event_data;
        char ip_str[16];
        esp_ip4addr_ntoa(&event->ip_info.ip, ip_str, sizeof(ip_str));
        ESP_LOGI(TAG, "✓ ได้รับ IP จาก Wi-Fi บ้านเรียบร้อยแล้ว: %s", ip_str);
        
        // 🟢 ต่อ Wi-Fi บ้านสำเร็จแล้ว ให้ปิดไฟ SoftAP และเปิดไฟสถานะระบบ
        set_softap_led(0);
        set_status_led(1);

        trigger_kwsapi_website(ip_str);
        restart_mqtt_client();
    }
}

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
    
    if (strlen(saved_ssid) > 0) {
        esp_wifi_connect();
    }
}

// ==========================================
// I2S & Task & Main
// ==========================================
void init_i2s_audio() {
    i2s_config_t i2s_config = {
        .mode = I2S_MODE_MASTER | I2S_MODE_RX, .sample_rate = I2S_SAMPLE_RATE, .bits_per_sample = I2S_BITS_PER_SAMPLE,
        .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT, .communication_format = I2S_COMM_FORMAT_STAND_I2S,
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
    
    uint32_t chunk_seq = 0;
    bool led_state = false; // 🟢 ตัวแปรสำหรับจำสถานะไฟปัจจุบัน

    while (1) {
        // ❌ เอาคำสั่ง set_record_led รัวๆ ออกไป
        esp_err_t ret = i2s_read(I2S_PORT, raw_buf, AUDIO_CHUNK_SAMPLES * sizeof(int32_t), &bytes_read, portMAX_DELAY);
        
        if (ret == ESP_OK && bytes_read > 0 && mqtt_connected) {
            int num_samples = (int)(bytes_read / sizeof(int32_t));
            for (int i = 0; i < num_samples; i++) { 
                chunk_buf[i] = (int16_t)(raw_buf[i] >> 16); 
            }
            
            esp_mqtt_client_publish(mqtt_client, mqtt_topic_dynamic, (const char *)chunk_buf, num_samples * sizeof(int16_t), 0, 0);
            
            chunk_seq++;
            
            // 🟢 ให้สลับสถานะไฟทุกๆ 4 รอบการส่ง (ประมาณ 0.5 วินาที)
            if (chunk_seq % 4 == 0) {
                led_state = !led_state; // สลับสถานะ (ถ้าดับอยู่ให้ติด, ถ้าติดอยู่ให้ดับ)
                set_record_led(led_state ? 1 : 0);
            }

            // ส่งสถานะ online ไปเรื่อยๆ
            if (chunk_seq % 50 == 0) { 
                esp_mqtt_client_publish(mqtt_client, status_topic_dynamic, "online", 6, 1, 1); 
            }
        } else {
            // 🟢 ถ้าไม่ได้ต่อเน็ต หรือไม่ได้บันทึกเสียง ให้ปิดไฟ
            set_record_led(0);
        }
    }
}

void system_monitor_task(void *pvParameters) {
    while (1) {
        vTaskDelay(30000 / portTICK_PERIOD_MS);
    }
}

static void captive_dns_task(void *pvParameters) {
    struct sockaddr_in dest_addr;
    dest_addr.sin_addr.s_addr = htonl(INADDR_ANY);
    dest_addr.sin_family = AF_INET;
    dest_addr.sin_port = htons(53); 

    int sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_IP);
    if (sock < 0) { vTaskDelete(NULL); return; }
    bind(sock, (struct sockaddr *)&dest_addr, sizeof(dest_addr));

    char rx_buffer[128];
    while (1) {
        struct sockaddr_in source_addr;
        socklen_t socklen = sizeof(source_addr);
        int len = recvfrom(sock, rx_buffer, sizeof(rx_buffer) - 1, 0, (struct sockaddr *)&source_addr, &socklen);
        
        if (len > 12 && len < 100) {
            char tx_buffer[150];
            memcpy(tx_buffer, rx_buffer, len);
            
            tx_buffer[2] = 0x81; 
            tx_buffer[3] = 0x80; 
            tx_buffer[6] = 0x00; tx_buffer[7] = 0x01; 
            
            char *ans = tx_buffer + len;
            *ans++ = 0xC0; *ans++ = 0x0C; 
            *ans++ = 0x00; *ans++ = 0x01; 
            *ans++ = 0x00; *ans++ = 0x01; 
            *ans++ = 0x00; *ans++ = 0x00; *ans++ = 0x00; *ans++ = 0x3C; 
            *ans++ = 0x00; *ans++ = 0x04; 
            *ans++ = 192;  *ans++ = 168;  *ans++ = 4;   *ans++ = 1;     
            
            sendto(sock, tx_buffer, ans - tx_buffer, 0, (struct sockaddr *)&source_addr, sizeof(source_addr));
        }
        vTaskDelay(pdMS_TO_TICKS(10)); 
    }
}

void reset_button_task(void *pvParameters) {
    // 1. ตั้งค่าขา 13 ให้เป็น Input และเปิดใช้งาน Pull-up ภายในบอร์ด
    gpio_set_direction(RESET_BUTTON_PIN, GPIO_MODE_INPUT);
    gpio_set_pull_mode(RESET_BUTTON_PIN, GPIO_PULLUP_ONLY);

    int press_count = 0;

    while (1) {
        // ถ้าระดับไฟเป็น 0 แปลว่าปุ่มถูกกดอยู่
        if (gpio_get_level(RESET_BUTTON_PIN) == 0) {
            press_count++;
            ESP_LOGW(TAG, "⚠️ ตรวจพบการกดปุ่มรีเซ็ตค้างไว้ (%d/3 วินาที)...", press_count);
            
            if (press_count >= 3) {
                ESP_LOGE(TAG, "🔥 กำลังล้างข้อมูลในความจำ (NVS Erase)...");
                
                // ล้างความจำถาวรทั้งหมด
                nvs_flash_erase(); 
                
                // กะพริบไฟรัวๆ เพื่อบอกผู้ใช้ว่ารีเซ็ตสำเร็จแล้ว
                blink_led(STATUS_LED_PIN, 3); 
                
                ESP_LOGE(TAG, "รีสตาร์ทบอร์ดใน 1 วินาที...");
                vTaskDelay(1000 / portTICK_PERIOD_MS);
                
                // สั่งรีบูตเครื่อง 1 รอบ
                esp_restart(); 
            }
        } else {
            // ถ้าปล่อยมือ ให้รีเซ็ตตัวนับกลับเป็น 0
            press_count = 0; 
        }
        
        // เช็คสถานะปุ่มทุกๆ 1 วินาที
        vTaskDelay(1000 / portTICK_PERIOD_MS); 
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

    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_STA); 
    char mac_str[18];
    snprintf(mac_str, sizeof(mac_str), "%02X:%02X:%02X:%02X:%02X:%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    
    snprintf(mqtt_topic_dynamic, sizeof(mqtt_topic_dynamic), "voice/audio/%s", mac_str);
    snprintf(status_topic_dynamic, sizeof(status_topic_dynamic), "device/status/%s", mac_str);
    
    ESP_LOGI(TAG, "🎯 อุปกรณ์นี้มี MAC: %s", mac_str);
    ESP_LOGI(TAG, "🎯 พ่นเสียงไปที่ Topic: %s", mqtt_topic_dynamic);
    
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
    xTaskCreate(reset_button_task, "reset_button", 2048, NULL, 5, NULL);
}