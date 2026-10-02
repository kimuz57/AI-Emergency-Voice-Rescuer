#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "freertos/semphr.h"
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
#include <unistd.h>
#include "lwip/sockets.h"

// 🔐 MQTT credentials อยู่ใน main/secrets.h (gitignored) — ดูแม่แบบที่ main/secrets.h.example
#if defined(__has_include)
#if !__has_include("secrets.h")
#error "firmwareV2/main/secrets.h is missing: copy main/secrets.h.example to main/secrets.h and fill in the MQTT credentials"
#endif
#endif
#include "secrets.h"

// ==========================================
// 🌍 Environment: แก้ที่ DEPLOY_ENV บรรทัดเดียว คุมทั้ง Go API, MQTT broker,
//    credentials และลิงก์ register-patient ที่หน้า provisioning (web_server.h)
// ==========================================
#define ENV_LOCAL   1
#define ENV_SERVER  2
#define ENV_LAB     3

#define DEPLOY_ENV  ENV_SERVER

#if DEPLOY_ENV == ENV_LOCAL

    #define TARGET_GO_API "http://192.168.1.109:8080/api/device/checkin?mac=%s&ip=%s"
    #define TARGET_MQTT_URI "ws://192.168.1.109:9001/mqtt"
    #define SKIP_CERT_CHECK true
    #define GO_API_USE_CRT_BUNDLE 0
    #define MQTT_USERNAME MQTT_USER_LOCAL
    #define MQTT_PASSWORD MQTT_PASS_LOCAL
    #define SERVER_URL "https://s8449mbs-3000.asse.devtunnels.ms/register-patient?mac=%s"

#elif DEPLOY_ENV == ENV_SERVER

    #define TARGET_GO_API "https://kwsb.wattanapong.com/api/device/checkin?mac=%s&ip=%s"
    #define TARGET_MQTT_URI "wss://mqtt.wattanapong.com:443/mqtt"
    #define SKIP_CERT_CHECK false
    #define GO_API_USE_CRT_BUNDLE 1
    #define MQTT_USERNAME MQTT_USER_SERVER
    #define MQTT_PASSWORD MQTT_PASS_SERVER
    #define SERVER_URL "https://kws.wattanapong.com/register-patient?mac=%s"

#elif DEPLOY_ENV == ENV_LAB

    #define TARGET_GO_API "http://10.151.202.101:8080/api/device/checkin?mac=%s&ip=%s"
    #define TARGET_MQTT_URI "ws://10.151.202.101:9001/mqtt"
    #define SKIP_CERT_CHECK true
    #define GO_API_USE_CRT_BUNDLE 0
    #define MQTT_USERNAME MQTT_USER_LAB
    #define MQTT_PASSWORD MQTT_PASS_LAB
    // เดิม web_server.h ใช้ลิงก์ devtunnels กับทุกค่าที่ไม่ใช่ 0 จึงคงไว้แบบเดียวกัน
    #define SERVER_URL "https://s8449mbs-3000.asse.devtunnels.ms/register-patient?mac=%s"

#else
    #error "Unknown Environment"
#endif

#include "web_server.h"

static const char *TAG = "VOICE_RECORDER";
static int s_retry_num = 0;
#define WIFI_MAXIMUM_RETRY 5

#define I2S_PORT I2S_NUM_0
#define I2S_SAMPLE_RATE 8000
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
#define AP_CHANNEL     1
#define AP_MAX_CONN    4

#define RESET_BUTTON_PIN 13

char mqtt_topic_dynamic[128] = "voice/audio/";
char status_topic_dynamic[128] = "device/status/";
char angle_topic_dynamic[128] = "voice/angle/";
char device_mac_str[18] = {0};
char mqtt_broker_uri_dynamic[128] = "wss://mqtt.wattanapong.com:443/mqtt";
char ap_ssid_dynamic[32] = {0};
char ap_password_dynamic[64] = {0};

#define AUDIO_CHUNK_SAMPLES 1024    
#define I2S_DMA_BUF_LEN     1024   

// ==========================================
// 🎯 TDOA (Time Difference of Arrival) config
// ==========================================
#define MIC_DISTANCE_M       0.10f   // ระยะห่างไมค์ซ้าย-ขวา (เมตร) แก้เป็นระยะจริงที่ติดตั้ง
#define SPEED_OF_SOUND_MPS   343.0f  // ความเร็วเสียงในอากาศ (m/s)
// ผลต่างเวลาสูงสุดที่เป็นไปได้ (sample) = ceil(MIC_DISTANCE_M / SPEED_OF_SOUND_MPS * I2S_SAMPLE_RATE) + เผื่อ 1
// คำนวณตอน compile จากค่าด้านบน แก้ MIC_DISTANCE_M แล้วค่านี้ตามเอง (0.10 m @ 8kHz -> ceil(2.33)+1 = 4)
#define TDOA_MAX_DELAY_SAMPLES_F  (MIC_DISTANCE_M * (float)I2S_SAMPLE_RATE / SPEED_OF_SOUND_MPS)
#define TDOA_MAX_LAG_SAMPLES      ((int)TDOA_MAX_DELAY_SAMPLES_F + \
                                   (((float)(int)TDOA_MAX_DELAY_SAMPLES_F < TDOA_MAX_DELAY_SAMPLES_F) ? 1 : 0) + 1)
