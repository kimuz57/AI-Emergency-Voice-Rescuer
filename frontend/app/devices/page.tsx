"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import CustomAudioPlayer from "@/components/CustomAudioPlayer"; 

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function RegistrationFormContent() {
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState({
    patientName: "",
    age: "",
    gender: "ชาย",
    roomNumber: "",
    medicalCondition: "",
    boardId: "",
    deviceName: "ไมค์หัวเตียง",
  });

  useEffect(() => {
    const mac = searchParams.get("mac");
    if (mac) {
      setFormData((prev) => ({ ...prev, boardId: mac }));
    }
  }, [searchParams]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const res = await fetch(`${API_BASE_URL}/api/patients/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // 🌟 ส่ง Cookie/Session ไปด้วยเพื่อให้ Backend รู้ว่า Account ไหนเป็นคนทำรายการ
        body: JSON.stringify({
          patientName: formData.patientName,
          age: parseInt(formData.age) || 0,
          gender: formData.gender,
          roomNumber: formData.roomNumber,
          medicalCondition: formData.medicalCondition,
          // 💡 ไม่ต้องส่ง caregiverEmail จากฟอร์มแล้ว ให้ Backend ดึงจาก Session ของผู้ใช้ที่ล็อกอินอยู่
          board_id: formData.boardId, 
          deviceName: formData.deviceName,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        alert("🎉 " + data.message);
        setFormData({
          patientName: "",
          age: "",
          gender: "ชาย",
          roomNumber: "",
          medicalCondition: "",
          boardId: "",
          deviceName: "ไมค์หัวเตียง",
        });
      } else {
        alert("❌ เกิดข้อผิดพลาด: " + data.error);
      }
    } catch (error) {
      alert("❌ ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ Backend ได้");
    }
  };

  return (
    <div className="dark:bg-slate-800 relative min-h-screen bg-slate-50 flex items-center justify-center p-4 md:p-8 font-sans overflow-hidden">
      {/* Background Glowing Orbs */}
      <div className="absolute top-[-5%] left-[-10%] w-[500px] h-[500px] bg-blue-400 rounded-full mix-blend-multiply filter blur-[120px] opacity-40 animate-pulse pointer-events-none"></div>
      <div
        className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] bg-purple-400 rounded-full mix-blend-multiply filter blur-[100px] opacity-40 animate-pulse pointer-events-none"
        style={{ animationDelay: "2s" }}
      ></div>
      <div
        className="absolute top-[40%] left-[20%] w-[300px] h-[300px] bg-emerald-300 rounded-full mix-blend-multiply filter blur-[100px] opacity-20 animate-pulse pointer-events-none"
        style={{ animationDelay: "4s" }}
      ></div>

      {/* Main Container */}
      <div className="dark:bg-slate-800 relative z-10 w-full max-w-4xl bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 md:p-10 border border-white/60">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="dark:bg-slate-800 inline-flex items-center justify-center w-16 h-16 rounded-2xl dark:bg-none bg-gradient-to-br from-blue-100 to-purple-100 mb-4 shadow-sm">
            <span className="text-3xl">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-8 h-8"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <path d="M12 11h4" />
                <path d="M12 16h4" />
                <circle cx="8" cy="11" r="1" fill="currentColor" stroke="none" />
                <circle cx="8" cy="16" r="1" fill="currentColor" stroke="none" />
              </svg>
            </span>
          </div>
          <h1 className="text-3xl p-4 md:text-4xl font-extrabold bg-gradient-to-r from-blue-700 to-purple-600 bg-clip-text text-transparent">
            ลงทะเบียนผู้ป่วยใหม่
          </h1>
          <p className="text-slate-500 mt-2 dark:text-slate-300">
            เพิ่มข้อมูลผู้ป่วยและผูกอุปกรณ์ EVR Sensor สำหรับการเฝ้าระวัง
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* ส่วนที่ 1: ข้อมูลผู้ป่วย */}
          <div className="dark:bg-slate-800 bg-white/60 backdrop-blur-md p-6 md:p-8 rounded-2xl shadow-sm border border-white flex flex-col gap-5 relative overflow-hidden group hover:shadow-md transition-shadow">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-blue-400 to-purple-500"></div>

            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2 dark:text-slate-200">
              <span className="text-purple-500 dark:text-white">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </span>{" "}
              ข้อมูลผู้ป่วย
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="dark:text-slate-300 block text-xs font-bold text-slate-600 mb-1 ml-1 uppercase tracking-wide">
                  ชื่อ-นามสกุล
                </label>
                <input
                  type="text"
                  name="patientName"
                  value={formData.patientName}
                  onChange={handleChange}
                  required
                  className="dark:bg-slate-800 dark:text-white w-full px-4 py-3 rounded-xl bg-slate-50/50 border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all text-sm text-slate-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="dark:text-slate-300 block text-xs font-bold text-slate-600 mb-1 ml-1 uppercase tracking-wide">
                    อายุ (ปี)
                  </label>
                  <input
                    type="number"
                    name="age"
                    value={formData.age}
                    onChange={handleChange}
                    className="dark:bg-slate-800 dark:text-white w-full px-4 py-3 rounded-xl bg-slate-50/50 border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all text-sm text-slate-700"
                  />
                </div>
                <div>
                  <label className="dark:text-slate-300 block text-xs font-bold text-slate-600 mb-1 ml-1 uppercase tracking-wide">
                    เพศ
                  </label>
                  <select
                    name="gender"
                    value={formData.gender}
                    onChange={handleChange}
                    className="dark:bg-slate-800 dark:text-white w-full px-4 py-3 rounded-xl bg-slate-50/50 border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all text-sm text-slate-700 appearance-none"
                  >
                    <option value="ชาย">ชาย</option>
                    <option value="หญิง">หญิง</option>
                    <option value="อื่นๆ">อื่นๆ</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="dark:text-slate-300 block text-xs font-bold text-slate-600 mb-1 ml-1 uppercase tracking-wide">
                  หมายเลขห้อง
                </label>
                <input
                  type="text"
                  name="roomNumber"
                  value={formData.roomNumber}
                  onChange={handleChange}
                  required
                  placeholder="เช่น 101A"
                  className="dark:bg-slate-800 dark:text-white w-full px-4 py-3 rounded-xl bg-slate-50/50 border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all text-sm text-slate-700"
                />
              </div>

              <div className="md:col-span-2">
                <label className="dark:text-slate-300 block text-xs font-bold text-slate-600 mb-1 ml-1 uppercase tracking-wide">
                  โรคประจำตัว (ถ้ามี)
                </label>
                <input
                  type="text"
                  name="medicalCondition"
                  value={formData.medicalCondition}
                  onChange={handleChange}
                  placeholder="เช่น ความดัน, เบาหวาน"
                  className="dark:bg-slate-800 dark:text-white w-full px-4 py-3 rounded-xl bg-slate-50/50 border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all text-sm text-slate-700"
                />
              </div>
            </div>
          </div>

          {/* ส่วนที่ 2: ข้อมูลอุปกรณ์ ESP32 */}
          <div className="dark:bg-slate-800 bg-white/60 backdrop-blur-md p-6 md:p-8 rounded-2xl shadow-sm border border-white flex flex-col gap-5 relative overflow-hidden group hover:shadow-md transition-shadow">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-emerald-400 to-teal-500"></div>

            <h2 className="dark:text-white text-xl font-bold text-slate-800 flex items-center gap-2">
              <span className="text-emerald-500">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="2" />
                  <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
                </svg>
              </span>{" "}
              ผูกอุปกรณ์ EVR Sensor
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="dark:text-slate-300 block text-xs font-bold text-slate-600 mb-1 ml-1 uppercase tracking-wide">
                  รหัสบอร์ด (MAC Address)
                </label>
                <input
                  type="text"
                  name="boardId"
                  value={formData.boardId}
                  onChange={handleChange}
                  required
                  placeholder="เช่น AA:BB:CC:DD:EE:FF"
                  className="dark:bg-slate-800 dark:text-white w-full px-4 py-3 rounded-xl bg-slate-50/50 border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all text-sm text-slate-700 uppercase font-mono"
                />
              </div>

              <div>
                <label className="dark:text-slate-300 block text-xs font-bold text-slate-600 mb-1 ml-1 uppercase tracking-wide">
                  จุดติดตั้งอุปกรณ์
                </label>
                <input
                  type="text"
                  name="deviceName"
                  value={formData.deviceName}
                  onChange={handleChange}
                  required
                  className="dark:bg-slate-800 dark:text-white w-full px-4 py-3 rounded-xl bg-slate-50/50 border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all text-sm text-slate-700"
                />
              </div>
            </div>
          </div>

          {/* ปุ่ม Submit */}
          <div className="flex justify-end pt-4">
            <button
              type="submit"
              className="w-full md:w-auto flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl font-bold text-lg hover:shadow-xl hover:shadow-purple-500/30 transition-all hover:-translate-y-1 active:translate-y-0"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path>
              </svg>
              บันทึกข้อมูลเข้าระบบ
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function DeviceRegistrationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-800 text-slate-500">
          กำลังโหลดข้อมูล...
        </div>
      }
    >
      <RegistrationFormContent />
    </Suspense>
  );
}