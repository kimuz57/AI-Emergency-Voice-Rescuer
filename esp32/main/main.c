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
#include "esp_mac.h"
#include "esp_sntp.h"
#include <time.h>
#include "lwip/sockets.h"
#include "web_server.h"

static const char *TAG = "VOICE_RECORDER";
static int s_retry_num = 0;
#define WIFI_MAXIMUM_RETRY 5

#define I2S_PORT I2S_NUM_0
#define I2S_SAMPLE_RATE 8000
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

// #define AP_SSID        "SmartVoice-ESP32"
// #define AP_PASSWORD    "smartvoice123"
#define AP_CHANNEL     1
#define AP_MAX_CONN    4

#define RESET_BUTTON_PIN 13

char mqtt_topic_dynamic[128] = "voice/audio/";
char status_topic_dynamic[128] = "device/status/";
char mqtt_broker_uri_dynamic[128] = "wss://mqtt.wattanapong.com:443/mqtt";
char ap_ssid_dynamic[32] = {0};
char ap_password_dynamic[64] = {0};

#define AUDIO_CHUNK_SAMPLES 1024    
#define I2S_DMA_BUF_LEN     1024   

// ==========================================
// 🌟 สวิตช์สลับโหมด (เปลี่ยนแค่บรรทัดนี้บรรทัดเดียว!)
// 1 = รันบน Local (คอมตัวเอง) | 0 = รันบน Server จริง
// ==========================================
#define IS_LOCAL_ENV 1 
#if IS_LOCAL_ENV
    // --- ตั้งค่าสำหรับ Local ---
    #define TARGET_GO_API "https://s8449mbs-8080.asse.devtunnels.ms/api/checkin?ip=%s"
    //#define TARGET_MQTT_URI "wss://192.168.1.109:8083/mqtt"
    #define TARGET_MQTT_URI "s8449mbs-8083.asse.devtunnels.ms/mqtt"
    #define SKIP_CERT_CHECK true  // Local มักจะใช้ Cert จำลอง เลยต้องกดข้าม
    #define USER "kws"
    #define PASS "kws123"
#else
    // --- ตั้งค่าสำหรับ Server จริง ---
    #define TARGET_GO_API "https://kwsapi.wattanapong.com/api/checkin?ip=%s"
    #define TARGET_MQTT_URI "wss://mqtt.wattanapong.com:443/mqtt"
    #define SKIP_CERT_CHECK false // Server จริงต้องตรวจสอบ Cert เพื่อความปลอดภัย
    #define USER "kws"
    #define PASS "31J6LEg4T$4dtwCf"
#endif

static esp_mqtt_client_handle_t mqtt_client = NULL;
static bool client_connected = false;  
static bool mqtt_connected = false;
static esp_netif_t *sta_netif = NULL;
static esp_netif_t *ap_netif = NULL;
static const char *server_cert; // 🔧 forward-declare: ตัวจริงถูกกำหนดค่าไว้ด้านล่างของไฟล์

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

