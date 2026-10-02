# Mosquitto (MQTT broker)

ใช้ผ่าน `docker compose up -d mosquitto` จาก root ของ repo (ดู `docker-compose.yml`)
config อยู่ที่ `config/mosquitto.conf` — listener: 1883 (MQTT), 8083 (WSS + TLS), 9001 (WS)

ไฟล์ต่อไปนี้ **ถูก gitignore** ต้องสร้างเองก่อนเปิด broker ครั้งแรก
ถ้าไม่มี Docker จะสร้าง path ที่หายเป็นโฟลเดอร์ว่างให้ และ broker จะ start ไม่ขึ้น

## 1. สร้างไฟล์รหัสผ่าน `config/passwd`

`mosquitto.conf` ตั้ง `allow_anonymous false` จึงต้องมี user อย่างน้อยหนึ่งตัว
(รันที่ root ของ repo, `-c` = สร้างไฟล์ใหม่ ใช้แค่ครั้งแรก ตัวถัดไปไม่ต้องใส่ `-c`)

```sh
docker run --rm -it -v "${PWD}/mosquitto/config:/mosquitto/config" eclipse-mosquitto:2 \
  mosquitto_passwd -c /mosquitto/config/passwd esp32-device
docker run --rm -it -v "${PWD}/mosquitto/config:/mosquitto/config" eclipse-mosquitto:2 \
  mosquitto_passwd /mosquitto/config/passwd ai-receiver
```

PowerShell ใช้ `${PWD}` ได้เหมือนกัน ส่วน cmd.exe ใช้ `%cd%` แทน
user ของ receiver ต้องตรงกับ `MQTT_USER` / `MQTT_PASSWORD` ใน `api/.env`
และ user ของบอร์ดต้องตรงกับที่ compile ไว้ใน firmware

## 2. สร้าง certificate สำหรับ WSS `certs/server.crt` + `certs/server.key`

listener 8083 ต้องใช้สองไฟล์นี้ ถ้าไม่มี broker จะ start ไม่ขึ้นทั้งตัว
สำหรับเครื่อง dev ใช้ self-signed ได้ (production ใช้ cert จริงของโดเมน):

```sh
mkdir -p mosquitto/certs
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout mosquitto/certs/server.key -out mosquitto/certs/server.crt -subj "/CN=localhost"
```

client ที่ต่อ 8083 ด้วย self-signed cert ต้องเชื่อ cert นี้ หรือ (dev เท่านั้น)
ตั้ง `TLS_INSECURE_SKIP_VERIFY=true` ใน `api/.env`

## 3. เปิด ACL (แนะนำ)

ถ้าไม่มี ACL user ที่มีรหัสคนไหนก็ publish `voice/audio/{MAC ใดก็ได้}` ได้

1. copy `config/acl.example` เป็น `config/acl`
2. แก้ชื่อ user ให้ตรงกับที่สร้างใน `passwd`
3. เอา `#` หน้า `acl_file /mosquitto/config/acl` ใน `config/mosquitto.conf` ออก
4. `docker compose restart mosquitto`

⚠️ เมื่อเปิด `acl_file` แล้ว ทุกอย่างที่ไม่ได้อนุญาตไว้จะถูกปฏิเสธ ถ้าชื่อ user ไม่ตรง
บอร์ดและ receiver จะ publish/subscribe ไม่ได้เลย ให้ดู log ด้วย `docker compose logs -f mosquitto`
