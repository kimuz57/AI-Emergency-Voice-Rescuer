/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// ==========================================
// 🚨 หน้าแจ้งเตือนฉุกเฉิน (Public - ไม่ต้อง Login)
// เข้าถึงได้จาก LINE / Telegram notification
// URL: /alert?mac=1C:C3:AB:B3:09:10&token=xxxxx
// ==========================================

function AlertContent() {
  const searchParams = useSearchParams();
  const mac = searchParams.get("mac");
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "alert" | "acknowledged" | "error">("loading");
  const [deviceInfo, setDeviceInfo] = useState<{ mac_address: string; patient_name: string | null } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (!mac) {
      setErrorMsg("ไม่พบข้อมูลอุปกรณ์ (ไม่มี MAC Address ใน URL)");
      setStatus("error");
      return;
    }

    // ดึงข้อมูลอุปกรณ์จาก MAC Address
    const fetchDevice = async () => {
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["X-Alert-Token"] = token;

        const res = await fetch(`${API_BASE_URL}/api/alert/device?mac=${encodeURIComponent(mac)}`, { headers });

        if (res.ok) {
          const data = await res.json();
          setDeviceInfo(data);
          setStatus("alert");
        } else {
          // ถ้า API ยังไม่พร้อม ให้แสดงข้อมูลจาก URL ไปก่อน
          setDeviceInfo({ mac_address: mac, patient_name: null });
          setStatus("alert");
        }
      } catch {
        // ถ้า Backend ไม่ตอบ ให้แสดงข้อมูลจาก URL ไปก่อน (offline-friendly)
        setDeviceInfo({ mac_address: mac, patient_name: null });
        setStatus("alert");
      }
    };

    fetchDevice();
  }, [mac, token]);

  // เริ่ม countdown หลังกด ยอมรับ
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(c => (c ?? 1) - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleAcknowledge = async () => {
    setIsAcknowledging(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["X-Alert-Token"] = token;

      await fetch(`${API_BASE_URL}/api/alert/acknowledge`, {
        method: "POST",
        headers,
        body: JSON.stringify({ mac_address: mac, token }),
      });
    } catch {
      // ถึงแม้ API จะล้มเหลว ให้ UI แสดงว่ายอมรับแล้ว (UX ต้องไม่ติด)
    } finally {
      setStatus("acknowledged");
      setIsAcknowledging(false);
      setCountdown(5);
    }
  };

  // ==========================================
  // 🔴 Loading State
  // ==========================================
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-medium">กำลังโหลดข้อมูลการแจ้งเตือน...</p>
        </div>
      </div>
    );
  }

  // ==========================================
  // ❌ Error State
  // ==========================================
  if (status === "error") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-800 mb-2">เกิดข้อผิดพลาด</h1>
          <p className="text-slate-500">{errorMsg}</p>
        </div>
      </div>
    );
  }

  // ==========================================
  // ✅ Acknowledged State
  // ==========================================
  if (status === "acknowledged") {
    return (
      <div className="min-h-screen bg-emerald-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full text-center animate-in fade-in zoom-in-95 duration-300">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold text-emerald-700 mb-2">รับทราบแล้ว</h1>
          <p className="text-slate-500 mb-2">การแจ้งเตือนถูกปิดแล้วสำหรับอุปกรณ์</p>
          <p className="font-mono font-bold text-slate-700 text-lg mb-6">{deviceInfo?.mac_address}</p>
          {deviceInfo?.patient_name && (
            <p className="text-slate-500 mb-6">ผู้ป่วย: <span className="font-semibold text-slate-700">{deviceInfo.patient_name}</span></p>
          )}
          <p className="text-sm text-slate-400">คุณสามารถปิดหน้าต่างนี้ได้แล้ว</p>
        </div>
      </div>
    );
  }

  // ==========================================
  // 🚨 Alert State — กระพริบสีแดง
  // ==========================================
  return (
    <div className="min-h-screen bg-red-50 flex items-center justify-center p-6">
      {/* พื้นหลังกระพริบแดง-ขาว */}
      <div className="fixed inset-0 alert-blink pointer-events-none" />

      <div className="relative z-10 bg-white rounded-2xl shadow-2xl border-4 border-red-500 p-8 max-w-md w-full text-center animate-in fade-in zoom-in-95 duration-300">
        
        {/* ไอคอนเตือน */}
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 alert-icon-pulse">
          <svg className="w-10 h-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </div>

        <div className="inline-flex items-center gap-2 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full mb-4 uppercase tracking-widest">
          <span className="w-2 h-2 rounded-full bg-white animate-ping" />
          SOS — แจ้งเตือนฉุกเฉิน
        </div>

        <h1 className="text-2xl font-extrabold text-red-700 mb-1">
          ตรวจพบเสียงร้องขอความช่วยเหลือ!
        </h1>
        <p className="text-slate-500 mb-6 text-sm">
          ระบบตรวจจับเสียงฉุกเฉินจากอุปกรณ์ดังต่อไปนี้
        </p>

        {/* ข้อมูลอุปกรณ์ */}
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-left">
          <div className="mb-3">
            <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-1">MAC Address</p>
            <p className="font-mono font-bold text-slate-800 text-lg">{deviceInfo?.mac_address}</p>
          </div>
          {deviceInfo?.patient_name && (
            <div>
              <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-1">ผู้ป่วย</p>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-red-200 flex items-center justify-center text-red-700 font-bold text-sm">
                  {deviceInfo.patient_name.charAt(0)}
                </div>
                <p className="font-semibold text-slate-800">{deviceInfo.patient_name}</p>
              </div>
            </div>
          )}
        </div>

        {/* ปุ่มยอมรับ */}
        <button
          onClick={handleAcknowledge}
          disabled={isAcknowledging}
          className="w-full py-4 bg-red-600 hover:bg-red-700 active:scale-95 text-white text-lg font-extrabold rounded-xl transition-all shadow-lg shadow-red-500/40 hover:shadow-red-500/60 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-3"
        >
          {isAcknowledging ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              กำลังส่งการยืนยัน...
            </>
          ) : (
            <>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              ✅ ยอมรับ — รับทราบแล้ว
            </>
          )}
        </button>

        <p className="text-xs text-slate-400 mt-4">
          กดปุ่มด้านบนเพื่อยืนยันว่าคุณรับทราบการแจ้งเตือนนี้แล้ว
        </p>
      </div>
    </div>
  );
}

export default function AlertPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <AlertContent />
    </Suspense>
  );
}
