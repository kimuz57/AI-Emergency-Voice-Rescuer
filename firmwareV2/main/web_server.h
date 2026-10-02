#ifndef WEB_SERVER_H
#define WEB_SERVER_H

#include <esp_http_server.h>
#include "esp_wifi.h"
#include "esp_log.h"
#include "esp_mac.h"
#include <stdlib.h> 
#include <ctype.h> // สำหรับถอดรหัส URL
#include <string.h>

// 🌍 SERVER_URL (ลิงก์ register-patient) และ TARGET_MQTT_URI มาจากบล็อก DEPLOY_ENV ใน main.c
// ซึ่งต้องอยู่ก่อน #include "web_server.h" — ไม่มีการ define environment ซ้ำในไฟล์นี้
#ifndef SERVER_URL
#error "SERVER_URL is not defined: set DEPLOY_ENV in main.c before including web_server.h"
#endif
#ifndef TARGET_MQTT_URI
#error "TARGET_MQTT_URI is not defined: set DEPLOY_ENV in main.c before including web_server.h"
#endif

extern char mqtt_broker_uri_dynamic[128];
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
// เขียนไม่เกิน dst_size (รวม '\0') คืน false ถ้าผลลัพธ์ยาวเกินที่ปลายทางรับได้
static bool url_decode(char *dst, size_t dst_size, const char *src) {
    char a, b;
    size_t out = 0;
    if (dst_size == 0) return false;
    while (*src) {
        if (out + 1 >= dst_size) {
            dst[out] = '\0';
            return false;
        }
        if ((*src == '%') &&
            ((a = src[1]) && (b = src[2])) &&
            (isxdigit((unsigned char)a) && isxdigit((unsigned char)b))) {
            if (a >= 'a') a -= 'a'-'A';
            if (a >= 'A') a -= ('A' - 10);
            else a -= '0';
            if (b >= 'a') b -= 'a'-'A';
            if (b >= 'A') b -= ('A' - 10);
            else b -= '0';
            dst[out++] = 16*a+b;
            src+=3;
        } else if (*src == '+') {
            dst[out++] = ' '; // แปลงเครื่องหมาย + เป็นเว้นวรรค
            src++;
        } else {
            dst[out++] = *src++;
        }
    }
    dst[out] = '\0';
    return true;
}

// 🛡️ escape ข้อความก่อนใส่ลง HTML (เช่น SSID จากการสแกน ที่ใครก็ตั้งชื่อเป็นแท็ก HTML/JS ได้)
// คืน false ถ้าไม่พอดี dst_size (ผลลัพธ์ที่ได้ยังปิดด้วย '\0' เสมอ)
static bool html_escape(char *dst, size_t dst_size, const char *src) {
    size_t out = 0;
    if (dst_size == 0) return false;
    for (; *src; src++) {
        char one[2] = { *src, '\0' };
        const char *rep = one;
        switch (*src) {
            case '&':  rep = "&amp;";  break;
            case '<':  rep = "&lt;";   break;
            case '>':  rep = "&gt;";   break;
            case '"':  rep = "&quot;"; break;
            case '\'': rep = "&#39;";  break;
            default: break;
        }
        size_t n = strlen(rep);
        if (out + n >= dst_size) {
            dst[out] = '\0';
            return false;
        }
        memcpy(dst + out, rep, n);
        out += n;
    }
    dst[out] = '\0';
    return true;
}

// 🛡️ เขียนข้อความเป็น JSON string พร้อมเครื่องหมายคำพูดหัวท้าย (escape " \ และอักขระควบคุม)
static bool json_escape_quoted(char *dst, size_t dst_size, const char *src) {
    size_t out = 0;
    if (dst_size < 3) return false;
    dst[out++] = '"';
    for (; *src; src++) {
        unsigned char c = (unsigned char)*src;
        char tmp[7];
        size_t n;
        if (c == '"' || c == '\\') {
            tmp[0] = '\\'; tmp[1] = (char)c; n = 2;
        } else if (c < 0x20) {
            snprintf(tmp, sizeof(tmp), "\\u%04x", c); n = 6;
        } else {
            tmp[0] = (char)c; n = 1;
        }
        if (out + n + 2 > dst_size) {   // เผื่อ '"' ปิดท้าย + '\0'
            dst[0] = '\0';
            return false;
        }
        memcpy(dst + out, tmp, n);
        out += n;
    }
    dst[out++] = '"';
    dst[out] = '\0';
    return true;
}

