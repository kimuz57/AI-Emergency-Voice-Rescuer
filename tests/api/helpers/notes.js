// จดค่าที่วัดได้จริงระหว่างทดสอบ (เช่น เวลาที่ SSE ส่ง event มาถึง) ให้ scripts/report.js ใส่ในคอลัมน์ผลจริง
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'results', 'notes.jsonl');

function note(id, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify({ id, text })}\n`, 'utf8');
}

function read() {
  if (!fs.existsSync(file)) return {};
  const notes = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    const { id, text } = JSON.parse(line);
    notes[id] = notes[id] ? `${notes[id]}; ${text}` : text;
  }
  return notes;
}

function reset() {
  fs.rmSync(file, { force: true });
}

module.exports = { note, read, reset };
