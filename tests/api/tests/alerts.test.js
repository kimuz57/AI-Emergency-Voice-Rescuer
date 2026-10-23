// ตารางที่ 3.28 กลุ่มระบบเหตุการณ์และไฟล์เสียง (TC-32 ถึง TC-42, TC-55, TC-56) + ข้อมูลผิดรูปแบบ
const api = require('../helpers/api');
const db = require('../helpers/db');
const redis = require('../helpers/redis');
const tokens = require('../helpers/tokens');
const { AI_BASE_URL, SSE_TIMEOUT_MS } = require('../helpers/config');
const { openStream } = require('../helpers/sse');
const { note } = require('../helpers/notes');
const { createUser, createDevice, createPatient, postEmergency, wav } = require('../helpers/fixtures');

const cleanup = new db.Cleanup();
let admin;
let caregiver;
let device;
let patient;
const logs = []; // { id, filename }

beforeAll(async () => {
  admin = await createUser(cleanup, { label: 'al-admin', role: 'admin' });
  caregiver = await createUser(cleanup, { label: 'al-caregiver' });
  device = await createDevice(cleanup, { active: true, status: 'online' });
  patient = await createPatient(cleanup, caregiver, { device, label: 'al-patient' });
  await redis.del([`alert:notify:${device.mac}`]);
});

afterAll(async () => {
  await cleanup.run({ adminToken: admin && admin.token });
  await db.close();
});

async function emergency() {
  const res = await postEmergency(device.mac);
  if (res.status === 200 && res.body.log_id) {
    cleanup.log(res.body.log_id);
    const row = await db.one('SELECT audio_url FROM detection_logs WHERE id = $1', [res.body.log_id]);
    logs.push({ id: res.body.log_id, filename: row.audio_url.replace('/api/audio/', '') });
  }
  return res;
}

const countLogs = async () => Number((await db.one(
  'SELECT count(*) AS n FROM detection_logs WHERE device_mac = $1 AND deleted_at IS NULL', [device.mac],
)).n);

(AI_BASE_URL ? test : test.skip)('TC-32 POST /need-help on the AI server returns detected and probability (needs AI_BASE_URL)', async () => {
  const res = await require('supertest')(AI_BASE_URL).post('/need-help').attach('sound', wav(2), 'help.wav');
  expect(res.status).toBe(200);
  expect(['yes', 'no']).toContain(res.body.detected);
  expect(res.body.probability).toBeGreaterThanOrEqual(0);
  expect(res.body.probability).toBeLessThanOrEqual(1);
});

