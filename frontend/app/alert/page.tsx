/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const EXPIRED_LINK_MSG = "ลิงก์หมดอายุหรือไม่ถูกต้อง";
const NO_PENDING_MSG = "ไม่มีเหตุฉุกเฉินที่รอการช่วยเหลือของอุปกรณ์นี้แล้ว อาจมีผู้ดูแลท่านอื่นรับทราบไปแล้ว";

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

    // ลิงก์จาก LINE/Telegram ต้องมี ?token= (alert token ที่ backend เซ็นให้ MAC นี้)
    if (!token) {
      setErrorMsg(EXPIRED_LINK_MSG);
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
        } else if (res.status === 401) {
          // token หมดอายุ (24 ชม.) หรือไม่ตรงกับ MAC
          setErrorMsg(EXPIRED_LINK_MSG);
          setStatus("error");
        } else if (res.status === 404) {
          // GetAlertDeviceInfo ตอบ 404 เมื่อไม่มีเหตุที่ยังไม่ปิดของอุปกรณ์นี้ (มักเพราะมีคนรับทราบไปแล้ว)
          setErrorMsg(NO_PENDING_MSG);
          setStatus("error");
        } else {
          // เซิร์ฟเวอร์ขัดข้อง: ยังแสดงหน้าฉุกเฉินไว้ก่อน (ไม่มีชื่อผู้ป่วย) ให้ผู้ดูแลไปดูผู้ป่วยได้
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

      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        alert(EXPIRED_LINK_MSG);
        setIsAcknowledging(false);
        return;
      }

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
  // Loading & Error States
  // ==========================================
  if (status === "loading") {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[var(--tb-surface-2)]">
        <div role="status" className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full border-4 border-[var(--tb-border)] border-t-[var(--tb-danger)] animate-spin" />
          <span className="sr-only">กำลังโหลด...</span>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[var(--tb-surface-2)] px-4 py-8">
        <div
          role="alert"
          className="w-full max-w-md rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-card)] p-6 sm:p-8 text-center"
        >
          <span className="inline-flex items-center justify-center w-14 h-14 mb-4 rounded-full bg-[var(--tb-danger-tint)] text-[var(--tb-danger-text)]">
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          </span>
          <h1 className="text-xl font-bold text-[var(--tb-text)] mb-2">
            {errorMsg === NO_PENDING_MSG ? "ไม่มีเหตุที่ต้องรับทราบ" : "เกิดข้อผิดพลาด"}
          </h1>
          <p className="text-base text-[var(--tb-muted)]">{errorMsg}</p>
        </div>
      </div>
    );
  }

  // ==========================================
  // Acknowledged State
  // ==========================================
  if (status === "acknowledged") {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[var(--tb-surface-2)] px-4 py-8">
        <div className="w-full max-w-md rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] border-t-4 border-t-[var(--tb-success)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-card)] p-6 sm:p-10 text-center animate-in fade-in zoom-in-95 duration-300">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 bg-[var(--tb-success-tint)] text-[var(--tb-success-text)]">
            <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-[var(--tb-success-text)] mb-2">รับทราบแล้ว</h1>
          <p className="text-base text-[var(--tb-muted)] mb-6">ผู้ป่วยกำลังได้รับการช่วยเหลือ</p>
          {deviceInfo?.patient_name && (
            <p className="mb-4 rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface-2)] px-4 py-3 text-lg font-semibold text-[var(--tb-text)] break-words">
              {deviceInfo.patient_name} (ห้อง {deviceInfo.room_number})
            </p>
          )}
          <p className="text-sm text-[var(--tb-muted)]" aria-live="polite">
            {countdown !== null && countdown > 0
              ? `ปิดหน้าต่างนี้ได้ใน ${countdown} วินาที...`
              : "ปิดหน้าต่างนี้ได้แล้ว"}
          </p>
        </div>
      </div>
    );
  }

  // ==========================================
  // Alert State — หน้าจอแจ้งเตือนหลัก
  // ==========================================
  return (
    <div className="relative min-h-[100dvh] flex items-start sm:items-center justify-center bg-[var(--tb-surface-2)] px-4 py-6 sm:py-10">
      <div className="fixed inset-0 alert-blink pointer-events-none" />

      <div
        role="region"
        aria-labelledby="alert-title"
        className="relative z-10 w-full max-w-md rounded-[var(--tb-radius-lg)] border border-[var(--tb-danger)]/40 border-t-4 border-t-[var(--tb-danger)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-pop)] animate-in fade-in zoom-in-95 duration-300"
      >
        {/* หัวการ์ด */}
        <div className="px-5 sm:px-6 pt-6 pb-5 text-center">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center mx-auto mb-4 bg-[var(--tb-danger-tint)] text-[var(--tb-danger-text)] alert-icon-pulse">
            <svg className="w-8 h-8 sm:w-10 sm:h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-3 text-xs font-bold tracking-wide bg-[var(--tb-danger)] text-white">
            <span aria-hidden="true" className="relative flex w-2 h-2">
              <span className="absolute inline-flex w-full h-full rounded-full bg-white opacity-75 animate-ping" />
              <span className="relative inline-flex w-2 h-2 rounded-full bg-white" />
            </span>
            SOS — แจ้งเตือนฉุกเฉิน
          </div>

          <h1 id="alert-title" className="text-2xl sm:text-3xl font-bold text-[var(--tb-danger-text)]">
            ต้องการความช่วยเหลือด่วน!
          </h1>
        </div>

        {/* ส่วนแสดงข้อมูลผู้ป่วย */}
        <div className="px-5 sm:px-6 pb-5">
          <div className="rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface-2)]">
            <p className="px-4 pt-4 text-xs font-semibold text-[var(--tb-muted)]">ข้อมูลผู้ป่วย</p>

            <dl className="px-4 pb-4">
              <div className="py-3 border-b border-[var(--tb-border)]">
                <dt className="text-sm text-[var(--tb-muted)] inline-flex items-center gap-1.5">
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  ชื่อ-สกุล:
                </dt>
                <dd className="mt-1 text-2xl font-bold leading-snug text-[var(--tb-text)] break-words">
                  {deviceInfo?.patient_name || "ไม่สามารถโหลดชื่อผู้ป่วยได้"}
                </dd>
              </div>

              <div className="py-3 border-b border-[var(--tb-border)]">
                <dt className="text-sm text-[var(--tb-muted)] inline-flex items-center gap-1.5">
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14" />
                    <path d="M2 20h20" />
                    <path d="M14 12v.01" />
                  </svg>
                  ห้องพัก:
                </dt>
                <dd className="mt-1.5">
                  <span className="inline-flex items-center rounded-[var(--tb-radius)] px-3 py-1 text-xl font-bold bg-[var(--tb-primary-tint)] text-[var(--tb-primary-text)] break-all">
                    {deviceInfo?.room_number || "-"}
                  </span>
                </dd>
              </div>

              <div className="pt-3">
                <dt className="text-sm text-[var(--tb-muted)] inline-flex items-center gap-1.5">
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M11 2v2" />
                    <path d="M5 2v2" />
                    <path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1" />
                    <path d="M8 15a6 6 0 0 0 12 0v-3" />
                    <circle cx="20" cy="10" r="2" />
                  </svg>
                  โรคประจำตัว:
                </dt>
                <dd className="mt-1 text-base font-semibold text-[var(--tb-danger-text)] break-words">
                  {deviceInfo?.underlying_disease || "ไม่ระบุ"}
                </dd>
              </div>
            </dl>

            {/* เครื่องเล่นไฟล์เสียง (ซ่อนถ้าไม่มี URL) */}
            {deviceInfo?.audio_url && (
              <div className="px-4 py-4 border-t border-[var(--tb-border)]">
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--tb-text)]">
                  <svg className="w-4 h-4 shrink-0 text-[var(--tb-danger-text)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </svg>
                  ฟังเสียงที่ตรวจจับได้:
                </p>
                <audio
                  controls
                  autoPlay
                  className="w-full h-12"
                  src={deviceInfo.audio_url}
                >
                  เบราว์เซอร์ของคุณไม่รองรับการเล่นไฟล์เสียง
                </audio>
              </div>
            )}
          </div>
        </div>

        {/* ปุ่มยอมรับ — ติดขอบล่างจอบนมือถือ กดได้ทันทีโดยไม่ต้องเลื่อน */}
        <div className="sticky bottom-0 z-10 px-5 sm:px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-[var(--tb-border)] bg-[var(--tb-surface)] rounded-b-[var(--tb-radius-lg)]">
          <button
            type="button"
            onClick={handleAcknowledge}
            disabled={isAcknowledging}
            className="w-full min-h-14 px-4 py-3 inline-flex items-center justify-center gap-3 rounded-[var(--tb-radius)] bg-[var(--tb-danger)] text-lg font-bold text-white shadow-[var(--tb-shadow-xs)] hover:brightness-110 active:scale-[0.98] transition disabled:opacity-70 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-danger)]/30"
          >
            {isAcknowledging ? (
              <>
                <span aria-hidden="true" className="w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                กำลังบันทึก...
              </>
            ) : (
              <>
                <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
                รับทราบและเข้าช่วยเหลือ
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AlertPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-[var(--tb-surface-2)]" />}>
      <AlertContent />
    </Suspense>
  );
}
