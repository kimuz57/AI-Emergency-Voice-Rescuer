"use client" // <--- ต้องมีบรรทัดนี้ไว้บนสุดเสมอ ถ้ามีการใช้ onClick

export default function VerifyEmailPage() {
  return (
    <div style={{ textAlign: 'center', marginTop: '50px', fontFamily: 'sans-serif' }}>
      <h1 style={{ color: '#d32f2f' }}>กรุณายืนยันอีเมลของคุณ</h1>
      <p>ระบบตรวจพบว่าอีเมลของคุณยังไม่ได้รับการยืนยัน</p>
      <p>กรุณาตรวจสอบ Inbox ในอีเมลของคุณ และคลิกลิงก์ที่ Auth0 ส่งไปให้ครับ</p>
      
      <button 
        onClick={() => window.location.href = '/'} 
        style={{
          padding: '10px 20px',
          marginTop: '20px',
          backgroundColor: '#0070f3',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer'
        }}
      >
        กลับหน้าหลัก
      </button>
    </div>
  );
}