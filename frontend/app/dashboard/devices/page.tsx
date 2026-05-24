"use client";

import { useState } from "react";

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
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">
        ลงทะเบียนผู้ป่วยและผูกอุปกรณ์ (ESP32)
      </h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ส่วนที่ 1: ข้อมูลผู้ป่วย */}
        <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
          <h2 className="text-xl font-semibold mb-4 text-blue-600 border-b pb-2">
            👤 ข้อมูลผู้ป่วย
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ชื่อ-นามสกุล
              </label>
              <input
                type="text"
                name="patientName"
                value={formData.patientName}
                onChange={handleChange}
                required
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  อายุ (ปี)
                </label>
                <input
                  type="number"
                  name="age"
                  value={formData.age}
                  onChange={handleChange}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  เพศ
                </label>
                <select
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                >
                  <option value="ชาย">ชาย</option>
                  <option value="หญิง">หญิง</option>
                  <option value="อื่นๆ">อื่นๆ</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                หมายเลขห้อง
              </label>
              <input
                type="text"
                name="roomNumber"
                value={formData.roomNumber}
                onChange={handleChange}
                required
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                โรคประจำตัว (ถ้ามี)
              </label>
              <input
                type="text"
                name="medicalCondition"
                value={formData.medicalCondition}
                onChange={handleChange}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                อีเมลผู้ดูแล (Caregiver Email)
              </label>
              <input
                type="email"
                name="caregiverEmail"
                value={formData.caregiverEmail}
                onChange={handleChange}
                placeholder="เช่น doctor@hospital.com"
                // 🟢 ถ้ามี Error ให้ขอบกล่องเปลี่ยนเป็นสีแดงเพื่อความเด่นชัด
                className={`w-full p-2 border rounded-lg focus:ring-2 outline-none ${caregiverError ? "border-red-500 focus:ring-red-500" : "focus:ring-blue-500"}`}
              />
              {/* 🟢 แสดงตัวหนังสือสีแดงเล็กๆ ข้างล่างอินพุตเมื่อหาอีเมลไม่เจอ */}
              {caregiverError && (
                <p className="text-red-500 text-xs font-medium mt-1 animate-pulse">
                  ⚠️ {caregiverError}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ส่วนที่ 2: ข้อมูลอุปกรณ์ ESP32 */}
        <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
          <h2 className="text-xl font-semibold mb-4 text-green-600 border-b pb-2">
            📡 ข้อมูลอุปกรณ์รับเสียง (Board ID)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                รหัสบอร์ด (MAC Address)
              </label>
              <input
                type="text"
                name="boardId"
                value={formData.boardId}
                onChange={handleChange}
                required
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                จุดติดตั้งอุปกรณ์
              </label>
              <select
                name="deviceName"
                value={formData.deviceName}
                onChange={handleChange}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white"
              >
                <option value="ไมค์หัวเตียง">ไมค์หัวเตียง</option>
                <option value="ไมค์ห้องน้ำ">ไมค์ห้องน้ำ</option>
                <option value="อุปกรณ์ติดตัว">อุปกรณ์ติดตัว (พกพา)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg shadow-lg"
          >
            💾 บันทึกข้อมูลเข้าระบบ
          </button>
        </div>
      </form>
    </div>
  );
}
