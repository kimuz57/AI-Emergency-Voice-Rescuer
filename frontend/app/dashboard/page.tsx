"use client";
/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import WaveformAudioPlayer from "@/components/WaveformAudioPlayer"; // ปรับ Path ให้ตรง
import PhoneReminder from "@/components/PhoneReminder";
import BlinkingAlert from "@/components/BlinkingAlert";
import DirectionCompass from "@/components/DirectionCompass";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

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
  coordinates?: Coordinates; // 🆕 Phase 3: ข้อมูลพิกัดจาก 4-mic array
};

export default function Dashboard() {
  //console.log("🟢 1. Dashboard Component Rendered!");
  const router = useRouter();

  // 🆕 Phase 3: Mock data สำหรับทดสอบ UI (จะลบออกเมื่อ Backend พร้อม)
  const MOCK_ALERT_DATA: EmergencyAlert[] = [
    {
      id: 1,
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
      id: 2,
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

  // 🆕 Phase 3: Toggle สำหรับเปิด/ปิด mock data (ใช้ในการทดสอบ)
  const [useMockData, setUseMockData] = useState(true); // เปลี่ยนเป็น false เมื่อ Backend พร้อม

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
  // 🔄 จังหวะที่ 1: ค้นหาอีเมลทันทีที่หน้าเว็บขยับ
  // ==========================================
  useEffect(() => {
    const initEmail = async () => {
      let email = localStorage.getItem("userEmail");

      // 🆕 ถ้ามี email ใน localStorage แล้ว ให้ใช้เลยทันที (ไม่ต้องรอ session)
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
        if (process.env.NODE_ENV === 'development') {
          const fallbackEmail = "test@example.com";
          setUserEmail(fallbackEmail);
          localStorage.setItem("userEmail", fallbackEmail);
        }
      }
    };

    initEmail();
  }, []); // ทำงานครั้งเดียวตอน Mount

  // ==========================================
  // 🚀 จังหวะที่ 2: เริ่มต่อท่อ SSE "เมื่อได้อีเมลแล้วเท่านั้น"
  // ==========================================
  useEffect(() => {
    if (!userEmail) return;

    // 🆕 Phase 3: ถ้าเปิด mock data ให้ใช้ข้อมูลทดสอบแทน SSE
    if (useMockData) {
      setAlerts(MOCK_ALERT_DATA);
      // ยังคงเชื่อมต่อ SSE สำหรับ Patients (ไม่ต้อง mock)
      const token = getAuthToken();
      const patientsUrl = `${API_BASE_URL}/api/patients/stream?email=${encodeURIComponent(userEmail)}&token=${encodeURIComponent(token)}`;
      const patientsSource = new EventSource(patientsUrl, {
        withCredentials: true,
      });

      patientsSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const newData = Array.isArray(data) ? data : [];
          setPatients((prev) => (JSON.stringify(prev) === JSON.stringify(newData) ? prev : newData));
        } catch (error) {
          console.error("Error parsing patients:", error);
        }
      };

      patientsSource.onerror = () => patientsSource.close();

      return () => {
        patientsSource.close();
      };
    }

    // เคลียร์ alerts เดิม (mock data) ก่อนเริ่ม Live SSE
    setAlerts([]);
    setPatients([]);

    const token = getAuthToken();

    // 1. เชื่อมต่อ SSE สำหรับ Alerts
    const alertsUrl = `${API_BASE_URL}/api/alerts/stream?email=${encodeURIComponent(userEmail)}&token=${encodeURIComponent(token)}`;
    const alertsSource = new EventSource(alertsUrl, {
      withCredentials: true,
    });

    alertsSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const newData = Array.isArray(data) ? data : [];
        setAlerts((prev) => (JSON.stringify(prev) === JSON.stringify(newData) ? prev : newData));
      } catch (error) {
        console.error("Error parsing alerts:", error);
      }
    };

    alertsSource.onerror = () => alertsSource.close();

    // 2. เชื่อมต่อ SSE สำหรับ Patients
    const patientsUrl = `${API_BASE_URL}/api/patients/stream?email=${encodeURIComponent(userEmail)}&token=${encodeURIComponent(token)}`;
    const patientsSource = new EventSource(patientsUrl, {
      withCredentials: true,
    });

    patientsSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const newData = Array.isArray(data) ? data : [];
        setPatients((prev) => (JSON.stringify(prev) === JSON.stringify(newData) ? prev : newData));
      } catch (error) {
        console.error("Error parsing patients:", error);
      }
    };

    patientsSource.onerror = () => patientsSource.close();

    // 3. Clean up
    return () => {
      alertsSource.close();
      patientsSource.close();
    };

  // 🌟 จุดสำคัญที่สุด: บังคับให้ React รู้ว่า "ถ้า userEmail เปลี่ยน ให้รีสตาร์ทฟังก์ชันนี้นะ!"
  }, [userEmail, useMockData]); // 🆕 เพิ่ม useMockData dependency

  // ==========================================
  // ฟังก์ชันเมื่อพยาบาลกดปุ่ม "รับทราบ" (อัปเดต DB)
  // ==========================================
  const handleResolve = async (id: number) => {
    if (!id) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/alerts/${id}/resolve`, {
        method: "PUT",
        credentials: "include",
      });

      if (!res.ok) {
        console.error("อัปเดตสถานะล้มเหลว");
      }
      // 💡 ข้อดีของ SSE:
      // ไม่จำเป็นต้องเรียกดึงข้อมูลใหม่แล้ว (ไม่ต้อง fetchAlerts)
      // เพราะเมื่อ Go Backend อัปเดต DB เสร็จ Go จะพ่นข้อมูลใหม่กลับมาทาง SSE Stream ให้เองทันที!
    } catch (error) {
      console.error("อัปเดตสถานะล้มเหลว:", error);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center p-4 md:p-8 font-sans overflow-hidden">
      {/* <PhoneReminder hasPhone={!!userData?.phone} /> */}
      {/* 🌟 Background Glowing Orbs (ลูกแก้วแสงวิ้งๆ สีไซเรนเตือนภัย) */}
      <div className="fixed top-[-10%] left-[-10%] w-[500px] h-[500px] bg-red-400 rounded-full mix-blend-multiply filter blur-[120px] opacity-20 animate-pulse pointer-events-none"></div>
      <div
        className="dark:bg-slate-800 fixed bottom-[-10%] right-[-5%] w-[400px] h-[400px] bg-blue-400 rounded-full mix-blend-multiply filter blur-[100px] opacity-20 animate-pulse pointer-events-none"
        style={{ animationDelay: "2s" }}
      ></div>

      {/* 📦 Main Container */}
      <div className="relative z-10 w-full max-w-5xl mt-6">
        {/* 🆕 Phase 3: Debug toggle (จะลบออกเมื่อ production) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mb-4 flex justify-end">
            <button
              onClick={() => setUseMockData(!useMockData)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                useMockData
                  ? 'bg-amber-500 text-white hover:bg-amber-600'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
              }`}
            >
              {useMockData ? '🧪 Mock Data ON' : '📡 Live SSE'}
            </button>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col md:flex-row items-center md:items-start gap-4 mb-10 text-center md:text-left bg-white/60 dark:bg-slate-800 backdrop-blur-md p-6 rounded-3xl border border-white/60 shadow-sm">
          <div className="p-3 bg-gradient-to-br rounded-2xl animate-bounce shadow-sm ">
            <span className="text-3xl md:text-4xl">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-9 h-9 text-rose-500"
              >
                {/* ฐานไซเรน */}
                <rect x="4" y="16" width="16" height="4" rx="1" />
                {/* โดมไฟ */}
                <path d="M7 16v-4a5 5 0 0 1 10 0v4" />
                {/* แสงไฟ 3 แฉก (บน, ซ้าย, ขวา) */}
                <line x1="12" x2="12" y1="2" y2="5" />
                <line x1="6" x2="8" y1="5" y2="7" />
                <line x1="18" x2="16" y1="5" y2="7" />
              </svg>
            </span>
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent tracking-tight dark:text-white">
              บอร์ดแจ้งเตือนผู้ป่วยวิกฤต
            </h1>
            <p className="text-slate-500 font-medium mt-1 text-sm md:text-base">
              (ข้อมูลอัปเดตเรียลไทม์จากระบบ AI Sensor)
            </p>
          </div>
        </div>

        {/* ========================================== */}
        {/* 🚨 เงื่อนไขที่ 1: มี Alert ฉุกเฉิน (แสดงก่อนเสมอ!) */}
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
                <div className="dark:bg-slate-800 dark:text-white bg-white/80 backdrop-blur-xl p-6 md:p-8 rounded-3xl shadow-lg border border-red-100 relative overflow-hidden flex flex-col gap-6 hover:shadow-xl transition-all group">
                  {/* แถบสีแดงเตือนภัยด้านซ้าย (Glow Effect) */}
                  <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-red-500 to-rose-600 shadow-[0_0_15px_rgba(225,29,72,0.6)]"></div>

                  {/* Header: ข้อมูลผู้ป่วย + เวลา */}
                  <div className="flex-1 pl-4 w-full">
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <span className="dark:bg-red-500 dark:text-red-300 px-4 py-1.5 bg-red-100 text-red-700 text-xs font-bold rounded-full uppercase tracking-wider animate-pulse border border-red-200 shadow-sm">
                        ⚠️ ต้องการความช่วยเหลือ!
                      </span>
                      <span className="dark:text-white text-xs text-slate-500 font-semibold bg-slate-100 dark:bg-slate-700 px-3 py-1 rounded-full">
                        🕒{" "}
                        {alert.created_at
                          ? new Date(alert.created_at).toLocaleString("th-TH")
                          : "ไม่ระบุเวลา"}
                      </span>
                    </div>
                    <h2 className="dark:text-white text-3xl font-extrabold text-slate-800 mb-1 tracking-tight">
                      {alert.patient_name}
                    </h2>
                    <p className="text-slate-500 text-sm font-medium flex items-center gap-2">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                        />
                      </svg>
                      ห้องพัก:{" "}
                      <span className="dark:text-slate-200 text-slate-700 font-bold text-base">
                        {alert.room_number}
                      </span>
                    </p>
                  </div>

                  {/* Main content: 2 columns layout */}
                  <div className="flex flex-col lg:flex-row gap-6 pl-4">
                    {/* Left column: Direction Compass */}
                    {alert.coordinates && (
                      <div className="flex-shrink-0">
                        <DirectionCompass
                          angle={alert.coordinates.angle_degrees}
                          distance={alert.coordinates.distance_meters}
                          confidence={alert.coordinates.confidence}
                        />
                      </div>
                    )}

                    {/* Right column: Audio player
                        จัดกึ่งกลางแนวตั้ง เพราะพอถอดแถบ SIGNAL ออกแล้ว
                        คอลัมน์นี้เตี้ยกว่าเข็มทิศ ถ้าชิดบนจะเหลือที่ว่างค้างด้านล่าง */}
                    <div className="flex-1 flex flex-col justify-center space-y-4">
                      {/* Audio player */}
                      <div className="dark:bg-slate-700 bg-slate-50/80 backdrop-blur-sm rounded-2xl p-4 border border-slate-200/60 dark:border-slate-600 shadow-inner">
                        <p className="dark:text-white text-xs font-bold text-slate-500 mb-3 flex items-center gap-2 uppercase tracking-wide">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping shadow-[0_0_8px_rgba(244,63,94,0.8)]"></span>
                          เสียงร้องขอความช่วยเหลือ:
                        </p>
                        <WaveformAudioPlayer
                          src={`${API_BASE_URL}${alert.audio_url}`}
                        />
                      </div>

                      {/* หมายเหตุ: แถบ SIGNAL ของไมค์ทั้ง 4 ย้ายไปหน้า
                          /admin/audio-diagnostics แล้ว — ผู้ดูแล (caregiver)
                          สนใจแค่ว่าตรวจจับเหตุได้ไหม ไม่ใช่ไมค์ตัวไหนดังกว่ากัน */}
                    </div>
                  </div>

                  {/* Footer: ปุ่มรับทราบ */}
                  <div className="w-full flex justify-end pl-4">
                    <button
                      onClick={() => {
                        const idToResolve = alert.id ?? alert.ID;
                        if (idToResolve !== undefined) {
                          handleResolve(idToResolve);
                        }
                      }}
                      className="w-full md:w-auto px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-bold text-lg shadow-lg hover:shadow-indigo-500/40 transition-all hover:-translate-y-1 active:translate-y-0 flex items-center justify-center gap-2"
                    >
                      <svg
                        className="w-6 h-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2.5"
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      รับทราบ & ช่วยเหลือ
                    </button>
                  </div>
                </div>
              </BlinkingAlert>
            ))}
          </div>
        ) : /* ========================================== */
        /* ⚪ เงื่อนไขที่ 2: ยังไม่มีผู้ป่วยในความดูแลเลย (Empty State) */
        /* ========================================== */
        patients.length === 0 ? (
          <div className="bg-white/80 dark:bg-slate-800 backdrop-blur-xl border border-white rounded-3xl p-12 flex flex-col items-center justify-center text-center shadow-lg relative overflow-hidden group">
            {/* แสงตกแต่งพื้นหลัง Empty State */}
            <div className="dark:bg-slate-700 inset-0 bg-gradient-to-b from-slate-50 to-white opacity-50"></div>

            <div className="relative z-10 bg-slate-100 rounded-full p-6 mb-6 group-hover:scale-110 transition-transform duration-500 dark:bg-slate-800">
              <svg
                className="w-12 h-12 text-slate-400 dark:text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                ></path>
              </svg>
            </div>
            <h2 className="relative z-10 text-2xl font-extrabold text-slate-800 mb-2 dark:text-white ">
              คุณยังไม่มีผู้ป่วยในการดูแล
            </h2>
            <p className="relative z-10 text-slate-500 mb-8 max-w-md leading-relaxed dark:text-slate-200">
              กรุณาเพิ่มข้อมูลผู้ป่วยและเชื่อมต่ออุปกรณ์ EVR Sensor
              เพื่อเริ่มการเฝ้าระวังตลอด 24 ชั่วโมง
            </p>

            <Link
              href="/register-patient"
              className="relative z-10 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-4 px-8 rounded-2xl transition-all shadow-lg hover:shadow-indigo-500/30 flex items-center gap-3 hover:-translate-y-1"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  d="M12 4v16m8-8H4"
                ></path>
              </svg>
              เพิ่มผู้ป่วยลงในระบบ
            </Link>
          </div>
        ) : (
          /* ========================================== */
          /* 🟢 เงื่อนไขที่ 3: มีผู้ป่วยแล้ว แต่ไม่มีใครป่วยหนัก (สถานการณ์ปกติ) */
          /* ========================================== */
          <div className="dark:bg-slate-800 bg-emerald-50/80 backdrop-blur-xl border border-emerald-100 rounded-3xl p-10 text-center flex flex-col items-center justify-center gap-4 shadow-lg relative overflow-hidden">
            {/* แสงวิ้งๆ สีเขียวมรกตแสดงความปลอดภัย */}
            <div className="absolute top-[-50%] left-[-20%] w-[300px] h-[300px] bg-emerald-300 rounded-full mix-blend-multiply filter blur-[80px] opacity-30 animate-pulse pointer-events-none "></div>

            <div className="relative z-10 bg-emerald-100/80 dark:bg-slate-700 p-4 rounded-full shadow-sm">
              <svg
                className="w-10 h-10 text-emerald-600 dark:text-emerald-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                ></path>
              </svg>
            </div>
            <h2 className="relative z-10 font-extrabold text-2xl text-emerald-800 tracking-wide dark:text-emerald-400">
              สถานการณ์ปกติ ปลอดภัยดี
            </h2>
            <p className="dark:bg-slate-700 relative z-10 text-emerald-600/80 font-medium bg-white/50  px-6 py-2 rounded-full backdrop-blur-sm dark:text-emerald-400">
              ไม่มีผู้ป่วยต้องการความช่วยเหลือในขณะนี้ ระบบ AI กำลังเฝ้าระวัง...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