_Static_assert(TDOA_MAX_LAG_SAMPLES >= 1 && 2 * TDOA_MAX_LAG_SAMPLES < AUDIO_CHUNK_SAMPLES,
               "TDOA_MAX_LAG_SAMPLES out of range: check MIC_DISTANCE_M / I2S_SAMPLE_RATE");
// 🔇 Energy gate: ถ้าพลังงานเสียง (variance ต่อ sample, หน่วย LSB^2 ของ sample 16-bit) ของช่อง L หรือ R
// ต่ำกว่าค่านี้ จะไม่คำนวณ/ไม่ส่งมุม (ช่วงเงียบ correlation ไม่มีความหมาย และเคยส่ง -90.0 ทุก chunk)
// 100 ≈ RMS 10 LSB ≈ -70 dBFS (เหนือ noise floor ของ INMP441 แต่ต่ำกว่าเสียงพูดปกติ) ปรับตามหน้างานจริงได้
#define TDOA_MIN_ENERGY      100.0f
#ifndef M_PI
#define M_PI 3.14159265358979323846f
#endif

static esp_mqtt_client_handle_t mqtt_client = NULL;
// 🔒 ป้องกัน audio_record_task() publish ด้วย handle ที่ restart_mqtt_client() กำลัง destroy
static SemaphoreHandle_t s_mqtt_mutex = NULL;
static volatile bool mqtt_connected = false;

// 📶 SSID/รหัส Wi-Fi ที่ผู้ใช้เพิ่งกรอก: เก็บใน RAM ก่อน จะบันทึกลง NVS ก็ต่อเมื่อได้ IP แล้วเท่านั้น
static char s_pending_ssid[33] = {0};
static char s_pending_pass[65] = {0};
static bool s_pending_creds = false;
static portMUX_TYPE s_pending_mux = portMUX_INITIALIZER_UNLOCKED;

static bool s_sntp_started = false;   // เรียก esp_sntp_init() แค่ครั้งเดียว

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
static volatile int s_softap_led_level = 0;   // สถานะล่าสุดที่ระบบสั่งไฟ SoftAP (ใช้คืนค่าหลังกระพริบแบบ async)
void set_softap_led(int state) { s_softap_led_level = state; gpio_set_level(SOFTAP_LED_PIN, state); } // 🟢 เพิ่มฟังก์ชันควบคุมไฟ SoftAP

void blink_led(int pin, int count) {
    for (int i = 0; i < count; i++) {
        gpio_set_level(pin, 1); vTaskDelay(300 / portTICK_PERIOD_MS);
        gpio_set_level(pin, 0); vTaskDelay(300 / portTICK_PERIOD_MS);
    }
}

// 💡 กระพริบไฟแบบไม่บล็อก: ใช้จาก event handler (Wi-Fi/MQTT) ที่ห้ามหน่วงเวลา
// สร้าง task สั้นๆ กระพริบ count ครั้ง แล้วตั้งไฟค้างไว้ที่ final_level ก่อนจบ
static void blink_led_task(void *pvParameters) {
    uintptr_t packed = (uintptr_t)pvParameters;
    int pin = (int)(packed & 0xFF);
    int count = (int)((packed >> 8) & 0xFF);
    int final_level = (int)((packed >> 16) & 0x1);
    blink_led(pin, count);
    // ไฟ SoftAP: คืนสถานะล่าสุดที่ระบบสั่ง (เช่น ได้ IP แล้วสั่งดับระหว่างกระพริบ) แทนค่าตอนเริ่มกระพริบ
    if (pin == SOFTAP_LED_PIN) final_level = s_softap_led_level;
    gpio_set_level(pin, final_level);
    vTaskDelete(NULL);
}

static void blink_led_async(int pin, int count, int final_level) {
    uintptr_t packed = ((uintptr_t)(pin & 0xFF)) | ((uintptr_t)(count & 0xFF) << 8) | ((uintptr_t)(final_level & 0x1) << 16);
    if (xTaskCreate(blink_led_task, "blink_led", 2048, (void *)packed, 2, NULL) != pdPASS) {
        gpio_set_level(pin, final_level);   // RAM ไม่พอสร้าง task ก็แค่ข้ามการกระพริบ
    }
}