bool load_wifi_from_nvs(char* ssid, size_t ssid_max_len, char* password, size_t password_max_len) {
    nvs_handle_t my_handle;
    bool found = false;
    if (nvs_open("storage", NVS_READONLY, &my_handle) == ESP_OK) {
        size_t len = ssid_max_len;
        if (nvs_get_str(my_handle, "wifi_ssid", ssid, &len) == ESP_OK) {
            len = password_max_len;
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
    
    snprintf(url, sizeof(url), TARGET_GO_API, ip_str);
    
    esp_http_client_config_t config = {
        .url = url, 
        .method = HTTP_METHOD_GET, 
        .timeout_ms = 5000, 
#if IS_LOCAL_ENV
        .cert_pem = server_cert,
#else
        .crt_bundle_attach = esp_crt_bundle_attach,
#endif
        .skip_cert_common_name_check = SKIP_CERT_CHECK,
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

static const char *server_cert = 
    "-----BEGIN CERTIFICATE-----\n"
    "MIIF0DCCBDigAwIBAgIRAL4NdhbxmFnAoi6O1joRN80wDQYJKoZIhvcNAQELBQAw\n"
    "gf8xHjAcBgNVBAoTFW1rY2VydCBkZXZlbG9wbWVudCBDQTFqMGgGA1UECwxhREVT\n"
    "S1RPUC04UlNEQ1FKXEpSY29tQERFU0tTUEUtOFJTRENRSiAo4LmB4Lif4LiZ4Lic\n"
    "4Lih4LmA4Lib4LmH4LiZ4Lih4Liy4Liq4LmE4Lij4LmA4LiU4Lit4Lij4LmMKTFx\n"
    "MG8GA1UEAwxobWtjZXJ0IERFU0tUT1AtOFJTRENRSlxKUmNvbUBERVNLVE9QLThS\n"
    "U0RDUUogKOC5geC4n+C4meC4nOC4oeC5gOC4m+C5h+C4meC4oeC4suC4quC5hOC4\n"
    "o+C5gOC4lOC4reC4o+C5jCkwHhcNMjYwNjI0MDMxODAzWhcNMzYwNjI0MDMxODAz\n"
    "WjCB/zEeMBwGA1UEChMVbWtjZXJ0IGRldmVsb3BtZW50IENBMWowaAYDVQQLDGFE\n"
    "RVNLVE9QLThSU0RDUUpcSlJjb21AREVTS1RPUC04UlNEQ1FKICjguYHguJ/guJng\n"
    "uJzguKHguYDguJvguYfguJnguKHguLLguKrguYTguKPguYDguJTguK3guKPguYwp\n"
    "MXEwbwYDVQQDDGhta2NlcnQgREVTS1RPUC04UlNEQ1FKXEpSY29tQERFU0tUT1At\n"
    "OFJTRENRSiAo4LmB4Lif4LiZ4Lic4Lih4LmA4Lib4LmH4LiZ4Lih4Liy4Liq4LmE\n"
    "4Lij4LmA4LiU4Lit4Lij4LmMKTCCAaIwDQYJKoZIhvcNAQEBBQADggGPADCCAYoC\n"
    "ggGBALGYNHmJBLqDVPMHc8UUIWhjBsyPg17q4yTsGRq0aQi0Udv0foVrAL3VpAK5\n"
    "VZA8ULRtyTph7nYX/6uVV/u1tPGo2qO2khvVndB68M+im3vD5HmZXl1B+FJ7QxfC\n"
    "/WLzPN7i/HuMLt86eIXBmkZP/LqOYintMjUxekZ1RsRMO7YgRIP8f2DQ6Hvv+L2X\n"
    "Vw19msZI3P2jeJ7uwy0F1MOH5t7PsiXM1/SPCV4xTfVEXHxpb7+XS4TsdlRgUPWY\n"
    "Y9v92g58yRYWmKldX4gdBqevOc1Nwjtj4mPyUnw+TfGAfsbumS8rWaKgK15VRat6\n"
    "d5p7SDSAvFtKReKyi0mM2+F0fFKHoumCaKEdv48vI0nwFHcUIzcZk7gNk12pMOVQ\n"
    "CVDqs1s73/Daxubwu+gB3AKbiELOo8K+7/RnsOo8mLZqVbmWzy5XaFHdBmaskYYK\n"
    "cmGst84p5fz9rtu3ocYhassrxsAI7ylTjPKsYVKa4C3NCtrcYE8WMyozshCg5iFq\n"
    "mMpjVwIDAQABo0UwQzAOBgNVHQ8BAf8EBAMCAgQwEgYDVR0TAQH/BAgwBgEB/wIB\n"
    "ADAdBgNVHQ4EFgQUwMUGOy8ZeNOl6vSOezpnOPBr5TIwDQYJKoZIhvcNAQELBQAD\n"
    "ggGBABP6MAAawnG7MeCWOR16jooZ4lFDS9gJTwNeSCs2Kd6lz9r/lW7dYxG5MbsE\n"
    "pX2gtTvRSUjzqYvN35j8YrZzEUd7zM1C+d+I4cEYkEZWE6gpP5bLqrOS/mdBsoDC\n"
    "ENnOqc4/aXL4nZLevgmijisk/hogWptedna+tr7wLKMYtCHXN7PJugNXwuELBPZX\n"
    "dUY8OlKu6Nv1kDH7C0vMjRoZ6E7GdSDnFYBQwJ5dBAyynZ56nHXa/4CpHyrTkQ1u\n"
    "VN75W4D4xwdgCxonUh0eZnlUfKY8XRdaedHzgvX1/O5sNk+jnVQek2sGZXbxhOYA\n"
    "Apwc4bxtYCdUeOMsCEiwr4n/FGytZE/vO20YD5C16+cniy38YL7R+7v+tXoNP0q8\n"
    "nbrIh1rd92lvkKWK7BuDXm8YT7VglcygqpBVr2d4AkR8mlTRg1IgHwpGwoG76sUD\n"
    "O91u9I6hnyYtNB7cEnww4PnNwrpvlXarqYXRbSd8oVfcc2s7m4twpWKsTUHCVL+T\n"
    "y9Wjyg==\n"
    "-----END CERTIFICATE-----\n";

void restart_mqtt_client(void) {
    // 🔧 กันเคส publish หลุดไปโดนอ้างอิง client ตัวเก่าที่กำลังจะถูกทำลายทิ้ง
    mqtt_connected = false;

    if (mqtt_client != NULL) {
        esp_mqtt_client_stop(mqtt_client);
        esp_mqtt_client_destroy(mqtt_client);
        mqtt_client = NULL;
    }

    const esp_mqtt_client_config_t mqtt_cfg = {
        .broker = {
            .address = {
                // 🟢 บังคับพิมพ์ URL ตรงๆ ไว้ตรงนี้เลย เพื่อป้องกัน NVS ดึงค่าเก่ามาหลอก!
                // .uri = "wss://mqtt.wattanapong.com:443/mqtt", 
                .uri = TARGET_MQTT_URI,
            },
            .verification = {
                .skip_cert_common_name_check = SKIP_CERT_CHECK,       
                .use_global_ca_store = false,             
#if IS_LOCAL_ENV
                // 🔧 local ใช้ cert ที่ mosquitto เซ็นเอง (self-signed) โดยตรง
                // เพราะ CA bundle สาธารณะของ ESP-IDF ไม่รู้จัก cert ตัวนี้แน่นอน
                .certificate = server_cert,
#else
                .crt_bundle_attach = esp_crt_bundle_attach, 
#endif
            },
        },
        .credentials = {
            .username = "kws",
            .authentication = {
                .password = "kws123",
            },
        },
        .session = { 
            .keepalive = 30,
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
    
    if (load_wifi_from_nvs(saved_ssid, sizeof(saved_ssid), saved_pass, sizeof(saved_pass))) {
        ESP_LOGI(TAG, "กำลังพยายามเชื่อมต่อ %s อีกครั้งตามคำสั่งจากหน้าเว็บ...", saved_ssid);
        connect_to_sta(saved_ssid, saved_pass);
    } else {
        ESP_LOGW(TAG, "ไม่พบประวัติ Wi-Fi ในระบบ ไม่สามารถ Reconnect ได้");
    }
}

// ==========================================
// 🔧 SNTP: sync เวลาให้ ESP32 รู้วันที่ปัจจุบัน
// (ESP32 ไม่มีแบตสำรอง RTC พอบูตใหม่นาฬิกาจะรีเซ็ตไปปี 1970
//  ถ้าไม่ sync เวลาก่อน การตรวจสอบ cert ที่มีวันหมดอายุจะ fail เสมอ)
// ==========================================
static void sync_time_via_sntp(void) {
    ESP_LOGI(TAG, "กำลังขอเวลาจาก NTP server...");
    esp_sntp_setoperatingmode(ESP_SNTP_OPMODE_POLL);
    esp_sntp_setservername(0, "pool.ntp.org");
    esp_sntp_setservername(1, "time.google.com");
    esp_sntp_init();

    time_t now = 0;
    int retry = 0;
    const int max_retry = 20; // รอสูงสุดประมาณ 10 วินาที
    // 1700000000 ~ พ.ย. 2023 ใช้เป็นเกณฑ์คร่าวๆ ว่าเวลาเริ่มสมเหตุสมผลแล้ว (ไม่ใช่ปี 1970)
    while (retry < max_retry) {
        time(&now);
        if (now > 1700000000) {
            ESP_LOGI(TAG, "✓ Sync เวลาสำเร็จ: %lld", (long long)now);
            return;
        }
        retry++;
        vTaskDelay(500 / portTICK_PERIOD_MS);
    }
    ESP_LOGW(TAG, "⚠️ Sync เวลาไม่สำเร็จภายในเวลาที่กำหนด (การเชื่อมต่อ TLS อาจ verify cert ไม่ผ่าน)");
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
                    ESP_LOGE(TAG, "หา Wi-Fi ไม่เจอ! เปิดฮอตสปอต (AP) และเตรียมเรดาร์ (STA) รอคนมาตั้งค่า...");
                    esp_wifi_set_mode(WIFI_MODE_APSTA); 
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
        
        esp_wifi_set_mode(WIFI_MODE_STA);
        sync_time_via_sntp(); // 🔧 sync เวลาก่อนต่อ TLS ทุกครั้ง (ทั้ง HTTPS API และ MQTT) กัน cert verify fail เพราะนาฬิกาเพี้ยน

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

    // 🌟 โครงสร้างใหม่ที่รอรับค่าจากตัวแปรไดนามิก
    wifi_config_t wifi_ap_config = {
        .ap = {
            .channel = AP_CHANNEL,
            .max_connection = AP_MAX_CONN,
            .authmode = WIFI_AUTH_WPA2_PSK,
        },
    };
    
    // 🌟 คัดลอกข้อความจากตัวแปรไดนามิกลงไป
    strncpy((char*)wifi_ap_config.ap.ssid, ap_ssid_dynamic, sizeof(wifi_ap_config.ap.ssid) - 1);
    wifi_ap_config.ap.ssid_len = strlen(ap_ssid_dynamic);
    strncpy((char*)wifi_ap_config.ap.password, ap_password_dynamic, sizeof(wifi_ap_config.ap.password) - 1);

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_APSTA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &wifi_ap_config));

    char saved_ssid[33] = {0};
    char saved_pass[64] = {0};
    if (load_wifi_from_nvs(saved_ssid, sizeof(saved_ssid), saved_pass, sizeof(saved_pass))) {
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
    
    if (!chunk_buf || !raw_buf) { 
        free(chunk_buf); free(raw_buf); vTaskDelete(NULL); return; 
    }
    
    uint32_t chunk_seq = 0;
    bool led_state = false;

    while (1) {
        // 1. ดึงเสียงจากไมค์ (ถ้าไมค์ไม่มีข้อมูล CPU จะหยุดรอตรงนี้ ไม่กินโหลด)
        esp_err_t ret = i2s_read(I2S_PORT, raw_buf, AUDIO_CHUNK_SAMPLES * sizeof(int32_t), &bytes_read, portMAX_DELAY);
        
        if (ret == ESP_OK && bytes_read > 0 && mqtt_connected) {
            int num_samples = (int)(bytes_read / sizeof(int32_t));
            for (int i = 0; i < num_samples; i++) { 
                chunk_buf[i] = (int16_t)(raw_buf[i] >> 16); 
            }
            
            // 🌟 2. ส่งเสียง และเช็กว่า "ท่อตัน" หรือไม่?
            int msg_id = esp_mqtt_client_publish(mqtt_client, mqtt_topic_dynamic, (const char *)chunk_buf, num_samples * sizeof(int16_t), 0, 0);
            
            if (msg_id == -1) {
                // ⚠️ ถ้าท่อตัน (Network ส่งไม่ทัน) ให้เบรก! พักให้ LwIP ได้เคลียร์ข้อมูลเก่า 50ms
                // วิธีนี้จะป้องกันอาการ Buffer Overflow และลด Error transport_poll_write ได้ 99%
                vTaskDelay(pdMS_TO_TICKS(50));
            }
            
            chunk_seq++;
            
            if (chunk_seq % 4 == 0) {
                led_state = !led_state; 
                set_record_led(led_state ? 1 : 0);
            }

            // 🌟 3. เปลี่ยน QoS จาก 1 เป็น 0 เพื่อไม่ให้มันบล็อกการสตรีมเสียง!
            if (chunk_seq % 50 == 0) { 
                esp_mqtt_client_publish(mqtt_client, status_topic_dynamic, "online", 6, 0, 1); 
            }
            
            // 🌟 4. ให้ CPU ถอนหายใจ 1 Tick เผื่อให้ Task อื่นได้แทรกมาทำงาน (รวมถึง MQTT)
            vTaskDelay(1);
            
        } else {
            set_record_led(0);
            // 🌟 5. กันเหนียว: ถ้าไม่ได้ต่อเน็ต หรือ i2s พัง ต้องหน่วงเวลาไว้ด้วย
            // ไม่งั้นมันจะวิ่ง while(1) แบบ 100% CPU จนบอร์ดค้าง
            vTaskDelay(pdMS_TO_TICKS(50));
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
   
    snprintf(ap_ssid_dynamic, sizeof(ap_ssid_dynamic), "Smartvoice-%02X%02X%02X", mac[3], mac[4], mac[5]);
    snprintf(ap_password_dynamic, sizeof(ap_password_dynamic), "SV_%02X%02X%02X", mac[0], mac[1], mac[2]);
    
    ESP_LOGI(TAG, "🟢 กำหนด SoftAP SSID: %s", ap_ssid_dynamic);
    ESP_LOGI(TAG, "🟢 กำหนด SoftAP Password: %s", ap_password_dynamic);

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

// งานยิบย่อย ไม่ต้องรีบมาก ปรับลดลงมาเหลือ Priority 2
    xTaskCreate(system_monitor_task, "monitor", 2048, NULL, 2, NULL);
    xTaskCreate(reset_button_task, "reset_button", 2048, NULL, 2, NULL);
    xTaskCreate(captive_dns_task, "captive_dns", 2048, NULL, 2, NULL);
    
    // 🌟 งานเสียง (หัวใจหลัก) ตั้งไว้ที่ 5 เหมือนเดิม
    // เพื่อให้มันเด่นกว่างานอื่น และมีลู่ทางทำงานร่วมกับ MQTT Task ได้ดีขึ้น
    xTaskCreate(audio_record_task, "audio_record", 4096, NULL, 5, NULL);
}
