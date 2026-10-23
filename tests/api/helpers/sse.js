// อ่าน Server-Sent Events จากเซิร์ฟเวอร์จริง (Go ส่ง "data: <json>\n\n" ทุก 1-2 วินาทีต่อ client)
const http = require('http');
const https = require('https');
const { BASE_URL } = require('./config');

/**
 * เปิด stream ด้วย JWT (Authorization: Bearer) แล้วคืน object ที่
 *   - ready: resolve เมื่อได้ event แรก (stream ใช้งานได้แล้ว)
 *   - waitFor(predicate, timeoutMs): resolve { data, elapsedMs } เมื่อ event ใดผ่าน predicate นับเวลาจากตอนเรียก
 *   - close()
 */
function openStream(path, token) {
  const url = new URL(path, BASE_URL);
  const lib = url.protocol === 'https:' ? https : http;
  const listeners = new Set();
  let buffer = '';
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });

  const req = lib.get(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' } }, (res) => {
    if (res.statusCode !== 200) {
      rejectReady(new Error(`SSE ${path} returned ${res.statusCode}`));
      res.resume();
      return;
    }
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const dataLines = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim());
        if (!dataLines.length) continue;
        let data;
        try { data = JSON.parse(dataLines.join('\n')); } catch { continue; }
        resolveReady(data);
        for (const listener of listeners) listener(data);
      }
    });
  });
  req.on('error', (err) => rejectReady(err));

  return {
    ready,
    waitFor(predicate, timeoutMs) {
      const started = Date.now();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          listeners.delete(listener);
          reject(new Error(`ไม่ได้รับ event ที่ต้องการภายใน ${timeoutMs} ms`));
        }, timeoutMs);
        function listener(data) {
          if (predicate(data)) {
            clearTimeout(timer);
            listeners.delete(listener);
            resolve({ data, elapsedMs: Date.now() - started });
          }
        }
        listeners.add(listener);
      });
    },
    close() {
      req.destroy();
    },
  };
}

module.exports = { openStream };