static void kwsapi_task(void *pvParameters) {
    char *ip_str = (char *)pvParameters;
    char url[128];
    
    snprintf(url, sizeof(url), TARGET_GO_API, device_mac_str, ip_str);
    
    esp_http_client_config_t config = {
        .url = url, 
        .method = HTTP_METHOD_GET, 
        .timeout_ms = 5000, 
#if GO_API_USE_CRT_BUNDLE
        .crt_bundle_attach = esp_crt_bundle_attach,
#endif
        //.skip_cert_common_name_check = SKIP_CERT_CHECK,
    };
    
    esp_http_client_handle_t client = esp_http_client_init(&config);
    
    // 👇 [สำคัญมาก!] เพิ่ม Header นี้ เพื่อข้ามหน้าจอแจ้งเตือนของ MS Dev Tunnels 👇
    esp_http_client_set_header(client, "X-Tunnel-Skip-AntiPhishing-Page", "true");
    
    // หลังจากเซ็ต Header แล้วค่อยสั่ง perform
    if (esp_http_client_perform(client) == ESP_OK) {
        // แนะนำให้ลอง log HTTP Status Code ออกมาดูด้วยครับ จะได้ชัวร์ว่าได้ 200 OK หรือไม่
        int status_code = esp_http_client_get_status_code(client);
        ESP_LOGI(TAG, "✓ เรียก API สำเร็จ (ส่ง IP: %s) Status: %d", ip_str, status_code);
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
        blink_led_async(RECORD_LED_PIN, 3, 0);
    } else if (event->event_id == MQTT_EVENT_DISCONNECTED) {
        ESP_LOGW(TAG, "MQTT Broker หลุดจากการเชื่อมต่อ");
        mqtt_connected = false;
        set_record_led(0);
    }
}

void restart_mqtt_client(void) {
    // 🔒 ถือ mutex ตลอดช่วง stop/destroy/create เพื่อให้ audio_record_task() ไม่ publish ด้วย handle ที่ถูก free ไปแล้ว
    xSemaphoreTake(s_mqtt_mutex, portMAX_DELAY);

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
                // 🟢 broker ถูกกำหนดตอน build (TARGET_MQTT_URI ตาม DEPLOY_ENV) ไม่ใช้ค่า mqtt_uri ใน NVS
                .uri = TARGET_MQTT_URI,
            },
            .verification = {
                .crt_bundle_attach = esp_crt_bundle_attach,
                .skip_cert_common_name_check = SKIP_CERT_CHECK,
            },
        },
        .credentials = {
            .username = MQTT_USERNAME,
            .authentication = {
                .password = MQTT_PASSWORD,
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
    if (mqtt_client != NULL) {
        esp_mqtt_client_register_event(mqtt_client, ESP_EVENT_ANY_ID, mqtt_event_handler, NULL);
        esp_mqtt_client_start(mqtt_client);
    } else {
        ESP_LOGE(TAG, "❌ สร้าง MQTT client ไม่สำเร็จ");
    }

    xSemaphoreGive(s_mqtt_mutex);
}

// ==========================================
// Wi-Fi (AP + STA Coexistence)
// ==========================================

// คัดลอก SSID/รหัสลง wifi_config_t ได้เต็มขนาด field (SSID 32, รหัส 64) โดยไม่ตัดตัวสุดท้ายทิ้ง
// (field ไม่จำเป็นต้องมี '\0' ปิดท้ายถ้ายาวเต็ม field และ config ถูก zero ไว้แล้ว)
static void fill_sta_config(wifi_config_t *cfg, const char *ssid, const char *password) {
    memcpy(cfg->sta.ssid, ssid, strnlen(ssid, sizeof(cfg->sta.ssid)));
    memcpy(cfg->sta.password, password, strnlen(password, sizeof(cfg->sta.password)));
    cfg->sta.threshold.authmode = WIFI_AUTH_WPA_WPA2_PSK;
}

void connect_to_sta(const char* ssid, const char* password) {
    esp_wifi_set_mode(WIFI_MODE_APSTA);

    wifi_config_t wifi_sta_config = {0};
    fill_sta_config(&wifi_sta_config, ssid, password);
    
    ESP_LOGI(TAG, "กำลังพยายามเชื่อมต่อ WiFi: %s", ssid);
    
    esp_wifi_disconnect();
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_sta_config));

    // 📝 ยังไม่บันทึกลง NVS: เก็บไว้ใน RAM ก่อน แล้วค่อยบันทึกตอนได้ IP (IP_EVENT_STA_GOT_IP)
    taskENTER_CRITICAL(&s_pending_mux);
    memset(s_pending_ssid, 0, sizeof(s_pending_ssid));
    memset(s_pending_pass, 0, sizeof(s_pending_pass));
    memcpy(s_pending_ssid, ssid, strnlen(ssid, sizeof(s_pending_ssid) - 1));
    memcpy(s_pending_pass, password, strnlen(password, sizeof(s_pending_pass) - 1));
    s_pending_creds = true;
    taskEXIT_CRITICAL(&s_pending_mux);

    s_retry_num = 0; 
    esp_wifi_connect();
}
    
