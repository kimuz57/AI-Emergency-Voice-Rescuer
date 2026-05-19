"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  // 🟢 1. ฟังก์ชันดึงข้อมูลเหตุฉุกเฉินจริงจาก Go Backend (PostgreSQL)
  const fetchAlerts = async () => {
    try {
      // 🟢 1. ดึงอีเมลของคนที่ Login อยู่ (สมมติว่าคุณเก็บไว้ใน localStorage ตอน Login)
      // (ถ้ายังไม่มีระบบ Login สามารถใส่ email ตรงๆ แบบ "doctor@hospital.com" เพื่อทดสอบก่อนได้ครับ)
      const targetEmail = localStorage.getItem("userEmail");

      if (!targetEmail || targetEmail === "null") {
        console.log("❌ ไม่มีอีเมลที่ถูกต้อง (พบค่าว่างหรือ null) หยุดการทำงาน API");
        return;
      }
      
      // 🟢 2. แนบอีเมลไปกับ URL
      const res = await fetch(`http://localhost:8080/api/alerts?email=${targetEmail}`);

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem("userEmail", targetEmail);
        router.push("/dashboard");
        setAlerts(data);
      }
    } catch (error) {
      console.error("Failed to fetch alerts:", error);
    }
  };

  useEffect(() => {
    fetchAlerts();
    // (Optional) ตั้งให้โหลดใหม่ทุกๆ 5 วินาที เพื่อดึงเคสใหม่จาก AI อัตโนมัติ
    const interval = setInterval(fetchAlerts, 5000);
    return () => clearInterval(interval);
  }, []);

  // 🟢 2. ฟังก์ชันเมื่อพยาบาลกดปุ่ม "รับทราบ" ให้ไปอัปเดตสถานะใน DB จริง
  const handleResolve = async (id: number) => {
    try {
      const res = await fetch(
        `http://localhost:8080/api/alerts/${id}/resolve`,
        {
          method: "PUT",
        },
      );
      if (res.ok) {
        // อัปเดตหน้าจอทันทีโดยการดึงข้อมูลใหม่
        fetchAlerts();
      }
    } catch (error) {
      console.error("อัปเดตสถานะล้มเหลว:", error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">
          🚨 บอร์ดแจ้งเตือนผู้ป่วยวิกฤต (ข้อมูลสดจาก DB)
        </h1>

        {alerts.length === 0 ? (
          <div className="bg-green-100 text-green-700 p-4 rounded-lg text-center font-medium">
            ✅ สถานการณ์ปกติ ไม่มีผู้ป่วยต้องการความช่วยเหลือในขณะนี้
          </div>
        ) : (
          <div className="space-y-4">
            {alerts.map((alert) => (
              <div
                key={alert.id || alert.ID}
                className="bg-white border-l-4 border-red-500 shadow-md rounded-lg p-6 flex flex-col md:flex-row gap-6 items-center"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-sm font-bold animate-pulse">
                      ต้องการความช่วยเหลือ!
                    </span>
                    {/* 🟢 แก้ไขตรงนี้: เช็คก่อนว่ามีข้อมูลเวลาส่งมาไหม แล้วรองรับทั้งพิมพ์เล็ก/ใหญ่ */}
                    <span className="text-gray-500 text-sm">
                      {alert.CreatedAt || alert.created_at
                        ? new Date(
                            alert.CreatedAt || alert.created_at,
                          ).toLocaleString("th-TH")
                        : "ไม่ระบุเวลา"}
                    </span>
                  </div>
                  <h2 className="text-xl font-semibold text-gray-800">
                    {alert.patient_name}
                  </h2>
                  <p className="text-gray-600">ห้องพัก: {alert.room_number}</p>
                </div>

                <div className="flex-shrink-0 w-full md:w-auto">
                  <p className="text-sm text-gray-500 mb-1">
                    เสียงหลักฐานจาก ESP32:
                  </p>
                  <audio
                    controls
                    src={alert.audio_url}
                    className="w-full h-10 outline-none rounded-md bg-gray-100"
                  />
                </div>

                <div className="flex-shrink-0">
                  <button
                    onClick={() => handleResolve(alert.ID || alert.id)} // 🟢 สั่งบันทึกการช่วยเหลือลง DB
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
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
