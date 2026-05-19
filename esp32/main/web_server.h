#ifndef WEB_SERVER_H
#define WEB_SERVER_H

#include <esp_http_server.h>
#include "esp_wifi.h"
#include "esp_log.h"
#include "esp_mac.h"
#include <stdlib.h> 
#include <ctype.h> // สำหรับถอดรหัส URL

extern char mqtt_broker_uri_dynamic[128];
extern void restart_mqtt_client(void);
extern void connect_to_sta(const char* ssid, const char* password);
extern void save_mqtt_uri_to_nvs(const char* uri);

extern const uint8_t wifi_html_start[] asm("_binary_wifi_html_start");
extern const uint8_t wifi_html_end[]   asm("_binary_wifi_html_end");

extern void trigger_wifi_reconnect(void);

static const char *WS_TAG = "WEB_SERVER";

// HTML Templates
const char* html_header = "<!DOCTYPE html><html><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width, initial-scale=1.0'><title>ESP32 Configuration</title><style>body{font-family:sans-serif;margin:20px;padding:0;background:#f4f4f9;color:#333;}h2{color:#0056b3;}a{display:inline-block;margin:10px 0;padding:10px 15px;background:#0056b3;color:#fff;text-decoration:none;border-radius:4px;}.btn{background:#28a745;color:white;border:none;padding:10px 15px;cursor:pointer;border-radius:4px;}input[type='text'],input[type='password']{width:100%;padding:10px;margin:8px 0;box-sizing:border-box;border:1px solid #ccc;border-radius:4px;}ul{list-style-type:none;padding:0;}li{background:#fff;margin:5px 0;padding:10px;border:1px solid #ddd;border-radius:4px;display:flex;justify-content:space-between;align-items:center;}</style></head><body>";
const char* html_footer = "</body></html>";

// 🟢 ฟังก์ชันช่วยถอดรหัส URL (แก้อาการรับชื่อไวไฟที่มีเว้นวรรคแล้วเพี้ยน)
static void url_decode(char *dst, const char *src) {
    char a, b;
    while (*src) {
        if ((*src == '%') &&
            ((a = src[1]) && (b = src[2])) &&
            (isxdigit((unsigned char)a) && isxdigit((unsigned char)b))) {
            if (a >= 'a') a -= 'a'-'A';
            if (a >= 'A') a -= ('A' - 10);
            else a -= '0';
            if (b >= 'a') b -= 'a'-'A';
            if (b >= 'A') b -= ('A' - 10);
            else b -= '0';
            *dst++ = 16*a+b;
            src+=3;
        } else if (*src == '+') {
            *dst++ = ' '; // แปลงเครื่องหมาย + เป็นเว้นวรรค
            src++;
        } else {
            *dst++ = *src++;
        }
    }
    *dst++ = '\0';
}

// 🟢 Route /wifi (GET: ส่งหน้าเว็บ wifi.html ที่ฝังใน CMake ออกไป)
esp_err_t wifi_page_get_handler(httpd_req_t *req) {
    httpd_resp_set_type(req, "text/html; charset=utf-8");
    const size_t wifi_html_size = (wifi_html_end - wifi_html_start);
    httpd_resp_send(req, (const char *)wifi_html_start, wifi_html_size);
    return ESP_OK;
}

// Route / (หน้าแรก) 🟢 เพิ่มปุ่มเข้าหน้าตั้งค่า WiFi
// แก้ไขโค้ดหน้าแรกให้มีปุ่ม Reconnect
static esp_err_t root_get_handler(httpd_req_t *req) {
    char response[1024];
    snprintf(response, sizeof(response), 
             "%s"
             "<h2>ESP32 SmartVoice Configuration</h2>"
             "<p>ปัจจุบัน MQTT URI: <b>%s</b></p>"
             "<p><a href='/host'>ตั้งค่า MQTT Broker URI</a></p>"
             "<p><a href='/wifi'>ตั้งค่าการเชื่อมต่อ Wi-Fi (ใหม่)</a></p>"
             "<p><a href='/scanwifi'>สแกนรายชื่อ Wi-Fi บริเวณนี้</a></p>"
             "<hr style='border:1px solid #ccc; margin:20px 0;'>"
             "<p><a href='/reconnect' style='background:#17a2b8;'>🔄 เชื่อมต่อ Wi-Fi เดิมอีกครั้ง (Reconnect)</a></p>" // 🟢 เพิ่มปุ่มนี้เข้าไป
             "%s", 
             html_header, mqtt_broker_uri_dynamic, html_footer);
             
    httpd_resp_set_type(req, "text/html");
    httpd_resp_send(req, response, HTTPD_RESP_USE_STRLEN);
    return ESP_OK;
}

// Route /host (GET)
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
    httpd_resp_send(req, response, HTTPD_RESP_USE_STRLEN);
    return ESP_OK;
}

