"use client"
import React from 'react';

export default function HomePage() {
  const handleLogin = () => {
    // 📍 ยิงไปที่ Go Backend เพื่อเริ่มกระบวนการ Auth0
    window.location.href = 'http://localhost:8080/login';
  };

  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center',
      fontFamily: 'sans-serif',
      background: '#f0f2f5' 
    }}>
      <h1>Guardian AI Voice Recorder</h1>
      <p>ระบบจัดการอุปกรณ์และวิเคราะห์เสียงอัจฉริยะ</p>
      
      <button 
        onClick={handleLogin}
        style={{
          padding: '12px 32px',
          fontSize: '18px',
          backgroundColor: '#0070f3',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          marginTop: '20px',
          fontWeight: 'bold',
          transition: '0.3s'
        }}
      >
        เข้าสู่ระบบด้วย Auth0
      </button>
    </div>
  );
}