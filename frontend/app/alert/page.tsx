/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// โครงสร้างข้อมูลที่คาดว่าจะได้รับจาก Backend
interface AlertData {
  patient_name: string | null;
  room_number: string | null;
  underlying_disease: string | null;
  audio_url: string | null;
}

function AlertContent() {
  const searchParams = useSearchParams();
  const mac = searchParams.get("mac"); // ยังต้องใช้ยิง API ไปบอกหลังบ้านว่าเครื่องไหน
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "alert" | "acknowledged" | "error">("loading");
  const [deviceInfo, setDeviceInfo] = useState<AlertData | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (!mac) {
      setErrorMsg("ไม่พบข้อมูลอุปกรณ์ (ไม่มีอ้างอิงจาก URL)");
      setStatus("error");
      return;
    }

    // ดึงข้อมูลผู้ป่วยและไฟล์เสียง
    const fetchDevice = async () => {
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["X-Alert-Token"] = token;

        const res = await fetch(`${API_BASE_URL}/api/alerts/device?mac=${encodeURIComponent(mac)}`, { headers });

        if (res.ok) {
          const data = await res.json();
          setDeviceInfo(data);
          setStatus("alert");
        } else {
          setDeviceInfo({ patient_name: null, room_number: null, underlying_disease: null, audio_url: null });
          setStatus("alert");
        }
      } catch {
        setDeviceInfo({ patient_name: null, room_number: null, underlying_disease: null, audio_url: null });
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

      const res = await fetch(`${API_BASE_URL}/api/alerts/acknowledge`, {
        method: "POST",
        headers,
        body: JSON.stringify({ mac_address: mac, token }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(`อัปเดตไม่สำเร็จ: ${data.error || 'ไม่ทราบสาเหตุ'}`);
        setIsAcknowledging(false);
        return;
      }

      setStatus("acknowledged");
      setCountdown(5);
    } catch (error) {
      console.error("ส่งข้อมูลล้มเหลว:", error);
      alert("ไม่สามารถติดต่อเซิร์ฟเวอร์ได้");
      setIsAcknowledging(false);
    }
  };

  // ==========================================
  // 🔴 Loading & Error States (ย่อไว้เหมือนเดิม)
  // ==========================================
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="neu-card p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-bold neu-text mb-2">เกิดข้อผิดพลาด</h1>
          <p className="neu-text-muted">{errorMsg}</p>
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
        <div className="neu-card p-10 max-w-md w-full text-center animate-in fade-in zoom-in-95 duration-300">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold text-emerald-700 mb-2">รับทราบแล้ว</h1>
          <p className="neu-text-muted mb-6">ผู้ป่วยกำลังได้รับการช่วยเหลือ</p>
          {deviceInfo?.patient_name && (
            <p className="font-semibold neu-text text-lg mb-4">{deviceInfo.patient_name} (ห้อง {deviceInfo.room_number})</p>
          )}
          <p className="text-sm neu-text-muted">ปิดหน้าต่างนี้ได้ใน {countdown} วินาที...</p>
        </div>
      </div>
    );
  }

  // ==========================================
  // 🚨 Alert State — หน้าจอแจ้งเตือนหลัก
  // ==========================================
  return (
    <div className="min-h-screen bg-red-50 flex items-center justify-center p-6">
      <div className="fixed inset-0 alert-blink pointer-events-none" />

      <div className="neu-card relative z-10 border-red-500 p-8 max-w-md w-full text-center animate-in fade-in zoom-in-95 duration-300">
        
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 alert-icon-pulse">
          <svg className="w-10 h-10 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 18v-6a5 5 0 1 1 10 0v6" />
            <path d="M5 21a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2z" />
            <path d="M21 12h1" />
            <path d="M18.5 4.5 18 5" />
            <path d="M2 12h1" />
            <path d="M12 2v1" />
            <path d="m4.929 4.929.707.707" />
            <path d="M12 12v6" />
          </svg>
        </div>

        <div className="inline-flex items-center gap-2 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full mb-4 uppercase tracking-widest">
          <span className="w-2 h-2 rounded-full bg-white animate-ping" />
          SOS — แจ้งเตือนฉุกเฉิน
        </div>

        <h1 className="text-2xl font-extrabold text-red-700 mb-6">
          ต้องการความช่วยเหลือด่วน!
        </h1>

        {/* 📋 ส่วนแสดงข้อมูลผู้ป่วย */}
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-6 text-left">
          <p className="text-[11px] font-bold text-red-500 uppercase tracking-widest mb-3">ข้อมูลผู้ป่วย</p>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-red-100 pb-2">
              <span className="text-sm neu-text-muted inline-flex items-center gap-1.5">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                ชื่อ-สกุล:
              </span>
              <span className="font-bold neu-text text-base">{deviceInfo?.patient_name || "กำลังโหลด..."}</span>
            </div>
            
            <div className="flex items-center justify-between border-b border-red-100 pb-2">
              <span className="text-sm neu-text-muted inline-flex items-center gap-1.5">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14" />
                  <path d="M2 20h20" />
                  <path d="M14 12v.01" />
                </svg>
                ห้องพัก:
              </span>
              <span className="font-bold neu-text text-base">{deviceInfo?.room_number || "-"}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm neu-text-muted inline-flex items-center gap-1.5">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M11 2v2" />
                  <path d="M5 2v2" />
                  <path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1" />
                  <path d="M8 15a6 6 0 0 0 12 0v-3" />
                  <circle cx="20" cy="10" r="2" />
                </svg>
                โรคประจำตัว:
              </span>
              <span className="font-bold text-red-600 text-sm text-right max-w-[60%]">
                {deviceInfo?.underlying_disease || "ไม่ระบุ"}
              </span>
            </div>
          </div>

          {/* 🔊 เครื่องเล่นไฟล์เสียง (ซ่อนถ้าไม่มี URL) */}
          {deviceInfo?.audio_url && (
            <div className="mt-5 pt-4 border-t border-red-200">
              <p className="text-xs font-bold text-red-700 mb-2 flex items-center gap-1">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
                ฟังเสียงที่ตรวจจับได้:
              </p>
              <audio 
                controls 
                autoPlay 
                className="w-full h-10" 
                src={deviceInfo.audio_url}
              >
                เบราว์เซอร์ของคุณไม่รองรับการเล่นไฟล์เสียง
              </audio>
            </div>
          )}
        </div>

        {/* ปุ่มยอมรับ */}
        <button
          onClick={handleAcknowledge}
          disabled={isAcknowledging}
          className="w-full py-4 bg-red-600 hover:bg-red-700 active:scale-95 text-white text-lg font-extrabold rounded-xl transition-all shadow-lg shadow-red-500/40 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-3"
        >
          {isAcknowledging ? (
            "กำลังบันทึก..."
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              รับทราบและเข้าช่วยเหลือ
            </>
          )}
        </button>

      </div>
    </div>
  );
}

export default function AlertPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <AlertContent />
    </Suspense>
  );
}