// Route /host (POST)
static esp_err_t host_post_handler(httpd_req_t *req) {
    char buf[150];
    int ret, received = 0;
    
    if (req->content_len >= sizeof(buf)) { return ESP_FAIL; }

    while (received < req->content_len) {
        ret = httpd_req_recv(req, buf + received, req->content_len - received);
        if (ret <= 0) {
            if (ret == HTTPD_SOCK_ERR_TIMEOUT) continue;
            return ESP_FAIL;
        }
        received += ret;
    }
    buf[received] = '\0';

    char uri_val[128] = {0};
    if (httpd_query_key_value(buf, "uri", uri_val, sizeof(uri_val)) == ESP_OK) {
        char decoded_uri[128] = {0};
        url_decode(decoded_uri, uri_val); // ใช้ฟังก์ชันถอดรหัส
        
        strncpy(mqtt_broker_uri_dynamic, decoded_uri, sizeof(mqtt_broker_uri_dynamic) - 1);
        ESP_LOGI(WS_TAG, "ปรับปรุง MQTT URI ใหม่สำเร็จ: %s", mqtt_broker_uri_dynamic);
        
        save_mqtt_uri_to_nvs(mqtt_broker_uri_dynamic); 
        restart_mqtt_client();
    }

    char response[1024];
    snprintf(response, sizeof(response),
             "%s"
             "<h2>บันทึกสำเร็จแล้ว!</h2>"
             "<p>กำลังเปลี่ยนระบบเชื่อมต่อไปยัง: %s</p>"
             "<script>setTimeout(function(){window.location.href='/admin';}, 3000);</script>"
             "%s",
             html_header, mqtt_broker_uri_dynamic, html_footer);
             
    httpd_resp_set_type(req, "text/html");
    httpd_resp_send(req, response, HTTPD_RESP_USE_STRLEN);
    return ESP_OK;
}

// Route /scanwifi (GET)
static esp_err_t scanwifi_get_handler(httpd_req_t *req) {
    uint16_t number = 15; wifi_ap_record_t ap_info[15]; uint16_t ap_count = 0;
    esp_wifi_scan_start(NULL, true);
    esp_wifi_scan_get_ap_records(&number, ap_info);
    esp_wifi_scan_get_ap_num(&ap_count);

    httpd_resp_set_type(req, "text/html");
    char chunk[512];
    snprintf(chunk, sizeof(chunk), "%s<h2>สแกนพบ Wi-Fi (%d ช่องสัญญาณ)</h2><ul>", html_header, ap_count);
    httpd_resp_send_chunk(req, chunk, HTTPD_RESP_USE_STRLEN);
    
    for (int i = 0; i < number && i < ap_count; i++) {
        snprintf(chunk, sizeof(chunk),
                 "<li>"
                 "  <span><b>%s</b> (RSSI: %d dBm)</span>"
                 "  <form action='/connect' method='POST' style='margin:0;'>"
                 "    <input type='hidden' name='ssid' value='%s'>"
                 "    <input type='password' name='password' placeholder='รหัสผ่าน Wi-Fi' style='width:150px; margin-right:5px; padding:5px;'>"
                 "    <input type='submit' class='btn' value='เชื่อมต่อ' style='padding:5px 10px;'>"
                 "  </form>"
                 "</li>",
                 (char*)ap_info[i].ssid, ap_info[i].rssi, (char*)ap_info[i].ssid);
        httpd_resp_send_chunk(req, chunk, HTTPD_RESP_USE_STRLEN);
    }
    snprintf(chunk, sizeof(chunk), "</ul><p><a href='/'>กลับหน้าหลัก</a></p>%s", html_footer);
    httpd_resp_send_chunk(req, chunk, HTTPD_RESP_USE_STRLEN);
    httpd_resp_send_chunk(req, NULL, 0); 
    
    return ESP_OK;
}

// 🟢 Route /connect (POST: รองรับรับค่าจากหน้าเว็บใหม่)
static esp_err_t connect_post_handler(httpd_req_t *req) {
    char buf[256];
    int ret, received = 0;

    if (req->content_len >= sizeof(buf)) { return ESP_FAIL; }

    while (received < req->content_len) {
        ret = httpd_req_recv(req, buf + received, req->content_len - received);
        if (ret <= 0) {
            if (ret == HTTPD_SOCK_ERR_TIMEOUT) continue;
            return ESP_FAIL;
        }
        received += ret;
    }
    buf[received] = '\0';

    char ssid_raw[64] = {0}, pass_raw[64] = {0};
    char ssid[64] = {0}, password[64] = {0};

    httpd_query_key_value(buf, "ssid", ssid_raw, sizeof(ssid_raw));
    httpd_query_key_value(buf, "password", pass_raw, sizeof(pass_raw));

    // ถอดรหัส URL เผื่อชื่อ Wi-Fi มีการเว้นวรรค
    url_decode(ssid, ssid_raw);
    url_decode(password, pass_raw);

    ESP_LOGI(WS_TAG, "รับคำสั่งเชื่อมต่อจากหน้าเว็บ -> SSID: %s", ssid);
    connect_to_sta(ssid, password);

    // ตอบกลับแค่ข้อความดิบเพื่อให้ JavaScript ของ wifi.html นำไปโชว์
    httpd_resp_set_type(req, "text/plain; charset=utf-8");
    httpd_resp_send(req, "กำลังเชื่อมต่อ Wi-Fi... (กรุณาเช็คสถานะที่ตัวบอร์ด)", HTTPD_RESP_USE_STRLEN);
    return ESP_OK;
}

