// อ่านค่าจาก tests/api/.env.test (ห้าม commit ไฟล์นี้ — ดู .env.test.example)
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.test'), quiet: true });

function required(key) {
  const value = (process.env[key] || '').trim();
  if (!value) {
    throw new Error(`ต้องตั้ง ${key} ใน tests/api/.env.test (ดู .env.test.example)`);
  }
  return value;
}

function optional(key) {
  const value = (process.env[key] || '').trim();
  return value || null;
}

module.exports = {
  BASE_URL: required('BASE_URL').replace(/\/+$/, ''),
  INTERNAL_API_KEY: required('INTERNAL_API_KEY'),
  // ใช้เตรียมข้อมูล (ยืนยันอีเมล ตั้ง role) ตรวจผลในตาราง และลบข้อมูลที่ test สร้างทิ้ง
  DATABASE_URL: required('DATABASE_URL'),
  // ไม่บังคับ: ไม่ตั้ง = ข้ามเฉพาะการตรวจ key ใน Redis
  REDIS_URL: optional('REDIS_URL'),
  // ไม่บังคับ: ใช้สร้าง alert token (TC-40, TC-41) และ JWT หมดอายุ (TC-49) ให้ตรงกับเซิร์ฟเวอร์
  JWT_SECRET: optional('JWT_SECRET'),
  // ไม่บังคับ: ต้องตั้งถ้าเซิร์ฟเวอร์ตั้ง TELEGRAM_WEBHOOK_SECRET (TC-17 จำลองการกด Start ในบอท)
  TELEGRAM_WEBHOOK_SECRET: optional('TELEGRAM_WEBHOOK_SECRET'),
  // ไม่บังคับ: Google ID token จริงที่ aud ตรงกับ GOOGLE_CLIENT_ID ของเซิร์ฟเวอร์ (TC-08)
  GOOGLE_ID_TOKEN: optional('GOOGLE_ID_TOKEN'),
  // ไม่บังคับ: URL ของ Python AI server (TC-32)
  AI_BASE_URL: optional('AI_BASE_URL') && optional('AI_BASE_URL').replace(/\/+$/, ''),
  // ไม่บังคับ: โฟลเดอร์ที่ Go backend รันอยู่ (เครื่องเดียวกัน) ใช้ลบรูปโปรไฟล์ที่ TC-14 อัปโหลด
  BACKEND_DIR: optional('BACKEND_DIR'),
  SSE_TIMEOUT_MS: Number(process.env.SSE_TIMEOUT_MS || 3000),
};
