// ตารางที่ 3.26 กลุ่มระบบจัดการผู้ป่วย (TC-19 ถึง TC-25) + ข้อมูลผิดรูปแบบ
const api = require('../helpers/api');
const db = require('../helpers/db');
const { SSE_TIMEOUT_MS } = require('../helpers/config');
const { openStream } = require('../helpers/sse');
const { note } = require('../helpers/notes');
const { createUser, createDevice, createPatient, uniqueName, seedData } = require('../helpers/fixtures');

const cleanup = new db.Cleanup();
let admin;
let me;
let other;
let mine;
let theirs;
let seed;

beforeAll(async () => {
  admin = await createUser(cleanup, { label: 'pt-admin', role: 'admin' });
  me = await createUser(cleanup, { label: 'pt-me' });
  other = await createUser(cleanup, { label: 'pt-other' });
  mine = await createPatient(cleanup, me, { label: 'pt-mine' });
  theirs = await createPatient(cleanup, other, { label: 'pt-theirs' });
  seed = await seedData();
});

afterAll(async () => {
  await cleanup.run({ adminToken: admin && admin.token });
  await db.close();
});

/** ผู้ป่วยที่ผู้ดูแลคนนี้เพิ่งสร้างแต่ API ไม่คืน id มา — หาจากชื่อแล้วจดไว้ลบ */
async function trackPatientsNamed(name) {
  const rows = await db.query('SELECT id FROM patients WHERE name = $1', [name]);
  rows.forEach((r) => cleanup.patient(r.id));
  return rows;
}

test('TC-19 GET /api/patients returns only the caller\'s own patients', async () => {
  const res = await api().get('/api/patients').set(api.bearer(me.token));
  expect(res.status).toBe(200);
  const ids = res.body.map((p) => p.ID);
  expect(ids).toContain(mine.id);
  expect(ids).not.toContain(theirs.id);
  if (seed) seed.patients.forEach((p) => expect(ids).not.toContain(p.id)); // ผู้ป่วยของผู้ดูแล seed
});

test('TC-20 POST /api/patients/register creates the patient and binds the device', async () => {
  const device = await createDevice(cleanup, { active: false });
  const name = uniqueName('pt-register');
  const res = await api().post('/api/patients/register').set(api.bearer(me.token)).send({
    patientName: name, age: 77, gender: 'ชาย', roomNumber: 'R-201', medicalCondition: 'ความดันสูง',
    board_id: device.mac.toLowerCase(), deviceName: 'ไมค์หัวเตียง',
  });
  const [patient] = await trackPatientsNamed(name);
  expect(res.status).toBe(200);
  expect(patient).toBeDefined();

  const link = await db.one('SELECT user_id FROM caregiver_patients WHERE patient_id = $1 AND deleted_at IS NULL', [patient.id]);
  expect(link.user_id).toBe(me.id);
  const binding = await db.one('SELECT device_id, device_name FROM device_patients WHERE patient_id = $1 AND deleted_at IS NULL', [patient.id]);
  expect(binding).toEqual({ device_id: device.id, device_name: 'ไมค์หัวเตียง' });
  const dev = await db.one('SELECT is_active FROM devices WHERE id = $1', [device.id]);
  expect(dev.is_active).toBe(true);
});

test('TC-21 POST /api/patients/register with missing required fields returns 400', async () => {
  const before = await db.one('SELECT max(id) AS id FROM patients');
  const res = await api().post('/api/patients/register').set(api.bearer(me.token)).send({ age: 70 });
  // ถ้าเซิร์ฟเวอร์สร้างผู้ป่วยไปแล้ว ให้ลบทิ้งด้วย
  const created = await db.query(
    `SELECT p.id FROM patients p JOIN caregiver_patients cp ON cp.patient_id = p.id WHERE p.id > $1 AND cp.user_id = $2`,
    [before.id || 0, me.id],
  );
  created.forEach((r) => cleanup.patient(r.id));
  expect(res.status).toBe(400);
  expect(created).toHaveLength(0);
});

test('VAL-04 POST /api/patients/register with a malformed board_id (MAC) returns 400', async () => {
  const name = uniqueName('pt-badmac');
  const res = await api().post('/api/patients/register').set(api.bearer(me.token))
    .send({ patientName: name, roomNumber: 'R-1', board_id: 'ZZ:not-a-mac' });
  await trackPatientsNamed(name);
  expect(res.status).toBe(400);
});

test('VAL-05 POST /api/patients/register with malformed JSON returns 400', async () => {
  const res = await api().post('/api/patients/register').set(api.bearer(me.token))
    .set('Content-Type', 'application/json').send('{"patientName": "x",');
  expect(res.status).toBe(400);
});

test('TC-22 PUT /api/patients/:id updates the patient', async () => {
  const name = uniqueName('pt-edited');
  const res = await api().put(`/api/patients/${mine.id}`).set(api.bearer(me.token))
    .send({ patientName: name, age: 81, gender: 'หญิง', roomNumber: 'R-305', medicalCondition: 'เบาหวาน' });
  expect(res.status).toBe(200);
  const row = await db.one('SELECT name, age, room_number, medical_condition FROM patients WHERE id = $1', [mine.id]);
  expect(row).toEqual({ name, age: 81, room_number: 'R-305', medical_condition: 'เบาหวาน' });
});

test('TC-25 GET /api/patients/stream delivers the patient list over SSE', async () => {
  const stream = openStream('/api/patients/stream', me.token);
  try {
    const { data, elapsedMs } = await stream.waitFor((list) => Array.isArray(list) && list.some((p) => p.ID === mine.id), SSE_TIMEOUT_MS);
    note('TC-25', `ได้รายชื่อผู้ป่วยใน ${elapsedMs} ms`);
    expect(data.map((p) => p.ID)).not.toContain(theirs.id);
  } finally {
    stream.close();
  }
});

test('TC-23 DELETE /api/patients/:id soft-deletes the patient', async () => {
  const res = await api().delete(`/api/patients/${mine.id}`).set(api.bearer(me.token));
  expect(res.status).toBe(200);
  const row = await db.one('SELECT deleted_at FROM patients WHERE id = $1', [mine.id]);
  expect(row).not.toBeNull();          // แถวยังอยู่
  expect(row.deleted_at).not.toBeNull(); // แต่ถูกทำเครื่องหมายว่าลบ
});

test('TC-24 DELETE /api/patients/:id for a patient that does not exist returns 404', async () => {
  const res = await api().delete('/api/patients/2147483000').set(api.bearer(me.token));
  expect(res.status).toBe(404);
});
