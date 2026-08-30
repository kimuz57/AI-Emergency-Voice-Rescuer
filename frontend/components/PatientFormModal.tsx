"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const getAuthToken = () => {
  if (typeof window === "undefined") return "";
  const fromStorage = localStorage.getItem("token");
  if (fromStorage) return fromStorage;
  const match = document.cookie.match(/(?:^|; )token_public=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
};

export type PatientFormValues = {
  id: number;
  name: string;
  age: number | string;
  gender: string;
  room: string;
  condition: string;
  deviceId: string;
  deviceName: string;
};

type Props = {
  mode: "add" | "edit";
  patient?: PatientFormValues | null;
  onClose: () => void;
  onSaved: () => void;
};

const EMPTY_FORM = {
  name: "",
  age: "",
  gender: "ไม่ระบุ",
  room: "",
  condition: "",
};

const GENDER_OPTIONS = ["ชาย", "หญิง", "อื่นๆ", "ไม่ระบุ"];

// โมดัลถูก mount ใหม่ทุกครั้งที่เปิด (ฝั่งเรียกใช้เรนเดอร์แบบมีเงื่อนไข)
// เลยเติมค่าเริ่มต้นจาก props ได้ตรงๆ ไม่ต้องมี effect คอย sync
export default function PatientFormModal({
  mode,
  patient,
  onClose,
  onSaved,
}: Props) {
  const [form, setForm] = useState(() =>
    patient
      ? {
          name: patient.name ?? "",
          age:
            patient.age !== undefined && patient.age !== null
              ? String(patient.age)
              : "",
          gender: patient.gender || "ไม่ระบุ",
          room: patient.room ?? "",
          condition: patient.condition ?? "",
        }
      : EMPTY_FORM,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const isEdit = mode === "edit";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setField = (key: keyof typeof EMPTY_FORM, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "กรุณากรอกชื่อ-นามสกุล";
    if (!form.room.trim()) next.room = "กรุณากรอกหมายเลขห้อง";
    if (form.age.trim()) {
      const age = Number(form.age);
      if (!Number.isFinite(age) || age < 0 || age > 150) {
        next.age = "อายุต้องเป็นตัวเลข 0-150";
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSaving(true);
    setSubmitError("");

    try {
      const token = getAuthToken();
      // mode "add" ยังไม่มีใครเรียก — ถ้าจะต่อสายในอนาคตต้องส่ง board_id/deviceName
      // เพิ่มด้วย เพราะ RegisterPatientWithDevice ผูกอุปกรณ์ในขั้นตอนเดียวกัน
      const url = isEdit
        ? `${API_URL}/api/patients/${patient?.id}`
        : `${API_URL}/api/patients/register`;

      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          patientName: form.name.trim(),
          age: parseInt(form.age, 10) || 0,
          gender: form.gender,
          roomNumber: form.room.trim(),
          medicalCondition: form.condition.trim(),
        }),
      });

      if (res.ok) {
        onSaved();
        onClose();
        return;
      }

      // PUT /api/patients/:id ยังไม่มีในฝั่ง Go — แยกเคสนี้ออกมาบอกให้ชัด
      // แทนที่จะโยน error ดิบที่ผู้ใช้อ่านไม่รู้เรื่อง
      if (res.status === 404 || res.status === 405) {
        setSubmitError(
          "ระบบยังไม่รองรับการแก้ไขข้อมูล (รอ backend เพิ่ม PUT /api/patients/:id)",
        );
        return;
      }
      if (res.status === 401 || res.status === 403) {
        setSubmitError("ไม่มีสิทธิ์แก้ไขข้อมูลนี้ กรุณาเข้าสู่ระบบใหม่");
        return;
      }

      const data = await res.json().catch(() => ({}));
      setSubmitError(data.error || `บันทึกไม่สำเร็จ (HTTP ${res.status})`);
    } catch {
      setSubmitError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = (key: string) =>
    `dark:bg-slate-700 dark:border-slate-600 dark:text-white w-full px-3 py-2.5 border rounded-xl text-sm outline-none focus:ring-2 focus:border-transparent transition ${
      errors[key]
        ? "border-red-400 focus:ring-red-400"
        : "border-slate-200 focus:ring-indigo-500"
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dark:bg-slate-800 bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="dark:text-white text-lg font-bold text-slate-800">
              {isEdit ? "แก้ไขข้อมูลผู้ป่วย" : "เพิ่มผู้ป่วยใหม่"}
            </h2>
            {isEdit && patient && (
              <p className="dark:text-slate-400 text-xs text-slate-500 mt-0.5">
                {patient.name}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            title="ปิด"
            className="dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg p-1 transition-colors"
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

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label className="dark:text-slate-300 block text-sm font-medium text-slate-700 mb-1">
              ชื่อ-นามสกุล <span className="text-red-500">*</span>
            </label>
            <input
              autoFocus
              type="text"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="นาย/นาง/นางสาว ชื่อ นามสกุล"
              className={inputClass("name")}
            />
            {errors.name && (
              <p className="text-xs text-red-500 mt-1">{errors.name}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="dark:text-slate-300 block text-sm font-medium text-slate-700 mb-1">
                อายุ (ปี)
              </label>
              <input
                type="number"
                value={form.age}
                onChange={(e) => setField("age", e.target.value)}
                placeholder="เช่น 72"
                className={inputClass("age")}
              />
              {errors.age && (
                <p className="text-xs text-red-500 mt-1">{errors.age}</p>
              )}
            </div>
            <div>
              <label className="dark:text-slate-300 block text-sm font-medium text-slate-700 mb-1">
                เพศ
              </label>
              <select
                value={form.gender}
                onChange={(e) => setField("gender", e.target.value)}
                className={inputClass("gender")}
              >
                {GENDER_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="dark:text-slate-300 block text-sm font-medium text-slate-700 mb-1">
              หมายเลขห้อง/เตียง <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.room}
              onChange={(e) => setField("room", e.target.value)}
              placeholder="เช่น A-101"
              className={inputClass("room")}
            />
            {errors.room && (
              <p className="text-xs text-red-500 mt-1">{errors.room}</p>
            )}
          </div>

          <div>
            <label className="dark:text-slate-300 block text-sm font-medium text-slate-700 mb-1">
              โรคประจำตัว
            </label>
            <input
              type="text"
              value={form.condition}
              onChange={(e) => setField("condition", e.target.value)}
              placeholder="เช่น ความดันโลหิตสูง"
              className={inputClass("condition")}
            />
          </div>

          {isEdit && (
            <div className="dark:bg-slate-700/40 dark:border-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="dark:text-slate-400 text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">
                อุปกรณ์ที่ผูกไว้
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="dark:text-slate-200 font-mono text-slate-700">
                  {patient?.deviceId || "—"}
                </span>
                <span className="dark:text-slate-400 text-slate-500">
                  {patient?.deviceName || "ยังไม่ได้ผูกอุปกรณ์"}
                </span>
              </div>
              <p className="dark:text-slate-500 text-[11px] text-slate-400 mt-2">
                เปลี่ยนอุปกรณ์ได้ที่หน้าลงทะเบียนผู้ป่วย
              </p>
            </div>
          )}

          {submitError && (
            <div className="dark:bg-amber-500/10 dark:border-amber-500/40 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
              <svg
                className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z"
                />
              </svg>
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                {submitError}
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSaving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
