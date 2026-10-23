// Supertest ยิงไปที่เซิร์ฟเวอร์ที่รันอยู่จริง (BASE_URL) ไม่ได้ import แอป Go เข้ามา
const request = require('supertest');
const { BASE_URL, INTERNAL_API_KEY } = require('./config');

const api = () => request(BASE_URL);

api.bearer = (token) => ({ Authorization: `Bearer ${token}` });
api.internal = () => ({ 'X-Internal-Key': INTERNAL_API_KEY });

module.exports = api;
