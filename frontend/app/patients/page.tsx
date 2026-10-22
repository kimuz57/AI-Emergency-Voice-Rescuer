"use client";
/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
import { useState, useEffect } from "react";
import PatientFormModal from "@/components/PatientFormModal";
import { authHeaders } from "@/lib/auth";

// ปรับ Type ให้ตรงกับข้อมูลที่ใช้ใน Frontend
type Patient = {
  id: number;
  name: string;
  age: number;
  gender: string;
  room: string;
  condition: string;
  deviceId: string;
  deviceName: string;
  avatar: string;
};

const avatarColors = ["#066fd1", "#0891b2", "#2f9e44", "#c2410c", "#7048e8"];

// ตั้งค่า URL ของ Backend (ควรใช้ Environment Variable ในระบบจริง)
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true); // เพิ่ม State สำหรับโหลดข้อมูล
  const [editing, setEditing] = useState<Patient | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // 🟢 1. ฟังก์ชันดึงข้อมูลจาก Backend
  const fetchPatients = async () => {
    setIsLoading(true);
    try {
      // ดึง email ของ User ปัจจุบัน (ตัวอย่างใช้ localStorage, ปรับแก้ตามระบบ Auth ของคุณ)
      const userEmail = localStorage.getItem("userEmail");

      const res = await fetch(`${API_URL}/api/patients`, {
        method: "GET",
        headers: authHeaders({ "Content-Type": "application/json" }),
        credentials: "include", // ต้องมีบรรทัดนี้ เพื่อส่ง Cookie ให้ Backend
      });
      if (!res.ok) throw new Error("ไม่สามารถดึงข้อมูลได้");

      const data = await res.json();

      // แปลงข้อมูลจาก Backend (GORM) ให้อยู่ในรูปแบบที่ Frontend ต้องการ
      const mappedPatients: Patient[] = data.map((p: any) => {
        // ตัวย่อในวงกลม: ตัดคำนำหน้าชื่อออกก่อน ไม่งั้นทุกคนได้ "นา" จาก นาย/นาง
        const firstName = (p.Name || "").replace(/^(นางสาว|นาง|นาย|ด\.ช\.|ด\.ญ\.)\s*/, "");
        const initials = firstName ? firstName.substring(0, 1) : "ผ";
        // ดึง MAC Address จากอุปกรณ์ที่ผูกไว้ตัวแรก (ถ้ามี)
        // Backend ส่ง models.Patient ดิบมา ข้อมูลอุปกรณ์เลยอยู่ที่
        // DeviceAssignments[].device.mac_address ไม่ใช่ Devices[].board_id
        const assignment =
          p.DeviceAssignments && p.DeviceAssignments.length > 0
            ? p.DeviceAssignments[0]
            : null;

        return {
          id: p.ID,
          name: p.Name,
          age: p.Age,
          gender: p.Gender || "ไม่ระบุ",
          room: p.RoomNumber,
          condition: p.MedicalCondition,
          deviceId: assignment?.device?.mac_address || "—",
          deviceName: assignment?.device_name || "",
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

  // 🟢 2. ฟังก์ชันลบข้อมูลผู้ป่วย
  const handleDelete = async (id: number) => {
    try {
      // ต้องแนบ Token/Cookie เหมือน fetchPatients ไม่งั้น RequireAuth ตีกลับ 401
      const res = await fetch(`${API_URL}/api/patients/${id}`, {
        method: "DELETE",
        headers: authHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
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

  // คลาสที่ใช้ซ้ำในหน้านี้ — Tailwind + ตัวแปร --tb-* ตามแบบ dashboard
  const th = "px-5 py-3 text-xs font-semibold text-[var(--tb-muted)] text-left whitespace-nowrap";
  const td = "px-5 py-4 align-middle";
  const btnSecondary =
    "inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface)] text-sm font-semibold text-[var(--tb-text)] hover:bg-[var(--tb-surface-2)] transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]";
  const btnPrimary =
    "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-[var(--tb-radius)] bg-[var(--tb-primary)] text-sm font-semibold text-[var(--tb-primary-contrast)] shadow-[var(--tb-shadow-xs)] hover:bg-[var(--tb-primary-hover)] transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]";

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      {/* หัวหน้า */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--tb-muted)]">ผู้ป่วย</p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--tb-text)]">ข้อมูลผู้ป่วย</h1>
          <p className="mt-1 text-sm font-medium text-[var(--tb-muted)]">
            ผู้ป่วยภายใต้การดูแลทั้งหมด {patients.length} ราย
          </p>
        </div>
        <a href="/register-patient" className={btnPrimary}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          เพิ่มผู้ป่วยใหม่
        </a>
      </div>

      {/* ตาราง — จอมือถือแต่ละแถวกลายเป็นการ์ด (กฎ .neu-table ใน globals.css อ่านจาก data-label) */}
      <div className="rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-card)] overflow-hidden max-md:border-0 max-md:bg-transparent max-md:shadow-none">
        <div className="overflow-x-auto">
          <table className="neu-table w-full text-sm">
            <thead className="bg-[var(--tb-surface-2)] border-b border-[var(--tb-border)]">
              <tr>
                <th className={th}>ผู้ป่วย</th>
                <th className={th}>อายุ</th>
                <th className={th}>ห้องพัก</th>
                <th className={th}>โรคประจำตัว</th>
                <th className={th}>อุปกรณ์รับเสียง</th>
                <th className={`${th} text-right`}>จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--tb-border)]">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-[var(--tb-muted)]">
                    กำลังโหลดข้อมูล...
                  </td>
                </tr>
              ) : patients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <p className="text-base font-semibold text-[var(--tb-text)]">ยังไม่มีข้อมูลผู้ป่วย</p>
                    <p className="mt-1 text-sm text-[var(--tb-muted)]">
                      กด &quot;เพิ่มผู้ป่วยใหม่&quot; เพื่อลงทะเบียนผู้ป่วยและผูกอุปกรณ์รับเสียง
                    </p>
                  </td>
                </tr>
              ) : (
                patients.map((p, i) => (
                  <tr key={p.id} className="hover:bg-[var(--tb-surface-2)] transition-colors">
                    <td data-label="ผู้ป่วย" className={td}>
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-white text-xs font-bold"
                          style={{ backgroundColor: avatarColors[i % avatarColors.length] }}
                        >
                          {p.avatar}
                        </span>
                        <span className="font-semibold text-[var(--tb-text)]">{p.name}</span>
                      </div>
                    </td>
                    <td data-label="อายุ" className={`${td} whitespace-nowrap text-[var(--tb-text)]`}>{p.age} ปี</td>
                    <td data-label="ห้องพัก" className={td}>
                      <span className="inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold bg-[var(--tb-primary-tint)] text-[var(--tb-primary-text)]">
                        {p.room || "—"}
                      </span>
                    </td>
                    <td data-label="โรคประจำตัว" className={`${td} text-[var(--tb-muted)]`}>
                      {p.condition || "—"}
                    </td>
                    <td data-label="อุปกรณ์รับเสียง" className={td}>
                      <div className="flex flex-col items-end md:items-start">
                        <span className="font-mono text-xs text-[var(--tb-text)]">{p.deviceId}</span>
                        {p.deviceName && (
                          <span className="text-xs text-[var(--tb-muted)]">{p.deviceName}</span>
                        )}
                      </div>
                    </td>
                    <td data-label="จัดการ" className={td}>
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        <button type="button" onClick={() => setEditing(p)} className={btnSecondary}>
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm(p.id)}
                          className={`${btnSecondary} text-[var(--tb-danger-text)] hover:bg-[var(--tb-danger-tint)]`}
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                          </svg>
                          ลบ
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

      {/* Modal แก้ไขข้อมูลผู้ป่วย (Edit Patient Modal) */}
      {editing && (
        <PatientFormModal
          mode="edit"
          patient={editing}
          onClose={() => setEditing(null)}
          onSaved={fetchPatients}
        />
      )}

      {/* Modal ยืนยันการลบ (Delete Confirm Modal) */}
      {deleteConfirm !== null && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-patient-title"
            className="w-full max-w-sm rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-pop)] p-6 text-center"
          >
            <span className="inline-flex items-center justify-center w-12 h-12 mb-4 rounded-full bg-[var(--tb-danger-tint)] text-[var(--tb-danger-text)]">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              </svg>
            </span>
            <h3 id="delete-patient-title" className="text-lg font-bold text-[var(--tb-text)] mb-1">ยืนยันการลบ</h3>
            <p className="text-sm text-[var(--tb-muted)] mb-6">ข้อมูลผู้ป่วยและการผูกอุปกรณ์จะถูกลบออกจากระบบ</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setDeleteConfirm(null)} className={`${btnSecondary} flex-1 h-10`}>
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 inline-flex items-center justify-center h-10 px-4 rounded-[var(--tb-radius)] bg-[var(--tb-danger)] text-sm font-semibold text-white hover:brightness-110 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-danger)]/30"
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