// เรียกตอนได้ IP แล้วเท่านั้น: ถ้ามี SSID/รหัสที่เพิ่งกรอกค้างอยู่ใน RAM ให้บันทึกลง NVS
static void persist_pending_wifi_creds(void) {
    char ssid[sizeof(s_pending_ssid)];
    char pass[sizeof(s_pending_pass)];
    bool has_pending;

    taskENTER_CRITICAL(&s_pending_mux);
    has_pending = s_pending_creds;
    memcpy(ssid, s_pending_ssid, sizeof(ssid));
    memcpy(pass, s_pending_pass, sizeof(pass));
    s_pending_creds = false;
    memset(s_pending_pass, 0, sizeof(s_pending_pass));
    taskEXIT_CRITICAL(&s_pending_mux);

    if (has_pending) {
        save_wifi_to_nvs(ssid, pass);
    }
    memset(pass, 0, sizeof(pass));
}

void trigger_wifi_reconnect(void) {
    char saved_ssid[33] = {0};
    char saved_pass[65] = {0};
    
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
    
    // 🟢 เพิ่ม Server ของไทย และ Google เข้าไปให้จับสัญญาณง่ายขึ้น
    // (ถ้า CONFIG_LWIP_SNTP_MAX_SERVERS = 1 ใน sdkconfig จะใช้แค่ server ลำดับ 0)
    esp_sntp_setservername(0, "th.pool.ntp.org");
    esp_sntp_setservername(1, "time.google.com");
    esp_sntp_setservername(2, "pool.ntp.org");
    esp_sntp_init();

    time_t now = 0;
    int retry = 0;
    
    // 🟢 เพิ่มเวลารอเป็น 60 รอบ (30 วินาที)
    const int max_retry = 60; 
    
    while (retry < max_retry) {
        time(&now);
        if (now > 1700000000) {
            ESP_LOGI(TAG, "✓ Sync เวลาสำเร็จ: %lld", (long long)now);
            return;
        }
        retry++;
        vTaskDelay(500 / portTICK_PERIOD_MS);
    }
    ESP_LOGW(TAG, "⚠️ Sync เวลาไม่สำเร็จ! บังคับยิง API ต่อ แต่อาจจะติดเรื่อง Cert");
}

// 🌐 งานหลังได้ IP: ทำใน task แยก เพื่อไม่ให้ event loop ค้างระหว่างรอ SNTP (สูงสุด 30 วินาที)
// หรือระหว่าง stop/start MQTT client
typedef struct {
    char ip_str[16];
    bool need_sntp;
} network_up_args_t;

static void network_up_task(void *pvParameters) {
    network_up_args_t *args = (network_up_args_t *)pvParameters;

    if (args->need_sntp) {
        sync_time_via_sntp(); // 🔧 sync เวลาก่อนต่อ TLS (ทั้ง HTTPS API และ MQTT) กัน cert verify fail เพราะนาฬิกาเพี้ยน
    }

    trigger_kwsapi_website(args->ip_str);
    restart_mqtt_client();

    free(args);
    vTaskDelete(NULL);
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
                // 🟢 ให้ไฟ AP กระพริบดีใจเวลามีคนเอามือถือมาเชื่อม แล้วค้างไฟไว้ (ไม่บล็อก event loop)
                set_softap_led(1);
                blink_led_async(SOFTAP_LED_PIN, 3, 1);
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
        
        s_retry_num = 0;               // ต่อติดแล้ว: เริ่มนับ retry ใหม่สำหรับการหลุดครั้งถัดไป
        persist_pending_wifi_creds();  // รหัสใช้ได้จริงแล้ว ค่อยบันทึกลง NVS

        // 🟢 ต่อ Wi-Fi บ้านสำเร็จแล้ว ให้ปิดไฟ SoftAP และเปิดไฟสถานะระบบ
        set_softap_led(0);
        set_status_led(1);
        
        esp_wifi_set_mode(WIFI_MODE_STA);

        network_up_args_t *args = (network_up_args_t *)calloc(1, sizeof(network_up_args_t));
        if (args == NULL) {
            ESP_LOGE(TAG, "❌ RAM ไม่พอสำหรับงานหลังได้ IP");
            return;
        }
        memcpy(args->ip_str, ip_str, sizeof(args->ip_str));   // ip_str[16] ปิดด้วย '\0' จาก esp_ip4addr_ntoa แล้ว
        args->ip_str[sizeof(args->ip_str) - 1] = '\0';
        args->need_sntp = !s_sntp_started;   // SNTP ถูก init ครั้งเดียว ครั้งต่อไปนาฬิกาเดินต่อเองแล้ว
        if (xTaskCreate(network_up_task, "network_up", 4096, args, 5, NULL) == pdPASS) {
            s_sntp_started = true;
        } else {
            ESP_LOGE(TAG, "❌ สร้าง task network_up ไม่สำเร็จ");
            free(args);
        }
    }
}

