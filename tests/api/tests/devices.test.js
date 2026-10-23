// ตารางที่ 3.27 กลุ่มระบบอุปกรณ์รับเสียง (TC-26 ถึง TC-31, TC-53, TC-54) + ข้อมูลผิดรูปแบบ
const api = require('../helpers/api');
const db = require('../helpers/db');
const redis = require('../helpers/redis');
const { createUser, createDevice, createPatient, uniqueMac, seedData } = require('../helpers/fixtures');
const { note } = require('../helpers/notes');

const cleanup = new db.Cleanup();
let admin;
let caregiver;
let activeMac;
let inactiveMac;

beforeAll(async () => {
  admin = await createUser(cleanup, { label: 'dev-admin', role: 'admin' });
  caregiver = await createUser(cleanup, { label: 'dev-caregiver' });

  // ใช้อุปกรณ์จาก go run ./cmd/seed ถ้ามี ไม่งั้นสร้างเอง
  const seed = await seedData();
  if (seed) {
    note('SEED', 'ใช้อุปกรณ์จาก go run ./cmd/seed');
    activeMac = seed.activeMac;
    inactiveMac = seed.inactiveMac;
  } else {
    const active = await createDevice(cleanup, { active: true });
    await createPatient(cleanup, caregiver, { device: active, label: 'dev-bound' });
    activeMac = active.mac;
    inactiveMac = (await createDevice(cleanup, { active: false })).mac;
  }
});

afterAll(async () => {
  // cache ของอุปกรณ์ seed ที่ test นี้ทำให้เกิด
  cleanup.redisKey(`device:activation:${activeMac}`);
  cleanup.redisKey(`device:activation:${inactiveMac}`);
  await cleanup.run({ adminToken: admin && admin.token });
  await db.close();
});

test('TC-26 GET /api/device/checkin records the MAC and IP address', async () => {
  const mac = cleanup.mac(uniqueMac());
  const res = await api().get('/api/device/checkin').query({ mac: mac.toLowerCase(), ip: '192.168.50.23' });
  expect(res.status).toBe(200);
  const row = await db.one('SELECT mac_address, ip_address, status FROM devices WHERE mac_address = $1', [mac]);
  expect(row).toEqual({ mac_address: mac, ip_address: '192.168.50.23', status: 'online' });
});

test('VAL-06 GET /api/device/checkin with a malformed MAC returns 400', async () => {
  const bad = cleanup.mac(`not-a-mac-${Date.now()}`);
  const res = await api().get('/api/device/checkin').query({ mac: bad, ip: '192.168.50.24' });
  expect(res.status).toBe(400);
});

test('VAL-07 GET /api/device/checkin without ip returns 400', async () => {
  const res = await api().get('/api/device/checkin').query({ mac: uniqueMac() });
  expect(res.status).toBe(400);
});

test('TC-27 check-activation (with X-Internal-Key) reports an active device and caches it in Redis', async () => {
  await redis.del([`device:activation:${activeMac}`]);
  const res = await api().get('/api/device/check-activation').query({ mac: activeMac }).set(api.internal());
  expect(res.status).toBe(200);
  expect(res.body.is_active).toBe(true);
  expect(res.body.source).toBe('db');

  const again = await api().get('/api/device/check-activation').query({ mac: activeMac }).set(api.internal());
  expect(again.body).toEqual({ is_active: true, source: 'cache' });
  if (redis.enabled) {
    expect(JSON.parse(await redis.getKey(`device:activation:${activeMac}`))).toEqual({ is_active: true });
    expect(await redis.ttl(`device:activation:${activeMac}`)).toBeGreaterThan(3500); // 1 ชั่วโมง
  }
});

test('TC-28 check-activation (with X-Internal-Key) reports an inactive device', async () => {
  await redis.del([`device:activation:${inactiveMac}`]);
  const res = await api().get('/api/device/check-activation').query({ mac: inactiveMac }).set(api.internal());
  expect(res.status).toBe(200);
  expect(res.body.is_active).toBe(false);
});

test('TC-53 internal API without X-Internal-Key or with a wrong key returns 401', async () => {
  const none = await api().get('/api/device/check-activation').query({ mac: activeMac });
  const wrong = await api().get('/api/device/check-activation').query({ mac: activeMac }).set('X-Internal-Key', 'wrong-key');
  expect(none.status).toBe(401);
  expect(wrong.status).toBe(401);
});

test('TC-29 POST /api/device/status online (with X-Internal-Key) sets status and a 35 s Redis key', async () => {
  const device = await createDevice(cleanup, { status: 'offline' });
  const res = await api().post('/api/device/status').set(api.internal()).send({ mac: device.mac, status: 'online' });
  expect(res.status).toBe(200);
  expect(res.body.device.status).toBe('online');
  expect((await db.one('SELECT status FROM devices WHERE id = $1', [device.id])).status).toBe('online');
  if (redis.enabled) {
    const ttl = await redis.ttl(`device:${device.id}:status`);
    note('TC-29', `device:${device.id}:status TTL ${ttl} s`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(35);
  }
});

test('VAL-08 POST /api/device/status with an empty mac or an unknown status returns 400', async () => {
  const device = await createDevice(cleanup);
  const noMac = await api().post('/api/device/status').set(api.internal()).send({ status: 'online' });
  const badStatus = await api().post('/api/device/status').set(api.internal()).send({ mac: device.mac, status: 'busy' });
  expect(noMac.status).toBe(400);
  expect(badStatus.status).toBe(400);
});

// สถานะ offline มาจาก device_monitor_worker ใน api/mqtt_audio_receiver.py เมื่อบอร์ดเงียบเกิน 10 วินาที
// ต้องมีบอร์ด + broker + Python receiver จริง — ทดสอบด้วยมือ
test.skip('TC-30 device goes offline about 10 s after the board stops sending audio (needs board + MQTT + receiver — manual test)', () => {});

test('TC-31 admin POST /api/devices registers a device', async () => {
  const mac = cleanup.mac(uniqueMac());
  const res = await api().post('/api/devices').set(api.bearer(admin.token))
    .send({ mac_address: mac, ip_address: '', status: 'offline', is_verified: true, is_active: false });
  expect(res.status).toBe(201);
  const row = await db.one('SELECT mac_address, is_active FROM devices WHERE mac_address = $1', [mac]);
  expect(row).toEqual({ mac_address: mac, is_active: false });
});

test('VAL-09 admin POST /api/devices with a malformed MAC returns 400', async () => {
  const bad = cleanup.mac(`12345-${Date.now()}`);
  const res = await api().post('/api/devices').set(api.bearer(admin.token))
    .send({ mac_address: bad, status: 'offline', is_verified: true, is_active: false });
  expect(res.status).toBe(400);
});

test('TC-54 caregiver (not admin) POST /api/devices returns 403', async () => {
  const mac = cleanup.mac(uniqueMac());
  const res = await api().post('/api/devices').set(api.bearer(caregiver.token))
    .send({ mac_address: mac, status: 'offline', is_verified: true, is_active: false });
  expect(res.status).toBe(403);
  expect(await db.one('SELECT id FROM devices WHERE mac_address = $1', [mac])).toBeNull();
});
