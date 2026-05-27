"use client";
import React, { useState } from 'react';

// กำหนด Interface สำหรับข้อมูลผู้ใช้ (TypeScript)
interface UserProfile {
  name: string;
  email: string;
  role: 'caregiver' | 'admin' | 'user';
  phone: string;
  isLineConnected: boolean;
  notifyWeb: boolean;
  notifyLine: boolean;
}

export default function ProfilePage() {
  // สเตตัสจำลองสำหรับหน้า UI
  const [profile, setProfile] = useState<UserProfile>({
    name: 'suphakit',
    email: 'suphakit@gmail.com',
    role: 'caregiver',
    phone: '089-123-4567',
    isLineConnected: true, // สมมุติว่าเชื่อมต่อ LINE แล้ว
    notifyWeb: true,
    notifyLine: true,
  });

  const [isEditing, setIsEditing] = useState(false);

  // ฟังก์ชันจำลองการบันทึกข้อมูล
  const handleSave = () => {
    setIsEditing(false);
    // TODO: ยิง API (Go Backend) เพื่ออัปเดตข้อมูล
    alert('บันทึกข้อมูลสำเร็จ');
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6 space-y-6 text-slate-800">
      
      {/* ส่วนหัวข้อหน้า */}
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold text-slate-900">ข้อมูลส่วนตัว</h1>
        <p className="text-sm text-slate-500">จัดการข้อมูลบัญชีผู้ดูแลระบบและการแจ้งเตือนเหตุฉุกเฉิน</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* คอลัมน์ซ้าย: Card โปรไฟล์หลัก */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col items-center text-center">
            {/* Avatar วงกลมดึงจาก Google */}
            <div className="w-24 h-24 bg-gradient-to-tr from-sky-400 to-blue-600 rounded-full flex items-center justify-center text-white text-3xl font-bold shadow-md relative">
              {profile.name.substring(0, 2).toUpperCase()}
              <div className="absolute bottom-0 right-0 bg-green-500 w-4 h-4 rounded-full border-2 border-white" />
            </div>
            
            <h2 className="mt-4 text-xl font-bold text-slate-900">{profile.name}</h2>
            <p className="text-sm text-slate-400 ">{profile.email}</p>
            
            {/* Badge Caregiver ตามแบบในเมนู */}
            <span className="mt-3 px-3 py-1 bg-blue-50 text-blue-600 text-xs font-semibold rounded-full border border-blue-100 tracking-wide uppercase">
              {profile.role}
            </span>
          </div>

          {/* Card ความปลอดภัย */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">บัญชีที่เชื่อมต่อ</h3>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-150">
              <div className="flex items-center space-x-3">
                {/* Google Icon SVG */}
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#EA4335" d="M12.24 10.285V13.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.859-3.578-7.859-8s3.53-8 7.859-8c2.46 0 4.105 1.025 5.047 1.926l2.427-2.334C18.155 2.551 15.44 1.5 12.24 1.5 6.435 1.5 1.74 6.2 1.74 12s4.695 10.5 10.5 10.5c6.075 0 10.11-4.269 10.11-10.285 0-.693-.075-1.221-.165-1.715H12.24z"/>
                </svg>
                <span className="text-sm font-medium text-slate-700">Google Account</span>
              </div>
              <span className="text-xs bg-green-100 text-green-700 font-medium px-2.5 py-0.5 rounded-full">Connected</span>
            </div>
          </div>
        </div>

        {/* คอลัมน์ขวา: ฟอร์มข้อมูลและการแจ้งเตือนภัย */}
        <div className="md:col-span-2 space-y-6">
          
          {/* Card: ข้อมูลพื้นฐาน */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900">รายละเอียดผู้ดูแล</h3>
              <button 
                onClick={() => isEditing ? handleSave() : setIsEditing(true)}
                className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-all ${
                  isEditing 
                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm' 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {isEditing ? 'บันทึกข้อมูล' : 'แก้ไขข้อมูล'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">ชื่อผู้ใช้งาน</label>
                <input 
                  type="text" 
                  disabled={!isEditing}
                  value={profile.name}
                  onChange={(e) => setProfile({...profile, name: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-500 transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">เบอร์โทรศัพท์รับเหตุฉุกเฉิน</label>
                <input 
                  type="text" 
                  disabled={!isEditing}
                  value={profile.phone}
                  onChange={(e) => setProfile({...profile, phone: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-500 transition-all text-sm font-mono"
                />
              </div>
            </div>
          </div>

          {/* Card: ระบบแจ้งเตือนวิกฤต (LINE Notify & Web Push) */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
            <div>
              <h3 className="text-lg font-bold text-slate-900">ช่องทางการรับสัญญาณเตือนภัย</h3>
              <p className="text-xs text-slate-400 mt-0.5">เปิด-ปิดช่องทางรับสัญญาณเมื่อ AI ตรวจพบเสียงร้องขอความช่วยเหลือ</p>
            </div>

            {/* ส่วนผูกไลน์บล็อกพิเศษเด่นๆ */}
            <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-emerald-500 text-white rounded-xl mt-0.5">
                  {/* Line Icon SVG */}
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M24 10.304c0-5.369-5.383-9.738-12-9.738s-12 4.369-12 9.738c0 4.814 4.269 8.846 10.036 9.608.391.084.922.258 1.058.592.121.303.079.778.039 1.084l-.171 1.027c-.052.303-.25 1.187 1.081.647 1.332-.54 7.186-4.231 9.805-7.242 2.152-2.31 3.152-4.59 3.152-6.516z"/>
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">LINE Notify Integration</h4>
                  <p className="text-xs text-slate-500 mt-0.5">ส่งข้อความเตือนภัยและตำแหน่งห้องเข้า LINE ทันทีเมื่อเกิดเหตุ</p>
                </div>
              </div>
              <button 
                className={`px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition-all whitespace-nowrap ${
                  profile.isLineConnected 
                    ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200' 
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {profile.isLineConnected ? '🚫 ยกเลิกการเชื่อมต่อ' : '🟢 เชื่อมต่อ LINE Notify'}
              </button>
            </div>

            {/* รายการสวิตช์เปิดปิดความปลอดภัย */}
            <div className="divide-y divide-slate-100 pt-1">
              
              {/* สวิตช์ 1: Web Push */}
              <div className="flex items-center justify-between py-3.5">
                <div>
                  <h4 className="text-sm font-semibold text-slate-800">เปิดระบบเสียงเตือนภัยบนเว็บไซต์</h4>
                  <p className="text-xs text-slate-400">ส่งเสียงไซเรนและหน้าต่าง Pop-up บนเบราว์เซอร์นี้แบบทันท่วงที</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={profile.notifyWeb}
                    onChange={(e) => setProfile({...profile, notifyWeb: e.target.checked})}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {/* สวิตช์ 2: LINE เตือนภัย */}
              <div className="flex items-center justify-between py-3.5">
                <div>
                  <h4 className="text-sm font-semibold text-slate-800">ส่งการแจ้งเตือนไปยังแอปพลิเคชัน LINE</h4>
                  <p className="text-xs text-slate-400">อนุญาตให้บอร์ด IoT ส่งสัญญาณพุชข้อความเข้าไลน์กลุ่ม/ส่วนตัว</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    disabled={!profile.isLineConnected}
                    checked={profile.notifyLine}
                    onChange={(e) => setProfile({...profile, notifyLine: e.target.checked})}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"></div>
                </label>
              </div>

            </div>
          </div>

          {/* ส่วนอันตราย: ปุ่มลบบัญชี */}
          <div className="flex justify-end pt-2">
            <button className="text-xs font-medium text-rose-500 hover:text-rose-700 hover:underline transition-all">
              ⚠️ ต้องการลบบัญชีผู้ดูแลและล้างข้อมูลโครงข่าย IoT?
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};