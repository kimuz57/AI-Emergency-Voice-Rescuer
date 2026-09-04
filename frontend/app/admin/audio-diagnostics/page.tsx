"use client";

import { useState } from "react";
import Link from "next/link";
import MicLevelIndicator from "@/components/MicLevelIndicator";
import { useAdminGuard } from "@/hooks/useAdminGuard";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const getAuthToken = () => {
  if (typeof window === "undefined") return "";
  const fromStorage = localStorage.getItem("token");
  if (fromStorage) return fromStorage;
  const match = document.cookie.match(/(?:^|; )token_public=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
};

// รูปร่างเดียวกับ models.HistoryResponse ฝั่ง Go + mic_levels ที่ยังรอเพิ่ม
type DiagnosticRow = {
  id: number;
  created_at: string;
  device_mac: string;
  patient_name: string;
  room_number: string;
  confidence: number;
  decibel_level: number;
  audio_url: string;
  status: string;
  mic_levels?: number[]; // ⏳ Backend ยังไม่ส่งฟิลด์นี้ (รอกิตเพิ่มใน Alert model)
};

// ข้อมูลตัวอย่างสำหรับพัฒนา UI ระหว่างรอ backend — ชุดเดียวกับที่ dashboard เคยใช้
const MOCK_ROWS: DiagnosticRow[] = [
  {
    id: 1,
    created_at: new Date().toISOString(),
    device_mac: "AA:BB:CC:DD:EE:01",
    patient_name: "นายสมชาย ใจดี",
    room_number: "A-301",
    confidence: 0.87,
    decibel_level: 72.4,
    audio_url: "/api/audio/emergency_001.wav",
    status: "pending",
    mic_levels: [0.8, 0.95, 0.65, 0.45],
  },
  {
    id: 2,
    created_at: new Date(Date.now() - 300000).toISOString(),
    device_mac: "AA:BB:CC:DD:EE:02",
    patient_name: "นางสาวมานี สุขใจ",
    room_number: "B-205",
    confidence: 0.65,
    decibel_level: 68.1,
    audio_url: "/api/audio/emergency_002.wav",
    status: "resolved",
    mic_levels: [0.45, 0.55, 0.92, 0.6],
  },
];

const MIC_LABELS = ["ไมค์ 1", "ไมค์ 2", "ไมค์ 3", "ไมค์ 4"];

const formatTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function AudioDiagnosticsPage() {
  const { isAdmin, isChecking } = useAdminGuard();

  const [rows, setRows] = useState<DiagnosticRow[]>([]);
  const [useMockData, setUseMockData] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  // เรียกจาก event handler เท่านั้น (สลับ toggle / กดโหลดใหม่)
  // ไม่เรียกใน useEffect เพราะค่าเริ่มต้นคือใช้ mock — ยังไม่ต้องยิง API ตอน mount
  const fetchRows = async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/api/alerts/history`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
      });

      if (!res.ok) {
        setLoadError(`ดึงข้อมูลไม่สำเร็จ (HTTP ${res.status})`);
        setRows([]);
        return;
      }

      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setLoadError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง");
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  };

  // ระหว่างรอผลตรวจสิทธิ์ อย่าเพิ่งวาดอะไรที่เป็นข้อมูลฝั่ง admin
  if (isChecking) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-indigo-600 rounded-full animate-spin" />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          กำลังตรวจสอบสิทธิ์ผู้ดูแลระบบ...
        </p>
      </div>
    );
  }

  // ไม่ผ่านด่าน — useAdminGuard สั่ง redirect ไปแล้ว ไม่ต้องวาดอะไรทับ
  if (!isAdmin) return null;

  const displayRows = useMockData ? MOCK_ROWS : rows;
  const withLevels = displayRows.filter(
    (r) => Array.isArray(r.mic_levels) && r.mic_levels.length === 4,
  );
  const missingLevels = displayRows.length - withLevels.length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* ---------- Header ---------- */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 text-[10px] font-bold uppercase tracking-widest">
              Admin
            </span>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              เฉพาะผู้ดูแลระบบ
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
            วิเคราะห์สัญญาณเสียง
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            ระดับสัญญาณของไมโครโฟนทั้ง 4 ตัวในแต่ละเหตุการณ์
            ใช้ตรวจสอบว่าอุปกรณ์รับเสียงได้ครบและสมดุลหรือไม่
          </p>
        </div>

        <Link
          href="/dashboard"
          className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          ← กลับหน้าแดชบอร์ด
        </Link>
      </div>

      {/* ---------- แถบควบคุมแหล่งข้อมูล ---------- */}
      <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={useMockData}
            onChange={(e) => {
              const next = e.target.checked;
              setUseMockData(next);
              // สลับมาโหมดข้อมูลจริงเมื่อไหร่ ค่อยยิง API
              if (!next) fetchRows();
            }}
            className="w-4 h-4 accent-indigo-600"
          />
          ใช้ข้อมูลตัวอย่าง (สำหรับพัฒนา UI)
        </label>

        {!useMockData && (
          <button
            type="button"
            onClick={fetchRows}
            disabled={isLoading}
            className="ml-auto px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            {isLoading ? "กำลังโหลด..." : "โหลดใหม่"}
          </button>
        )}
      </div>

      {/* ---------- แจ้งเตือน: backend ยังไม่ส่ง mic_levels ---------- */}
      {missingLevels > 0 && (
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/40 rounded-2xl p-4 flex items-start gap-3">
          <svg
            className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400"
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
          <div className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
            <p className="font-bold mb-0.5">
              มี {missingLevels} เหตุการณ์ที่ยังไม่มีข้อมูลระดับสัญญาณไมค์
            </p>
            <p>
              ตอนนี้ Backend ยังไม่ส่งฟิลด์{" "}
              <code className="font-mono">mic_levels</code> มากับข้อมูลเหตุการณ์
              — รอเพิ่มใน Alert model และให้ DSP pipeline
              ส่งค่าไมค์ทั้ง 4 ตัวมาด้วย
            </p>
          </div>
        </div>
      )}

      {/* ---------- ข้อผิดพลาดตอนดึงข้อมูล ---------- */}
      {loadError && (
        <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/40 rounded-2xl p-4">
          <p className="text-xs font-medium text-rose-700 dark:text-rose-300">
            {loadError}
          </p>
        </div>
      )}

      {/* ---------- รายการเหตุการณ์ ---------- */}
      {withLevels.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-12 text-center">
          <p className="text-4xl mb-3">🎤</p>
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            ยังไม่มีข้อมูลระดับสัญญาณให้แสดง
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            ติ๊ก &quot;ใช้ข้อมูลตัวอย่าง&quot;
            เพื่อดูหน้าตาของหน้านี้ระหว่างรอ Backend
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {withLevels.map((row) => {
            const levels = row.mic_levels as number[];
            const maxLevel = Math.max(...levels);
            const maxIndex = levels.indexOf(maxLevel);

            return (
              <div
                key={row.id}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-4"
              >
                {/* หัวการ์ด */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-slate-800 dark:text-white">
                      {row.patient_name || "ไม่ทราบชื่อผู้ป่วย"}
                      <span className="ml-2 text-xs font-medium text-slate-400 dark:text-slate-500">
                        ห้อง {row.room_number || "—"}
                      </span>
                    </p>
                    <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
                      {row.device_mac || "—"} · {formatTime(row.created_at)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold tabular-nums">
                      ความมั่นใจ {Math.round((row.confidence || 0) * 100)}%
                    </span>
                    <span className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold tabular-nums">
                      {(row.decibel_level || 0).toFixed(1)} dB
                    </span>
                  </div>
                </div>

                {/* แถบสัญญาณ 4 ไมค์ (โหมดเต็ม ไม่ต้องพึ่ง tooltip) */}
                <div className="bg-slate-50 dark:bg-slate-700/40 border border-slate-200/60 dark:border-slate-600 rounded-xl p-4">
                  <MicLevelIndicator levels={levels} compact={false} />
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  ไมค์ที่รับเสียงดังที่สุด:{" "}
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {MIC_LABELS[maxIndex]} ({Math.round(maxLevel * 100)}%)
                  </span>
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
