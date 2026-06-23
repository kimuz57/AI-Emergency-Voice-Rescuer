"use client";

import { useState, useEffect } from "react";
// import UnderConstruction from '../../components/UnderConstruction';

// ปรับ Type ให้ตรงกับข้อมูลที่ใช้ใน Frontend
type Patient = {
  id: number;
  name: string;
  age: number;
  room: string;
  condition: string;
  deviceId: string;
  avatar: string;
};

const avatarColors = ["#4f46e5", "#0891b2", "#059669", "#d97706", "#dc2626"];

// ตั้งค่า URL ของ Backend (ควรใช้ Environment Variable ในระบบจริง)
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true); // เพิ่ม State สำหรับโหลดข้อมูล
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    name: "",
    age: "",
    room: "",
    condition: "",
    deviceId: "",
    gender: "ไม่ระบุ", // เพิ่มมาเผื่อ API Backend
  });
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // 🟢 1. ฟังก์ชันดึงข้อมูลจาก Backend
  const fetchPatients = async () => {
    setIsLoading(true);
    try {
      // ดึง email ของ User ปัจจุบัน (ตัวอย่างใช้ localStorage, ปรับแก้ตามระบบ Auth ของคุณ)
      const userEmail = localStorage.getItem("userEmail");

      const res = await fetch(`${API_URL}/api/patients?email=${userEmail}`);
      if (!res.ok) throw new Error("ไม่สามารถดึงข้อมูลได้");

      const data = await res.json();

      // แปลงข้อมูลจาก Backend (GORM) ให้อยู่ในรูปแบบที่ Frontend ต้องการ
      const mappedPatients: Patient[] = data.map((p: any) => {
        // สร้างตัวย่อชื่อ 2 ตัวอักษร
        const initials = p.Name ? p.Name.substring(0, 2) : "ผป";
        // ดึง MAC Address จาก Device ตัวแรก (ถ้ามี) หมายเหตุ: Backend คุณตั้ง json:"board_id" ไว้
        const deviceMac =
          p.Devices && p.Devices.length > 0 ? p.Devices[0].board_id : "—";

        return {
          id: p.ID,
          name: p.Name,
          age: p.Age,
          room: p.RoomNumber,
          condition: p.MedicalCondition,
          deviceId: deviceMac,
          avatar: initials,
        };
      });

      setPatients(mappedPatients);
    } catch (error) {
      console.error("Fetch Error:", error);
      alert("เกิดข้อผิดพลาดในการโหลดข้อมูลผู้ป่วย");
    } finally {
      setIsLoading(false);
    }
  };

  // ดึงข้อมูลเมื่อเปิดหน้าเว็บครั้งแรก
  useEffect(() => {
    fetchPatients();
  }, []);

  // 🟢 2. ฟังก์ชันเพิ่มข้อมูลผู้ป่วยใหม่
  // const handleAdd = async () => {
  //   if (!form.name || !form.age || !form.room) {
  //     alert("กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน");
  //     return;
  //   }

  //   try {
  //     const userEmail =
  //       localStorage.getItem("user_email") || "admin@example.com";

  //     // เตรียม Payload ให้ตรงกับ Struct RegisterInput ใน Go
  //     const payload = {
  //       patientName: form.name,
  //       age: parseInt(form.age),
  //       gender: form.gender,
  //       roomNumber: form.room,
  //       medicalCondition: form.condition,
  //       caregiverEmail: userEmail,
  //       board_id: form.deviceId,
  //       deviceName: "ไมค์หัวเตียง", // ตั้งค่าเริ่มต้นตาม Backend
  //     };

  //     const res = await fetch(`${API_URL}/api/patients/register`, {
  //       method: "POST",
  //       headers: { "Content-Type": "application/json" },
  //       body: JSON.stringify(payload),
  //     });

  //     const data = await res.json();

  //     if (res.ok) {
  //       alert("เพิ่มข้อมูลผู้ป่วยเรียบร้อยแล้ว");
  //       setForm({
  //         name: "",
  //         age: "",
  //         room: "",
  //         condition: "",
  //         deviceId: "",
  //         gender: "ไม่ระบุ",
  //       });
  //       setShowModal(false);
  //       fetchPatients(); // โหลดข้อมูลตารางใหม่
  //     } else {
  //       alert(data.error || "เกิดข้อผิดพลาดในการบันทึก");
  //     }
  //   } catch (error) {
  //     console.error("Add Error:", error);
  //     alert("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
  //   }
  // };

  // 🟢 3. ฟังก์ชันลบข้อมูลผู้ป่วย
  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/api/patients/${id}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (res.ok) {
        alert("ลบข้อมูลสำเร็จ");
        setDeleteConfirm(null);
        fetchPatients(); // โหลดข้อมูลตารางใหม่เพื่อให้รายการหายไป
      } else {
        alert(data.error || "เกิดข้อผิดพลาดในการลบ");
      }
    } catch (error) {
      console.error("Delete Error:", error);
      alert("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
    }
  };

  return (
    <div className="dark:bg-slate space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 dark:bg-slate-800 rounded-2xl bg-slate-100 p-3 shadow-sm border border-slate-200">
        <div className="dark:bg-slate-800 bg-slate-100 p-4 rounded-2xl shadow-sm border border-slate-200">
          <h1 className="dark:text-white text-2xl font-bold text-slate-800">
            จัดการข้อมูลผู้ป่วย
          </h1>
          <p className="dark:text-slate-300 text-slate-500 text-sm mt-1">
            ทะเบียนผู้ป่วยภายใต้การดูแลทั้งหมด {patients.length} ราย
          </p>
        </div>
        <a
          href="/devices"
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          เพิ่มผู้ป่วยใหม่
        </a>
      </div>

      {/* Table */}
      <div className="dark:bg-slate-800 dark:text-white bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="dark:bg-slate-800 dark:text-white bg-slate-50 border-b border-slate-200">
                <th className="dark:text-white text-left px-6 py-4 text-slate-500 font-semibold uppercase tracking-wide text-xs">
                  ผู้ป่วย
                </th>
                <th className="dark:text-white text-left px-6 py-4 text-slate-500 font-semibold uppercase tracking-wide text-xs">
                  อายุ
                </th>
                <th className="dark:text-white text-left px-6 py-4 text-slate-500 font-semibold uppercase tracking-wide text-xs">
                  ห้องพัก
                </th>
                <th className="dark:text-white text-left px-6 py-4 text-slate-500 font-semibold uppercase tracking-wide text-xs">
                  โรคประจำตัว
                </th>
                <th className="dark:text-white text-left px-6 py-4 text-slate-500 font-semibold uppercase tracking-wide text-xs">
                  Device ID
                </th>
                <th className="dark:text-white text-right px-6 py-4 text-slate-500 font-semibold uppercase tracking-wide text-xs">
                  การดำเนินการ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center text-slate-500"
                  >
                    กำลังโหลดข้อมูล...
                  </td>
                </tr>
              ) : patients.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center text-slate-500"
                  >
                    ยังไม่มีข้อมูลผู้ป่วยในระบบ
                  </td>
                </tr>
              ) : (
                patients.map((p, i) => (
                  <tr
                    key={p.id}
                    className="dark:bg-slate-800 dark:text-white hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{
                            backgroundColor:
                              avatarColors[i % avatarColors.length],
                          }}
                        >
                          {p.avatar}
                        </div>
                        <span className="font-medium text-slate-800">
                          {p.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{p.age} ปี</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                        {p.room}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{p.condition}</td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-500">
                      {p.deviceId}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {/* ปุ่ม Edit ถูกซ่อนไว้เป็น Placeholder ตามโค้ดเดิม */}
                        <button
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="แก้ไข"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="15"
                            height="15"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(p.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="ลบ"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="15"
                            height="15"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal เพิ่มข้อมูลผู้ป่วย (Add Patient Modal) */}
      {/* {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="dark:bg-slate-800 bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="dark:text-white flex items-center justify-between mb-5">
              <h2 className="dark:text-white text-lg font-bold text-slate-800">
                เพิ่มผู้ป่วยใหม่
              </h2>
              <button
                href="/devices"
                className="dark:text-white text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="dark:text-white space-y-4">
              {[
                {
                  label: "ชื่อ-นามสกุล",
                  key: "name",
                  placeholder: "นาย/นาง/นางสาว ชื่อ นามสกุล",
                  type: "text",
                },
                {
                  label: "อายุ",
                  key: "age",
                  placeholder: "เช่น 72",
                  type: "number",
                },
                {
                  label: "หมายเลขห้อง/เตียง",
                  key: "room",
                  placeholder: "เช่น A-101",
                  type: "text",
                },
                {
                  label: "โรคประจำตัว",
                  key: "condition",
                  placeholder: "เช่น ความดันโลหิตสูง",
                  type: "text",
                },
                {
                  label: "Device ID (MAC Address)",
                  key: "deviceId",
                  placeholder: "เช่น AA:BB:CC:DD:EE:FF",
                  type: "text",
                },
              ].map(({ label, key, placeholder, type }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {label}
                  </label>
                  <input
                    type={type}
                    placeholder={placeholder}
                    value={(form as any)[key]}
                    onChange={(e) =>
                      setForm({ ...form, [key]: e.target.value })
                    }
                    className="dark:bg-slate-700 dark:border-slate-600 dark:text-white w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleAdd}
                className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )} */}

      {/* Modal ยืนยันการลบ (Delete Confirm Modal) */}
      {deleteConfirm !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="dark:bg-slate-800 bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#dc2626"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              </svg>
            </div>
            <h3 className="dark:text-white text-base font-bold text-slate-800 mb-1">
              ยืนยันการลบ
            </h3>
            <p className="dark:text-slate-400 text-sm text-slate-500 mb-5">
              ข้อมูลผู้ป่วยและอุปกรณ์จะถูกลบออกจากระบบ
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                ยืนยันลบ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
