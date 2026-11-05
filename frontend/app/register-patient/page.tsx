"use client";
/* eslint-disable @typescript-eslint/no-unused-vars, react-hooks/set-state-in-effect */
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function formatMacAddress(value: string) {
  const cleaned = value.replace(/[^a-fA-F0-9]/g, "").slice(0, 12);
  if (!cleaned) return "";

  const parts: string[] = [];
  for (let i = 0; i < cleaned.length; i += 2) {
    parts.push(cleaned.slice(i, i + 2));
  }

  return parts.join(":").toUpperCase();
}

function RegistrationFormContent() {
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState({
    patientName: "",
    age: "",
    gender: "ชาย",
    roomNumber: "",
    medicalCondition: "",
    boardId: "",
    deviceName: "ไมค์หัวเตียง",
  });
  const [activeTab, setActiveTab] = useState<"register" | "scan">("register");
  const [scannedMAC, setScannedMAC] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const mac = searchParams.get("mac");
    if (mac) {
      setFormData((prev) => ({ ...prev, boardId: formatMacAddress(mac) }));
    }
  }, [searchParams]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    if (name === "boardId") {
      setFormData((prev) => ({ ...prev, boardId: formatMacAddress(value) }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const getAuthToken = () => {
        if (typeof window === "undefined") return "";
        const fromStorage = localStorage.getItem("token");
        if (fromStorage) return fromStorage;
        const match = document.cookie.match(/(?:^|; )token_public=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : "";
      };

      const token = getAuthToken();

      const res = await fetch(`${API_BASE_URL}/api/patients/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include", // ส่ง Cookie/Session ไปด้วยเพื่อให้ Backend รู้ว่า Account ไหนเป็นคนทำรายการ
        body: JSON.stringify({
          patientName: formData.patientName,
          age: parseInt(formData.age) || 0,
          gender: formData.gender,
          roomNumber: formData.roomNumber,
          medicalCondition: formData.medicalCondition,
          // ไม่ต้องส่ง caregiverEmail จากฟอร์มแล้ว ให้ Backend ดึงจาก Session ของผู้ใช้ที่ล็อกอินอยู่
          board_id: formData.boardId,
          deviceName: formData.deviceName,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        alert(data.message);
        setFormData({
          patientName: "",
          age: "",
          gender: "ชาย",
          roomNumber: "",
          medicalCondition: "",
          boardId: "",
          deviceName: "ไมค์หัวเตียง",
        });
      } else {
        alert("เกิดข้อผิดพลาด: " + data.error);
      }
    } catch {
      alert("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ Backend ได้");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      {/* หัวหน้า */}
      <div className="mb-6 min-w-0">
        <p className="text-xs font-semibold text-[var(--tb-muted)]">ผู้ป่วย</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--tb-text)]">
          ลงทะเบียนผู้ป่วย
        </h1>
        <p className="mt-1 text-sm font-medium text-[var(--tb-muted)]">
          สร้าง QR Code สำหรับบอร์ด หรือลงทะเบียนผู้ป่วยพร้อมผูกอุปกรณ์
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ส่วนที่ 1: ข้อมูลผู้ป่วย */}
        <section
          aria-labelledby="section-patient"
          className={cardClass}
        >
          <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--tb-border)]">
            <span
              aria-hidden="true"
              className="inline-flex shrink-0 items-center justify-center w-9 h-9 rounded-[var(--tb-radius)] bg-[var(--tb-primary-tint)] text-[var(--tb-primary-text)]"
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
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            <h2
              id="section-patient"
              className="text-base font-semibold text-[var(--tb-text)]"
            >
              ข้อมูลผู้ป่วย
            </h2>
            {scannedMAC && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold bg-[var(--tb-success-tint)] text-[var(--tb-success-text)] animate-pulse">
                QR
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 p-5">
            <div className="min-w-0">
              <label htmlFor="patientName" className={labelClass}>
                ชื่อ-นามสกุล
              </label>
              <input
                id="patientName"
                type="text"
                name="patientName"
                value={formData.patientName}
                onChange={handleChange}
                required
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4 min-w-0">
              <div className="min-w-0">
                <label htmlFor="age" className={labelClass}>
                  อายุ (ปี)
                </label>
                <input
                  id="age"
                  type="number"
                  name="age"
                  value={formData.age}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="gender" className={labelClass}>
                  เพศ
                </label>
                <div className="relative">
                  <select
                    id="gender"
                    name="gender"
                    value={formData.gender}
                    onChange={handleChange}
                    className={`${inputClass} appearance-none pr-9 cursor-pointer`}
                  >
                    <option value="ชาย">ชาย</option>
                    <option value="หญิง">หญิง</option>
                    <option value="อื่นๆ">อื่นๆ</option>
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

            <div className="min-w-0">
              <label htmlFor="roomNumber" className={labelClass}>
                หมายเลขห้อง
              </label>
              <input
                id="roomNumber"
                type="text"
                name="roomNumber"
                value={formData.roomNumber}
                onChange={handleChange}
                required
                placeholder="เช่น 101A"
                className={inputClass}
              />
            </div>

            <div className="md:col-span-2 min-w-0">
              <label htmlFor="medicalCondition" className={labelClass}>
                โรคประจำตัว (ถ้ามี)
              </label>
              <input
                id="medicalCondition"
                type="text"
                name="medicalCondition"
                value={formData.medicalCondition}
                onChange={handleChange}
                placeholder="เช่น ความดัน, เบาหวาน"
                className={inputClass}
              />
            </div>
          </div>
        </section>

        {/* ส่วนที่ 2: ข้อมูลอุปกรณ์ ESP32 */}
        <section
          aria-labelledby="section-device"
          className={cardClass}
        >
          <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--tb-border)]">
            <span
              aria-hidden="true"
              className="inline-flex shrink-0 items-center justify-center w-9 h-9 rounded-[var(--tb-radius)] bg-[var(--tb-success-tint)] text-[var(--tb-success-text)]"
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
                <circle cx="12" cy="12" r="2" />
                <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
              </svg>
            </span>
            <h2
              id="section-device"
              className="text-base font-semibold text-[var(--tb-text)]"
            >
              ผูกอุปกรณ์ EVR Sensor
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 p-5">
            <div className="min-w-0">
              <label htmlFor="boardId" className={labelClass}>
                รหัสบอร์ด (MAC Address)
              </label>
              <input
                id="boardId"
                type="text"
                name="boardId"
                value={formData.boardId}
                onChange={handleChange}
                required
                placeholder="เช่น AA:BB:CC:DD:EE:FF"
                className={`${inputClass} uppercase font-mono tracking-wider`}
              />
            </div>

            <div className="min-w-0">
              <label htmlFor="deviceName" className={labelClass}>
                จุดติดตั้งอุปกรณ์
              </label>
              <input
                id="deviceName"
                type="text"
                name="deviceName"
                value={formData.deviceName}
                onChange={handleChange}
                required
                className={inputClass}
              />
            </div>
          </div>
        </section>

        {/* ปุ่ม Submit */}
        <div className="flex justify-end">
          {/* กันกดซ้ำระหว่างส่ง ไม่งั้นได้ผู้ป่วยซ้ำ 2 รายการ */}
          <button
            type="submit"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            className={`${btnPrimary} w-full sm:w-auto disabled:opacity-60 disabled:cursor-not-allowed`}
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
              <path d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            {isSubmitting ? "กำลังบันทึก..." : "บันทึกข้อมูลเข้าระบบ"}
          </button>
        </div>
      </form>
    </div>
  );
}

// คลาสที่ใช้ซ้ำในหน้านี้ — Tailwind + ตัวแปร --tb-* ตามแบบหน้า patients
const cardClass =
  "rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-card)]";
const labelClass = "block mb-1.5 text-sm font-semibold text-[var(--tb-text)]";
const inputClass =
  "block w-full h-10 px-3 rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface)] text-sm text-[var(--tb-text)] placeholder:text-[var(--tb-placeholder)] shadow-[var(--tb-shadow-xs)] transition-colors focus:outline-none focus:border-[var(--tb-primary)] focus:ring-4 focus:ring-[var(--tb-primary-ring)]";
const btnPrimary =
  "inline-flex items-center justify-center gap-2 h-11 px-5 rounded-[var(--tb-radius)] bg-[var(--tb-primary)] text-base font-semibold text-[var(--tb-primary-contrast)] shadow-[var(--tb-shadow-xs)] hover:bg-[var(--tb-primary-hover)] transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]";

export default function DeviceRegistrationPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-3xl mx-auto px-4 py-20 flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[var(--tb-border)] border-t-[var(--tb-primary)] animate-spin" />
          <p className="text-sm text-[var(--tb-muted)]">กำลังโหลดข้อมูล...</p>
        </div>
      }
    >
      <RegistrationFormContent />
    </Suspense>
  );
}
