// ข้อมูลตั้งต้นของแต่ละไฟล์ test — ทุกอย่างมีชื่อ/อีเมล/MAC ไม่ซ้ำต่อรอบ และถูกจดไว้ใน Cleanup
const crypto = require('crypto');
const api = require('./api');
const db = require('./db');

// อีเมลและ MAC ไม่ซ้ำกันระหว่างรอบ จึงรันซ้ำได้แม้รอบก่อนลบไม่ครบ
const RUN_ID = `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
let counter = 0;

function uniqueEmail(label) {
  counter += 1;
  return `apitest.${label}.${RUN_ID}.${counter}@example.com`;
}

function uniqueName(label) {
  counter += 1;
  return `APITEST ${label} ${RUN_ID}-${counter}`;
}

/** MAC แบบ locally administered (02:...) จึงไม่ชนบอร์ด ESP32 จริงหรือข้อมูล seed (02:5E:ED:...) */
function uniqueMac() {
  const b = crypto.randomBytes(4);
  return ['02', '7E', ...[...b].map((x) => x.toString(16).padStart(2, '0').toUpperCase())].join(':');
}

function password() {
  return `Pw-${crypto.randomBytes(9).toString('base64url')}`;
}

/**
 * สมัครผ่าน API จริง (POST /api/auth/register) แล้วตั้ง is_verified / role ใน DB
 * (ยืนยันอีเมลจริงต้องเปิดลิงก์ในอีเมล — TC-03 ทดสอบเส้นทางนั้นแยกต่างหาก)
 */
async function createUser(cleanup, { label = 'user', role = 'caregiver', verified = true, login = true } = {}) {
  const email = uniqueEmail(label);
  const pwd = password();
  const res = await api().post('/api/auth/register').send({ name: uniqueName(label), email, password: pwd });
  if (res.status !== 201) throw new Error(`register ${email} failed: ${res.status} ${JSON.stringify(res.body)}`);

  const row = await db.one('SELECT id FROM users WHERE email = $1', [email]);
  cleanup.user(row.id);
  await db.query('UPDATE users SET is_verified = $2, role = $3 WHERE id = $1', [row.id, verified, role]);

  const user = { id: row.id, email, password: pwd, role, token: null };
  if (login && verified) {
    const loginRes = await api().post('/api/auth/login').send({ email, password: pwd });
    if (loginRes.status !== 200) throw new Error(`login ${email} failed: ${loginRes.status}`);
    user.token = loginRes.body.token;
  }
  return user;
}

/** อุปกรณ์ตรงใน DB (ใช้เป็นข้อมูลตั้งต้น — การลงทะเบียนผ่าน API ทดสอบใน TC-31) */
async function createDevice(cleanup, { active = false, status = 'offline' } = {}) {
  const mac = cleanup.mac(uniqueMac());
  const row = await db.one(
    `INSERT INTO devices (created_at, updated_at, mac_address, ip_address, status, is_active, is_verified)
     VALUES (now(), now(), $1, '10.99.0.1', $2, $3, true) RETURNING id`,
    [mac, status, active],
  );
  cleanup.device(row.id);
  return { id: row.id, mac };
}

/** ผู้ป่วยตรงใน DB ผูกกับผู้ดูแล และ (ถ้าส่ง device) ผูกอุปกรณ์ผ่าน device_patients */
async function createPatient(cleanup, caregiver, { device = null, label = 'patient' } = {}) {
  const name = uniqueName(label);
  const row = await db.one(
    `INSERT INTO patients (created_at, updated_at, name, age, gender, room_number, medical_condition)
     VALUES (now(), now(), $1, 80, 'หญิง', 'T-01', 'ทดสอบ') RETURNING id`,
    [name],
  );
  cleanup.patient(row.id);
  await db.query(`INSERT INTO caregiver_patients (patient_id, user_id, created_at) VALUES ($1, $2, now())`, [row.id, caregiver.id]);
  if (device) {
    await db.query(
      `INSERT INTO device_patients (created_at, updated_at, device_id, patient_id, device_name) VALUES (now(), now(), $1, $2, 'ไมค์ทดสอบ')`,
      [device.id, row.id],
    );
  }
  return { id: row.id, name };
}

/** WAV 8 kHz mono 16-bit (ไซน์ 440 Hz) */
function wav(seconds = 0.5) {
  const rate = 8000;
  const n = Math.round(rate * seconds);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i += 1) buf.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / rate)), 44 + i * 2);
  return buf;
}

/** ส่งเหตุฉุกเฉินแบบที่ Python receiver ส่ง (multipart: audio + device_mac + event_type + confidence) */
function postEmergency(mac, { file = wav(), filename = 'emergency.wav', headers = api.internal() } = {}) {
  return api()
    .post('/api/audio/emergency')
    .set(headers)
    .field('device_mac', mac)
    .field('event_type', 'needs_help')
    .field('confidence', '0.93')
    .attach('audio', file, filename);
}

/** ข้อมูล seed (go run ./cmd/seed) ถ้ามี — คืน null ถ้าไม่มี */
async function seedData() {
  const devices = await db.query(
    `SELECT id, mac_address, is_active FROM devices WHERE mac_address IN ('02:5E:ED:00:00:01', '02:5E:ED:00:00:04') AND deleted_at IS NULL`,
  );
  const active = devices.find((d) => d.mac_address === '02:5E:ED:00:00:01' && d.is_active);
  const inactive = devices.find((d) => d.mac_address === '02:5E:ED:00:00:04' && !d.is_active);
  if (!active || !inactive) return null;
  const patients = await db.query(
    `SELECT p.id, p.name FROM patients p JOIN device_patients dp ON dp.patient_id = p.id AND dp.deleted_at IS NULL
     JOIN devices d ON d.id = dp.device_id WHERE d.mac_address LIKE '02:5E:ED:%' AND p.deleted_at IS NULL`,
  );
  return { activeMac: active.mac_address, inactiveMac: inactive.mac_address, patients };
}

module.exports = {
  RUN_ID, uniqueEmail, uniqueName, uniqueMac, password,
  createUser, createDevice, createPatient, wav, postEmergency, seedData,
};
