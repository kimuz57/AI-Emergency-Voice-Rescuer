"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const avatarColors = ["#EF4444", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"];

export default function AdminPatients() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [patients, setPatients] = useState<any[]>([]);
  
  const [availableCaregivers, setAvailableCaregivers] = useState<any[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [editPatient, setEditPatient] = useState<any>(null);

  // 🟢 1. เพิ่ม State สำหรับช่องค้นหาผู้ดูแล
  const [caregiverSearch, setCaregiverSearch] = useState("");

  const [editForm, setEditForm] = useState({
    name: "",
    age: 0,
    room_number: "",
    medical_condition: "",
    caregiver_ids: [] as number[],
  });

  useEffect(() => {
    const role = localStorage.getItem("userRole");
    if (!role || role.toLowerCase() !== "admin") {
      router.push("/dashboard");
      return;
    }

    const fetchPatients = fetch(`${API_URL}/api/admin/patients`, {
      method: "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    }).then(res => res.ok ? res.json() : []);

    const fetchUsers = fetch(`${API_URL}/api/admin/users`, {
      method: "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    }).then(res => res.ok ? res.json() : []);

    Promise.all([fetchPatients, fetchUsers])
      .then(([patientsData, usersData]) => {
        setPatients(Array.isArray(patientsData) ? patientsData : []);
        if (Array.isArray(usersData)) {
          const caregiversOnly = usersData.filter((u: any) => u.role === "caregiver" || u.role === "admin");
          setAvailableCaregivers(caregiversOnly);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("❌ ดึงข้อมูลล้มเหลว:", err);
        setIsLoading(false);
      });
  }, [router]);

  const openEditPopup = (patient: any) => {
    setEditPatient(patient);
    // 🟢 2. เคลียร์ช่องค้นหาทุกครั้งที่เปิด Popup ใหม่
    setCaregiverSearch("");
    
    const existingCaregiverIds = patient.Caregivers ? patient.Caregivers.map((c: any) => c.ID || c.id) : [];

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
      const res = await fetch(`${API_URL}/api/admin/patients/${editPatient.ID}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          age: Number(editForm.age),
          room_number: editForm.room_number,
          medical_condition: editForm.medical_condition,
          caregiver_ids: editForm.caregiver_ids
        }),
      });

      if (res.ok) {
        const responseData = await res.json();
        setPatients(patients.map(p => 
          p.ID === editPatient.ID ? responseData.patient : p
        ));
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
        return { ...prev, caregiver_ids: prev.caregiver_ids.filter(id => id !== caregiverId) };
      } else {
        return { ...prev, caregiver_ids: [...prev.caregiver_ids, caregiverId] };
      }
    });
  };

  // 🟢 3. กรองรายชื่อผู้ดูแลตามข้อความที่ค้นหา (ค้นหาได้ทั้งชื่อและอีเมล)
  const filteredCaregivers = availableCaregivers.filter(cg => 
    (cg.name && cg.name.toLowerCase().includes(caregiverSearch.toLowerCase())) ||
    (cg.email && cg.email.toLowerCase().includes(caregiverSearch.toLowerCase()))
  );

  return (
    <div className="p-6">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">จัดการข้อมูลผู้ป่วย</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">แอดมินสามารถแก้ไขประวัติผู้ป่วยและลบข้อมูลออกจากระบบได้</p>
        </div>
      </div>

      <div className="overflow-x-auto shadow-md rounded-lg">
        <table className="w-full text-sm text-left">
          {/* ... ส่วนหัวตารางและเนื้อหาตารางเหมือนเดิมเป๊ะ ไม่มีการเปลี่ยนแปลง ... */}
          <thead className="dark:bg-slate-800 dark:text-white bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 text-slate-500 font-semibold uppercase tracking-wide text-xs">ผู้ป่วย</th>
              <th className="px-6 py-4 text-slate-500 font-semibold uppercase tracking-wide text-xs">อายุ</th>
              <th className="px-6 py-4 text-slate-500 font-semibold uppercase tracking-wide text-xs">ห้องพัก</th>
              <th className="px-6 py-4 text-slate-500 font-semibold uppercase tracking-wide text-xs">โรคประจำตัว</th>
              <th className="px-6 py-4 text-slate-500 font-semibold uppercase tracking-wide text-xs">ผู้ดูแล</th>
              <th className="px-6 py-4 text-slate-500 font-semibold uppercase tracking-wide text-xs">Device ID</th>
              <th className="px-6 py-4 text-right text-slate-500 font-semibold uppercase tracking-wide text-xs">การดำเนินการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-slate-500">กำลังโหลดข้อมูล...</td></tr>
            ) : patients.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-slate-500">ยังไม่มีข้อมูลผู้ป่วยในระบบ</td></tr>
            ) : (
              patients.map((p: any, i) => (
                <tr key={p.ID} className="dark:bg-slate-800 dark:text-white hover:bg-slate-700 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold"
                           style={{ backgroundColor: avatarColors[i % avatarColors.length] }}>
                        {p.Name ? p.Name.charAt(0) : "?"}
                      </div>
                      <span className="font-medium text-slate-800 dark:text-white">{p.Name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{p.Age} ปี</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                      {p.RoomNumber}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{p.MedicalCondition}</td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                    {p.Caregivers && p.Caregivers.length > 0 ? (
                      p.Caregivers.map((c: any) => c.name || c.Name).join(", ")
                    ) : <span className="text-slate-400 italic text-xs">ยังไม่มีผู้ดูแล</span>}
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-500">
                    {p.Devices && p.Devices.length > 0 ? (
                      p.Devices.map((d: any) => d.board_id).join(", ")
                    ) : <span className="text-slate-400 italic text-xs">ไม่มีอุปกรณ์</span>}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEditPopup(p)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="แก้ไข">
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      </button>
                      <button onClick={() => setDeleteConfirm(p.ID)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="ลบ">
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* 🟡 Popup แก้ไขข้อมูลผู้ป่วย */}
        {editPatient && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="dark:bg-slate-800 bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 overflow-y-auto max-h-[90vh]">
              <h3 className="dark:text-white text-xl font-bold text-slate-800 mb-4 border-b pb-3 dark:border-slate-700">แก้ไขข้อมูลผู้ป่วย</h3>
              
              <div className="flex flex-col gap-4 mb-6">
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 ml-1 block mb-1">ชื่อ-นามสกุลผู้ป่วย</label>
                  <input type="text" value={editForm.name} onChange={(e) => setEditForm({...editForm, name: e.target.value})} className="w-full p-2.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 ml-1 block mb-1">อายุ (ปี)</label>
                    <input type="number" min="0" value={editForm.age} onChange={(e) => setEditForm({...editForm, age: Number(e.target.value)})} className="w-full p-2.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 ml-1 block mb-1">ห้องพัก</label>
                    <input type="text" value={editForm.room_number} onChange={(e) => setEditForm({...editForm, room_number: e.target.value})} className="w-full p-2.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 ml-1 block mb-1">โรคประจำตัว / อาการ</label>
                  <input type="text" value={editForm.medical_condition} onChange={(e) => setEditForm({...editForm, medical_condition: e.target.value})} className="w-full p-2.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>

                {/* 🟢 ส่วนแสดงรายชื่อผู้ดูแล พร้อมช่องค้นหา */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 ml-1 block mb-1">
                    ผู้ดูแล (เลือกได้มากกว่า 1 คน)
                  </label>
                  
                  <div className="border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 overflow-hidden flex flex-col">
                    {/* ช่องพิมพ์ค้นหา */}
                    <div className="p-2 border-b border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800">
                      <div className="relative">
                        <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        <input 
                          type="text" 
                          placeholder="ค้นหาชื่อ หรือ อีเมล..." 
                          value={caregiverSearch}
                          onChange={(e) => setCaregiverSearch(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-700 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>

                    {/* กล่องรายการ Checklist (ใช้ข้อมูลที่ Filter แล้ว) */}
                    <div className="max-h-32 overflow-y-auto p-2 flex flex-col gap-1">
                      {filteredCaregivers.length > 0 ? (
                        filteredCaregivers.map((cg) => {
                          const isChecked = editForm.caregiver_ids.includes(cg.id || cg.ID);
                          return (
                            <label key={cg.id || cg.ID} className="flex items-center gap-3 cursor-pointer p-1.5 hover:bg-white dark:hover:bg-slate-600 rounded transition-colors">
                              <input 
                                type="checkbox" 
                                checked={isChecked}
                                onChange={() => handleCaregiverToggle(cg.id || cg.ID)}
                                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                              />
                              <div className="flex flex-col">
                                <span className="text-sm font-medium dark:text-slate-200">{cg.name}</span>
                                <span className="text-xs text-slate-500 dark:text-slate-400">{cg.email}</span>
                              </div>
                            </label>
                          );
                        })
                      ) : (
                        <div className="p-3 text-center text-xs text-slate-500 italic">
                          ไม่พบผู้ดูแลที่คุณค้นหา
                        </div>
                      )}
                    </div>
                  </div>
                </div>

              </div>

              <div className="flex gap-3">
                <button onClick={() => setEditPatient(null)} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">ยกเลิก</button>
                <button onClick={handleUpdatePatient} className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm">บันทึกข้อมูล</button>
              </div>
            </div>
          </div>
        )}

        {/* 🔴 Popup ยืนยันการลบ */}
        {deleteConfirm !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="dark:bg-slate-800 bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
              </div>
              <h3 className="dark:text-white text-base font-bold text-slate-800 mb-1">ยืนยันการลบผู้ป่วย</h3>
              <p className="dark:text-slate-400 text-sm text-slate-500 mb-5">ข้อมูลผู้ป่วยและอุปกรณ์ที่เชื่อมโยงจะถูกลบออกจากระบบ</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">ยกเลิก</button>
                <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors">ยืนยันลบ</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}