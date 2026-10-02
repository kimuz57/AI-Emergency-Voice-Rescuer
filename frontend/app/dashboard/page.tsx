"use client";
/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import WaveformAudioPlayer from "@/components/WaveformAudioPlayer"; // ปรับ Path ให้ตรง
import BlinkingAlert from "@/components/BlinkingAlert";
import DirectionCompass from "@/components/DirectionCompass";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// ==========================================
// เปิด SSE แบบต่อใหม่อัตโนมัติ
// - error ชั่วคราว (เน็ตหลุด) browser จะ reconnect เองถ้าเราไม่ close()
// - ถ้า browser ยอมแพ้ (readyState = CLOSED เช่น backend ตอบ 5xx/401) เราต่อใหม่เองแบบ backoff สูงสุด 30 วินาที
// คืนฟังก์ชัน cleanup สำหรับใช้ตอน unmount
// ==========================================
const SSE_RETRY_MIN_MS = 1000;
const SSE_RETRY_MAX_MS = 30000;

function connectSSE(url: string, label: string, onData: (data: any) => void): () => void {
  let source: EventSource | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryDelay = SSE_RETRY_MIN_MS;
  let stopped = false;

  const open = () => {
    if (stopped) return;
    const es = new EventSource(url, { withCredentials: true });
    source = es;

    es.onopen = () => {
      retryDelay = SSE_RETRY_MIN_MS;
    };

    es.onmessage = (event) => {
      try {
        onData(JSON.parse(event.data));
      } catch (error) {
        console.error(`Error parsing ${label}:`, error);
      }
    };

    es.onerror = () => {
      if (stopped || es.readyState !== EventSource.CLOSED) return; // browser กำลัง reconnect เอง
      es.close();
      retryTimer = setTimeout(open, retryDelay);
      retryDelay = Math.min(retryDelay * 2, SSE_RETRY_MAX_MS);
    };
  };

  open();

  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    source?.close();
  };
}

type Coordinates = {
  angle_degrees: number;
  distance_meters: number | null;
  confidence: number;
};

type EmergencyAlert = {
  ID?: number; // รองรับทั้ง ID และ id ตามที่ Go ส่งมา
  id?: number;
  patient_name: string;
  room_number: string;
  created_at: string;
  audio_url: string;
  status: string;
  coordinates?: Coordinates; // Phase 3: ข้อมูลพิกัดจาก 4-mic array
};

