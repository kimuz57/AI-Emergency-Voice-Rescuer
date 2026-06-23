"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// รับ Props hasPhone เพื่อเช็คว่าถ้ามีเบอร์แล้วก็ไม่ต้องทำงานเลย
export default function PhoneReminder({ hasPhone }: { hasPhone: boolean }) {
  const [isVisible, setIsVisible] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // 1. ถ้าผู้ใช้มีเบอร์โทรแล้ว ให้หยุดทำงานทันที
    if (hasPhone) return;

    // 2. เช็คเวลาจาก Local Storage
    const lastShown = localStorage.getItem("phone_reminder_timestamp");
    const now = new Date().getTime();
    const cooldown = 3 * 60 * 60 * 1000; // 3 ชั่วโมง (คำนวณเป็นมิลลิวินาที)

    // ถ้ายังไม่เคยโชว์ หรือ เลยคูลดาวน์ 3 ชั่วโมงมาแล้ว
    if (!lastShown || now - parseInt(lastShown) > cooldown) {
      // หน่วงเวลา 1.5 วินาทีหลังจากเข้าหน้าเว็บ ค่อยเด้งขึ้นมาให้ดูเป็นธรรมชาติ
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [hasPhone]);

  // ฟังก์ชันเมื่อกด "ภายหลัง" (ปิด Popup)
  const handleClose = () => {
    localStorage.setItem("phone_reminder_timestamp", new Date().getTime().toString());
    setIsVisible(false);
  };

  // ฟังก์ชันเมื่อกด "เพิ่มตอนนี้"
  const handleAddNow = () => {
    localStorage.setItem("phone_reminder_timestamp", new Date().getTime().toString());
    setIsVisible(false);
    router.push("/profile"); // 🟢 เตะไปหน้า Profile
  };

  if (!isVisible) return null;

  return (
    // 🌟 กล่อง Popup เด้งที่มุมขวาล่าง (Toast Notification)
    <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 p-5 transform transition-all duration-500 ease-in-out animate-in slide-in-from-bottom-5 fade-in">
      <div className="flex items-start gap-4">
        {/* ไอคอนเตือนความจำ */}
        <div className="flex-shrink-0 w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
        </div>
        
        <div className="flex-1">
          <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-1">
            เพิ่มเบอร์โทรศัพท์ของคุณ
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
            เพื่อให้ระบบสามารถส่งการแจ้งเตือนเหตุฉุกเฉินถึงคุณได้ทันท่วงที กรุณาเพิ่มเบอร์โทรศัพท์ในโปรไฟล์
          </p>
          
          <div className="flex gap-2">
            <button 
              onClick={handleClose}
              className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              ภายหลัง
            </button>
            <button 
              onClick={handleAddNow}
              className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
            >
              เพิ่มตอนนี้
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}