"use client";

import { useState } from "react";
import CustomAudioPlayer from "@/components/CustomAudioPlayer"; // ปรับ Path ให้ตรง

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
export default function DeviceRegistrationPage() {
  const [formData, setFormData] = useState({
    patientName: "",
    age: "",
    gender: "ชาย",
    roomNumber: "",
    medicalCondition: "",
    caregiverEmail: "",
    boardId: "",
    deviceName: "ไมค์หัวเตียง",
  });

  // 🟢 เพิ่ม State สำหรับเก็บ Error ของอีเมลผู้ดูแลโดยเฉพาะ
  const [caregiverError, setCaregiverError] = useState("");

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    // เวลาผู้ใช้พิมพ์แก้คำใหม่ ให้ล้างตัวหนังสือสีแดงแจ้งเตือนทิ้งไปก่อน
    if (e.target.name === "caregiverEmail") {
      setCaregiverError("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCaregiverError(""); // ล้าง Error เก่าก่อนยิงซ้ำ

    try {
      // ในไฟล์ app/dashboard/devices/page.tsx ตรง handleSubmit
      const res = await fetch(`${API_BASE_URL}/api/patients/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName: formData.patientName,
          age: parseInt(formData.age) || 0,
          gender: formData.gender,
          roomNumber: formData.roomNumber,
          medicalCondition: formData.medicalCondition,
          caregiverEmail: formData.caregiverEmail,
          board_id: formData.boardId, // 🟢 มั่นใจว่าตรงนี้ส่งเป็น board_id (ตัวพิมพ์เล็ก มี _ ) เพื่อให้ตรงกับฝั่ง Go
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
          caregiverEmail: "",
          boardId: "",
          deviceName: "ไมค์หัวเตียง",
        });
      } else {
        // 🟢 ถ้าหลังบ้านบอกว่าพังที่ฟิลด์ caregiverEmail ให้เอาคำเตือนไปใส่ใน State
        if (data.field === "caregiverEmail") {
          setCaregiverError(data.error);
        } else {
          alert("❌ เกิดข้อผิดพลาด: " + data.error);
        }
      }
    } catch (error) {
      alert("❌ ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ Backend ได้");
    }
  };

  return (
    <div className="dark:bg-slate-800 relative min-h-screen bg-slate-50 flex items-center justify-center p-4 md:p-8 font-sans overflow-hidden">
      {/* 🌟 Background Glowing Orbs (ลูกแก้วแสงวิ้งๆ) */}
      <div className="absolute top-[-5%] left-[-10%] w-[500px] h-[500px] bg-blue-400 rounded-full mix-blend-multiply filter blur-[120px] opacity-40 animate-pulse pointer-events-none"></div>

      <div
        className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] bg-purple-400 rounded-full mix-blend-multiply filter blur-[100px] opacity-40 animate-pulse pointer-events-none"
        style={{ animationDelay: "2s" }}
      ></div>

      <div
        className="absolute top-[40%] left-[20%] w-[300px] h-[300px] bg-emerald-300 rounded-full mix-blend-multiply filter blur-[100px] opacity-20 animate-pulse pointer-events-none"
        style={{ animationDelay: "4s" }}
      ></div>

      {/* 📦 Main Container */}
      <div className="dark:bg-slate-800 relative z-10 w-full max-w-4xl bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 md:p-10 border border-white/60">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="dark:bg-slate-800 inline-flex items-center justify-center w-16 h-16 rounded-2xl dark:bg-none bg-gradient-to-br from-blue-100 to-purple-100 mb-4 shadow-sm">
            <span className="text-3xl">📝</span>
          </div>
          <h1 className="text-3xl p-4 md:text-4xl font-extrabold bg-gradient-to-r from-blue-700 to-purple-600 bg-clip-text text-transparent">
            ลงทะเบียนผู้ป่วยใหม่
          </h1>
          <p className="text-slate-500 mt-2 dark:text-slate-300">
            เพิ่มข้อมูลผู้ป่วยและผูกอุปกรณ์ EVR Sensor สำหรับการเฝ้าระวัง
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* ========================================== */}
          {/* 👤 ส่วนที่ 1: ข้อมูลผู้ป่วย */}
          {/* ========================================== */}
          <div className="dark:bg-slate-800 bg-white/60 backdrop-blur-md p-6 md:p-8 rounded-2xl shadow-sm border border-white flex flex-col gap-5 relative overflow-hidden group hover:shadow-md transition-shadow">
            {/* แถบสีตกแต่งด้านซ้าย */}
            <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-blue-400 to-purple-500"></div>

            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2 dark:text-slate-200">
              <span className="text-purple-500 dark:text-white">👤</span> ข้อมูลผู้ป่วย
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* ชื่อ-นามสกุล */}
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
                  placeholder=""
                  className="dark:bg-slate-800 dark:text-white w-full px-4 py-3 rounded-xl bg-slate-50/50 border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all text-sm text-slate-700"
                />
              </div>

              {/* อายุ & เพศ */}
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
                    placeholder=""
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

              {/* หมายเลขห้อง */}
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

              {/* โรคประจำตัว */}
              <div>
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

              {/* อีเมลผู้ดูแล */}
              <div className="dark:bg-slate-800 md:col-span-2 bg-purple-50/50 p-4 rounded-xl border border-purple-100">
                <label className="dark:text-purple-500 block text-xs font-bold text-purple-800 mb-1 ml-1 uppercase tracking-wide">
                  อีเมลผู้ดูแล (Caregiver Email){" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  name="caregiverEmail"
                  value={formData.caregiverEmail}
                  onChange={handleChange}
                  placeholder="เช่น doctor@hospital.com"
                  className={`dark:bg-slate-800 dark:text-white w-full px-4 py-3 rounded-xl bg-white border outline-none transition-all text-sm text-slate-700
                    ${
                      caregiverError
                        ? "border-red-400 focus:ring-2 focus:ring-red-200 text-red-600"
                        : "border-purple-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                    }`}
                />
                {caregiverError && (
                  <p className="text-red-500 text-xs font-bold mt-2 ml-1 flex items-center gap-1 animate-pulse">
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
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                    {caregiverError}
                  </p>
                )}
                <p className="dark:text-purple-600 text-xs text-purple-600/70 mt-2 ml-1">
                  ระบบจะส่งการแจ้งเตือนฉุกเฉินไปยังผู้ดูแลที่ระบุไว้
                </p>
              </div>
            </div>
          </div>

          {/* ========================================== */}
          {/* 📡 ส่วนที่ 2: ข้อมูลอุปกรณ์ ESP32 */}
          {/* ========================================== */}
          <div className="dark:bg-slate-800 bg-white/60 backdrop-blur-md p-6 md:p-8 rounded-2xl shadow-sm border border-white flex flex-col gap-5 relative overflow-hidden group hover:shadow-md transition-shadow">
            {/* แถบสีตกแต่งด้านซ้าย */}
            <div className=" absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-emerald-400 to-teal-500"></div>

            <h2 className="dark:text-white text-xl font-bold text-slate-800 flex items-center gap-2">
              <span className="text-emerald-500 ">📡</span> ผูกอุปกรณ์EVR Sensor
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Board ID */}
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

              {/* จุดติดตั้งอุปกรณ์ */}
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
                  placeholder=""
                  className="dark:bg-slate-800 dark:text-white w-full px-4 py-3 rounded-xl bg-slate-50/50 border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all text-sm text-slate-700"
                />
              </div>
            </div>
          </div>

          {/* ========================================== */}
          {/* 🎯 ปุ่ม Submit */}
          {/* ========================================== */}
          <div className="flex justify-end pt-4">
            <button
              type="submit"
              className="w-full md:w-auto flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl font-bold text-lg hover:shadow-xl hover:shadow-purple-500/30 transition-all hover:-translate-y-1 active:translate-y-0"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                ></path>
              </svg>
              บันทึกข้อมูลเข้าระบบ
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