// 🟢 Route /reconnect (GET: รับคำสั่งเชื่อมต่อใหม่)
static esp_err_t reconnect_get_handler(httpd_req_t *req) {
    // สั่งให้ main.c ไปดึงรหัสเดิมมาต่อใหม่
    trigger_wifi_reconnect();
    
    // แสดงหน้าเว็บชั่วคราว แล้วเด้งกลับไปหน้าแรกใน 3 วินาที
    char response[500];
    snprintf(response, sizeof(response),
             "%s"
             "<h2>กำลังพยายามเชื่อมต่อ Wi-Fi อีกครั้ง...</h2>"
             "<p>ระบบกำลังค้นหาและเชื่อมต่อไปยัง Wi-Fi เดิมที่เคยบันทึกไว้ (เช็คสถานะได้จากไฟ LED)</p>"
             "<script>setTimeout(function(){window.location.href='/';}, 3000);</script>"
             "%s",
             html_header, html_footer);
             
    httpd_resp_set_type(req, "text/html; charset=utf-8");
    httpd_resp_send(req, response, HTTPD_RESP_USE_STRLEN);
    return ESP_OK;
}

static esp_err_t captive_portal_404_handler(httpd_req_t *req, httpd_err_code_t err) {
    // สั่ง HTTP 302 Redirect ให้เบราว์เซอร์ของมือถือเด้งไปที่หน้าแรก
    httpd_resp_set_status(req, "302 Found");
    httpd_resp_set_hdr(req, "Location", "http://192.168.4.1/");
    httpd_resp_send(req, NULL, 0);
    return ESP_OK;
}

httpd_handle_t start_web_server(void) {
    httpd_handle_t server = NULL;
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.lru_purge_enable = true;

    ESP_LOGI(WS_TAG, "กำลังเริ่มระบบ HTTP Web Server บนพอร์ต: '%d'", config.server_port);
    if (httpd_start(&server, &config) == ESP_OK) {
        httpd_uri_t host_get = { .uri = "/host", .method = HTTP_GET, .handler = host_get_handler, .user_ctx = NULL };
        httpd_register_uri_handler(server, &host_get);

        httpd_uri_t host_post = { .uri = "/host", .method = HTTP_POST, .handler = host_post_handler, .user_ctx = NULL };
        httpd_register_uri_handler(server, &host_post);
        
        // 🟢 ลงทะเบียนหน้าเว็บตั้งค่าไวไฟ (HTML ของคุณ)
        // httpd_uri_t wifi_setup_uri = { .uri = "/wifi", .method = HTTP_GET, .handler = wifi_page_get_handler, .user_ctx = NULL };
        // httpd_register_uri_handler(server, &wifi_setup_uri);
        httpd_uri_t root = { .uri = "/", .method = HTTP_GET, .handler = wifi_page_get_handler, .user_ctx = NULL };
        httpd_register_uri_handler(server, &root);

        // 🟢 2. หน้าแอดมิน (/admin) : เอาหน้าเมนูเดิมไปซ่อนไว้ที่นี่ สำหรับคุณเข้าคนเดียว
        httpd_uri_t admin_page = { .uri = "/admin", .method = HTTP_GET, .handler = root_get_handler, .user_ctx = NULL };
        httpd_register_uri_handler(server, &admin_page);

        httpd_uri_t scan_get = { .uri = "/scanwifi", .method = HTTP_GET, .handler = scanwifi_get_handler, .user_ctx = NULL };
        httpd_register_uri_handler(server, &scan_get);

        httpd_uri_t connect_post = { .uri = "/connect", .method = HTTP_POST, .handler = connect_post_handler, .user_ctx = NULL };
        httpd_register_uri_handler(server, &connect_post);

        httpd_uri_t reconnect_get = { .uri = "/reconnect", .method = HTTP_GET, .handler = reconnect_get_handler, .user_ctx = NULL };
        httpd_register_uri_handler(server, &reconnect_get);

        // 🟢 ลงทะเบียน 404 Error ให้ทำหน้าที่เด้งป๊อปอัป
        httpd_register_err_handler(server, HTTPD_404_NOT_FOUND, captive_portal_404_handler);

        return server;
    }
    ESP_LOGE(WS_TAG, "ไม่สามารถสร้างเซิร์ฟเวอร์ HTTP ได้!");
    return NULL;
}

#endif // WEB_SERVER_H