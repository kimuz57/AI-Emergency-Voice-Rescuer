// ตารางที่ 3.30 กลุ่มความปลอดภัยและสถานะระบบ (TC-48 ถึง TC-51)
const api = require('../helpers/api');
const db = require('../helpers/db');
const tokens = require('../helpers/tokens');
const { createUser } = require('../helpers/fixtures');

const cleanup = new db.Cleanup();
let user;

beforeAll(async () => {
  user = await createUser(cleanup, { label: 'sec-user' });
});

afterAll(async () => {
  await cleanup.run();
  await db.close();
});

test('TC-48 GET /api/patients without a token returns 401', async () => {
  const res = await api().get('/api/patients');
  expect(res.status).toBe(401);
});

test('TC-49 GET /api/patients with an invalid or expired token returns 401', async () => {
  const garbage = await api().get('/api/patients').set(api.bearer('not-a-jwt'));
  expect(garbage.status).toBe(401);

  // ลายเซ็นถูกแก้ (เปลี่ยน payload แต่คงลายเซ็นเดิม)
  const [h, , s] = user.token.split('.');
  const forgedPayload = Buffer.from(JSON.stringify({ user_id: user.id, email: user.email, exp: 4102444800 })).toString('base64url');
  const tampered = await api().get('/api/patients').set(api.bearer(`${h}.${forgedPayload}.${s}`));
  expect(tampered.status).toBe(401);

  // alg none
  const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${forgedPayload}.`;
  expect((await api().get('/api/patients').set(api.bearer(none))).status).toBe(401);

  if (tokens.hasSecret) {
    const expired = tokens.jwt({ user_id: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) - 60 });
    expect((await api().get('/api/patients').set(api.bearer(expired))).status).toBe(401);
  }
});

// ต้องมี MQTT broker + Python receiver จริง (receiver ทิ้งเสียงของบอร์ดที่ check-activation ตอบ false) — ทดสอบด้วยมือ
test.skip('TC-50 audio from a device that is not activated is not processed (needs MQTT broker + receiver — manual test)', () => {});

test('TC-51 GET /api/health returns 200', async () => {
  const res = await api().get('/api/health');
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('ok');
});