// 📄 ส่งหน้า HTML แบบ chunk: html_header, ส่วนเนื้อหาตามลำดับ, html_footer
// (เดิมรวมทุกอย่างลง buffer เดียวด้วย snprintf ซึ่งเล็กกว่า html_header ~830 byte จนหน้าเว็บถูกตัด)
static esp_err_t send_html_parts(httpd_req_t *req, const char *const parts[], size_t count) {
    httpd_resp_set_type(req, "text/html; charset=utf-8");
    if (httpd_resp_send_chunk(req, html_header, HTTPD_RESP_USE_STRLEN) != ESP_OK) return ESP_FAIL;
    for (size_t i = 0; i < count; i++) {
        if (parts[i] != NULL && httpd_resp_send_chunk(req, parts[i], HTTPD_RESP_USE_STRLEN) != ESP_OK) return ESP_FAIL;
    }
    if (httpd_resp_send_chunk(req, html_footer, HTTPD_RESP_USE_STRLEN) != ESP_OK) return ESP_FAIL;
    return httpd_resp_send_chunk(req, NULL, 0);
}

static esp_err_t send_html_page(httpd_req_t *req, const char *body) {
    const char *parts[] = { body };
    return send_html_parts(req, parts, 1);
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
    // ℹ️ broker ถูกกำหนดตอน build (TARGET_MQTT_URI) ไม่ใช่ค่า mqtt_uri ใน NVS จึงแสดงค่าที่ใช้จริง
    static const char body[] =
             "<h2>ESP32 SmartVoice Configuration</h2>"
             "<p>MQTT Broker ที่ใช้งาน (กำหนดตอน build เปลี่ยนจากหน้าเว็บไม่ได้): <b>" TARGET_MQTT_URI "</b></p>"
             "<p><a href='/host'>ข้อมูล MQTT Broker URI</a></p>"
             "<p><a href='/'>ตั้งค่าการเชื่อมต่อ Wi-Fi (ใหม่)</a></p>"
             "<p><a href='/scanwifi'>สแกนรายชื่อ Wi-Fi บริเวณนี้</a></p>"
             "<hr style='border:1px solid #ccc; margin:20px 0;'>"
             "<p><a href='/reconnect' style='background:#17a2b8;'>🔄 เชื่อมต่อ Wi-Fi เดิมอีกครั้ง (Reconnect)</a></p>"; // 🟢 เพิ่มปุ่มนี้เข้าไป
             
    return send_html_page(req, body);
}

// Route /host (GET)
static esp_err_t host_get_handler(httpd_req_t *req) {
    char uri_esc[sizeof(mqtt_broker_uri_dynamic) * 6];
    html_escape(uri_esc, sizeof(uri_esc), mqtt_broker_uri_dynamic);

    const char *parts[] = {
             "<h2>MQTT Broker URI</h2>"
             "<p>เฟิร์มแวร์นี้เชื่อมต่อ broker ที่กำหนดตอน build เท่านั้น (TARGET_MQTT_URI): <b>" TARGET_MQTT_URI "</b></p>"
             "<p style='color:#856404;'>⚠️ ค่าในฟอร์มด้านล่างถูกเก็บใน NVS แต่ <b>ไม่ถูกใช้</b> เชื่อมต่อ MQTT "
             "(เปลี่ยน broker ต้องแก้ DEPLOY_ENV ใน main.c แล้ว build ใหม่)</p>"
             "<form action='/host' method='POST'>"
             "  <label>ค่าที่เก็บใน NVS (ไม่ถูกใช้):</label>"
             "  <input type='text' name='uri' value='",
             uri_esc,
             "' placeholder='mqtt://192.168.1.50:1883'>"
             "  <input type='submit' class='btn' value='บันทึกลง NVS'>"
             "</form>"
             "<p><a href='/'>กลับหน้าหลัก</a></p>",
    };
    return send_html_parts(req, parts, sizeof(parts) / sizeof(parts[0]));
}

