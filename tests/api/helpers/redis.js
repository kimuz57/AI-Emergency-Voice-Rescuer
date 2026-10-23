// Redis ของเซิร์ฟเวอร์ (ไม่บังคับ) — ไม่ตั้ง REDIS_URL = test ที่ต้องดู key จะข้ามเฉพาะส่วนนั้น
const { createClient } = require('redis');
const { REDIS_URL } = require('./config');

let client = null;

async function get() {
  if (!REDIS_URL) return null;
  if (!client) {
    client = createClient({ url: REDIS_URL, disableClientInfo: true });
    client.on('error', () => {});
    await client.connect();
  }
  return client;
}

module.exports = {
  enabled: Boolean(REDIS_URL),
  async getKey(key) {
    const c = await get();
    return c ? c.get(key) : null;
  },
  async ttl(key) {
    const c = await get();
    return c ? c.ttl(key) : null;
  },
  async del(keys) {
    const c = await get();
    if (c && keys.length) await c.del(keys);
  },
  async close() {
    if (client) {
      await client.quit().catch(() => {});
      client = null;
    }
  },
};