export default function Dashboard() {
  //console.log("1. Dashboard Component Rendered!");
  const router = useRouter();

  // Phase 3: Mock data สำหรับทดสอบ UI (จะลบออกเมื่อ Backend พร้อม)
  // ใช้ id ติดลบ เพื่อไม่ให้ชนกับ id จริงใน detection_logs (handleResolve จะไม่ยิง API ให้ id ติดลบ)
  const MOCK_ALERT_DATA: EmergencyAlert[] = [
    {
      id: -1,
      patient_name: "นายสมชาย ใจดี",
      room_number: "A-301",
      created_at: new Date().toISOString(),
      audio_url: "/api/audio/emergency_001.wav",
      status: "pending",
      coordinates: {
        angle_degrees: 45, // ทิศตะวันออกเฉียงเหนือ
        distance_meters: 2.5, // 2.5 เมตร
        confidence: 0.87, // 87% มั่นใจ
      },
    },
    // เพิ่มตัวอย่างที่ 2 (ไม่มีระยะทาง)
    {
      id: -2,
      patient_name: "นางสาวมานี สุขใจ",
      room_number: "B-205",
      created_at: new Date(Date.now() - 300000).toISOString(), // 5 นาทีก่อน
      audio_url: "/api/audio/emergency_002.wav",
      status: "pending",
      coordinates: {
        angle_degrees: 180, // ทิศใต้
        distance_meters: null, // ไม่ทราบระยะ
        confidence: 0.65,
      },
    },
  ];

  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);
  const [userData, setUserData] = useState<any>(null);
  const [patients, setPatients] = useState<any[]>([]);

  // Phase 3: Toggle สำหรับเปิด/ปิด mock data (ใช้ในการทดสอบ)
  // ค่าเริ่มต้นเป็นข้อมูลจริงเสมอ ปุ่มสลับแสดงเฉพาะตอน development
  const [useMockData, setUseMockData] = useState(false);

  // Helper สำหรับดึง Token
  const getAuthToken = () => {
    if (typeof window === "undefined") return "";
    const fromStorage = localStorage.getItem("token");
    if (fromStorage) return fromStorage;
    const match = document.cookie.match(/(?:^|; )token_public=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  };

  // ==========================================
  // เชื่อมต่อ SSE จาก Go Backend ผ่าน useEffect
  // ==========================================
  const [userEmail, setUserEmail] = useState<string | null>(null);
  // ==========================================
  // จังหวะที่ 1: ค้นหาอีเมลทันทีที่หน้าเว็บขยับ
  // ==========================================
  useEffect(() => {
    const initEmail = async () => {
      let email = localStorage.getItem("userEmail");

      // ถ้ามี email ใน localStorage แล้ว ให้ใช้เลยทันที (ไม่ต้องรอ session)
      if (email && email !== "null" && email !== "undefined") {
        setUserEmail(email);
        return;
      }
      try {
        const sessionRes = await Promise.race([
          fetch("/api/auth/session", { cache: "no-store" }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Session timeout')), 3000)
          )
        ]) as Response;

        if (sessionRes.ok) {
          const session = await sessionRes.json();
          if (session?.user?.email) {
            email = session.user.email;
            localStorage.setItem("userEmail", email as string);
            setUserEmail(email);
          }
        }
      } catch (error) {
        // ถ้า session fail ให้ใช้ fallback email สำหรับทดสอบ
        // ใช้ในหน่วยความจำเท่านั้น ห้ามเขียนลง localStorage ไม่งั้นจะค้างไปถึงตอน login จริง
        if (process.env.NODE_ENV === 'development') {
          const fallbackEmail = "test@example.com";
          setUserEmail(fallbackEmail);
        }
      }
    };

    initEmail();
  }, []); // ทำงานครั้งเดียวตอน Mount

  // ==========================================
  // จังหวะที่ 2: เริ่มต่อท่อ SSE "เมื่อได้อีเมลแล้วเท่านั้น"
  // ==========================================
  useEffect(() => {
    if (!userEmail) return;

    // Phase 3: ถ้าเปิด mock data ให้ใช้ข้อมูลทดสอบแทน SSE
    if (useMockData) {
      setAlerts(MOCK_ALERT_DATA);
      // ยังคงเชื่อมต่อ SSE สำหรับ Patients (ไม่ต้อง mock)
      const token = getAuthToken();
      const patientsUrl = `${API_BASE_URL}/api/patients/stream?email=${encodeURIComponent(userEmail)}&token=${encodeURIComponent(token)}`;
      const closePatients = connectSSE(patientsUrl, "patients", (data) => {
        const newData = Array.isArray(data) ? data : [];
        setPatients((prev) => (JSON.stringify(prev) === JSON.stringify(newData) ? prev : newData));
      });

      return () => {
        closePatients();
      };
    }

    // เคลียร์ alerts เดิม (mock data) ก่อนเริ่ม Live SSE
    setAlerts([]);
    setPatients([]);

    const token = getAuthToken();

    // 1. เชื่อมต่อ SSE สำหรับ Alerts
    const alertsUrl = `${API_BASE_URL}/api/alerts/stream?email=${encodeURIComponent(userEmail)}&token=${encodeURIComponent(token)}`;
    const closeAlerts = connectSSE(alertsUrl, "alerts", (data) => {
      const newData = Array.isArray(data) ? data : [];
      setAlerts((prev) => (JSON.stringify(prev) === JSON.stringify(newData) ? prev : newData));
    });

    // 2. เชื่อมต่อ SSE สำหรับ Patients
    const patientsUrl = `${API_BASE_URL}/api/patients/stream?email=${encodeURIComponent(userEmail)}&token=${encodeURIComponent(token)}`;
    const closePatients = connectSSE(patientsUrl, "patients", (data) => {
      const newData = Array.isArray(data) ? data : [];
      setPatients((prev) => (JSON.stringify(prev) === JSON.stringify(newData) ? prev : newData));
    });

    // 3. Clean up (ยกเลิก timer reconnect ที่ค้างอยู่ด้วย)
    return () => {
      closeAlerts();
      closePatients();
    };

  // จุดสำคัญที่สุด: บังคับให้ React รู้ว่า "ถ้า userEmail เปลี่ยน ให้รีสตาร์ทฟังก์ชันนี้นะ!"
  }, [userEmail, useMockData]); // เพิ่ม useMockData dependency

  // ==========================================
  // ฟังก์ชันเมื่อพยาบาลกดปุ่ม "รับทราบ" (อัปเดต DB)
  // ==========================================
  const handleResolve = async (id: number) => {
    if (!id) return;
    // การ์ด mock (id ติดลบ หรือเปิดโหมด mock อยู่) ปิดเฉพาะบนหน้าจอ ห้ามยิง API
    // ไม่งั้นอาจไป resolve alert จริงใน DB ที่ id ตรงกัน
    if (useMockData || id < 0) {
      setAlerts((prev) => prev.filter((a) => (a.id ?? a.ID) !== id));
      return;
    }
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE_URL}/api/alerts/${id}/resolve`, {
        method: "PUT",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        console.error("อัปเดตสถานะล้มเหลว");
      }
      // ข้อดีของ SSE:
      // ไม่จำเป็นต้องเรียกดึงข้อมูลใหม่แล้ว (ไม่ต้อง fetchAlerts)
      // เพราะเมื่อ Go Backend อัปเดต DB เสร็จ Go จะพ่นข้อมูลใหม่กลับมาทาง SSE Stream ให้เองทันที!
    } catch (error) {
      console.error("อัปเดตสถานะล้มเหลว:", error);
    }
  };

  // ค่าสรุปสำหรับแถวสถิติ — คำนวณจาก state ที่มีอยู่แล้วเท่านั้น ไม่มีการดึงข้อมูลเพิ่ม
  // (stream แจ้งเตือนส่งมาเฉพาะเหตุที่ยังไม่มีใครรับทราบ จึงนับจาก alerts ได้ตรงๆ)
  const latestAlertTime = alerts.reduce<number | null>((latest, a) => {
    const t = Date.parse(a.created_at);
    if (Number.isNaN(t)) return latest;
    return latest === null || t > latest ? t : latest;
  }, null);

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 lg:py-8">

      {/* หัวหน้า (Tabler page header) — ปุ่มอยู่ขวา จอเล็กตกลงมาใต้หัวข้อ */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--tb-muted)]">ภาพรวม</p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--tb-text)]">
            บอร์ดแจ้งเตือนผู้ป่วยวิกฤต
          </h1>
          <p className="mt-1 text-sm font-medium text-[var(--tb-muted)]">
            ข้อมูลอัปเดตเรียลไทม์จากระบบ AI Sensor
          </p>
        </div>

        {/* Phase 3: Debug toggle (จะลบออกเมื่อ production) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setUseMockData(!useMockData)}
              aria-pressed={useMockData}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface)] text-sm font-semibold text-[var(--tb-text)] shadow-[var(--tb-shadow-xs)] hover:bg-[var(--tb-surface-2)] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]"
            >
              <span
                aria-hidden="true"
                className={`w-2 h-2 rounded-full ${
                  useMockData ? "bg-[var(--tb-warning)]" : "bg-[var(--tb-success)]"
                }`}
              />
              {useMockData ? "ข้อมูลตัวอย่าง: เปิด" : "ข้อมูลตัวอย่าง: ปิด"}
            </button>
          </div>
        )}
      </div>

      {/* แถวสถิติ */}
      {/* มือถือเรียง 2 คอลัมน์ ไม่งั้นการ์ด 4 ใบดันการ์ดแจ้งเหตุฉุกเฉินตกไปใต้จอ */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 mb-6">
        <StatCard
          label="แจ้งเตือนรอรับทราบ"
          value={alerts.length}
          sub={alerts.length > 0 ? "ต้องเข้าช่วยเหลือทันที" : "ไม่มีเหตุฉุกเฉิน"}
          tone={alerts.length > 0 ? "danger" : "success"}
          icon={
            <>
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </>
          }
        />
        <StatCard
          label="ผู้ป่วยในความดูแล"
          value={patients.length}
          sub="เฝ้าระวังด้วย AI Sensor"
          tone="primary"
          subTone="neutral"
          icon={
            <>
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </>
          }
        />
        <StatCard
          label="แจ้งเตือนล่าสุด"
          value={latestAlertTime !== null ? formatClock(latestAlertTime) : "–"}
          sub={latestAlertTime !== null ? formatDay(latestAlertTime) : "ยังไม่มีการแจ้งเตือน"}
          tone="neutral"
          icon={
            <>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </>
          }
        />
        <StatCard
          label="แหล่งข้อมูล"
          value={useMockData ? "ตัวอย่าง" : "เรียลไทม์"}
          sub={useMockData ? "ข้อมูลทดสอบ ไม่ใช่เหตุจริง" : "รับข้อมูลสดผ่าน SSE"}
          tone={useMockData ? "warning" : "success"}
          icon={<path d="M22 12h-4l-3 9L9 3l-3 9H2" />}
        />
      </div>

      {/* ========================================== */}
      {/* เงื่อนไขที่ 1: มี Alert ฉุกเฉิน (แสดงก่อนเสมอ!) */}
      {/* ========================================== */}
      {alerts.length > 0 ? (
        /* แสดงการ์ด Alert */
        <div className="space-y-6">
          {alerts.map((alert, index) => (
            <BlinkingAlert
              key={alert.id || alert.ID || `alert-${index}`}
              isActive={true}
              intensity="high"
            >
              <article className="relative overflow-hidden bg-[var(--tb-surface)] border border-[var(--tb-border)] rounded-[var(--tb-radius-lg)] shadow-[var(--tb-shadow-card)]">
                {/* แถบสีแดง 4px ด้านซ้าย — stream ส่งมาเฉพาะเหตุที่ยังไม่รับทราบ ทุกใบจึงมีแถบนี้ */}
                <div
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 w-1 bg-[var(--tb-danger)]"
                />

                {/* หัวการ์ด: สถานะ + เวลา */}
                <div className="flex flex-wrap items-center gap-2 pl-6 pr-5 py-4 border-b border-[var(--tb-border)]">
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border border-[var(--tb-danger)]/25 bg-[var(--tb-danger-tint)] text-[var(--tb-danger-text)] animate-pulse">
                    <svg
                      className="w-3.5 h-3.5 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <path d="M12 9v4" />
                      <path d="M12 17h.01" />
                    </svg>
                    ต้องการความช่วยเหลือ
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border border-[var(--tb-border)] bg-[var(--tb-surface-2)] text-[var(--tb-muted)]">
                    <svg
                      className="w-3.5 h-3.5 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 6v6l4 2" />
                    </svg>
                    {alert.created_at
                      ? new Date(alert.created_at).toLocaleString("th-TH")
                      : "ไม่ระบุเวลา"}
                  </span>
                </div>

                {/* เนื้อหาการ์ด */}
                <div className="pl-6 pr-5 py-5">
                  <h2 className="text-2xl font-bold text-[var(--tb-text)] break-words">
                    {alert.patient_name}
                  </h2>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-[var(--tb-muted)]">
                    <svg
                      className="w-4 h-4 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    ห้องพัก:
                    <span className="font-semibold text-[var(--tb-text)]">
                      {alert.room_number}
                    </span>
                  </p>

                  {/* สองคอลัมน์: เข็มทิศ | เสียง (จอเล็กเรียงลงมา) */}
                  <div className="mt-5 flex flex-col md:flex-row gap-4">
                    {/* Left column: Direction Compass */}
                    {alert.coordinates && (
                      <section className="md:w-80 shrink-0 p-4 rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface-2)]">
                        <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold text-[var(--tb-muted)]">
                          <svg
                            className="w-4 h-4 shrink-0"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" />
                          </svg>
                          ทิศทางของเสียง
                        </h3>
                        <DirectionCompass
                          angle={alert.coordinates.angle_degrees}
                          distance={alert.coordinates.distance_meters}
                          confidence={alert.coordinates.confidence}
                        />
                      </section>
                    )}

                    {/* Right column: Audio player
                        ตัวเล่นจัดกึ่งกลางแนวตั้งในพื้นที่ที่เหลือ เพราะกล่องนี้เตี้ยกว่า
                        กล่องเข็มทิศ ถ้าชิดบนจะเหลือที่ว่างค้างด้านล่าง */}
                    <section className="flex-1 min-w-0 flex flex-col p-4 rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface-2)]">
                      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold text-[var(--tb-muted)]">
                        <span aria-hidden="true" className="relative flex w-2.5 h-2.5 shrink-0">
                          <span className="absolute inline-flex w-full h-full rounded-full bg-[var(--tb-danger)] opacity-75 animate-ping" />
                          <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-[var(--tb-danger)]" />
                        </span>
                        เสียงร้องขอความช่วยเหลือ
                      </h3>
                      <div className="flex-1 flex items-center">
                        <WaveformAudioPlayer
                          src={`${API_BASE_URL}${alert.audio_url}`}
                        />
                      </div>

                      {/* หมายเหตุ: แถบ SIGNAL ของไมค์ทั้ง 4 ย้ายไปหน้า
                          /admin/audio-diagnostics แล้ว — ผู้ดูแล (caregiver)
                          สนใจแค่ว่าตรวจจับเหตุได้ไหม ไม่ใช่ไมค์ตัวไหนดังกว่ากัน */}
                    </section>
                  </div>
                </div>

                {/* Footer: ปุ่มรับทราบ */}
                <div className="flex md:justify-end pl-6 pr-5 py-4 border-t border-[var(--tb-border)]">
                  <button
                    type="button"
                    onClick={() => {
                      const idToResolve = alert.id ?? alert.ID;
                      if (idToResolve !== undefined) {
                        handleResolve(idToResolve);
                      }
                    }}
                    className={`${PRIMARY_BTN} w-full md:w-auto h-11 px-5 text-base`}
                  >
                    <svg
                      className="w-5 h-5 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                    รับทราบ & ช่วยเหลือ
                  </button>
                </div>
              </article>
            </BlinkingAlert>
          ))}
        </div>
      ) : /* ========================================== */
      /* เงื่อนไขที่ 2: ยังไม่มีผู้ป่วยในความดูแลเลย (Empty State) */
      /* ========================================== */
      patients.length === 0 ? (
        <EmptyCard
          tone="primary"
          title="คุณยังไม่มีผู้ป่วยในการดูแล"
          description="กรุณาเพิ่มข้อมูลผู้ป่วยและเชื่อมต่ออุปกรณ์ EVR Sensor เพื่อเริ่มการเฝ้าระวังตลอด 24 ชั่วโมง"
          icon={
            <>
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </>
          }
        >
          <Link
            href="/register-patient"
            className={`${PRIMARY_BTN} mt-6 h-10 px-4 text-sm`}
          >
            <svg
              className="w-5 h-5 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            เพิ่มผู้ป่วยลงในระบบ
          </Link>
        </EmptyCard>
      ) : (
        /* ========================================== */
        /* เงื่อนไขที่ 3: มีผู้ป่วยแล้ว แต่ไม่มีใครป่วยหนัก (สถานการณ์ปกติ) */
        /* ========================================== */
        <EmptyCard
          tone="success"
          title="สถานการณ์ปกติ ปลอดภัยดี"
          description="ไม่มีผู้ป่วยต้องการความช่วยเหลือในขณะนี้ ระบบ AI กำลังเฝ้าระวัง..."
          icon={
            <>
              <circle cx="12" cy="12" r="10" />
              <path d="m9 12 2 2 4-4" />
            </>
          }
        />
      )}
    </div>
  );
}

// ==========================================
// ชิ้นส่วน UI ของหน้านี้ (สไตล์ Tabler)
// ==========================================
const PRIMARY_BTN =
  "inline-flex items-center justify-center gap-2 rounded-[var(--tb-radius)] bg-[var(--tb-primary)] hover:bg-[var(--tb-primary-hover)] text-[var(--tb-primary-contrast)] font-semibold shadow-[var(--tb-shadow-xs)] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]";

type Tone = "danger" | "success" | "warning" | "primary" | "neutral";

// สีตัวอักษร / สีพื้นอ่อนของไอคอน ตามโทนสถานะ
const TONE_TEXT: Record<Tone, string> = {
  danger: "text-[var(--tb-danger-text)]",
  success: "text-[var(--tb-success-text)]",
  warning: "text-[var(--tb-warning-text)]",
  primary: "text-[var(--tb-primary-text)]",
  neutral: "text-[var(--tb-muted)]",
};

const TONE_CHIP: Record<Tone, string> = {
  danger: "bg-[var(--tb-danger-tint)] text-[var(--tb-danger-text)]",
  success: "bg-[var(--tb-success-tint)] text-[var(--tb-success-text)]",
  warning: "bg-[var(--tb-warning-tint)] text-[var(--tb-warning-text)]",
  primary: "bg-[var(--tb-primary-tint)] text-[var(--tb-primary-text)]",
  neutral: "bg-[var(--tb-surface-2)] text-[var(--tb-muted)]",
};

// icon = เนื้อใน <svg> (path/circle) แบบเส้น viewBox 24
function StatCard({
  label,
  value,
  sub,
  tone,
  subTone = tone,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  tone: Tone;
  subTone?: Tone;
  icon: React.ReactNode;
}) {
  return (
    <div className="p-4 sm:p-5 bg-[var(--tb-surface)] border border-[var(--tb-border)] rounded-[var(--tb-radius-lg)] shadow-[var(--tb-shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--tb-muted)]">{label}</p>
          <p className="mt-1 text-2xl sm:text-3xl font-bold leading-tight tabular-nums text-[var(--tb-text)]">
            {value}
          </p>
        </div>
        <span
          aria-hidden="true"
          className={`hidden sm:inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-[var(--tb-radius)] ${TONE_CHIP[tone]}`}
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
          >
            {icon}
          </svg>
        </span>
      </div>
      <p className={`mt-1 text-xs sm:text-sm font-medium ${TONE_TEXT[subTone]}`}>{sub}</p>
    </div>
  );
}

// การ์ดสถานะว่าง: ไอคอนในวงกลมสีอ่อน + หัวข้อ + คำอธิบาย (+ ปุ่มถ้ามี)
function EmptyCard({
  tone,
  title,
  description,
  icon,
  children,
}: {
  tone: Tone;
  title: string;
  description: string;
  icon: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-12 sm:py-16 bg-[var(--tb-surface)] border border-[var(--tb-border)] rounded-[var(--tb-radius-lg)] shadow-[var(--tb-shadow-card)]">
      <span
        aria-hidden="true"
        className={`inline-flex items-center justify-center w-14 h-14 mb-4 rounded-full ${TONE_CHIP[tone]}`}
      >
        <svg
          className="w-7 h-7"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
        >
          {icon}
        </svg>
      </span>
      <h2 className="text-lg font-semibold text-[var(--tb-text)]">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-[var(--tb-muted)]">
        {description}
      </p>
      {children}
    </div>
  );
}

// เวลา/วันที่ของแจ้งเตือนล่าสุด (ms จาก Date.parse)
function formatClock(ms: number) {
  return `${new Date(ms).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.`;
}

function formatDay(ms: number) {
  return new Date(ms).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