// Route /host (POST)
static esp_err_t host_post_handler(httpd_req_t *req) {
    char buf[150];
    int ret, received = 0;
    
    if (req->content_len >= sizeof(buf)) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Request body too long");
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

    char uri_val[128] = {0};
    esp_err_t qerr = httpd_query_key_value(buf, "uri", uri_val, sizeof(uri_val));
    if (qerr == ESP_ERR_HTTPD_RESULT_TRUNC) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "uri too long");
        return ESP_OK;
    }
    if (qerr == ESP_OK) {
        char decoded_uri[sizeof(mqtt_broker_uri_dynamic)] = {0};
        if (!url_decode(decoded_uri, sizeof(decoded_uri), uri_val)) { // ใช้ฟังก์ชันถอดรหัส
            httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "uri too long");
            return ESP_OK;
        }
        
        memcpy(mqtt_broker_uri_dynamic, decoded_uri, sizeof(mqtt_broker_uri_dynamic)); // url_decode ปิดด้วย '\0' ภายในขนาดนี้แล้ว
        ESP_LOGI(WS_TAG, "บันทึก MQTT URI ลง NVS (ไม่ถูกใช้ เชื่อมต่อจริงใช้ TARGET_MQTT_URI): %s", mqtt_broker_uri_dynamic);
        
        // ℹ️ ไม่ restart MQTT client แล้ว: restart_mqtt_client() ใช้ TARGET_MQTT_URI เสมอ
        // การ restart จึงแค่ตัดสตรีมเสียงชั่วคราวโดยไม่เปลี่ยน broker
        save_mqtt_uri_to_nvs(mqtt_broker_uri_dynamic); 
    }

    char uri_esc[sizeof(mqtt_broker_uri_dynamic) * 6];
    html_escape(uri_esc, sizeof(uri_esc), mqtt_broker_uri_dynamic);
             
    const char *parts[] = {
             "<h2>บันทึกลง NVS แล้ว</h2>"
             "<p>ค่าที่บันทึก: <b>",
             uri_esc,
             "</b></p>"
             "<p>⚠️ ไม่มีผลกับการเชื่อมต่อ MQTT — เฟิร์มแวร์นี้ใช้ broker ที่กำหนดตอน build: <b>" TARGET_MQTT_URI "</b></p>"
             "<script>setTimeout(function(){window.location.href='/admin';}, 3000);</script>",
    };
    return send_html_parts(req, parts, sizeof(parts) / sizeof(parts[0]));
}

// Route /scanwifi (GET)
static esp_err_t scanwifi_get_handler(httpd_req_t *req) {
    uint16_t number = 15; uint16_t ap_count = 0;
    // 🌟 ใช้ heap แทน stack ของเว็บเซิร์ฟเวอร์ (15 records ~1.2 KB)
    wifi_ap_record_t *ap_info = (wifi_ap_record_t *)calloc(number, sizeof(wifi_ap_record_t));
    if (ap_info == NULL) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Out of memory");
        return ESP_OK;
    }
    esp_wifi_scan_start(NULL, true);
    esp_wifi_scan_get_ap_num(&ap_count);   // ถามจำนวนก่อน เพราะ get_ap_records จะคืนหน่วยความจำผลสแกนทิ้ง
    if (esp_wifi_scan_get_ap_records(&number, ap_info) != ESP_OK) {
        number = 0;
    }

    httpd_resp_set_type(req, "text/html; charset=utf-8");
    char chunk[1024];
    char ssid_esc[sizeof(ap_info[0].ssid) * 6];
    esp_err_t err = httpd_resp_send_chunk(req, html_header, HTTPD_RESP_USE_STRLEN);
    if (err == ESP_OK) {
        snprintf(chunk, sizeof(chunk), "<h2>สแกนพบ Wi-Fi (%d ช่องสัญญาณ)</h2><ul>", ap_count);
        err = httpd_resp_send_chunk(req, chunk, HTTPD_RESP_USE_STRLEN);
    }
    
    for (int i = 0; err == ESP_OK && i < number; i++) {
        // 🛡️ SSID มาจากใครก็ได้ที่ปล่อย Wi-Fi ใกล้ๆ ต้อง escape ก่อนใส่ลง HTML
        if (!html_escape(ssid_esc, sizeof(ssid_esc), (char*)ap_info[i].ssid)) continue;
        int n = snprintf(chunk, sizeof(chunk),
                 "<li>"
                 "  <span><b>%s</b> (RSSI: %d dBm)</span>"
                 "  <form action='/connect' method='POST' style='margin:0;'>"
                 "    <input type='hidden' name='ssid' value='%s'>"
                 "    <input type='password' name='password' placeholder='รหัสผ่าน Wi-Fi' style='width:150px; margin-right:5px; padding:5px;'>"
                 "    <input type='submit' class='btn' value='เชื่อมต่อ' style='padding:5px 10px;'>"
                 "  </form>"
                 "</li>",
                 ssid_esc, ap_info[i].rssi, ssid_esc);
        if (n < 0 || n >= (int)sizeof(chunk)) continue;   // ไม่ส่งแถวที่ถูกตัด
        err = httpd_resp_send_chunk(req, chunk, HTTPD_RESP_USE_STRLEN);
    }
    free(ap_info);
    if (err != ESP_OK) return ESP_FAIL;

    if (httpd_resp_send_chunk(req, "</ul><p><a href='/'>กลับหน้าหลัก</a></p>", HTTPD_RESP_USE_STRLEN) != ESP_OK) return ESP_FAIL;
    if (httpd_resp_send_chunk(req, html_footer, HTTPD_RESP_USE_STRLEN) != ESP_OK) return ESP_FAIL;
    httpd_resp_send_chunk(req, NULL, 0); 
    
    return ESP_OK;
}

