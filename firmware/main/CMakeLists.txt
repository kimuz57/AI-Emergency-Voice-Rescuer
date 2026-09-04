idf_component_register(
    SRCS "main.c"
    INCLUDE_DIRS "."
    EMBED_TXTFILES "wifi.html"
    REQUIRES
        freertos
        lwip
        mqtt
        esp_netif
        esp_wifi
        esp_event
        nvs_flash
        driver
        esp_timer
        esp_rom
        esp_http_client
        esp_http_server
)