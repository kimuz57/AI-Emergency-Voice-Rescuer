idf_component_register(
    SRCS "voice_recorder.c"
    INCLUDE_DIRS "."
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
)