test('TC-33 POST /api/audio/emergency (with X-Internal-Key) creates a detection_logs row and starts the notification', async () => {
  const res = await emergency();
  expect(res.status).toBe(200);
  const row = await db.one('SELECT patient_id, device_mac, status, is_resolved FROM detection_logs WHERE id = $1', [res.body.log_id]);
  expect(row).toEqual({ patient_id: patient.id, device_mac: device.mac, status: 'needs_help', is_resolved: false });
  // ส่ง LINE/Telegram จริงตรวจจาก API ไม่ได้ — หลักฐานว่าเข้าเส้นทางแจ้งเตือนคือ throttle key ที่ถูกตั้ง (อายุ ≤ 60 วิ)
  // ส่วน SSE ตรวจใน TC-42
  if (redis.enabled) {
    const ttl = await redis.ttl(`alert:notify:${device.mac}`);
    note('TC-33', `log_id ${res.body.log_id}, alert:notify TTL ${ttl} s`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  }
});

test('TC-34 a second emergency within 60 s is recorded but not notified again', async () => {
  const before = await countLogs();
  const ttlBefore = redis.enabled ? await redis.ttl(`alert:notify:${device.mac}`) : null;
  const res = await emergency();
  expect(res.status).toBe(200);
  const after = await countLogs();
  note('TC-34', `detection_logs ${before} -> ${after}`);
  expect(after).toBe(before + 1); // บันทึกเพิ่ม
  // ไม่แจ้งซ้ำ = SetNX ไม่สำเร็จ key เดิมไม่ถูกตั้งใหม่ (TTL ไม่ถูกรีเซ็ตกลับเป็น 60)
  if (redis.enabled) {
    const ttlAfter = await redis.ttl(`alert:notify:${device.mac}`);
    note('TC-34', `alert:notify TTL ${ttlBefore} -> ${ttlAfter} s (ไม่ถูกตั้งใหม่)`);
    expect(ttlAfter).toBeLessThanOrEqual(ttlBefore);
  }
});

test('VAL-10 POST /api/audio/emergency with a file that is not WAV returns 400', async () => {
  const before = await countLogs();
  const res = await postEmergency(device.mac, { file: Buffer.from('<html>not audio</html>'), filename: 'page.html' });
  if (res.body && res.body.log_id) cleanup.log(res.body.log_id);
  expect(res.status).toBe(400);
  expect(await countLogs()).toBe(before);
});

test('VAL-11 POST /api/audio/emergency without the audio field returns 400', async () => {
  const res = await api().post('/api/audio/emergency').set(api.internal()).field('device_mac', device.mac);
  expect(res.status).toBe(400);
});

test('VAL-12 POST /api/audio/emergency without X-Internal-Key or with a wrong key returns 401', async () => {
  const none = await postEmergency(device.mac, { headers: {} });
  const wrong = await postEmergency(device.mac, { headers: { 'X-Internal-Key': 'wrong-key' } });
  expect(none.status).toBe(401);
  expect(wrong.status).toBe(401);
});

test('TC-35 GET /api/alerts lists the unresolved alerts of the caller\'s patients', async () => {
  const res = await api().get('/api/alerts').set(api.bearer(caregiver.token));
  expect(res.status).toBe(200);
  const ids = res.body.map((a) => a.id);
  logs.forEach((l) => expect(ids).toContain(l.id));
  expect(res.body.every((a) => a.status === 'needs_help')).toBe(true);
});

test('TC-36 GET /api/alerts/history returns the events with patient data', async () => {
  const res = await api().get('/api/alerts/history').set(api.bearer(caregiver.token));
  expect(res.status).toBe(200);
  const mine = res.body.find((h) => h.id === logs[0].id);
  expect(mine).toMatchObject({ device_mac: device.mac, patient_name: patient.name, room_number: 'T-01' });
});

test('TC-37 GET /api/alerts/stats returns counts for today, this week and in total', async () => {
  const res = await api().get('/api/alerts/stats').set(api.bearer(caregiver.token));
  expect(res.status).toBe(200);
  const expected = await countLogs(); // ผู้ดูแลคนนี้เห็นแค่ผู้ป่วยของตัวเอง ซึ่งเหตุทั้งหมดเกิดวันนี้
  expect(res.body.summary).toMatchObject({ today: expected, this_week: expected, total: expected });
});

test('TC-41 GET /api/audio/:filename with a JWT (or an alert token) returns the WAV file', async () => {
  const { filename } = logs[0];
  const res = await api().get(`/api/audio/${filename}`).set(api.bearer(caregiver.token)).buffer(true);
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toContain('audio/wav');
  expect(Buffer.from(res.body).subarray(0, 4).toString()).toBe('RIFF');

  if (tokens.hasSecret) {
    const viaLink = await api().get(`/api/audio/${filename}`)
      .query({ mac: device.mac, alert_token: tokens.alertToken(device.mac) }).buffer(true);
    expect(viaLink.status).toBe(200);
  }
});

test('TC-56 GET /api/audio/:filename without a token returns 401', async () => {
  const res = await api().get(`/api/audio/${logs[0].filename}`);
  expect(res.status).toBe(401);
});

test('TC-42 GET /api/alerts/stream (JWT) delivers a new emergency within 3 seconds', async () => {
  const stream = openStream('/api/alerts/stream', caregiver.token);
  try {
    await stream.ready; // stream เปิดแล้ว (ได้ event แรก) ค่อยส่งเหตุ
    let newId = null;
    const waiting = stream.waitFor((list) => Array.isArray(list) && list.some((a) => a.id === newId), SSE_TIMEOUT_MS);
    const res = await emergency();
    expect(res.status).toBe(200);
    newId = res.body.log_id;
    const { elapsedMs } = await waiting;
    note('TC-42', `ได้ event ใน ${elapsedMs} ms`);
    expect(elapsedMs).toBeLessThanOrEqual(SSE_TIMEOUT_MS);
  } finally {
    stream.close();
  }
});

test('TC-38 PUT /api/alerts/:id/resolve sets is_resolved to true', async () => {
  const res = await api().put(`/api/alerts/${logs[0].id}/resolve`).set(api.bearer(caregiver.token));
  expect(res.status).toBe(200);
  const row = await db.one('SELECT is_resolved, status, resolved_at FROM detection_logs WHERE id = $1', [logs[0].id]);
  expect(row.is_resolved).toBe(true);
  expect(row.status).toBe('resolved');
  expect(row.resolved_at).not.toBeNull();
});

test('TC-39 PUT /api/alerts/:id/resolve for an event that does not exist returns 404', async () => {
  const res = await api().put('/api/alerts/2147483000/resolve').set(api.bearer(caregiver.token));
  expect(res.status).toBe(404);
});

test('TC-55 POST /api/alerts/acknowledge without an alert token or with a wrong one returns 401', async () => {
  const none = await api().post('/api/alerts/acknowledge').send({ mac_address: device.mac });
  const wrong = await api().post('/api/alerts/acknowledge')
    .send({ mac_address: device.mac, token: `${Math.floor(Date.now() / 1000) + 3600}.forged-signature` });
  expect(none.status).toBe(401);
  expect(wrong.status).toBe(401);
  const open = await db.one('SELECT count(*) AS n FROM detection_logs WHERE device_mac = $1 AND is_resolved = false', [device.mac]);
  expect(Number(open.n)).toBeGreaterThan(0); // ไม่มีอะไรถูกปิด
});

(tokens.hasSecret ? test : test.skip)('TC-40 POST /api/alerts/acknowledge with the alert token from the message acknowledges the event (needs JWT_SECRET)', async () => {
  const latest = await db.one(
    'SELECT id FROM detection_logs WHERE device_mac = $1 AND is_resolved = false ORDER BY created_at DESC LIMIT 1', [device.mac],
  );
  const res = await api().post('/api/alerts/acknowledge').send({ mac_address: device.mac, token: tokens.alertToken(device.mac) });
  expect(res.status).toBe(200);
  const row = await db.one('SELECT is_resolved, status FROM detection_logs WHERE id = $1', [latest.id]);
  expect(row).toEqual({ is_resolved: true, status: 'resolved' });
});