void init_wifi() {
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    esp_netif_create_default_wifi_ap();
    esp_netif_create_default_wifi_sta();

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
    char saved_pass[65] = {0};
    if (load_wifi_from_nvs(saved_ssid, sizeof(saved_ssid), saved_pass, sizeof(saved_pass))) {
        wifi_config_t wifi_sta_config = {0};
        fill_sta_config(&wifi_sta_config, saved_ssid, saved_pass);
        
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
    // 🎤🎤 โหมด stereo: อ่านไมค์ 2 ตัวพร้อมกันจาก I2S บัสเดียว (sync กันระดับ hardware โดยอัตโนมัติ)
    // วิธีต่อสาย: SD ของไมค์ทั้งสองตัวต่อเข้า DIN_PIN เส้นเดียวกัน (ใช้ tri-state สลับกันเอง)
    //   ไมค์ซ้าย (L): ขา L/R ต่อ GND
    //   ไมค์ขวา (R): ขา L/R ต่อ 3.3V
    //   BCK/WS ใช้เส้นร่วมกันทั้งคู่ตามเดิม
    i2s_config_t i2s_config = {
        .mode = I2S_MODE_MASTER | I2S_MODE_RX, .sample_rate = I2S_SAMPLE_RATE, .bits_per_sample = I2S_BITS_PER_SAMPLE,
        .channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT, .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1, .dma_buf_count = 8, .dma_buf_len = I2S_DMA_BUF_LEN,
        .use_apll = true, .tx_desc_auto_clear = false, .fixed_mclk = 0
    };
    i2s_pin_config_t pin_config = { .bck_io_num = I2S_SCK_PIN, .ws_io_num = I2S_WS_PIN, .data_out_num = I2S_DOUT_PIN, .data_in_num = I2S_DIN_PIN };
    ESP_ERROR_CHECK(i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL));
    ESP_ERROR_CHECK(i2s_set_pin(I2S_PORT, &pin_config));
}

// ==========================================
// 🎯 TDOA: หาผลต่างเวลา (τ) ระหว่างไมค์ซ้าย-ขวา ด้วย cross-correlation ช่วงแคบ
// (แคบเพราะระยะไมค์ใกล้กัน ผลต่างเวลาสูงสุดมีแค่ไม่กี่ sample เท่านั้น เลยเบาเครื่องมาก
//  ประมาณ (2*TDOA_MAX_LAG_SAMPLES+1) * n การคูณ-บวก ต่อ 1 ก้อนเสียง)
// ==========================================
static float compute_tdoa_seconds(const int16_t *left, const int16_t *right, int n) {
    int best_lag = 0;
    float best_score = -1e18f;
    float corr_at[2 * TDOA_MAX_LAG_SAMPLES + 1];

    for (int lag = -TDOA_MAX_LAG_SAMPLES; lag <= TDOA_MAX_LAG_SAMPLES; lag++) {
        int64_t sum = 0;
        int start = (lag >= 0) ? lag : 0;
        int end   = (lag >= 0) ? n : n + lag;
        for (int i = start; i < end; i++) {
            sum += (int32_t)left[i] * (int32_t)right[i - lag];
        }
        float score = (float)sum;
        corr_at[lag + TDOA_MAX_LAG_SAMPLES] = score;
        if (score > best_score) {
            best_score = score;
            best_lag = lag;
        }
    }

    // 🌟 Parabolic interpolation รอบจุดพีค เพื่อความละเอียดระดับ sub-sample
    // (ไม่งั้นมุมจะกระโดดเป็นขั้นๆ หยาบมาก เพราะมี lag ให้เลือกแค่ไม่กี่ค่า)
    float frac = 0.0f;
    if (best_lag > -TDOA_MAX_LAG_SAMPLES && best_lag < TDOA_MAX_LAG_SAMPLES) {
        float c_minus = corr_at[best_lag - 1 + TDOA_MAX_LAG_SAMPLES];
        float c_0     = corr_at[best_lag     + TDOA_MAX_LAG_SAMPLES];
        float c_plus  = corr_at[best_lag + 1 + TDOA_MAX_LAG_SAMPLES];
        float denom = (c_minus - 2.0f * c_0 + c_plus);
        if (fabsf(denom) > 1e-6f) {
            frac = 0.5f * (c_minus - c_plus) / denom;
        }
    }

    float lag_samples = (float)best_lag + frac;
    return lag_samples / (float)I2S_SAMPLE_RATE;  // τ หน่วยวินาที
}

// แปลง τ (วินาที) เป็นมุมทิศทาง (องศา) : 0 = ตรงหน้า (broadside), ค่าบวก = เอียงไปทางขวา, ค่าลบ = เอียงไปทางซ้าย
// ⚠️ เครื่องหมาย (+/-) ขึ้นกับลำดับช่อง L/R จริงตอนต่อสาย ทดสอบแล้วถ้ากลับด้าน ใส่ - นำหน้า asinf() ได้เลย
static float tdoa_to_angle_deg(float tau_seconds) {
    float ratio = (SPEED_OF_SOUND_MPS * tau_seconds) / MIC_DISTANCE_M;
    if (ratio > 1.0f)  ratio = 1.0f;
    if (ratio < -1.0f) ratio = -1.0f;
    return asinf(ratio) * 180.0f / (float)M_PI;
}

