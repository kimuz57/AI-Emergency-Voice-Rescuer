#ifndef WEB_SERVER_H
#define WEB_SERVER_H

#include <esp_http_server.h>
#include "esp_wifi.h"
#include "esp_log.h"
#include "esp_mac.h"
#include <stdlib.h> 
#include <ctype.h> // สำหรับถอดรหัส URL

#define IS_LOCAL_ENV 0 

#if IS_LOCAL_ENV
    // --- ตั้งค่าสำหรับ Local ---
    #define SERVER_URL "https://s8449mbs-3000.asse.devtunnels.ms/registor-patient?mac=%s" 
#else
    // --- ตั้งค่าสำหรับ Server จริง ---
    #define SERVER_URL "https://kws.wattanapong.com/registor-patient?mac=%s"
#endif



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

// 🟢 Route /connect (POST: ส่งหน้าจอให้ผู้ใช้กดค้างเพื่อ Copy ลิงก์ แบบ Manual)
static esp_err_t connect_post_handler(httpd_req_t *req) {
    char buf[512]; 
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

    char ssid_raw[256] = {0}, pass_raw[256] = {0};
    char ssid[128] = {0}, password[128] = {0};

    httpd_query_key_value(buf, "ssid", ssid_raw, sizeof(ssid_raw));
    httpd_query_key_value(buf, "password", pass_raw, sizeof(pass_raw));

    url_decode(ssid, ssid_raw);
    url_decode(password, pass_raw);

    if (strlen(ssid) == 0) {
        httpd_resp_set_type(req, "text/plain; charset=utf-8");
        httpd_resp_send(req, "❌ ข้อผิดพลาด: ไม่พบชื่อ Wi-Fi (SSID เป็นค่าว่าง)", HTTPD_RESP_USE_STRLEN);
        return ESP_OK;
    }

    ESP_LOGI(WS_TAG, "รับค่า Wi-Fi เตรียมส่งหน้าจอให้ Copy ลิงก์ (Manual)");

    char *response_html = (char *)malloc(4096);
    if (response_html == NULL) {
        return ESP_FAIL;
    }

    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_STA);
    char mac_str[13];
    snprintf(mac_str, sizeof(mac_str), "%02X%02X%02X%02X%02X%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);

    // 1. สร้างหน้า HTML แบบให้กดค้างเพื่อ Copy เอง (ใช้ CSS ช่วยคลุมดำข้อความอัตโนมัติ)
    snprintf(response_html, 4096,
        "<!DOCTYPE html>"
        "<html>"
        "<head>"
        "    <meta charset='utf-8'>"
        "    <meta name='viewport' content='width=device-width, initial-scale=1'>"
        "    <title>Setup Complete</title>"
        "</head>"
        "<body style='text-align:center; padding:20px; font-family:sans-serif; background-color:#f4f4f9;'>"
        "    <div style='background:white; padding:25px; border-radius:12px; box-shadow:0 4px 15px rgba(0,0,0,0.1); max-width:400px; margin:auto;'>"
        "        <h2 style='color:#28a745; margin-top:0;'>✅ บันทึก Wi-Fi สำเร็จ!</h2>"
        "        <p style='color:#dc3545; font-size:13px; font-weight:bold; margin-bottom:10px;'>(ระบบมือถือไม่อนุญาตให้กดปุ่มคัดลอกอัตโนมัติ)</p>"
        "        <p style='color:#555; font-size:15px; margin-bottom:15px;'>👇 <b>กรุณากดค้างที่ข้อความด้านล่าง</b> เพื่อคัดลอกด้วยตัวเอง</p>"
        "        "
        "        <!-- กล่องอัจฉริยะ: แค่แตะหรือกดค้าง CSS จะคลุมดำให้ทั้งประโยคทันที -->"
        "        <div style='background:#e9ecef; padding:15px; border-radius:8px; border:2px dashed #007bff; margin-bottom:25px; word-break:break-all; font-size:16px; font-weight:bold; color:#007bff; user-select:all; -webkit-user-select:all;'>"
        "            " SERVER_URL ""
        "        </div>"
        "        "
        "        "
        "        <div style='background:#fff3cd; padding:15px; border-radius:8px; text-align:left; border-left:4px solid #ffc107;'>"
        "            <p style='font-weight:bold; color:#856404; margin:0 0 8px 0; font-size:14px;'>📌 ขั้นตอนต่อไป:</p>"
        "            <ol style='margin:0; padding-left:20px; font-size:13px; color:#856404; line-height:1.6;'>"
        "                <li>กด <b>คัดลอก (Copy)</b> ลิงก์ในกรอบประด้านบน</li>"
        "                <li>กดคำว่า <b>เสร็จสิ้น (Done)</b> หรือ <b>ยกเลิก</b> ที่มุมขวาบนเพื่อปิดหน้านี้</li>"
        "                <li>เปิดแอป <b>Safari หรือ Chrome</b> แล้ววางลิงก์เพื่อใช้งาน</li>"
        "            </ol>"
        "        </div>"
        "    </div>"
        "</body>"
        "</html>", mac_str);

    // 2. ตอบหน้าเว็บกลับไปให้มือถือทันที
    httpd_resp_set_type(req, "text/html; charset=utf-8");
    httpd_resp_send(req, response_html, HTTPD_RESP_USE_STRLEN);
    
    free(response_html);

    // 3. ยืนรอ 2 วินาทีเพื่อให้ชัวร์ว่ามือถือโหลดหน้าเว็บเสร็จ
    vTaskDelay(pdMS_TO_TICKS(2000));

    // 4. สั่งบอร์ดสลับไปต่อเน็ตบ้าน
    connect_to_sta(ssid, password);

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

// 🟢 API: สแกน Wi-Fi และส่งรายชื่อกลับไปเป็นรูปแบบ JSON Array ["WIFI_1", "WIFI_2"]
// 🟢 API: สแกน Wi-Fi และส่งรายชื่อกลับไปเป็นรูปแบบ JSON Array
// 🟢 API: สแกน Wi-Fi และส่งรายชื่อกลับไปเป็นรูปแบบ JSON Array
// 🟢 API: สแกน Wi-Fi แบบใช้ Dynamic Memory (ป้องกันบอร์ดพัง/Stack Overflow)
static esp_err_t api_scan_get_handler(httpd_req_t *req) {
    ESP_LOGI(WS_TAG, "เริ่มสแกนหาคลื่น Wi-Fi...");
    
    // ตั้งค่าการสแกน
    wifi_scan_config_t scan_config = {
        .ssid = 0,
        .bssid = 0,
        .channel = 0,
        .show_hidden = false
    };

    // สั่งเริ่มสแกน (รอจนกว่าจะเสร็จ)
    esp_err_t err = esp_wifi_scan_start(&scan_config, true);
    if (err != ESP_OK) {
        ESP_LOGE(WS_TAG, "สแกน Wi-Fi ล้มเหลว! (อาจกำลังทำงานอื่นอยู่)");
        httpd_resp_set_type(req, "application/json; charset=utf-8");
        httpd_resp_send(req, "[]", 2);
        return ESP_OK;
    }

    uint16_t ap_count = 0;
    esp_wifi_scan_get_ap_num(&ap_count);
    
    // จำกัดให้แสดงแค่ 15 ชื่อแรกที่สัญญาณแรงสุด
    uint16_t max_ap = 15;
    if (ap_count > max_ap) ap_count = max_ap;

    ESP_LOGI(WS_TAG, "สแกนเสร็จสิ้น เจอ %d เครือข่าย", ap_count);

    // 🌟 1. ดึงหน่วยความจำจาก Heap (แรมหลัก) เพื่อไม่ให้ Stack ของเว็บเซิร์ฟเวอร์ระเบิด
    wifi_ap_record_t *ap_info = (wifi_ap_record_t *)malloc(sizeof(wifi_ap_record_t) * max_ap);
    char *json_response = (char *)malloc(2048);

    // ป้องกันกรณีที่แรมเต็มจริงๆ
    if (ap_info == NULL || json_response == NULL) {
        ESP_LOGE(WS_TAG, "หน่วยความจำ (RAM) ไม่พอ!");
        if (ap_info) free(ap_info);
        if (json_response) free(json_response);
        httpd_resp_set_type(req, "application/json; charset=utf-8");
        httpd_resp_send(req, "[]", 2);
        return ESP_OK;
    }

    // ดึงข้อมูลรายชื่อ Wi-Fi มาใส่ในแรมที่จองไว้
    esp_wifi_scan_get_ap_records(&max_ap, ap_info);

    strcpy(json_response, "[");
    bool first_item = true;

    for (int i = 0; i < max_ap; i++) {
        // กรองเอาเฉพาะ Wi-Fi ที่มีชื่อ (ไม่ซ่อน SSID)
        if (strlen((char *)ap_info[i].ssid) > 0) {
            char ssid_buffer[128];
            if (!first_item) strcat(json_response, ",");
            
            // ใช้ท่า snprintf ป้องกันการเขียนทับ (Buffer Overflow)
            snprintf(ssid_buffer, sizeof(ssid_buffer), "\"%s\"", (char *)ap_info[i].ssid);
            strcat(json_response, ssid_buffer);
            first_item = false;
        }
    }
    strcat(json_response, "]");
    
    // ส่งข้อมูลกลับไปให้หน้าเว็บ
    httpd_resp_set_type(req, "application/json; charset=utf-8");
    httpd_resp_send(req, json_response, HTTPD_RESP_USE_STRLEN);
    
    // 🌟 2. ใช้เสร็จแล้ว ต้องคืนความจำให้ระบบเสมอ! (สำคัญมาก ไม่งั้นแรมจะค่อยๆ รั่วจนบอร์ดค้าง)
    free(ap_info);
    free(json_response);
    
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

        httpd_uri_t api_scan_get = { .uri = "/api/scan", .method = HTTP_GET, .handler = api_scan_get_handler, .user_ctx = NULL };
        httpd_register_uri_handler(server, &api_scan_get);

        // 🟢 ลงทะเบียน 404 Error ให้ทำหน้าที่เด้งป๊อปอัป
        httpd_register_err_handler(server, HTTPD_404_NOT_FOUND, captive_portal_404_handler);

        return server;
    }
    ESP_LOGE(WS_TAG, "ไม่สามารถสร้างเซิร์ฟเวอร์ HTTP ได้!");
    return NULL;
}

#endif // WEB_SERVER_H