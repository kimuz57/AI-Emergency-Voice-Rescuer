#ifndef WEB_SERVER_H
#define WEB_SERVER_H

#include <esp_http_server.h>
#include "esp_wifi.h"
#include "esp_log.h"
#include "esp_mac.h"

extern char mqtt_broker_uri_dynamic[128];
extern void restart_mqtt_client(void);
extern void connect_to_sta(const char* ssid, const char* password);

static const char *WS_TAG = "WEB_SERVER";

// HTML Templates
const char* html_header = "<!DOCTYPE html><html><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width, initial-scale=1.0'><title>ESP32 Configuration</title><style>body{font-family:sans-serif;margin:20px;padding:0;background:#f4f4f9;color:#333;}h2{color:#0056b3;}a{display:inline-block;margin:10px 0;padding:10px 15px;background:#0056b3;color:#fff;text-decoration:none;border-radius:4px;}.btn{background:#28a745;color:white;border:none;padding:10px 15px;cursor:pointer;border-radius:4px;}input[type='text'],input[type='password']{width:100%;padding:10px;margin:8px 0;box-sizing:border-box;border:1px solid #ccc;border-radius:4px;}ul{list-style-type:none;padding:0;}li{background:#fff;margin:5px 0;padding:10px;border:1px solid #ddd;border-radius:4px;display:flex;justify-content:space-between;align-items:center;}</style></head><body>";
const char* html_footer = "</body></html>";

// Route / (หน้าแรก)
static esp_err_t root_get_handler(httpd_req_t *req) {
    char response[1024];
    snprintf(response, sizeof(response), 
             "%s"
             "<h2>ESP32 SmartVoice Configuration</h2>"
             "<p>ปัจจุบัน MQTT URI: <b>%s</b></p>"
             "<p><a href='/host'>ตั้งค่า MQTT Broker URI</a></p>"
             "<p><a href='/scanwifi'>สแกนและเชื่อมต่อ Wi-Fi</a></p>"
             "%s", 
             html_header, mqtt_broker_uri_dynamic, html_footer);
             
    httpd_resp_set_type(req, "text/html");
    httpd_resp_send(req, response, HTTPD_RESP_USE_UNKNOWN_LEN);
    return ESP_OK;
}

// Route /host (GET: แสดงฟอร์มแก้ไข)
static esp_err_t host_get_handler(httpd_req_t *req) {
    char response[1500];
    snprintf(response, sizeof(response),
             "%s"
             "<h2>ตั้งค่า MQTT Broker URI</h2>"
             "<form action='/host' method='POST'>"
             "  <label>MQTT Broker URI:</label>"
             "  <input type='text' name='uri' value='%s' placeholder='mqtt://192.168.1.50:1883'>"
             "  <input type='submit' class='btn' value='บันทึกและปรับปรุง'>"
             "</form>"
             "<p><a href='/'>กลับหน้าหลัก</a></p>"
             "%s",
             html_header, mqtt_broker_uri_dynamic, html_footer);

    httpd_resp_set_type(req, "text/html");
    httpd_resp_send(req, response, HTTPD_RESP_USE_UNKNOWN_LEN);
    return ESP_OK;
}

// Route /host (POST: บันทึกค่า)
static esp_err_t host_post_handler(httpd_req_t *req) {
    char buf[150];
    int ret, received = 0;
    
    if (req->content_len >= sizeof(buf)) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Content too long");
        return ESP_FAIL;
    }

    while (received < req->content_len) {
        ret = httpd_req_recv(req, buf + received, req->content_len - received);
        if (ret <= 0) {
            if (ret == HTTPD_SOCK_ERR_TIMEOUT) continue;
            return ESP_FAIL;
        }
        received += ret;
    }
    buf[received] = '\0';

    // ค้นหาตัวแปร uri= จาก x-www-form-urlencoded
    char uri_val[128] = {0};
    if (httpd_query_key_value(buf, "uri", uri_val, sizeof(uri_val)) == ESP_OK) {
        // URL Decode แบบง่าย (เปลี่ยน %3A เป็น : และ %2F เป็น /)
        char decoded_uri[128] = {0};
        char *p = uri_val;
        int i = 0;
        while (*p && i < 127) {
            if (*p == '%' && *(p+1) && *(p+2)) {
                char hex[3] = { *(p+1), *(p+2), '\0' };
                decoded_uri[i++] = (char)strtol(hex, NULL, 16);
                p += 3;
            } else {
                decoded_uri[i++] = *p;
                p++;
            }
        }
        strncpy(mqtt_broker_uri_dynamic, decoded_uri, sizeof(mqtt_broker_uri_dynamic) - 1);
        ESP_LOGI(WS_TAG, "ปรับปรุง MQTT URI ใหม่สำเร็จ: %s", mqtt_broker_uri_dynamic);
        
        // รีสตาร์ท MQTT Client ให้ชี้ไปที่โฮสต์ใหม่
        restart_mqtt_client();
    }

    // ส่งผลลัพธ์แจ้งเตือนและ Redirect กลับ
    char response[500];
    snprintf(response, sizeof(response),
             "%s<h2>บันทึกสำเร็จแล้ว!</h2><p>กำลังเปลี่ยนระบบเชื่อมต่อไปยัง: %s</p><script>setTimeout(function(){window.location.href='/';}, 3000);</script>%s",
             html_header, mqtt_broker_uri_dynamic, html_footer);
    httpd_resp_set_type(req, "text/html");
    httpd_resp_send(req, response, HTTPD_RESP_USE_UNKNOWN_LEN);
    return ESP_OK;
}