// 🟢 Route /connect (POST: ส่งหน้าจอให้ผู้ใช้กดค้างเพื่อ Copy ลิงก์ แบบ Manual)
static esp_err_t connect_post_handler(httpd_req_t *req) {
    char buf[512]; 
    int ret, received = 0;

    if (req->content_len >= sizeof(buf)) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Request body too long");
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

    // ขนาดตาม wifi_config_t: SSID ≤ 32 byte, รหัส ≤ 64 byte (+1 สำหรับ '\0')
    // ค่าดิบเป็น URL-encoded ซึ่งแต่ละ byte อาจกลายเป็น %XX (3 ตัวอักษร) จึงเผื่อไว้ 3 เท่า
    char ssid_raw[32 * 3 + 1] = {0}, pass_raw[64 * 3 + 1] = {0};
    char ssid[32 + 1] = {0}, password[64 + 1] = {0};

    esp_err_t ssid_err = httpd_query_key_value(buf, "ssid", ssid_raw, sizeof(ssid_raw));
    esp_err_t pass_err = httpd_query_key_value(buf, "password", pass_raw, sizeof(pass_raw));

    if (ssid_err == ESP_ERR_HTTPD_RESULT_TRUNC || pass_err == ESP_ERR_HTTPD_RESULT_TRUNC ||
        !url_decode(ssid, sizeof(ssid), ssid_raw) ||
        !url_decode(password, sizeof(password), pass_raw)) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "SSID (max 32 bytes) or password (max 64 bytes) is too long");
        return ESP_OK;
    }

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
    static const char body[] =
             "<h2>กำลังพยายามเชื่อมต่อ Wi-Fi อีกครั้ง...</h2>"
             "<p>ระบบกำลังค้นหาและเชื่อมต่อไปยัง Wi-Fi เดิมที่เคยบันทึกไว้ (เช็คสถานะได้จากไฟ LED)</p>"
             "<script>setTimeout(function(){window.location.href='/';}, 3000);</script>";
    
    return send_html_page(req, body);
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
    // JSON: SSID ละ ≤ 32 byte ที่ escape แล้วยาวได้สูงสุด 6 เท่า (\u00XX) + เครื่องหมายคำพูด 2 + ',' 1
    const size_t json_cap = (size_t)max_ap * (32 * 6 + 3) + 3;
    wifi_ap_record_t *ap_info = (wifi_ap_record_t *)malloc(sizeof(wifi_ap_record_t) * max_ap);
    char *json_response = (char *)malloc(json_cap);

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

    size_t used = 0;
    json_response[used++] = '[';
    bool first_item = true;

    for (int i = 0; i < max_ap; i++) {
        // กรองเอาเฉพาะ Wi-Fi ที่มีชื่อ (ไม่ซ่อน SSID)
        if (strlen((char *)ap_info[i].ssid) > 0) {
            char ssid_buffer[32 * 6 + 3];
            
            // 🛡️ escape " \ และอักขระควบคุมใน SSID ไม่ให้ JSON พัง
            if (!json_escape_quoted(ssid_buffer, sizeof(ssid_buffer), (char *)ap_info[i].ssid)) continue;
            size_t n = strlen(ssid_buffer);
            if (used + n + 3 > json_cap) break;   // ',' + ']' + '\0'
            if (!first_item) json_response[used++] = ',';
            memcpy(json_response + used, ssid_buffer, n);
            used += n;
            first_item = false;
        }
    }
    json_response[used++] = ']';
    json_response[used] = '\0';
    
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