"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from "react";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { authHeaders } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
// ชุดสีเดียวกับหน้า /patients
const avatarColors = ["#066fd1", "#0891b2", "#2f9e44", "#c2410c", "#7048e8"];

export default function AdminUsers() {
  // เดิมหน้านี้เช็คสิทธิ์จาก localStorage.userRole ซึ่งมีปัญหา 2 อย่าง:
  // ปลอมได้ใน devtools และคีย์นั้นถูกตั้งเฉพาะตอนล็อกอินด้วยอีเมล/รหัสผ่าน
  // (ล็อกอินด้วย Google จะไม่มีเลย ทำให้แอดมินตัวจริงเข้าหน้านี้ไม่ได้)
  // ตอนนี้ถาม backend เหมือนหน้า admin อื่นๆ
  const { isAdmin, isChecking } = useAdminGuard();
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

  const fetchUsers = useCallback(() => {
    fetch(`${API_URL}/api/admin/users`, {
      method: "GET",
      credentials: "include",
      headers: authHeaders({ "Content-Type": "application/json" }),
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
        console.error("ดึงข้อมูลล้มเหลว:", err);
        setUsers([]);
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    if (isAdmin) fetchUsers();
  }, [isAdmin, fetchUsers]);

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: authHeaders({ "Content-Type": "application/json" }),
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

  // ฟังก์ชันเมื่อกดปุ่มแก้ไข (ดึงข้อมูลเก่ามาใส่ฟอร์ม)
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

  // ฟังก์ชันบันทึกข้อมูล
  const handleUpdateUser = async () => {
    if (!editUser) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${editUser.id || editUser.ID}`, {
        method: "PUT",
        credentials: "include",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(editForm), // ส่งข้อมูลทั้งก้อนไปให้ Go
      });

      if (res.ok) {
        // อัปเดตข้อมูลในหน้าจอ
        // เทียบรหัสตัวเดียว: API ส่ง `id` มา ถ้าใช้ `u.ID === editUser.ID` ด้วย จะเป็น undefined === undefined แล้วแก้ทุกแถว
        const editedId = editUser.id ?? editUser.ID;
        setUsers(users.map(u => (u.id ?? u.ID) === editedId ? { ...u, ...editForm } : u));
        setEditUser(null);
      } else {
        alert("อัปเดตข้อมูลไม่สำเร็จ");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
  };

  if (isChecking) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--tb-border)] border-t-[var(--tb-primary)] animate-spin" />
        <p className="text-sm text-[var(--tb-muted)]">
          กำลังตรวจสอบสิทธิ์ผู้ดูแลระบบ...
        </p>
      </div>
    );
  }

  // ไม่ผ่านด่าน — useAdminGuard สั่ง redirect ไปแล้ว
  if (!isAdmin) return null;

  // คลาสที่ใช้ซ้ำในหน้านี้ — Tailwind + ตัวแปร --tb-* ตามแบบหน้า /patients
  const th = "px-5 py-3 text-xs font-semibold text-[var(--tb-muted)] text-left whitespace-nowrap";
  const td = "px-5 py-4 align-middle";
  const btnSecondary =
    "inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface)] text-sm font-semibold text-[var(--tb-text)] hover:bg-[var(--tb-surface-2)] transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]";
  const btnPrimary =
    "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-[var(--tb-radius)] bg-[var(--tb-primary)] text-sm font-semibold text-[var(--tb-primary-contrast)] shadow-[var(--tb-shadow-xs)] hover:bg-[var(--tb-primary-hover)] transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]";
  const labelClass = "block mb-1.5 text-sm font-medium text-[var(--tb-text)]";
  const inputClass =
    "w-full h-10 px-3 rounded-[var(--tb-radius)] border border-[var(--tb-border-strong)] bg-[var(--tb-surface)] text-sm text-[var(--tb-text)] placeholder:text-[var(--tb-placeholder)] shadow-[var(--tb-shadow-xs)] outline-none transition focus:border-[var(--tb-primary)] focus:ring-4 focus:ring-[var(--tb-primary-ring)] [&>option]:bg-[var(--tb-surface)] [&>option]:text-[var(--tb-text)]";
  const pill = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold";
  const dot = "w-1.5 h-1.5 rounded-full bg-current";
  const btnDisconnect =
    "inline-flex items-center justify-center h-8 px-2.5 rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface)] text-xs font-semibold text-[var(--tb-danger-text)] hover:bg-[var(--tb-danger-tint)] transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]";

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      {/* ---------- หัวหน้า ---------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--tb-muted)]">ผู้ดูแลระบบ</p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--tb-text)]">จัดการผู้ใช้งาน (Users)</h1>
          <p className="mt-1 text-sm font-medium text-[var(--tb-muted)]">
            รายชื่อผู้ใช้งานทั้งหมดในระบบ แอดมินสามารถแก้ไขสิทธิ์ ลบการเชื่อมต่อ และลบบัญชีได้
          </p>
        </div>
      </div>

      {/* ---------- ตาราง — จอมือถือแต่ละแถวกลายเป็นการ์ด (กฎ .neu-table ใน globals.css อ่านจาก data-label) ---------- */}
      <div className="rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-card)] overflow-hidden max-md:border-0 max-md:bg-transparent max-md:shadow-none">
        <div className="overflow-x-auto">
          <table className="neu-table w-full text-sm">
            <thead className="bg-[var(--tb-surface-2)] border-b border-[var(--tb-border)]">
              <tr>
                <th className={th}>ผู้ใช้งาน</th>
                <th className={th}>อีเมล</th>
                <th className={th}>สถานะยืนยัน</th>
                <th className={th}>การเชื่อมต่อ</th>
                <th className={th}>สิทธิ์ (Role)</th>
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
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <p className="text-base font-semibold text-[var(--tb-text)]">ยังไม่มีผู้ใช้งานในระบบ</p>
                  </td>
                </tr>
              ) : (
                users.map((u, i) => (
                  <tr key={u.id || u.ID} className="hover:bg-[var(--tb-surface-2)] transition-colors">
                    <td data-label="ผู้ใช้งาน" className={td}>
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          aria-hidden="true"
                          className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-white text-xs font-bold"
                          style={{ backgroundColor: avatarColors[i % avatarColors.length] }}
                        >
                          {u.name ? u.name.charAt(0).toUpperCase() : "?"}
                        </span>
                        <span className="font-semibold text-[var(--tb-text)]">{u.name}</span>
                      </div>
                    </td>
                    <td data-label="อีเมล" className={`${td} text-[var(--tb-muted)] break-all`}>
                      {u.email}
                    </td>
                    <td data-label="สถานะยืนยัน" className={td}>
                      {u.is_verified ? (
                        <span className={`${pill} bg-[var(--tb-success-tint)] text-[var(--tb-success-text)]`}>
                          <span aria-hidden="true" className={dot} />
                          ยืนยันแล้ว
                        </span>
                      ) : (
                        <span className={`${pill} bg-[var(--tb-danger-tint)] text-[var(--tb-danger-text)]`}>
                          <span aria-hidden="true" className={dot} />
                          ยังไม่ยืนยัน
                        </span>
                      )}
                    </td>
                    <td data-label="การเชื่อมต่อ" className={td}>
                      <div className="flex flex-wrap gap-1.5">
                        {u.is_linked_line && (
                          <span className={`${pill} bg-[var(--tb-success-tint)] text-[var(--tb-success-text)]`}>LINE</span>
                        )}
                        {u.is_telegram_connected && (
                          <span className={`${pill} bg-[var(--tb-primary-tint)] text-[var(--tb-primary-text)]`}>TG</span>
                        )}
                        {(!u.is_linked_line && !u.is_telegram_connected) && (
                          <span className="text-xs text-[var(--tb-muted)]">-</span>
                        )}
                      </div>
                    </td>
                    <td data-label="สิทธิ์ (Role)" className={td}>
                      <span
                        className={`${pill} ${
                          u.role === "admin"
                            ? "bg-[var(--tb-primary-tint)] text-[var(--tb-primary-text)]"
                            : "border border-[var(--tb-border)] bg-[var(--tb-surface-2)] text-[var(--tb-text)]"
                        }`}
                      >
                        {u.role || "caregiver"}
                      </span>
                    </td>
                    <td data-label="จัดการ" className={td}>
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEditPopup(u)}
                          className={btnSecondary}
                          title="แก้ไขข้อมูล"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm(u.id || u.ID)}
                          className={`${btnSecondary} text-[var(--tb-danger-text)] hover:bg-[var(--tb-danger-tint)]`}
                          title="ลบผู้ใช้"
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

      {/* ---------- Popup แก้ไขข้อมูลผู้ใช้ ---------- */}
      {editUser && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-edit-user-title"
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-pop)]"
          >
            <div className="px-6 py-4 border-b border-[var(--tb-border)]">
              <h3 id="admin-edit-user-title" className="text-lg font-bold text-[var(--tb-text)]">
                แก้ไขข้อมูลผู้ใช้งาน
              </h3>
            </div>

            <div className="flex flex-col gap-4 px-6 py-5">
              {/* ชื่อ */}
              <div>
                <label htmlFor="admin-user-name" className={labelClass}>ชื่อ-นามสกุล</label>
                <input
                  id="admin-user-name"
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                  className={inputClass}
                />
              </div>

              {/* อีเมล */}
              <div>
                <label htmlFor="admin-user-email" className={labelClass}>อีเมล</label>
                <input
                  id="admin-user-email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-4">
                {/* สถานะการยืนยัน */}
                <div>
                  <label htmlFor="admin-user-verified" className={labelClass}>การยืนยันอีเมล</label>
                  <select
                    id="admin-user-verified"
                    value={editForm.is_verified ? "true" : "false"}
                    onChange={(e) => setEditForm({...editForm, is_verified: e.target.value === "true"})}
                    className={inputClass}
                  >
                    <option value="true">ยืนยันแล้ว</option>
                    <option value="false">ยังไม่ยืนยัน</option>
                  </select>
                </div>

                {/* สิทธิ์ Role */}
                <div>
                  <label htmlFor="admin-user-role" className={labelClass}>สิทธิ์ (Role)</label>
                  <select
                    id="admin-user-role"
                    value={editForm.role}
                    onChange={(e) => setEditForm({...editForm, role: e.target.value})}
                    className={inputClass}
                  >
                    <option value="caregiver">Caregiver</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>

              {/* ส่วนลบการเชื่อมต่อ */}
              <div>
                <p className={labelClass}>การเชื่อมต่อแจ้งเตือน</p>
                <div className="rounded-[var(--tb-radius)] border border-[var(--tb-border)] divide-y divide-[var(--tb-border)]">

                  {/* เช็ค LINE */}
                  <div className="flex items-center justify-between gap-3 px-3 py-2.5 min-h-[52px]">
                    <span className="text-sm font-medium text-[var(--tb-text)] flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={`w-2 h-2 rounded-full ${editForm.is_linked_line ? "bg-[var(--tb-success)]" : "bg-[var(--tb-border-strong)]"}`}
                      />
                      LINE
                    </span>
                    {editForm.is_linked_line ? (
                      <button
                        type="button"
                        onClick={() => setEditForm({...editForm, is_linked_line: false})}
                        className={btnDisconnect}
                      >
                        ยกเลิกการเชื่อมต่อ
                      </button>
                    ) : (
                      <span className="text-xs text-[var(--tb-muted)]">ไม่ได้เชื่อมต่อ</span>
                    )}
                  </div>

                  {/* เช็ค Telegram */}
                  <div className="flex items-center justify-between gap-3 px-3 py-2.5 min-h-[52px]">
                    <span className="text-sm font-medium text-[var(--tb-text)] flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={`w-2 h-2 rounded-full ${editForm.is_telegram_connected ? "bg-[var(--tb-primary)]" : "bg-[var(--tb-border-strong)]"}`}
                      />
                      Telegram
                    </span>
                    {editForm.is_telegram_connected ? (
                      <button
                        type="button"
                        onClick={() => setEditForm({...editForm, is_telegram_connected: false})}
                        className={btnDisconnect}
                      >
                        ยกเลิกการเชื่อมต่อ
                      </button>
                    ) : (
                      <span className="text-xs text-[var(--tb-muted)]">ไม่ได้เชื่อมต่อ</span>
                    )}
                  </div>

                </div>
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-[var(--tb-border)] bg-[var(--tb-surface-2)] rounded-b-[var(--tb-radius-lg)]">
              <button type="button" onClick={() => setEditUser(null)} className={`${btnSecondary} flex-1 h-10`}>
                ยกเลิก
              </button>
              <button type="button" onClick={handleUpdateUser} className={`${btnPrimary} flex-1`}>
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
            aria-labelledby="admin-delete-user-title"
            className="w-full max-w-sm rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-pop)] p-6 text-center"
          >
            <span className="inline-flex items-center justify-center w-12 h-12 mb-4 rounded-full bg-[var(--tb-danger-tint)] text-[var(--tb-danger-text)]">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              </svg>
            </span>
            <h3 id="admin-delete-user-title" className="text-lg font-bold text-[var(--tb-text)] mb-1">ยืนยันการลบผู้ใช้งาน</h3>
            <p className="text-sm text-[var(--tb-muted)] mb-6">หากลบแล้วจะไม่สามารถกู้คืนบัญชีนี้ได้</p>
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