void audio_record_task(void *pvParameters) {
    size_t bytes_read = 0;

    // 🎤🎤 raw_buf ตอนนี้เก็บข้อมูล stereo แบบ interleave (L,R,L,R,...)
    // เลยต้องอ่านทีละ 2 เท่าของจำนวน sample ต่อช่องที่ต้องการ
    int16_t *chunk_buf  = (int16_t *)malloc(AUDIO_CHUNK_SAMPLES * sizeof(int16_t));   // มิกซ์แล้วเหลือช่องเดียว (mono) ขนาดเท่าเดิม ไม่เพิ่ม bandwidth
    int16_t *left_buf   = (int16_t *)malloc(AUDIO_CHUNK_SAMPLES * sizeof(int16_t));
    int16_t *right_buf  = (int16_t *)malloc(AUDIO_CHUNK_SAMPLES * sizeof(int16_t));
    int32_t *raw_buf    = (int32_t *)malloc(AUDIO_CHUNK_SAMPLES * 2 * sizeof(int32_t));

    if (!chunk_buf || !left_buf || !right_buf || !raw_buf) {
        free(chunk_buf); free(left_buf); free(right_buf); free(raw_buf);
        vTaskDelete(NULL); return;
    }

    uint32_t chunk_seq = 0;
    bool led_state = false;

    while (1) {
        // 1. ดึงเสียงจากไมค์ 2 ตัว (ถ้าไมค์ไม่มีข้อมูล CPU จะหยุดรอตรงนี้ ไม่กินโหลด)
        esp_err_t ret = i2s_read(I2S_PORT, raw_buf, AUDIO_CHUNK_SAMPLES * 2 * sizeof(int32_t), &bytes_read, portMAX_DELAY);

        if (ret == ESP_OK && bytes_read > 0 && mqtt_connected) {
            int num_frames = (int)(bytes_read / (2 * sizeof(int32_t)));   // จำนวน sample ต่อช่อง (L หรือ R)

            // 2. แยกช่อง L/R ออกจากกัน แล้วมิกซ์รวมเป็น mono ไปในตัวเลย
            // ⚠️ ถ้าเทียบกับของจริงแล้ว L/R สลับกัน ให้สลับ index [2*i] กับ [2*i+1] ตรงนี้
            int64_t sum_l = 0, sum_r = 0, sq_l = 0, sq_r = 0;   // สำหรับ energy gate
            for (int i = 0; i < num_frames; i++) {
                int16_t l = (int16_t)(raw_buf[2 * i]     >> 16);
                int16_t r = (int16_t)(raw_buf[2 * i + 1] >> 16);
                left_buf[i]  = l;
                right_buf[i] = r;
                chunk_buf[i] = (int16_t)(((int32_t)l + (int32_t)r) / 2);   // มิกซ์ดาวน์เป็นเสียงเดียว
                sum_l += l; sq_l += (int32_t)l * l;
                sum_r += r; sq_r += (int32_t)r * r;
            }

            // 3. คำนวณทิศทางเสียงจากผลต่างเวลา (TDOA) — คำนวณจาก L/R ก่อนที่จะถูกมิกซ์ทิ้ง
            // 🔇 ข้ามถ้าช่องใดช่องหนึ่งเงียบเกินไป (variance < TDOA_MIN_ENERGY) หรือ chunk สั้นกว่าช่วง lag
            bool angle_valid = false;
            float angle_deg = 0.0f;
            if (num_frames > 2 * TDOA_MAX_LAG_SAMPLES) {
                float n = (float)num_frames;
                float mean_l = (float)sum_l / n, mean_r = (float)sum_r / n;
                float energy_l = (float)sq_l / n - mean_l * mean_l;
                float energy_r = (float)sq_r / n - mean_r * mean_r;
                if (energy_l >= TDOA_MIN_ENERGY && energy_r >= TDOA_MIN_ENERGY) {
                    float tau = compute_tdoa_seconds(left_buf, right_buf, num_frames);
                    angle_deg = tdoa_to_angle_deg(tau);
                    angle_valid = true;
                }
            }

            char angle_payload[16];
            int angle_len = 0;
            if (angle_valid) {
                angle_len = snprintf(angle_payload, sizeof(angle_payload), "%.1f", angle_deg);
            }

            chunk_seq++;
            bool send_status = (chunk_seq % 50 == 0);
            bool network_busy = false;

            // 🔒 publish ภายใต้ mutex เดียวกับ restart_mqtt_client() และเช็ก handle/สถานะซ้ำหลังได้ lock
            xSemaphoreTake(s_mqtt_mutex, portMAX_DELAY);
            if (mqtt_client != NULL && mqtt_connected) {
                // 🌟 4. ส่งเสียง (mono เท่านั้น ขนาดเท่าเดิมกับตอนไมค์เดียว) และเช็กว่า "ท่อตัน" หรือไม่?
                int msg_id = esp_mqtt_client_publish(mqtt_client, mqtt_topic_dynamic, (const char *)chunk_buf, num_frames * sizeof(int16_t), 0, 0);
                network_busy = (msg_id == -1);

                // 🌟 5. ส่งมุมทิศทางแยก topic ต่างหาก (payload เล็กมาก ไม่กระทบ bandwidth) เฉพาะ chunk ที่มีเสียงพอ
                if (angle_valid && angle_len > 0 && angle_len < (int)sizeof(angle_payload)) {
                    esp_mqtt_client_publish(mqtt_client, angle_topic_dynamic, angle_payload, angle_len, 0, 0);
                }

                // 🌟 6. เปลี่ยน QoS จาก 1 เป็น 0 เพื่อไม่ให้มันบล็อกการสตรีมเสียง!
                if (send_status) {
                    esp_mqtt_client_publish(mqtt_client, status_topic_dynamic, "online", 6, 0, 1);
                }
            }
            xSemaphoreGive(s_mqtt_mutex);

            if (network_busy) {
                // ⚠️ ถ้าท่อตัน (Network ส่งไม่ทัน) ให้เบรก! พักให้ LwIP ได้เคลียร์ข้อมูลเก่า 50ms
                // วิธีนี้จะป้องกันอาการ Buffer Overflow และลด Error transport_poll_write ได้ 99%
                vTaskDelay(pdMS_TO_TICKS(50));
            }

            if (chunk_seq % 4 == 0) {
                led_state = !led_state; 
                set_record_led(led_state ? 1 : 0);
            }
            
            // 🌟 7. ให้ CPU ถอนหายใจ 1 Tick เผื่อให้ Task อื่นได้แทรกมาทำงาน (รวมถึง MQTT)
            vTaskDelay(1);
            
        } else {
            set_record_led(0);
            // 🌟 8. กันเหนียว: ถ้าไม่ได้ต่อเน็ต หรือ i2s พัง ต้องหน่วงเวลาไว้ด้วย
            // ไม่งั้นมันจะวิ่ง while(1) แบบ 100% CPU จนบอร์ดค้าง
            vTaskDelay(pdMS_TO_TICKS(50));
        }
    }
}

