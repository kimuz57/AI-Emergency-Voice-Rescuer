// ตารางที่ 3.25 กลุ่มข้อมูลผู้ใช้และการผูกบัญชี (TC-12 ถึง TC-18, TC-52)
const path = require('path');
const api = require('../helpers/api');
const db = require('../helpers/db');
const { TELEGRAM_WEBHOOK_SECRET, BACKEND_DIR } = require('../helpers/config');
const { createUser, uniqueName } = require('../helpers/fixtures');

const cleanup = new db.Cleanup();
let admin;
let me;
let other;

// PNG 1x1 ที่ถูกต้อง (ตรวจชนิดไฟล์จากเนื้อไฟล์ ไม่ใช่นามสกุล)
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

beforeAll(async () => {
  admin = await createUser(cleanup, { label: 'user-admin', role: 'admin' });
  me = await createUser(cleanup, { label: 'user-me' });
  other = await createUser(cleanup, { label: 'user-other' });
});

afterAll(async () => {
  await cleanup.run({ adminToken: admin && admin.token });
  await db.close();
});

test('TC-12 GET /api/user/profile returns 200 with the caller\'s own data', async () => {
  const res = await api().get('/api/user/profile').set(api.bearer(me.token));
  expect(res.status).toBe(200);
  expect(res.body.id).toBe(me.id);
  expect(res.body.email).toBe(me.email);
});

test('TC-52 caregiver asking for another user\'s profile (?email=) gets 403', async () => {
  const res = await api().get('/api/user/profile').query({ email: other.email }).set(api.bearer(me.token));
  expect(res.status).toBe(403);
  expect(JSON.stringify(res.body)).not.toContain(other.email);
});

test('TC-13 PUT /api/user/profile updates name and phone in the database', async () => {
  const name = uniqueName('renamed');
  const res = await api().put('/api/user/profile').set(api.bearer(me.token)).send({ name, phone: '0812345678' });
  expect(res.status).toBe(200);
  const row = await db.one('SELECT name, phone FROM users WHERE id = $1', [me.id]);
  expect(row).toEqual({ name, phone: '0812345678' });
});

test('TC-14 upload-profile with a PNG returns 200 and the new image URL', async () => {
  const res = await api().post('/api/user/upload-profile').set(api.bearer(me.token))
    .attach('profile_image', PNG_1PX, 'avatar.png');
  expect(res.status).toBe(200);
  expect(res.body.imageUrl).toMatch(new RegExp(`/profile/${me.id}_[0-9a-f]{32}\\.png$`));
  const row = await db.one('SELECT profile FROM users WHERE id = $1', [me.id]);
  expect(row.profile).toBe(res.body.imageUrl);
  if (BACKEND_DIR) cleanup.file(path.join(BACKEND_DIR, 'profile', res.body.imageUrl.split('/profile/')[1]));
});

test('VAL-03 upload-profile with a file that is not an image returns 415', async () => {
  const res = await api().post('/api/user/upload-profile').set(api.bearer(me.token))
    .attach('profile_image', Buffer.from('not an image at all, just text'), 'avatar.png');
  expect(res.status).toBe(415);
});

// ต้องมี authorization code จริงจาก LINE Login (OAuth) ซึ่งสร้างอัตโนมัติไม่ได้ — ทดสอบด้วยมือผ่านหน้าเว็บ
test.skip('TC-15 link-line sets is_linked_line to true (needs a real LINE Login code — manual test)', () => {});

test('TC-16 DELETE /api/user/unlink-line sets is_linked_line to false', async () => {
  await db.query('UPDATE users SET is_linked_line = true WHERE id = $1', [me.id]);
  await db.query('INSERT INTO user_line_mappings (user_id, line_user_id, created_at) VALUES ($1, $2, now())', [me.id, `Uapitest${me.id}${Date.now()}`]);

  const res = await api().delete('/api/user/unlink-line').set(api.bearer(me.token));
  expect(res.status).toBe(200);
  const row = await db.one('SELECT is_linked_line FROM users WHERE id = $1', [me.id]);
  expect(row.is_linked_line).toBe(false);
  const mapping = await db.one('SELECT id FROM user_line_mappings WHERE user_id = $1', [me.id]);
  expect(mapping).toBeNull();
});

describe('Telegram', () => {
  const chatId = 900000000 + Math.floor(Math.random() * 99999999);

  test('TC-17 link-token returns a deep link, and /start <token> in the bot stores telegram_chat_id', async () => {
    const res = await api().post('/api/user/telegram/link-token').set(api.bearer(me.token));
    expect(res.status).toBe(200);
    expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.body.deep_link).toMatch(new RegExp(`^https://t\\.me/\\w+\\?start=${res.body.token}$`));

    // จำลอง Telegram เรียก webhook ตอนผู้ใช้กด Start ในบอท
    const hook = api().post('/api/telegram/webhook');
    if (TELEGRAM_WEBHOOK_SECRET) hook.set('X-Telegram-Bot-Api-Secret-Token', TELEGRAM_WEBHOOK_SECRET);
    const hookRes = await hook.send({ message: { text: `/start ${res.body.token}`, chat: { id: chatId } } });
    expect(hookRes.status).toBe(200);

    const mapping = await db.one('SELECT telegram_chat_id, is_telegram_connected FROM user_telegram_mapping WHERE user_id = $1', [me.id]);
    expect(mapping).toEqual({ telegram_chat_id: String(chatId), is_telegram_connected: true });
    const profile = await api().get('/api/user/profile').set(api.bearer(me.token));
    expect(profile.body.isTelegramConnected).toBe(true);
  });

  test('TC-18 telegram/toggle switches notify_telegram off and on', async () => {
    const off = await api().post('/api/user/telegram/toggle').set(api.bearer(me.token)).send({ status: false });
    expect(off.status).toBe(200);
    expect((await db.one('SELECT notify_telegram FROM user_telegram_mapping WHERE user_id = $1', [me.id])).notify_telegram).toBe(false);

    const on = await api().post('/api/user/telegram/toggle').set(api.bearer(me.token)).send({ status: true });
    expect(on.status).toBe(200);
    const profile = await api().get('/api/user/profile').set(api.bearer(me.token));
    expect(profile.body.notifyTelegram).toBe(true);
  });
});
