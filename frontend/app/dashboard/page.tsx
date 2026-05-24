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
  const router = useRouter();
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);

  // 🟢 State จำลองรายชื่อผู้ป่วย (เดี๋ยวเราค่อยทำ API ดึงจาก Go มาใส่แทน)
  // ลองเปลี่ยนเป็น [] เพื่อดูหน้าจอ "ไม่มีผู้ป่วย (Empty State)"
  const [patients, setPatients] = useState<any[]>([]);

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
      const res = await fetch(
        `${API_BASE_URL}/api/alerts/${id}/resolve`,
        { method: "PUT" },
      );
      if (res.ok) {
        fetchAlerts(); // อัปเดตหน้าจอทันที
      }
    } catch (error) {
      console.error("อัปเดตสถานะล้มเหลว:", error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl md:text-3xl font-bold text-gray-800 mb-8 text-center md:text-left flex items-center justify-center md:justify-start gap-3">
          🚨 บอร์ดแจ้งเตือนผู้ป่วยวิกฤต{" "}
          <span className="text-sm md:text-lg text-gray-500 font-normal">
            (ข้อมูลสดจาก DB)
          </span>
        </h1>

        {/* ========================================== */}
        {/* 🔴 เงื่อนไขที่ 1: ยังไม่มีผู้ป่วยในความดูแลเลย (Empty State) */}
        {/* ========================================== */}
        {patients.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-gray-300 rounded-xl p-10 flex flex-col items-center justify-center text-center shadow-sm">
            <div className="bg-gray-100 rounded-full p-5 mb-5">
              <svg
                className="w-10 h-10 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                ></path>
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-gray-800 mb-2">
              คุณยังไม่มีผู้ป่วยในการดูแล
            </h2>
            <p className="text-gray-500 mb-8 max-w-md">
              กรุณาเพิ่มข้อมูลผู้ป่วยและเชื่อมต่ออุปกรณ์ AI SmartVoice
              เพื่อเริ่มการเฝ้าระวังตลอด 24 ชั่วโมง
            </p>

            <Link
              href="/dashboard/devices" // 🟢 เปลี่ยนเป็น Path หน้าลงทะเบียนของผู้กองได้เลย
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-8 rounded-lg transition-all shadow-sm hover:shadow-md flex items-center gap-2"
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
                  strokeWidth="2"
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
          <div className="bg-green-50 text-green-700 border-2 border-green-200 rounded-xl p-8 text-center flex flex-col items-center justify-center gap-3 shadow-sm">
            <div className="bg-green-100 p-3 rounded-full">
              <svg
                className="w-8 h-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                ></path>
              </svg>
            </div>
            <span className="font-semibold text-lg">สถานการณ์ปกติ</span>
            <span className="text-green-600">
              ไม่มีผู้ป่วยต้องการความช่วยเหลือในขณะนี้ ระบบกำลังเฝ้าระวัง...
            </span>
          </div>
        ) : (
          /* ========================================== */
          /* 🚨 เงื่อนไขที่ 3: มีผู้ป่วยต้องการความช่วยเหลือ (โชว์ข้อมูล) */
          /* ========================================== */
          <div className="space-y-4">
            {alerts.map((alert) => (
              <div
                key={alert.id || alert.ID || Math.random()}
                className="bg-white border-l-4 border-red-500 shadow-md rounded-xl p-6 flex flex-col md:flex-row gap-6 items-center transition-all hover:shadow-lg"
              >
                {/* ข้อมูลผู้ป่วย */}
                <div className="flex-1 w-full">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs md:text-sm font-bold animate-pulse whitespace-nowrap">
                      ต้องการความช่วยเหลือ!
                    </span>
                    <span className="text-gray-500 text-sm">
                      {alert.created_at
                        ? new Date(alert.created_at).toLocaleString("th-TH")
                        : "ไม่ระบุเวลา"}
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-800 mb-1">
                    {alert.patient_name}
                  </h2>
                  <p className="text-gray-600 font-medium">
                    ห้องพัก: {alert.room_number}
                  </p>
                </div>

                {/* เครื่องเล่นเสียง */}
                <div className="flex-shrink-0 w-full md:w-auto bg-gray-50 p-3 rounded-lg border border-gray-100">
                  <p className="text-xs text-gray-500 mb-2 font-medium">
                    <span className="inline-block w-2 h-2 bg-red-500 rounded-full mr-1 animate-ping"></span>
                    เสียงหลักฐานจาก ESP32:
                  </p>
                  <CustomAudioPlayer
                    src={`${API_BASE_URL}${alert.audio_url}`}
                  />
                </div>

                {/* ปุ่มรับทราบ */}
                <div className="flex-shrink-0 w-full md:w-auto">
                  <button
                    onClick={() => {
                      const idToResolve = alert.id ?? alert.ID;
                      if (idToResolve !== undefined) {
                        handleResolve(idToResolve);
                      }
                    }}
                    className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors shadow-sm"
                  >
                    รับทราบ & เข้าช่วยเหลือ
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
