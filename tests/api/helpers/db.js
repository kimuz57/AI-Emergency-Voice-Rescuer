// เข้าถึง PostgreSQL ของเซิร์ฟเวอร์ที่ทดสอบ: เตรียมข้อมูล ตรวจผล และลบข้อมูลที่ test สร้าง
const { Pool, types } = require('pg');
const { DATABASE_URL } = require('./config');
const redis = require('./redis');

// id ของ GORM เป็น BIGINT (int8) ซึ่ง pg คืนเป็น string — แปลงเป็น number ให้เทียบกับ JSON ของ API ได้ (ไม่เกิน 2^53)
types.setTypeParser(types.builtins.INT8, (value) => Number(value));

const pool = new Pool({ connectionString: DATABASE_URL, max: 3 });

async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

/**
 * จดสิ่งที่ test สร้างไว้ แล้วลบแบบ hard delete ตอนจบไฟล์ (รันซ้ำได้ ไม่ทิ้งขยะ)
 * ลำดับการลบตาม foreign key: logs -> ตารางเชื่อม -> patients/devices -> users
 */
class Cleanup {
  constructor() {
    this.users = new Set();
    this.patients = new Set();
    this.devices = new Set();
    this.macs = new Set();
    this.logs = new Set();
    this.audioFiles = new Set();
    this.redisKeys = new Set();
    this.files = new Set();
  }

  user(id) { this.users.add(Number(id)); return id; }
  patient(id) { this.patients.add(Number(id)); return id; }
  device(id) { this.devices.add(Number(id)); return id; }
  mac(mac) { this.macs.add(String(mac).toUpperCase()); return mac; }
  log(id) { this.logs.add(Number(id)); return id; }
  audio(filename) { this.audioFiles.add(filename); return filename; }
  redisKey(key) { this.redisKeys.add(key); return key; }
  file(filePath) { this.files.add(filePath); return filePath; }

  async run({ adminToken } = {}) {
    const users = [...this.users];
    const macs = [...this.macs];

    // ไฟล์เสียงที่ /api/audio/emergency สร้างบนเครื่องเซิร์ฟเวอร์ ลบผ่าน API ของ admin (ต้องทำก่อนลบ log)
    const files = new Set(this.audioFiles);
    const logRows = await query(
      `SELECT audio_url FROM detection_logs WHERE id = ANY($1) OR UPPER(device_mac) = ANY($2)`,
      [[...this.logs], macs],
    );
    for (const row of logRows) {
      if (row.audio_url && row.audio_url.startsWith('/api/audio/')) files.add(row.audio_url.slice('/api/audio/'.length));
    }
    if (adminToken) {
      const api = require('./api');
      let pending = [...files];
      // ไฟล์ที่เพิ่งถูกเปิดฟัง (TC-41) Fiber SendFile ยังถือ handle ไว้ ~10 วิ บน Windows จึงลบไม่ได้ (500) — รอแล้วลองใหม่
      for (let attempt = 0; attempt < 6 && pending.length; attempt += 1) {
        if (attempt) await new Promise((r) => setTimeout(r, 3000));
        const failed = [];
        for (const filename of pending) {
          const res = await api().delete(`/api/audio/${encodeURIComponent(filename)}`).set('Authorization', `Bearer ${adminToken}`);
          if (res.status >= 500) failed.push(filename);
        }
        pending = failed;
      }
      if (pending.length) console.warn(`ลบไฟล์เสียงบนเซิร์ฟเวอร์ไม่สำเร็จ: ${pending.join(', ')}`);
    }

    const devices = [
      ...this.devices,
      ...(await query(`SELECT id FROM devices WHERE UPPER(mac_address) = ANY($1)`, [macs])).map((r) => r.id),
    ];

    await query(`DELETE FROM detection_logs WHERE id = ANY($1) OR UPPER(device_mac) = ANY($2)`, [[...this.logs], macs]);
    await query(`DELETE FROM device_patients WHERE device_id = ANY($1) OR patient_id = ANY($2)`, [devices, [...this.patients]]);
    await query(`DELETE FROM caregiver_patients WHERE user_id = ANY($1) OR patient_id = ANY($2)`, [users, [...this.patients]]);
    await query(`DELETE FROM user_line_mappings WHERE user_id = ANY($1)`, [users]);
    await query(`DELETE FROM user_telegram_mapping WHERE user_id = ANY($1)`, [users]);
    await query(`DELETE FROM patients WHERE id = ANY($1)`, [[...this.patients]]);
    await query(`DELETE FROM devices WHERE id = ANY($1)`, [devices]);

    const emails = (await query(`SELECT email FROM users WHERE id = ANY($1)`, [users])).map((r) => r.email);
    await query(`DELETE FROM users WHERE id = ANY($1)`, [users]);

    const keys = new Set(this.redisKeys);
    for (const mac of macs) {
      keys.add(`device:activation:${mac}`);
      keys.add(`alert:notify:${mac}`);
    }
    for (const id of devices) keys.add(`device:${id}:status`);
    for (const email of emails) keys.add(`verify:resend:${email.toLowerCase()}`);
    await redis.del([...keys]);

    const fs = require('fs');
    for (const filePath of this.files) fs.rmSync(filePath, { force: true });
  }
}

async function close() {
  await pool.end();
  await redis.close();
}

module.exports = { query, one, Cleanup, close };
