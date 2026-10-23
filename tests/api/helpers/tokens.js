// สร้าง token แบบเดียวกับเซิร์ฟเวอร์ (ใช้ได้เมื่อรู้ JWT_SECRET ของเซิร์ฟเวอร์ที่ทดสอบเท่านั้น)
const crypto = require('crypto');
const { JWT_SECRET } = require('./config');

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/** alert token ของหน้า /alert: "<exp>.<HMAC-SHA256("alert:<MAC>:<exp>")>" — เหมือน backend/utils/alert_token.go */
function alertToken(mac, { secret = JWT_SECRET, expiresInSec = 3600 } = {}) {
  const exp = Math.floor(Date.now() / 1000) + expiresInSec;
  const sig = crypto.createHmac('sha256', secret).update(`alert:${mac.toUpperCase()}:${exp}`).digest('base64url');
  return `${exp}.${sig}`;
}

/** JWT HS256 แบบเดียวกับ utils.GenerateToken (ใช้สร้าง token หมดอายุใน TC-49) */
function jwt(claims, { secret = JWT_SECRET } = {}) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify(claims));
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

module.exports = { alertToken, jwt, hasSecret: Boolean(JWT_SECRET) };
