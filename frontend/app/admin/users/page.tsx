"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const avatarColors = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#EF4444"];

export default function AdminUsers() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);

  // States สำหรับ Popups
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [editUser, setEditUser] = useState<any>(null);
  
  // State สำหรับฟอร์มแก้ไขข้อมูล
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    role: "caregiver",
    is_verified: false,
    is_linked_line: false,
    is_telegram_connected: false,
  });

  const fetchUsers = () => {
    fetch(`${API_URL}/api/admin/users`, {
      method: "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setUsers(Array.isArray(data) ? data : []);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("❌ ดึงข้อมูลล้มเหลว:", err);
        setUsers([]);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    const role = localStorage.getItem("userRole");
    if (!role || role.toLowerCase() !== "admin") {
      router.push("/dashboard");
      return;
    }
    fetchUsers();
  }, [router]);

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (res.ok) {
        setUsers(users.filter((u) => u.id !== id && u.ID !== id));
        setDeleteConfirm(null);
      } else {
        alert("ลบไม่สำเร็จ");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
  };

  // 🟢 ฟังก์ชันเมื่อกดปุ่มแก้ไข (ดึงข้อมูลเก่ามาใส่ฟอร์ม)
  const openEditPopup = (user: any) => {
    setEditUser(user);
    setEditForm({
      name: user.name || "",
      email: user.email || "",
      role: user.role || "caregiver",
      is_verified: user.is_verified || false,
      is_linked_line: user.is_linked_line || false,
      is_telegram_connected: user.is_telegram_connected || false,
    });
  };

  // 🟢 ฟังก์ชันบันทึกข้อมูล
  const handleUpdateUser = async () => {
    if (!editUser) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${editUser.id || editUser.ID}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm), // ส่งข้อมูลทั้งก้อนไปให้ Go
      });

      if (res.ok) {
        // อัปเดตข้อมูลในหน้าจอ
        setUsers(users.map(u => (u.id === editUser.id || u.ID === editUser.ID) ? { ...u, ...editForm } : u));
        setEditUser(null);
      } else {
        alert("อัปเดตข้อมูลไม่สำเร็จ");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">จัดการผู้ใช้งาน (Users)</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">รายชื่อผู้ใช้งานทั้งหมดในระบบ แอดมินสามารถแก้ไขสิทธิ์ ลบการเชื่อมต่อ และลบบัญชีได้</p>
      </div>

      <div className="overflow-x-auto shadow-md rounded-lg">
        <table className="w-full text-sm text-left">
          <thead className="dark:bg-slate-800 dark:text-white bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 text-slate-500 font-semibold uppercase text-xs">ผู้ใช้งาน</th>
              <th className="px-6 py-4 text-slate-500 font-semibold uppercase text-xs">อีเมล</th>
              <th className="px-6 py-4 text-slate-500 font-semibold uppercase text-xs">สถานะยืนยัน</th>
              <th className="px-6 py-4 text-slate-500 font-semibold uppercase text-xs">การเชื่อมต่อ</th>
              <th className="px-6 py-4 text-slate-500 font-semibold uppercase text-xs">สิทธิ์ (Role)</th>
              <th className="px-6 py-4 text-right text-slate-500 font-semibold uppercase text-xs">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">กำลังโหลดข้อมูล...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">ยังไม่มีผู้ใช้งานในระบบ</td></tr>
            ) : (
              users.map((u, i) => (
                <tr key={u.id || u.ID} className="dark:bg-slate-800 dark:text-white hover:bg-slate-700 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold"
                           style={{ backgroundColor: avatarColors[i % avatarColors.length] }}>
                        {u.name ? u.name.charAt(0).toUpperCase() : "?"}
                      </div>
                      <span className="font-medium">{u.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{u.email}</td>
                  <td className="px-6 py-4">
                    {u.is_verified ? (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">ยืนยันแล้ว</span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">ยังไม่ยืนยัน</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      {u.is_linked_line && <span className="px-2 py-0.5 bg-[#00B900]/10 text-[#00B900] rounded text-xs font-bold border border-[#00B900]/20">LINE</span>}
                      {u.is_telegram_connected && <span className="px-2 py-0.5 bg-[#0088cc]/10 text-[#0088cc] rounded text-xs font-bold border border-[#0088cc]/20">TG</span>}
                      {(!u.is_linked_line && !u.is_telegram_connected) && <span className="text-slate-400 text-xs">-</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                      u.role === "admin" ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-blue-50 text-blue-700 border-blue-200"
                    }`}>
                      {u.role || "caregiver"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEditPopup(u)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="แก้ไขข้อมูล">
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      </button>
                      <button onClick={() => setDeleteConfirm(u.id || u.ID)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="ลบผู้ใช้">
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* 🟡 Popup แก้ไขข้อมูลผู้ใช้ */}
        {editUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="dark:bg-slate-800 bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
              <h3 className="dark:text-white text-xl font-bold text-slate-800 mb-4 border-b pb-3 dark:border-slate-700">แก้ไขข้อมูลผู้ใช้งาน</h3>
              
              <div className="flex flex-col gap-4 mb-6">
                {/* ชื่อ */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 ml-1 block mb-1">ชื่อ-นามสกุล</label>
                  <input type="text" value={editForm.name} onChange={(e) => setEditForm({...editForm, name: e.target.value})} className="w-full p-2.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>

                {/* อีเมล */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 ml-1 block mb-1">อีเมล</label>
                  <input type="email" value={editForm.email} onChange={(e) => setEditForm({...editForm, email: e.target.value})} className="w-full p-2.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* สถานะการยืนยัน */}
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 ml-1 block mb-1">การยืนยันอีเมล</label>
                    <select value={editForm.is_verified ? "true" : "false"} onChange={(e) => setEditForm({...editForm, is_verified: e.target.value === "true"})} className="w-full p-2.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="true">ยืนยันแล้ว</option>
                      <option value="false">ยังไม่ยืนยัน</option>
                    </select>
                  </div>

                  {/* สิทธิ์ Role */}
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 ml-1 block mb-1">สิทธิ์ (Role)</label>
                    <select value={editForm.role} onChange={(e) => setEditForm({...editForm, role: e.target.value})} className="w-full p-2.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="caregiver">Caregiver</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>

                {/* ส่วนลบการเชื่อมต่อ */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 ml-1 block mb-1">การเชื่อมต่อแจ้งเตือน</label>
                  <div className="flex flex-col gap-2 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
                    
                    {/* เช็ค LINE */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium dark:text-slate-300 flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${editForm.is_linked_line ? 'bg-[#00B900]' : 'bg-slate-300 dark:bg-slate-500'}`}></div>
                        LINE
                      </span>
                      {editForm.is_linked_line ? (
                        <button type="button" onClick={() => setEditForm({...editForm, is_linked_line: false})} className="text-xs px-2 py-1 bg-red-100 text-red-600 font-semibold rounded hover:bg-red-200 transition-colors">
                          ยกเลิกการเชื่อมต่อ
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">ไม่ได้เชื่อมต่อ</span>
                      )}
                    </div>

                    {/* เช็ค Telegram */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium dark:text-slate-300 flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${editForm.is_telegram_connected ? 'bg-[#0088cc]' : 'bg-slate-300 dark:bg-slate-500'}`}></div>
                        Telegram
                      </span>
                      {editForm.is_telegram_connected ? (
                        <button type="button" onClick={() => setEditForm({...editForm, is_telegram_connected: false})} className="text-xs px-2 py-1 bg-red-100 text-red-600 font-semibold rounded hover:bg-red-200 transition-colors">
                          ยกเลิกการเชื่อมต่อ
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">ไม่ได้เชื่อมต่อ</span>
                      )}
                    </div>

                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setEditUser(null)} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">ยกเลิก</button>
                <button onClick={handleUpdateUser} className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm">บันทึกข้อมูล</button>
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
              <h3 className="dark:text-white text-base font-bold text-slate-800 mb-1">ยืนยันการลบผู้ใช้งาน</h3>
              <p className="dark:text-slate-400 text-sm text-slate-500 mb-5">หากลบแล้วจะไม่สามารถกู้คืนบัญชีนี้ได้</p>
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