// 🌐 Captive DNS ฝั่ง SoftAP: ตอบทุกชื่อโดเมนด้วย 192.168.4.1 เพื่อให้มือถือเด้งหน้า provisioning
static const uint8_t s_softap_ip[4] = {192, 168, 4, 1};

static void captive_dns_task(void *pvParameters) {
    struct sockaddr_in dest_addr;
    memset(&dest_addr, 0, sizeof(dest_addr));
    dest_addr.sin_family = AF_INET;
    dest_addr.sin_port = htons(53); 
    // bind เฉพาะ IP ของ SoftAP (ไม่ใช่ INADDR_ANY) จะได้ไม่ตอบ DNS ปลอมให้เครื่องใน LAN บ้านผ่านขา STA
    memcpy(&dest_addr.sin_addr.s_addr, s_softap_ip, sizeof(s_softap_ip));

    int sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_IP);
    if (sock < 0) { vTaskDelete(NULL); return; }
    if (bind(sock, (struct sockaddr *)&dest_addr, sizeof(dest_addr)) < 0) {
        ESP_LOGE(TAG, "❌ captive DNS bind 192.168.4.1:53 ไม่สำเร็จ");
        close(sock);
        vTaskDelete(NULL); return;
    }

    // static: ไม่กิน stack ของ task (2048 byte) — มี task นี้ตัวเดียว
    static uint8_t rx_buffer[512];
    static uint8_t tx_buffer[512 + 16];
    while (1) {
        struct sockaddr_in source_addr;
        socklen_t socklen = sizeof(source_addr);
        int len = recvfrom(sock, rx_buffer, sizeof(rx_buffer), 0, (struct sockaddr *)&source_addr, &socklen);
        
        // header 12 byte: ต้องเป็น query (QR=0, opcode=0) และมี question อย่างน้อย 1 ข้อ
        if (len > 12 && (rx_buffer[2] & 0xF8) == 0 && ((rx_buffer[4] << 8) | rx_buffer[5]) >= 1) {
            // หาจุดจบของ question แรก: QNAME (label ... 0) + QTYPE(2) + QCLASS(2)
            int pos = 12;
            while (pos < len && rx_buffer[pos] != 0) {
                if (rx_buffer[pos] & 0xC0) { pos = len; break; }   // ไม่รับ compression pointer ใน question
                pos += rx_buffer[pos] + 1;
            }
            int q_end = pos + 1 + 4;
            if (pos < len && q_end <= len) {
                uint16_t qtype  = (uint16_t)((rx_buffer[pos + 1] << 8) | rx_buffer[pos + 2]);
                uint16_t qclass = (uint16_t)((rx_buffer[pos + 3] << 8) | rx_buffer[pos + 4]);
                // ตอบ A record เฉพาะ QTYPE A / QCLASS IN ส่วน AAAA และอื่นๆ ตอบ NOERROR แบบไม่มีคำตอบ
                bool answer_a = (qtype == 1 && qclass == 1);
            
                // คัดลอกแค่ header + question แรก (ตัด authority/additional เช่น EDNS OPT ทิ้ง)
                memcpy(tx_buffer, rx_buffer, q_end);
                tx_buffer[2] = 0x81; 
                tx_buffer[3] = 0x80; 
                tx_buffer[4] = 0x00; tx_buffer[5] = 0x01;                  // QDCOUNT = 1
                tx_buffer[6] = 0x00; tx_buffer[7] = answer_a ? 0x01 : 0x00; // ANCOUNT
                tx_buffer[8] = 0x00; tx_buffer[9] = 0x00;                  // NSCOUNT = 0
                tx_buffer[10] = 0x00; tx_buffer[11] = 0x00;                // ARCOUNT = 0
            
                uint8_t *ans = tx_buffer + q_end;
                if (answer_a) {
                    *ans++ = 0xC0; *ans++ = 0x0C; 
                    *ans++ = 0x00; *ans++ = 0x01; 
                    *ans++ = 0x00; *ans++ = 0x01; 
                    *ans++ = 0x00; *ans++ = 0x00; *ans++ = 0x00; *ans++ = 0x3C; 
                    *ans++ = 0x00; *ans++ = 0x04; 
                    memcpy(ans, s_softap_ip, sizeof(s_softap_ip)); ans += sizeof(s_softap_ip);
                }
            
                sendto(sock, tx_buffer, ans - tx_buffer, 0, (struct sockaddr *)&source_addr, sizeof(source_addr));
            }
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

    s_mqtt_mutex = xSemaphoreCreateMutex();   // ต้องมีก่อน Wi-Fi ได้ IP (restart_mqtt_client) และก่อน audio_record_task
    if (s_mqtt_mutex == NULL) {
        ESP_LOGE(TAG, "❌ สร้าง MQTT mutex ไม่สำเร็จ รีสตาร์ท...");
        esp_restart();
    }

    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_STA); 
    // 🟢 เก็บลงตัวแปร Global แทน (ลบ char mac_str[18] อันเก่าทิ้งได้เลย)
    snprintf(device_mac_str, sizeof(device_mac_str), "%02X:%02X:%02X:%02X:%02X:%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);

    char mac_str[18];
    snprintf(mac_str, sizeof(mac_str), "%02X:%02X:%02X:%02X:%02X:%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
   
    snprintf(ap_ssid_dynamic, sizeof(ap_ssid_dynamic), "Smartvoice-%02X%02X%02X", mac[3], mac[4], mac[5]);
    snprintf(ap_password_dynamic, sizeof(ap_password_dynamic), "SV_%02X%02X%02X", mac[0], mac[1], mac[2]);
    
    ESP_LOGI(TAG, "🟢 กำหนด SoftAP SSID: %s", ap_ssid_dynamic);
    // 🔐 ไม่พิมพ์รหัส SoftAP ลง log (ยังคำนวณจาก MAC เหมือนเดิม เพราะ QR ฝั่ง frontend ใช้สูตรเดียวกัน)

    snprintf(mqtt_topic_dynamic, sizeof(mqtt_topic_dynamic), "voice/audio/%s", mac_str);
    snprintf(status_topic_dynamic, sizeof(status_topic_dynamic), "device/status/%s", mac_str);
    snprintf(angle_topic_dynamic, sizeof(angle_topic_dynamic), "voice/angle/%s", mac_str);
    
    ESP_LOGI(TAG, "🎯 อุปกรณ์นี้มี MAC: %s", mac_str);
    ESP_LOGI(TAG, "🎯 พ่นเสียงไปที่ Topic: %s", mqtt_topic_dynamic);
    ESP_LOGI(TAG, "🎯 พ่นมุมทิศทางไปที่ Topic: %s", angle_topic_dynamic);
    
    load_mqtt_uri_from_nvs();

    init_led();
    init_i2s_audio();
    init_wifi();

    vTaskDelay(1000 / portTICK_PERIOD_MS);
    start_web_server();

// งานยิบย่อย ไม่ต้องรีบมาก ปรับลดลงมาเหลือ Priority 2
    xTaskCreate(reset_button_task, "reset_button", 2048, NULL, 2, NULL);
    xTaskCreate(captive_dns_task, "captive_dns", 2048, NULL, 2, NULL);
    
    // 🌟 งานเสียง (หัวใจหลัก) ตั้งไว้ที่ 5 เหมือนเดิม
    // เพื่อให้มันเด่นกว่างานอื่น และมีลู่ทางทำงานร่วมกับ MQTT Task ได้ดีขึ้น
    xTaskCreate(audio_record_task, "audio_record", 4096, NULL, 5, NULL);
}