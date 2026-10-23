// ตารางที่ 3.29 กลุ่มระบบผู้ดูแลระบบ (TC-43 ถึง TC-47)
const api = require('../helpers/api');
const db = require('../helpers/db');
const { createUser, createPatient, uniqueName } = require('../helpers/fixtures');

const cleanup = new db.Cleanup();
let admin;
let caregiver;
let target;
let patient;

beforeAll(async () => {
  admin = await createUser(cleanup, { label: 'adm-admin', role: 'admin' });
  caregiver = await createUser(cleanup, { label: 'adm-caregiver' });
  target = await createUser(cleanup, { label: 'adm-target' });
  patient = await createPatient(cleanup, caregiver, { label: 'adm-patient' });
});

afterAll(async () => {
  await cleanup.run({ adminToken: admin && admin.token });
  await db.close();
});

test('TC-43 admin GET /api/admin/users returns 200 with every user', async () => {
  const res = await api().get('/api/admin/users').set(api.bearer(admin.token));
  expect(res.status).toBe(200);
  const ids = res.body.map((u) => u.ID ?? u.id);
  expect(ids).toEqual(expect.arrayContaining([admin.id, caregiver.id, target.id]));
  expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/); // ไม่ส่ง bcrypt hash ออกมา
});

test('TC-44 admin PUT /api/admin/users/:id updates the user', async () => {
  const name = uniqueName('adm-renamed');
  const res = await api().put(`/api/admin/users/${target.id}`).set(api.bearer(admin.token))
    .send({ name, email: target.email, role: 'caregiver', is_verified: true });
  expect(res.status).toBe(200);
  const row = await db.one('SELECT name, email, role FROM users WHERE id = $1', [target.id]);
  expect(row).toEqual({ name, email: target.email, role: 'caregiver' });
});

test('TC-45 admin DELETE /api/admin/users/:id removes the user from the system', async () => {
  const res = await api().delete(`/api/admin/users/${target.id}`).set(api.bearer(admin.token));
  expect(res.status).toBe(200);
  const row = await db.one('SELECT deleted_at FROM users WHERE id = $1', [target.id]);
  expect(row.deleted_at).not.toBeNull();
  const login = await api().post('/api/auth/login').send({ email: target.email, password: target.password });
  expect(login.status).toBe(401);
  const withOldToken = await api().get('/api/user/profile').set(api.bearer(target.token));
  expect(withOldToken.status).toBe(401);
});

test('TC-46 admin GET /api/admin/patients returns 200 with every patient', async () => {
  const res = await api().get('/api/admin/patients').set(api.bearer(admin.token));
  expect(res.status).toBe(200);
  expect(res.body.map((p) => p.ID ?? p.id)).toContain(patient.id);
});

test('TC-47 caregiver calling /api/admin/* gets 403', async () => {
  const res = await api().get('/api/admin/users').set(api.bearer(caregiver.token));
  expect(res.status).toBe(403);
  const patients = await api().get('/api/admin/patients').set(api.bearer(caregiver.token));
  expect(patients.status).toBe(403);
});
