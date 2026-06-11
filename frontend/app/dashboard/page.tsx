"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import CustomAudioPlayer from "@/components/CustomAudioPlayer"; // ปรับ Path ให้ตรง

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type EmergencyAlert = {
  ID?: number; // รองรับทั้ง ID และ id ตามที่ Go ส่งมา
  id?: number;
  patient_name: string;
  room_number: string;
  created_at: string;
  audio_url: string;
  status: string;
};

export default function Dashboard() {
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);

  // 🟢 State จำลองรายชื่อผู้ป่วย (เดี๋ยวเราค่อยทำ API ดึงจาก Go มาใส่แทน)
  // ลองเปลี่ยนเป็น [] เพื่อดูหน้าจอ "ไม่มีผู้ป่วย (Empty State)"
  const [patients, setPatients] = useState<unknown[]>([]);

  // ==========================================
  // 1. ฟังก์ชันดึงข้อมูลเหตุฉุกเฉินจริงจาก Go Backend (PostgreSQL)
  // ==========================================
  const fetchAlerts = async () => {
    try {
      const targetEmail = localStorage.getItem("userEmail");

      if (!targetEmail || targetEmail === "null") {
        console.log("❌ ไม่มีอีเมลที่ถูกต้อง หยุดการทำงาน API");
        return;
      }

      const res = await fetch(
        `${API_BASE_URL}/api/alerts?email=${targetEmail}`,
        {
          method: "GET", // ระบุ method ให้ชัดเจน
          credentials: "include", // 🔑 สั่งให้แนบคุกกี้ httpOnly ไปด้วย!
        },
      );

      if (res.ok) {
        const data = await res.json();
        setAlerts(Array.isArray(data) ? data : []);
      } else {
        setAlerts([]);
      }
    } catch (error) {
      console.error("Failed to fetch alerts:", error);
      setAlerts([]);
    }
  };

  const fetchPatients = async () => {
    try {
      // ❌ ไม่ต้องพยายามดึง Token จาก localStorage แล้วครับ ลบทิ้งไปได้เลย
      const targetEmail = localStorage.getItem("userEmail"); // (สมมติว่าอีเมลยังเก็บไว้ในนี้)

      if (!targetEmail || targetEmail === "null") {
        console.log("❌ ไม่มีอีเมล");
        return;
      }

      // 🟢 ยิง API โดยสั่งให้เบราว์เซอร์ "แนบคุกกี้ (Token) ไปด้วยอัตโนมัติ"
      const res = await fetch(
        `${API_BASE_URL}/api/patients?email=${targetEmail}`,
        {
          method: "GET",
          credentials: "include", // 🔑 พระเอกของเราอยู่ตรงนี้ครับ!
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (res.ok) {
        const data = await res.json();
        setPatients(Array.isArray(data) ? data : []);
      } else {
        console.error("ดึงข้อมูลผู้ป่วยล้มเหลว");
        setPatients([]);
      }
    } catch (error) {
      console.error("เชื่อมต่อ Backend ล้มเหลว:", error);
      setPatients([]);
    }
  };

  // useEffect(() => {
  //   fetchAlerts();
  //   // โหลดข้อมูลใหม่ทุกๆ 5 วินาที
  //   const interval = setInterval(fetchAlerts, 5000);
  //   return () => clearInterval(interval);
  // }, []);
  useEffect(() => {
    fetchAlerts();
    fetchPatients(); // 🟢 1. สั่งดึงรายชื่อ/จำนวนคนไข้ตอนเปิดหน้าเว็บครั้งแรก

    const interval = setInterval(() => {
      fetchAlerts();
      fetchPatients(); // 🟢 2. สั่งให้อัปเดตข้อมูลคนไข้สดใหม่ทุกๆ 5 วินาที
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // ==========================================
  // 2. ฟังก์ชันเมื่อพยาบาลกดปุ่ม "รับทราบ" (อัปเดต DB)
  // ==========================================
  const handleResolve = async (id: number) => {
    if (!id) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/alerts/${id}/resolve`, {
        method: "PUT",
      });
      if (res.ok) {
        fetchAlerts(); // อัปเดตหน้าจอทันที
      }
    } catch (error) {
      console.error("อัปเดตสถานะล้มเหลว:", error);
    }
  };

  return (
    <div className="dark:bg-slate-800 relative min-h-screen bg-slate-50 flex flex-col items-center p-4 md:p-8 font-sans overflow-hidden dark:bg-slate-800">
      {/* 🌟 Background Glowing Orbs (ลูกแก้วแสงวิ้งๆ สีไซเรนเตือนภัย) */}
      <div className="fixed top-[-10%] left-[-10%] w-[500px] h-[500px] bg-red-400 rounded-full mix-blend-multiply filter blur-[120px] opacity-20 animate-pulse pointer-events-none"></div>
      <div
        className="dark:bg-slate-800 fixed bottom-[-10%] right-[-5%] w-[400px] h-[400px] bg-blue-400 rounded-full mix-blend-multiply filter blur-[100px] opacity-20 animate-pulse pointer-events-none"
        style={{ animationDelay: "2s" }}
      ></div>

      {/* 📦 Main Container */}
      <div className="relative z-10 w-full max-w-5xl mt-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-center md:items-start gap-4 mb-10 text-center md:text-left bg-white/60 dark:bg-slate-800 backdrop-blur-md p-6 rounded-3xl border border-white/60 shadow-sm">
          <div className="p-3 bg-gradient-to-br rounded-2xl animate-bounce shadow-sm ">
            <span className="text-3xl md:text-4xl">🚨</span>
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
        {/* ⚪ เงื่อนไขที่ 1: ยังไม่มีผู้ป่วยในความดูแลเลย (Empty State) */}
        {/* ========================================== */}
        {patients.length === 0 ? (
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
              href="/devices"
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
        ) : /* ========================================== */
        /* 🟢 เงื่อนไขที่ 2: มีผู้ป่วยแล้ว แต่ไม่มีใครป่วยหนัก (สถานการณ์ปกติ) */
        /* ========================================== */
        alerts.length === 0 ? (
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
              🛡️
            </p>
          </div>
        ) : (
          /* ========================================== */
          /* 🚨 เงื่อนไขที่ 3: มีผู้ป่วยต้องการความช่วยเหลือ (โชว์ Alert Cards) */
          /* ========================================== */
          <div className="space-y-6">
            {alerts.map((alert, index) => (
              <div
                key={alert.id || alert.ID || `alert-${index}`}
                className="dark:bg-slate-800 dark:text-white bg-white/80 backdrop-blur-xl p-6 md:p-8 rounded-3xl shadow-lg border border-red-100 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6 hover:shadow-xl hover:-translate-y-1 transition-all group"
              >
                {/* แถบสีแดงเตือนภัยด้านซ้าย (Glow Effect) */}
                <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-red-500 to-rose-600 shadow-[0_0_15px_rgba(225,29,72,0.6)]"></div>

                {/* 1. ข้อมูลผู้ป่วย */}
                <div className="flex-1 pl-4 w-full">
                  <div className=" flex flex-wrap items-center gap-3 mb-3">
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

                {/* 2. เครื่องเล่นเสียง AI */}
                <div className="dark:bg-slate-700 flex-1 w-full md:w-auto bg-slate-50/80 backdrop-blur-sm rounded-2xl p-4 border border-slate-200/60 shadow-inner">
                  <p className="dark:text-white text-xs font-bold text-slate-500 mb-3 flex items-center gap-2 uppercase tracking-wide">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping shadow-[0_0_8px_rgba(244,63,94,0.8)]"></span>
                    เสียงร้องขอความช่วยเหลือ:
                  </p>

                  {/* กล่องใส่ Component เสียงเดิมของคุณ */}
                  <div className="w-full relative z-20">
                    <CustomAudioPlayer
                      src={`${API_BASE_URL}${alert.audio_url}`}
                    />
                  </div>
                </div>

                {/* 3. ปุ่มรับทราบ */}
                <div className="w-full md:w-auto flex justify-end mt-2 md:mt-0 relative z-20">
                  <button
                    onClick={() => {
                      const idToResolve = alert.id ?? alert.ID;
                      if (idToResolve !== undefined) {
                        handleResolve(idToResolve);
                      }
                    }}
                    className="w-full md:w-auto px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-bold text-lg shadow-lg hover:shadow-indigo-500/40 transition-all hover:-translate-y-1 active:translate-y-0 flex items-center justify-center gap-2 group-hover:scale-105"
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
