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

      // UpdatePatient ตอบ 404 ทั้งเมื่อไม่พบผู้ป่วย และเมื่อผู้ดูแลไม่ได้ผูกกับผู้ป่วยรายนี้
      if (res.status === 404) {
        setSubmitError("ไม่พบข้อมูลผู้ป่วย หรือคุณไม่มีสิทธิ์แก้ไขผู้ป่วยรายนี้");
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

  // คลาสช่องกรอก — Tailwind + ตัวแปร --tb-* ตามแบบหน้า patients
  const inputClass = (key: string) =>
    `block w-full h-10 px-3 rounded-[var(--tb-radius)] border bg-[var(--tb-surface)] text-sm text-[var(--tb-text)] placeholder:text-[var(--tb-placeholder)] shadow-[var(--tb-shadow-xs)] transition-colors focus:outline-none focus:ring-4 ${
      errors[key]
        ? "border-[var(--tb-danger)] focus:border-[var(--tb-danger)] focus:ring-[var(--tb-danger)]/25"
        : "border-[var(--tb-border)] focus:border-[var(--tb-primary)] focus:ring-[var(--tb-primary-ring)]"
    }`;
  const labelClass = "block mb-1.5 text-sm font-semibold text-[var(--tb-text)]";
  const errorClass = "mt-1.5 text-xs font-medium text-[var(--tb-danger-text)]";
  const btnSecondary =
    "inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface)] text-sm font-semibold text-[var(--tb-text)] hover:bg-[var(--tb-surface-2)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]";
  const btnPrimary =
    "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-[var(--tb-radius)] bg-[var(--tb-primary)] text-sm font-semibold text-[var(--tb-primary-contrast)] shadow-[var(--tb-shadow-xs)] hover:bg-[var(--tb-primary-hover)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4 py-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="patient-form-title"
        className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-pop)]"
      >
        {/* หัวโมดัล */}
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 py-4 border-b border-[var(--tb-border)]">
          <div className="min-w-0">
            <h2
              id="patient-form-title"
              className="text-lg font-bold text-[var(--tb-text)]"
            >
              {isEdit ? "แก้ไขข้อมูลผู้ป่วย" : "เพิ่มผู้ป่วยใหม่"}
            </h2>
            {isEdit && patient && (
              <p className="mt-0.5 text-sm text-[var(--tb-muted)] break-words">
                {patient.name}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            title="ปิด"
            aria-label="ปิด"
            className="inline-flex shrink-0 items-center justify-center w-9 h-9 -mr-1.5 rounded-[var(--tb-radius)] text-[var(--tb-muted)] hover:bg-[var(--tb-surface-2)] hover:text-[var(--tb-text)] transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col min-h-0 flex-1"
          noValidate
        >
          {/* เนื้อหา — เลื่อนได้เมื่อจอเตี้ย */}
          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4">
            <div>
              <label htmlFor="patient-form-name" className={labelClass}>
                ชื่อ-นามสกุล{" "}
                <span className="text-[var(--tb-danger-text)]" aria-hidden="true">
                  *
                </span>
              </label>
              <input
                id="patient-form-name"
                autoFocus
                type="text"
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="นาย/นาง/นางสาว ชื่อ นามสกุล"
                aria-required="true"
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? "patient-form-name-error" : undefined}
                className={inputClass("name")}
              />
              {errors.name && (
                <p id="patient-form-name-error" className={errorClass}>
                  {errors.name}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="min-w-0">
                <label htmlFor="patient-form-age" className={labelClass}>
                  อายุ (ปี)
                </label>
                <input
                  id="patient-form-age"
                  type="number"
                  value={form.age}
                  onChange={(e) => setField("age", e.target.value)}
                  placeholder="เช่น 72"
                  aria-invalid={errors.age ? true : undefined}
                  aria-describedby={errors.age ? "patient-form-age-error" : undefined}
                  className={inputClass("age")}
                />
                {errors.age && (
                  <p id="patient-form-age-error" className={errorClass}>
                    {errors.age}
                  </p>
                )}
              </div>
              <div className="min-w-0">
                <label htmlFor="patient-form-gender" className={labelClass}>
                  เพศ
                </label>
                <div className="relative">
                  <select
                    id="patient-form-gender"
                    value={form.gender}
                    onChange={(e) => setField("gender", e.target.value)}
                    className={`${inputClass("gender")} appearance-none pr-9 cursor-pointer`}
                  >
                    {GENDER_OPTIONS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                  <svg
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--tb-muted)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="patient-form-room" className={labelClass}>
                หมายเลขห้อง/เตียง{" "}
                <span className="text-[var(--tb-danger-text)]" aria-hidden="true">
                  *
                </span>
              </label>
              <input
                id="patient-form-room"
                type="text"
                value={form.room}
                onChange={(e) => setField("room", e.target.value)}
                placeholder="เช่น A-101"
                aria-required="true"
                aria-invalid={errors.room ? true : undefined}
                aria-describedby={errors.room ? "patient-form-room-error" : undefined}
                className={inputClass("room")}
              />
              {errors.room && (
                <p id="patient-form-room-error" className={errorClass}>
                  {errors.room}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="patient-form-condition" className={labelClass}>
                โรคประจำตัว
              </label>
              <input
                id="patient-form-condition"
                type="text"
                value={form.condition}
                onChange={(e) => setField("condition", e.target.value)}
                placeholder="เช่น ความดันโลหิตสูง"
                className={inputClass("condition")}
              />
            </div>

            {isEdit && (
              <div className="rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface-2)] p-4">
                <p className="mb-2 text-xs font-semibold text-[var(--tb-muted)]">
                  อุปกรณ์ที่ผูกไว้
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="font-mono text-[var(--tb-text)] break-all">
                    {patient?.deviceId || "—"}
                  </span>
                  <span className="text-[var(--tb-muted)]">
                    {patient?.deviceName || "ยังไม่ได้ผูกอุปกรณ์"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-[var(--tb-muted)]">
                  เปลี่ยนอุปกรณ์ได้ที่หน้าลงทะเบียนผู้ป่วย
                </p>
              </div>
            )}

            {submitError && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-[var(--tb-radius)] border border-[var(--tb-warning)]/30 bg-[var(--tb-warning-tint)] p-3"
              >
                <svg
                  className="w-4 h-4 shrink-0 mt-0.5 text-[var(--tb-warning-text)]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </svg>
                <p className="text-sm font-medium text-[var(--tb-warning-text)]">
                  {submitError}
                </p>
              </div>
            )}
          </div>

          {/* ท้ายโมดัล: ปุ่ม */}
          <div className="flex gap-3 px-5 sm:px-6 py-4 border-t border-[var(--tb-border)]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className={`${btnSecondary} flex-1`}
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className={`${btnPrimary} flex-1`}
            >
              {isSaving && (
                <span
                  aria-hidden="true"
                  className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"
                />
              )}
              {isSaving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