// Route /scanwifi (GET: สแกนหาคลื่น WiFi)
static esp_err_t scanwifi_get_handler(httpd_req_t *req) {
    uint16_t number = 15;
    wifi_ap_record_t ap_info[15];
    uint16_t ap_count = 0;
    
    // เคลียร์ค่า และสั่งสแกน
    memset(ap_info, 0, sizeof(ap_info));
    esp_wifi_scan_start(NULL, true);
    esp_wifi_scan_get_ap_records(&number, ap_info);
    esp_wifi_scan_get_ap_num(&ap_count);

    // สร้าง HTML
    char *response = malloc(4096);
    if (!response) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Memory allocation failed");
        return ESP_FAIL;
    }

    int len = snprintf(response, 4096, "%s<h2>สแกนพบ Wi-Fi (%d ช่องสัญญาณ)</h2><ul>", html_header, ap_count);
    
    for (int i = 0; i < number && i < ap_count; i++) {
        int len_left = 4096 - len;
        if (len_left < 300) break; // ป้องกัน buffer overflow นอกเขตจัดสรร
        
        int current_len = snprintf(response + len, len_left,
                 "<li>"
                 "  <span><b>%s</b> (RSSI: %d dBm)</span>"
                 "  <form action='/connect' method='POST' style='margin:0;'>"
                 "    <input type='hidden' name='ssid' value='%s'>"
                 "    <input type='password' name='password' placeholder='รหัสผ่าน Wi-Fi' style='width:150px; margin-right:5px; padding:5px;'>"
                 "    <input type='submit' class='btn' value='เชื่อมต่อ' style='padding:5px 10px;'>"
                 "  </form>"
                 "</li>",
                 (char*)ap_info[i].ssid, ap_info[i].rssi, (char*)ap_info[i].ssid);
        len += current_len;
    }

    snprintf(response + len, 4096 - len, "</ul><p><a href='/'>กลับหน้าหลัก</a></p>%s", html_footer);
    
    httpd_resp_set_type(req, "text/html");
    httpd_resp_send(req, response, HTTPD_RESP_USE_UNKNOWN_LEN);
    free(response);
    return ESP_OK;
}

// Route /connect (POST: รับชื่อ SSID และรหัสผ่านไปต่อเน็ต)
static esp_err_t connect_post_handler(httpd_req_t *req) {
    char buf[256];
    int ret, received = 0;

    if (req->content_len >= sizeof(buf)) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Content too long");
        return ESP_FAIL;
    }

    while (received < req->content_len) {
        ret = httpd_req_recv(req, buf + received, req->content_len - received);
        if (ret <= 0) {
            if (ret == HTTPD_SOCK_ERR_TIMEOUT) continue;
            return ESP_FAIL;
        }
        received += ret;
    }
    buf[received] = '\0';

    char ssid[32] = {0};
    char password[64] = {0};

    httpd_query_key_value(buf, "ssid", ssid, sizeof(ssid));
    httpd_query_key_value(buf, "password", password, sizeof(password));

    ESP_LOGI(WS_TAG, "กำลังทำการเชื่อมต่อไปยัง SSID: %s", ssid);
    
    // เรียกใช้ฟังก์ชันเชื่อมต่อในไฟล์หลัก
    connect_to_sta(ssid, password);

    // ตอบกลับผู้ใช้งานว่าบอร์ดรับทราบแล้ว และกำลังพยายามเชื่อมต่อ
    char response[1024];
    snprintf(response, sizeof(response),
             "%s"
             "<h2>ระบบกำลังพยายามเชื่อมต่อ Wi-Fi...</h2>"
             "<p>เชื่อมต่อไปยัง <b>%s</b></p>"
             "<p>เมื่อเชื่อมต่อเสร็จแล้ว ตัวอุปกรณ์จะแจ้งพิกัด IP และเปิดลิงก์ API อัตโนมัติในฝั่งเบื้องหลัง</p>"
             "<p><a href='/'>กลับหน้าหลักเพื่อเช็คสถานะ</a></p>"
             "%s",
             html_header, ssid, html_footer);

    httpd_resp_set_type(req, "text/html");
    httpd_resp_send(req, response, HTTPD_RESP_USE_UNKNOWN_LEN);
    return ESP_OK;
}

// ฟังก์ชันเริ่มการทำงานของ Web Server
httpd_handle_t start_web_server(void) {
    httpd_handle_t server = NULL;
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.lru_purge_enable = true;

    ESP_LOGI(WS_TAG, "กำลังเริ่มระบบ HTTP Web Server บนพอร์ต: '%d'", config.server_port);
    if (httpd_start(&server, &config) == ESP_OK) {
        // ลงทะเบียน URI Handlers
        httpd_uri_t root = { .uri = "/", .method = HTTP_GET, .handler = root_get_handler, .user_ctx = NULL };
        httpd_register_uri_handler(server, &root);

        httpd_uri_t host_get = { .uri = "/host", .method = HTTP_GET, .handler = host_get_handler, .user_ctx = NULL };
        httpd_register_uri_handler(server, &host_get);

        httpd_uri_t host_post = { .uri = "/host", .method = HTTP_POST, .handler = host_post_handler, .user_ctx = NULL };
        httpd_register_uri_handler(server, &host_post);

        httpd_uri_t scan_get = { .uri = "/scanwifi", .method = HTTP_GET, .handler = scanwifi_get_handler, .user_ctx = NULL };
        httpd_register_uri_handler(server, &scan_get);

        httpd_uri_t connect_post = { .uri = "/connect", .method = HTTP_POST, .handler = connect_post_handler, .user_ctx = NULL };
        httpd_register_uri_handler(server, &connect_post);

        return server;
    }
    ESP_LOGE(WS_TAG, "ไม่สามารถสร้างเซิร์ฟเวอร์ HTTP ได้!");
    return NULL;
}

#endif // WEB_SERVER_H