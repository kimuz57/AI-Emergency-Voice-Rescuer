"use client";

import React, { useState } from "react";

export default function AddPatientPage() {
  const [formData, setFormData] = useState({
    name: "",
    age: "",
    gender: "ชาย",
    roomNumber: "",
    medicalCondition: "",
  });
  const [message, setMessage] = useState("");

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");

    try {
      // แปลงอายุจาก String เป็น Number ก่อนส่ง
      const payload = { ...formData, age: Number(formData.age) };

      const response = await fetch("http://localhost:8080/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage("✅ " + data.message);
        // เคลียร์ฟอร์ม
        setFormData({
          name: "",
          age: "",
          gender: "ชาย",
          roomNumber: "",
          medicalCondition: "",
        });
      } else {
        setMessage("❌ " + data.error);
      }
    } catch (error) {
      console.error("Error:", error);
      setMessage("❌ เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-10 flex justify-center items-start">
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 w-full max-w-lg">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">
          เพิ่มข้อมูลผู้ป่วยใหม่
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              ชื่อ-นามสกุล
            </label>
            <input
              type="text"
              name="name"
              required
              value={formData.name}
              onChange={handleChange}
              className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="เช่น สมชาย ใจดี"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                อายุ (ปี)
              </label>
              <input
                type="number"
                name="age"
                required
                value={formData.age}
                onChange={handleChange}
                className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                min="1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                เพศ
              </label>
              <select
                name="gender"
                value={formData.gender}
                onChange={handleChange}
                className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ชาย">ชาย</option>
                <option value="หญิง">หญิง</option>
                <option value="อื่นๆ">อื่นๆ</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              หมายเลขห้อง / เตียง
            </label>
            <input
              type="text"
              name="roomNumber"
              value={formData.roomNumber}
              onChange={handleChange}
              className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="เช่น 401A"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              โรคประจำตัว / ข้อมูลการแพทย์
            </label>
            <textarea
              name="medicalCondition"
              value={formData.medicalCondition}
              onChange={handleChange}
              className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="เช่น โรคหัวใจ, ความดันโลหิตสูง"
            ></textarea>
          </div>

          {message && (
            <div
              className={`p-3 rounded-lg text-sm ${message.includes("✅") ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
            >
              {message}
            </div>
          )}

          <button
            type="submit"
            className="mt-4 bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors"
          >
            บันทึกข้อมูลผู้ป่วย
          </button>
        </form>
      </div>
    </div>
  );
}
