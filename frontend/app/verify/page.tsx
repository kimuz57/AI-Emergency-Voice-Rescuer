"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("กำลังตรวจสอบข้อมูลของคุณ...");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("ไม่พบลิงก์ยืนยัน กรุณาตรวจสอบอีเมลของคุณอีกครั้ง");
      return;
    }

    const verifyToken = async () => {
      try {
        // ยิง Token ไปให้ Go Fiber ตรวจสอบ
        const res = await fetch(`http://localhost:8080/api/auth/verify-email?token=${token}`);
        const data = await res.json();

        if (res.ok) {
          setStatus("success");
          setMessage("ยืนยันอีเมลสำเร็จ! บัญชีของคุณพร้อมใช้งานแล้ว");
        } else {
          setStatus("error");
          setMessage(data.error || "ลิงก์ไม่ถูกต้อง หรือถูกใช้งานไปแล้ว");
        }
      } catch (error) {
        setStatus("error");
        setMessage("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
      }
    };

    verifyToken();
  }, [token]);

  return (
    <div className="text-center">
      {/* ไอคอนแสดงสถานะ */}
      <div className="mb-6 flex justify-center">
        {status === "loading" && (
          <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
        )}
        {status === "success" && (
          <div className="w-20 h-20 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center text-4xl shadow-sm">
            ✓
          </div>
        )}
        {status === "error" && (
          <div className="w-20 h-20 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center text-4xl shadow-sm">
            ✕
          </div>
        )}
      </div>

      <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
        {status === "loading" ? "กำลังตรวจสอบ..." : status === "success" ? "สำเร็จ!" : "เกิดข้อผิดพลาด"}
      </h2>
      <p className="text-slate-500 dark:text-slate-400 mb-8">
        {message}
      </p>

      {/* ปุ่มกลับไปหน้าล็อกอิน */}
      {status !== "loading" && (
        <Link 
          href="/login" 
          className="inline-flex justify-center w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors shadow-sm"
        >
          กลับไปหน้าเข้าสู่ระบบ
        </Link>
      )}
    </div>
  );
}

export default function VerifyPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700">
        
        <div className="text-center mb-8">
          <h1 className="text-xl font-black text-indigo-600 uppercase tracking-wider">Emergency Voice Rescuer</h1>
        </div>

        {/* 🟢 Next.js App Router บังคับให้ใช้ Suspense ครอบเวลาดึงค่าจาก URL */}
        <Suspense fallback={<div className="text-center text-slate-500">กำลังโหลด...</div>}>
          <VerifyEmailContent />
        </Suspense>
        
      </div>
    </div>
  );
}