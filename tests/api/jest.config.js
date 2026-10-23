module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  // bcrypt cost 14 ใน backend ใช้ ~1-2 วินาทีต่อการสมัคร/ล็อกอิน
  testTimeout: 60000,
  // ข้อมูลตั้งต้นของแต่ละไฟล์อยู่ใน DB เดียวกัน: รันทีละไฟล์ (npm test ใส่ --runInBand อยู่แล้ว)
  maxWorkers: 1,
};
