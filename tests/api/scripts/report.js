// แปลงผล jest --json เป็นตาราง Markdown ไว้แนบเป็นหลักฐานการทดสอบ (results/summary.md)
const fs = require('fs');
const path = require('path');

const resultsDir = path.join(__dirname, '..', 'results');
const input = path.join(resultsDir, 'jest-results.json');
if (!fs.existsSync(input)) {
  console.error('ไม่พบ results/jest-results.json — รัน npm run test:report');
  process.exit(1);
}

const STATUS = { passed: 'ผ่าน', failed: 'ไม่ผ่าน', pending: 'ข้าม', skipped: 'ข้าม', todo: 'ข้าม' };
const clean = (s) => s.replace(/\u001b\[[0-9;]*m/g, '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

const data = JSON.parse(fs.readFileSync(input, 'utf8'));
const notes = require('../helpers/notes').read();
const rows = [];
for (const file of data.testResults) {
  for (const t of file.assertionResults) {
    const id = (t.title.match(/^([A-Z]+-\d+[a-z]?)/) || [, '-'])[1];
    const reason = t.failureMessages && t.failureMessages.length
      ? clean(t.failureMessages[0].split('\n').slice(0, 4).join(' ')).slice(0, 220)
      : '';
    const detail = reason || clean(notes[id] || '');
    rows.push({ id, file: path.basename(file.name), title: clean(t.title), status: STATUS[t.status] || t.status, ms: t.duration, detail });
  }
}

const order = (id) => {
  const m = id.match(/^([A-Z]+)-(\d+)/);
  return m ? [m[1] === 'TC' ? 0 : 1, Number(m[2]), id] : [2, 0, id];
};
rows.sort((a, b) => {
  const [x, y] = [order(a.id), order(b.id)];
  return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2]);
});

const count = (s) => rows.filter((r) => r.status === s).length;
const lines = [
  `# ผลการทดสอบ API`,
  '',
  `รันเมื่อ ${new Date(data.startTime).toLocaleString('th-TH')} — ผ่าน ${count('ผ่าน')} / ไม่ผ่าน ${count('ไม่ผ่าน')} / ข้าม ${count('ข้าม')} (ทั้งหมด ${rows.length})`,
  '',
  ...(notes.SEED ? [`ข้อมูลตั้งต้น: ${notes.SEED}`, ''] : []),
  '| รหัส | กรณีทดสอบ | ไฟล์ | ผล | เวลา (ms) | ค่าที่วัดได้ / สาเหตุที่ไม่ผ่าน |',
  '|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.id} | ${r.title} | ${r.file} | ${r.status} | ${r.ms ?? ''} | ${r.detail} |`),
  '',
];
fs.writeFileSync(path.join(resultsDir, 'summary.md'), lines.join('\n'), 'utf8');
console.log(`เขียน results/summary.md แล้ว (${rows.length} กรณี)`);
