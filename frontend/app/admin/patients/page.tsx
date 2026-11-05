"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authHeaders, getAuthToken } from "@/lib/auth";
import { nameInitial } from "@/lib/initials";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
// ชุดสีเดียวกับหน้า /patients
const avatarColors = ["#066fd1", "#0891b2", "#2f9e44", "#c2410c", "#7048e8"];

export default function AdminPatients() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [patients, setPatients] = useState<any[]>([]);

  const [availableCaregivers, setAvailableCaregivers] = useState<any[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [editPatient, setEditPatient] = useState<any>(null);

  // 1. เพิ่ม State สำหรับช่องค้นหาผู้ดูแล
  const [caregiverSearch, setCaregiverSearch] = useState("");

  const [editForm, setEditForm] = useState({
    name: "",
    age: 0,
    room_number: "",
    medical_condition: "",
    caregiver_ids: [] as number[],
  });

  useEffect(() => {
    const checkAdminAndFetchData = async () => {
      try {
        const email = localStorage.getItem("userEmail");
        // ผู้ใช้ที่ login ผ่าน Google ไม่มี token ใน localStorage → ใช้ helper ที่ fallback ไป cookie token_public
        const token = getAuthToken();

        if (!email) {
          router.push("/dashboard");
          return;
        }

        // 1. ยิง API เช็คสิทธิ์จาก Database ตรงๆ เพื่อความปลอดภัยสูงสุด
        const profileRes = await fetch(
          `${API_URL}/api/user/profile?email=${encodeURIComponent(email)}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token || ""}`,
            },
            credentials: "include",
          },
        );

        if (!profileRes.ok) {
          router.push("/dashboard");
          return;
        }

        const profileData = await profileRes.json();
        if (profileData.role?.toLowerCase() !== "admin") {
          router.push("/dashboard");
          return;
        }

        // 3. ถ้าเป็น Admin ตัวจริง ค่อยดึงข้อมูลผู้ป่วยและผู้ดูแล
        const fetchPatients = fetch(`${API_URL}/api/admin/patients`, {
          method: "GET",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token || ""}`,
          },
        }).then((res) => (res.ok ? res.json() : []));

        const fetchUsers = fetch(`${API_URL}/api/admin/users`, {
          method: "GET",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token || ""}`,
          },
        }).then((res) => (res.ok ? res.json() : []));

        const [patientsData, usersData] = await Promise.all([
          fetchPatients,
          fetchUsers,
        ]);

        setPatients(Array.isArray(patientsData) ? patientsData : []);

        if (Array.isArray(usersData)) {
          const caregiversOnly = usersData.filter(
            (u: any) => u.role === "caregiver" || u.role === "admin",
          );
          setAvailableCaregivers(caregiversOnly);
        }
      } catch (err) {
        console.error("ดึงข้อมูลล้มเหลว:", err);
        router.push("/dashboard");
      } finally {
        setIsLoading(false);
      }
    };

    checkAdminAndFetchData();
  }, [router]);

  const openEditPopup = (patient: any) => {
    setEditPatient(patient);
    // 2. เคลียร์ช่องค้นหาทุกครั้งที่เปิด Popup ใหม่
    setCaregiverSearch("");

    const existingCaregiverIds = patient.Caregivers
      ? patient.Caregivers.map((c: any) => c.ID || c.id)
      : [];

    setEditForm({
      name: patient.Name || "",
      age: patient.Age || 0,
      room_number: patient.RoomNumber || "",
      medical_condition: patient.MedicalCondition || "",
      caregiver_ids: existingCaregiverIds,
    });
  };

  const handleUpdatePatient = async () => {
    if (!editPatient) return;

    try {
      const res = await fetch(
        `${API_URL}/api/admin/patients/${editPatient.ID}`,
        {
          method: "PUT",
          credentials: "include",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            name: editForm.name,
            age: Number(editForm.age),
            room_number: editForm.room_number,
            medical_condition: editForm.medical_condition,
            caregiver_ids: editForm.caregiver_ids,
          }),
        },
      );

      if (res.ok) {
        const responseData = await res.json();
        setPatients(
          patients.map((p) =>
            p.ID === editPatient.ID ? responseData.patient : p,
          ),
        );
        setEditPatient(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(`อัปเดตไม่สำเร็จ: ${errData.error || res.statusText}`);
      }
    } catch (error) {
      console.error("Error:", error);
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/patients/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: authHeaders(),
      });
      if (res.ok) {
        setPatients(patients.filter((p: any) => p.ID !== id));
        setDeleteConfirm(null);
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleCaregiverToggle = (caregiverId: number) => {
    setEditForm((prev) => {
      const isSelected = prev.caregiver_ids.includes(caregiverId);
      if (isSelected) {
        return {
          ...prev,
          caregiver_ids: prev.caregiver_ids.filter((id) => id !== caregiverId),
        };
      } else {
        return { ...prev, caregiver_ids: [...prev.caregiver_ids, caregiverId] };
      }
    });
  };

  // 3. กรองรายชื่อผู้ดูแลตามข้อความที่ค้นหา (ค้นหาได้ทั้งชื่อและอีเมล)
  const filteredCaregivers = availableCaregivers.filter(
    (cg) =>
      (cg.name &&
        cg.name.toLowerCase().includes(caregiverSearch.toLowerCase())) ||
      (cg.email &&
        cg.email.toLowerCase().includes(caregiverSearch.toLowerCase())),
  );
  // ระหว่างตรวจสิทธิ์ + โหลดข้อมูล แสดงตัวหมุนแบบเดียวกับหน้า admin อื่นๆ
  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--tb-border)] border-t-[var(--tb-primary)] animate-spin" />
        <p className="text-sm text-[var(--tb-muted)]">กำลังโหลดข้อมูล...</p>
      </div>
    );
  }

  // คลาสที่ใช้ซ้ำในหน้านี้ — Tailwind + ตัวแปร --tb-* ตามแบบหน้า /patients
  const th = "px-5 py-3 text-xs font-semibold text-[var(--tb-muted)] text-left whitespace-nowrap";
  const td = "px-5 py-4 align-middle";
  const btnSecondary =
    "inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface)] text-sm font-semibold text-[var(--tb-text)] hover:bg-[var(--tb-surface-2)] transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]";
  const btnPrimary =
    "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-[var(--tb-radius)] bg-[var(--tb-primary)] text-sm font-semibold text-[var(--tb-primary-contrast)] shadow-[var(--tb-shadow-xs)] hover:bg-[var(--tb-primary-hover)] transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]";
  const labelClass = "block mb-1.5 text-sm font-medium text-[var(--tb-text)]";
  const inputClass =
    "w-full h-10 px-3 rounded-[var(--tb-radius)] border border-[var(--tb-border-strong)] bg-[var(--tb-surface)] text-sm text-[var(--tb-text)] placeholder:text-[var(--tb-placeholder)] shadow-[var(--tb-shadow-xs)] outline-none transition focus:border-[var(--tb-primary)] focus:ring-4 focus:ring-[var(--tb-primary-ring)]";
  const emptyCell = "text-xs italic text-[var(--tb-muted)]";

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      {/* ---------- หัวหน้า ---------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--tb-muted)]">ผู้ดูแลระบบ</p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--tb-text)]">จัดการข้อมูลผู้ป่วย</h1>
          <p className="mt-1 text-sm font-medium text-[var(--tb-muted)]">
            แอดมินสามารถแก้ไขประวัติผู้ป่วยและลบข้อมูลออกจากระบบได้
          </p>
        </div>
      </div>

      {/* ---------- ตาราง — จอมือถือแต่ละแถวกลายเป็นการ์ด (กฎ .neu-table ใน globals.css อ่านจาก data-label) ---------- */}
      <div className="rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-card)] overflow-hidden max-md:border-0 max-md:bg-transparent max-md:shadow-none">
        <div className="overflow-x-auto">
          <table className="neu-table w-full text-sm">
            <thead className="bg-[var(--tb-surface-2)] border-b border-[var(--tb-border)]">
              <tr>
                <th className={th}>ผู้ป่วย</th>
                <th className={th}>อายุ</th>
                <th className={th}>ห้องพัก</th>
                <th className={th}>โรคประจำตัว</th>
                <th className={th}>ผู้ดูแล</th>
                <th className={th}>Device ID</th>
                <th className={`${th} text-right`}>การดำเนินการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--tb-border)]">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-[var(--tb-muted)]">
                    กำลังโหลดข้อมูล...
                  </td>
                </tr>
              ) : patients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <p className="text-base font-semibold text-[var(--tb-text)]">ยังไม่มีข้อมูลผู้ป่วยในระบบ</p>
                  </td>
                </tr>
              ) : (
                patients.map((p: any, i) => (
                  <tr key={p.ID} className="hover:bg-[var(--tb-surface-2)] transition-colors">
                    <td data-label="ผู้ป่วย" className={td}>
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-white text-xs font-bold"
                          style={{ backgroundColor: avatarColors[i % avatarColors.length] }}
                        >
                          {nameInitial(p.Name)}
                        </span>
                        <span className="font-semibold text-[var(--tb-text)]">{p.Name}</span>
                      </div>
                    </td>
                    <td data-label="อายุ" className={`${td} whitespace-nowrap text-[var(--tb-text)]`}>
                      {p.Age} ปี
                    </td>
                    <td data-label="ห้องพัก" className={td}>
                      <span className="inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold bg-[var(--tb-primary-tint)] text-[var(--tb-primary-text)]">
                        {p.RoomNumber}
                      </span>
                    </td>
                    <td data-label="โรคประจำตัว" className={`${td} text-[var(--tb-muted)]`}>
                      {p.MedicalCondition}
                    </td>
                    <td data-label="ผู้ดูแล" className={`${td} text-[var(--tb-text)]`}>
                      {p.Caregivers && p.Caregivers.length > 0 ? (
                        p.Caregivers.map((c: any) => c.name || c.Name).join(", ")
                      ) : (
                        <span className={emptyCell}>ยังไม่มีผู้ดูแล</span>
                      )}
                    </td>
                    <td data-label="Device ID" className={`${td} font-mono text-xs text-[var(--tb-text)] break-all`}>
                      {p.DeviceAssignments && p.DeviceAssignments.length > 0 ? (
                        p.DeviceAssignments.map(
                          (d: any) =>
                            d.device?.mac_address || d.device_id || d.DeviceID,
                        ).join(", ")
                      ) : (
                        <span className={`${emptyCell} font-sans`}>ไม่มีอุปกรณ์</span>
                      )}
                    </td>
                    <td data-label="การดำเนินการ" className={td}>
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEditPopup(p)}
                          className={btnSecondary}
                          title="แก้ไข"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm(p.ID)}
                          className={`${btnSecondary} text-[var(--tb-danger-text)] hover:bg-[var(--tb-danger-tint)]`}
                          title="ลบ"
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

      {/* ---------- Popup แก้ไขข้อมูลผู้ป่วย ---------- */}
      {editPatient && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-edit-patient-title"
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-pop)]"
          >
            <div className="px-6 py-4 border-b border-[var(--tb-border)]">
              <h3 id="admin-edit-patient-title" className="text-lg font-bold text-[var(--tb-text)]">
                แก้ไขข้อมูลผู้ป่วย
              </h3>
            </div>

            <div className="flex flex-col gap-4 px-6 py-5">
              <div>
                <label htmlFor="admin-patient-name" className={labelClass}>
                  ชื่อ-นามสกุลผู้ป่วย
                </label>
                <input
                  id="admin-patient-name"
                  type="text"
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="admin-patient-age" className={labelClass}>
                    อายุ (ปี)
                  </label>
                  <input
                    id="admin-patient-age"
                    type="number"
                    min="0"
                    value={editForm.age}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        age: Number(e.target.value),
                      })
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="admin-patient-room" className={labelClass}>
                    ห้องพัก
                  </label>
                  <input
                    id="admin-patient-room"
                    type="text"
                    value={editForm.room_number}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        room_number: e.target.value,
                      })
                    }
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="admin-patient-condition" className={labelClass}>
                  โรคประจำตัว / อาการ
                </label>
                <input
                  id="admin-patient-condition"
                  type="text"
                  value={editForm.medical_condition}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      medical_condition: e.target.value,
                    })
                  }
                  className={inputClass}
                />
              </div>

              {/* ส่วนแสดงรายชื่อผู้ดูแล พร้อมช่องค้นหา */}
              <div>
                <label htmlFor="admin-caregiver-search" className={labelClass}>
                  ผู้ดูแล (เลือกได้มากกว่า 1 คน)
                </label>

                <div className="overflow-hidden flex flex-col rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface)]">
                  {/* ช่องพิมพ์ค้นหา */}
                  <div className="p-2 border-b border-[var(--tb-border)] bg-[var(--tb-surface-2)]">
                    <div className="relative">
                      <svg
                        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--tb-muted)]"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      <input
                        id="admin-caregiver-search"
                        type="text"
                        placeholder="ค้นหาชื่อ หรือ อีเมล..."
                        value={caregiverSearch}
                        onChange={(e) => setCaregiverSearch(e.target.value)}
                        className="w-full h-9 pl-8 pr-3 rounded-[var(--tb-radius)] border border-[var(--tb-border-strong)] bg-[var(--tb-surface)] text-sm text-[var(--tb-text)] placeholder:text-[var(--tb-placeholder)] outline-none transition focus:border-[var(--tb-primary)] focus:ring-4 focus:ring-[var(--tb-primary-ring)]"
                      />
                    </div>
                  </div>

                  {/* กล่องรายการ Checklist (ใช้ข้อมูลที่ Filter แล้ว) */}
                  <div className="max-h-40 overflow-y-auto p-1.5 flex flex-col gap-0.5">
                    {filteredCaregivers.length > 0 ? (
                      filteredCaregivers.map((cg) => {
                        const isChecked = editForm.caregiver_ids.includes(
                          cg.id || cg.ID,
                        );
                        return (
                          <label
                            key={cg.id || cg.ID}
                            className={`flex items-center gap-3 cursor-pointer px-2 py-1.5 rounded-[var(--tb-radius)] transition-colors ${
                              isChecked
                                ? "bg-[var(--tb-primary-tint)]"
                                : "hover:bg-[var(--tb-surface-2)]"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() =>
                                handleCaregiverToggle(cg.id || cg.ID)
                              }
                              className="w-4 h-4 shrink-0 cursor-pointer accent-[var(--tb-primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]"
                            />
                            <span className="flex min-w-0 flex-col">
                              <span className="text-sm font-medium text-[var(--tb-text)] truncate">
                                {cg.name}
                              </span>
                              <span className="text-xs text-[var(--tb-muted)] truncate">
                                {cg.email}
                              </span>
                            </span>
                          </label>
                        );
                      })
                    ) : (
                      <div className="p-3 text-center text-xs italic text-[var(--tb-muted)]">
                        ไม่พบผู้ดูแลที่คุณค้นหา
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-[var(--tb-border)] bg-[var(--tb-surface-2)] rounded-b-[var(--tb-radius-lg)]">
              <button
                type="button"
                onClick={() => setEditPatient(null)}
                className={`${btnSecondary} flex-1 h-10`}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleUpdatePatient}
                className={`${btnPrimary} flex-1`}
              >
                บันทึกข้อมูล
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Popup ยืนยันการลบ ---------- */}
      {deleteConfirm !== null && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-delete-patient-title"
            className="w-full max-w-sm rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-pop)] p-6 text-center"
          >
            <span className="inline-flex items-center justify-center w-12 h-12 mb-4 rounded-full bg-[var(--tb-danger-tint)] text-[var(--tb-danger-text)]">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              </svg>
            </span>
            <h3 id="admin-delete-patient-title" className="text-lg font-bold text-[var(--tb-text)] mb-1">
              ยืนยันการลบผู้ป่วย
            </h3>
            <p className="text-sm text-[var(--tb-muted)] mb-6">
              ข้อมูลผู้ป่วยและอุปกรณ์ที่เชื่อมโยงจะถูกลบออกจากระบบ
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className={`${btnSecondary} flex-1 h-10`}
              >
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
