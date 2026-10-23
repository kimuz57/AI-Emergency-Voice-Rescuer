// npm run test:report — รัน jest แล้วเขียน results/summary.md เสมอ (แม้มี test ไม่ผ่าน) และคืน exit code ของ jest
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
fs.mkdirSync(path.join(root, 'results'), { recursive: true });
require('../helpers/notes').reset();

const jest = spawnSync(process.execPath, [
  require.resolve('jest/bin/jest'), '--runInBand', '--json', '--outputFile=results/jest-results.json',
  ...process.argv.slice(2),
], { cwd: root, stdio: 'inherit' });

require('./report');
process.exit(jest.status ?? 1);
