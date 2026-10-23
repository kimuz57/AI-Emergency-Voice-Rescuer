// ตารางที่ 3.24 กลุ่มระบบสมาชิกและการยืนยันตัวตน (TC-01 ถึง TC-11) + ข้อมูลผิดรูปแบบ
const api = require('../helpers/api');
const db = require('../helpers/db');
const { GOOGLE_ID_TOKEN } = require('../helpers/config');
const { createUser, uniqueEmail, uniqueName, password } = require('../helpers/fixtures');

const cleanup = new db.Cleanup();
let admin;

beforeAll(async () => {
  admin = await createUser(cleanup, { label: 'auth-admin', role: 'admin' });
});

afterAll(async () => {
  await cleanup.run({ adminToken: admin && admin.token });
  await db.close();
});

describe('สมัครสมาชิกและยืนยันอีเมล', () => {
  const email = uniqueEmail('auth-new');
  const pwd = password();

  test('TC-01 register with a new email creates an unverified account and returns 201', async () => {
    const res = await api().post('/api/auth/register').send({ name: uniqueName('auth-new'), email, password: pwd });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe(email);

    const user = await db.one('SELECT id, is_verified, verification_token FROM users WHERE email = $1', [email]);
    expect(user).not.toBeNull();
    cleanup.user(user.id);
    expect(user.is_verified).toBe(false);
    // อีเมลยืนยันถูกส่งแบบ background ตรวจจาก API ไม่ได้ — ตรวจว่ามี token ที่จะอยู่ในลิงก์แทน
    expect(user.verification_token).toMatch(/^[0-9a-f]{32}$/);
  });

  test('TC-02 register with an existing email returns 400', async () => {
    const res = await api().post('/api/auth/register').send({ name: 'ซ้ำ', email, password: password() });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('มีในระบบแล้ว');
  });

  test('TC-03 verify-email link marks the account as verified', async () => {
    const { verification_token: token } = await db.one('SELECT verification_token FROM users WHERE email = $1', [email]);
    const res = await api().get('/api/auth/verify-email').query({ token });
    expect(res.status).toBe(200);

    const user = await db.one('SELECT is_verified, verification_token FROM users WHERE email = $1', [email]);
    expect(user.is_verified).toBe(true);
    expect(user.verification_token).toBe('');
  });

  test('TC-04 login with correct credentials returns 200 and a JWT', async () => {
    const res = await api().post('/api/auth/login').send({ email, password: pwd });
    expect(res.status).toBe(200);
    expect(res.body.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(res.body.user.email).toBe(email);
  });
});

describe('เข้าสู่ระบบไม่สำเร็จ', () => {
  let user;
  let unverified;

  beforeAll(async () => {
    user = await createUser(cleanup, { label: 'auth-login' });
    unverified = await createUser(cleanup, { label: 'auth-unverified', verified: false });
  });

  test('TC-05 login with wrong password returns 401', async () => {
    const res = await api().post('/api/auth/login').send({ email: user.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  test('TC-06 login with an unknown email returns 401', async () => {
    const res = await api().post('/api/auth/login').send({ email: uniqueEmail('nobody'), password: 'whatever1' });
    expect(res.status).toBe(401);
  });

  test('TC-07 login to an unverified account returns 403', async () => {
    const res = await api().post('/api/auth/login').send({ email: unverified.email, password: unverified.password });
    expect(res.status).toBe(403);
    expect(res.body.token).toBeUndefined();
  });
});

describe('Google', () => {
  (GOOGLE_ID_TOKEN ? test : test.skip)('TC-08 Google login with a valid ID token returns 200 and a JWT (needs GOOGLE_ID_TOKEN)', async () => {
    const res = await api().post('/api/auth/google').send({ id_token: GOOGLE_ID_TOKEN });
    expect(res.status).toBe(200);
    expect(res.body.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    const row = await db.one('SELECT id FROM users WHERE email = $1', [res.body.user.email]);
    if (row && res.body.user.email.startsWith('apitest.')) cleanup.user(row.id);
  });

  test('TC-08b Google login with a forged ID token returns 401', async () => {
    const res = await api().post('/api/auth/google').send({ id_token: 'eyJhbGciOiJSUzI1NiJ9.forged.signature' });
    expect(res.status).toBe(401);
  });
});

describe('ลืมรหัสผ่านและออกจากระบบ', () => {
  let user;

  beforeAll(async () => {
    user = await createUser(cleanup, { label: 'auth-reset' });
  });

  test('TC-09 forgot-password stores a reset token and returns 200', async () => {
    const res = await api().post('/api/auth/forgot-password').send({ email: user.email });
    expect(res.status).toBe(200);
    const row = await db.one('SELECT password_reset_token, password_reset_expiry FROM users WHERE id = $1', [user.id]);
    expect(row.password_reset_token).toMatch(/^[0-9a-f]{32}$/);
    expect(new Date(row.password_reset_expiry).getTime()).toBeGreaterThan(Date.now());
  });

  test('TC-10 reset-password with a password shorter than 6 characters returns 400', async () => {
    const { password_reset_token: token } = await db.one('SELECT password_reset_token FROM users WHERE id = $1', [user.id]);
    const res = await api().post('/api/auth/reset-password').send({ token, new_password: '12345' });
    expect(res.status).toBe(400);
    // รหัสเดิมยังใช้ได้ และ token ยังไม่ถูกใช้
    const still = await db.one('SELECT password_reset_token FROM users WHERE id = $1', [user.id]);
    expect(still.password_reset_token).toBe(token);
  });

  test('TC-11 logout returns 200 and clears the token cookie', async () => {
    const res = await api().post('/api/auth/logout').set(api.bearer(user.token));
    expect(res.status).toBe(200);
    const cookie = (res.headers['set-cookie'] || []).find((c) => c.startsWith('token='));
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/^token=;/);
    expect(cookie).toMatch(/max-age=0|expires=Thu, 01 Jan 1970/i);
  });
});

describe('ข้อมูลผิดรูปแบบ', () => {
  test('VAL-01 login with malformed JSON returns 400', async () => {
    const res = await api().post('/api/auth/login').set('Content-Type', 'application/json').send('{"email": "a@b.c", ');
    expect(res.status).toBe(400);
  });

  test('VAL-02 register with an empty email or password returns 400', async () => {
    const noEmail = await api().post('/api/auth/register').send({ name: 'x', email: '', password: 'secret1' });
    const noPassword = await api().post('/api/auth/register').send({ name: 'x', email: uniqueEmail('val'), password: '' });
    expect(noEmail.status).toBe(400);
    expect(noPassword.status).toBe(400);
  });
});
