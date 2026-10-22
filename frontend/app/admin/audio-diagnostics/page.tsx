"use client";

import { useCallback, useEffect, useState } from "react";
import MicLevelIndicator, { MIC_LABELS } from "@/components/MicLevelIndicator";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { authHeaders } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

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
  // ระดับสัญญาณของไมค์ 2 ตัว (0-1) — backend ยังไม่ส่งฟิลด์นี้ ต้องรอให้อุปกรณ์
  // ส่งเสียง 2 ช่องแยกกันก่อน แล้วฝั่ง AI คำนวณระดับของแต่ละช่องส่งต่อมา
  mic_levels?: number[];
};

// ข้อมูลตัวอย่างสำหรับดูหน้าตาระหว่างพัฒนา — ปุ่มเปิดมีเฉพาะตอน development
const MOCK_ROWS: DiagnosticRow[] = [
  {
    id: -1,
    created_at: new Date().toISOString(),
    device_mac: "AA:BB:CC:DD:EE:01",
    patient_name: "นายสมชาย ใจดี",
    room_number: "A-301",
    confidence: 0.87,
    decibel_level: 72.4,
    audio_url: "/api/audio/emergency_001.wav",
    status: "pending",
    mic_levels: [0.82, 0.64],
  },
  {
    id: -2,
    created_at: new Date(Date.now() - 300000).toISOString(),
    device_mac: "AA:BB:CC:DD:EE:02",
    patient_name: "นางสาวมานี สุขใจ",
    room_number: "B-205",
    confidence: 0.65,
    decibel_level: 68.1,
    audio_url: "/api/audio/emergency_002.wav",
    status: "resolved",
  },
];

const hasLevels = (r: DiagnosticRow) =>
  Array.isArray(r.mic_levels) && r.mic_levels.length >= MIC_LABELS.length;

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

const badgeClass =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums border border-[var(--tb-border)] bg-[var(--tb-surface-2)] text-[var(--tb-text)]";

export default function AudioDiagnosticsPage() {
  const { isAdmin, isChecking } = useAdminGuard();

  const [rows, setRows] = useState<DiagnosticRow[]>([]);
  const [useMockData, setUseMockData] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // ทุก setState อยู่หลัง await — เรียกจาก effect ได้โดยไม่ setState แบบ synchronous
  const fetchRows = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/alerts/history`, {
        method: "GET",
        headers: authHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
      });
      if (!res.ok) {
        setLoadError(`ดึงข้อมูลไม่สำเร็จ (HTTP ${res.status})`);
        setRows([]);
        return;
      }
      const data = await res.json();
      setLoadError("");
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setLoadError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง");
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    // fetchRows แตะ state หลัง await ทั้งหมด แต่ตัวกฎมองเข้าไปในฟังก์ชันไม่ได้ — ปิดเฉพาะบรรทัดนี้
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRows();
  }, [isAdmin, fetchRows]);

  const reload = () => {
    setIsLoading(true);
    fetchRows();
  };

  // ระหว่างรอผลตรวจสิทธิ์ อย่าเพิ่งวาดอะไรที่เป็นข้อมูลฝั่ง admin
  if (isChecking) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--tb-border)] border-t-[var(--tb-primary)] animate-spin" />
        <p className="text-sm text-[var(--tb-muted)]">กำลังตรวจสอบสิทธิ์ผู้ดูแลระบบ...</p>
      </div>
    );
  }

  // ไม่ผ่านด่าน — useAdminGuard สั่ง redirect ไปแล้ว ไม่ต้องวาดอะไรทับ
  if (!isAdmin) return null;

  const displayRows = useMockData ? MOCK_ROWS : rows;
  const missingLevels = displayRows.filter((r) => !hasLevels(r)).length;

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      {/* ---------- หัวหน้า ---------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--tb-muted)]">ผู้ดูแลระบบ</p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--tb-text)]">วิเคราะห์สัญญาณเสียง</h1>
          <p className="mt-1 text-sm font-medium text-[var(--tb-muted)]">
            ระดับสัญญาณของไมโครโฟนทั้ง 2 ตัวในแต่ละเหตุการณ์
            ใช้ตรวจสอบว่าอุปกรณ์รับเสียงได้ครบและสมดุลหรือไม่
          </p>
        </div>

        <div className="flex flex-wrap gap-2 sm:gap-3">
          {process.env.NODE_ENV === "development" && (
            <button
              type="button"
              onClick={() => setUseMockData(!useMockData)}
              aria-pressed={useMockData}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface)] text-sm font-semibold text-[var(--tb-text)] shadow-[var(--tb-shadow-xs)] hover:bg-[var(--tb-surface-2)] transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]"
            >
              <span
                aria-hidden="true"
                className={`w-2 h-2 rounded-full ${useMockData ? "bg-[var(--tb-warning)]" : "bg-[var(--tb-success)]"}`}
              />
              {useMockData ? "ข้อมูลตัวอย่าง: เปิด" : "ข้อมูลตัวอย่าง: ปิด"}
            </button>
          )}
          {!useMockData && (
            <button
              type="button"
              onClick={reload}
              disabled={isLoading}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface)] text-sm font-semibold text-[var(--tb-text)] shadow-[var(--tb-shadow-xs)] hover:bg-[var(--tb-surface-2)] transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]"
            >
              <svg className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <path d="M21 3v6h-6" />
              </svg>
              {isLoading ? "กำลังโหลด..." : "โหลดใหม่"}
            </button>
          )}
        </div>
      </div>

      {/* ---------- ยังไม่มีข้อมูลระดับสัญญาณ ---------- */}
      {missingLevels > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-[var(--tb-radius-lg)] border border-[var(--tb-warning)]/30 bg-[var(--tb-warning-tint)] p-4">
          <svg className="w-5 h-5 shrink-0 mt-0.5 text-[var(--tb-warning-text)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
          <div className="text-sm leading-relaxed text-[var(--tb-warning-text)]">
            <p className="font-semibold">มี {missingLevels} เหตุการณ์ที่ยังไม่มีข้อมูลระดับสัญญาณแยกไมค์</p>
            <p className="mt-0.5">
              ระบบจะแสดงค่านี้เมื่ออุปกรณ์ส่งเสียง 2 ช่องแยกกัน
              และเซิร์ฟเวอร์ส่งค่า <code className="font-mono">mic_levels</code> มากับเหตุการณ์
            </p>
          </div>
        </div>
      )}

      {/* ---------- ข้อผิดพลาดตอนดึงข้อมูล ---------- */}
      {!useMockData && loadError && (
        <div role="alert" className="mb-6 rounded-[var(--tb-radius-lg)] border border-[var(--tb-danger)]/25 bg-[var(--tb-danger-tint)] p-4 text-sm font-medium text-[var(--tb-danger-text)]">
          {loadError}
        </div>
      )}

      {/* ---------- รายการเหตุการณ์ ---------- */}
      {!useMockData && isLoading ? (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="h-40 rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface)] animate-pulse" />
          ))}
        </div>
      ) : displayRows.length === 0 ? (
        <div className="flex flex-col items-center text-center px-6 py-12 rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-card)]">
          <span className="inline-flex items-center justify-center w-12 h-12 mb-3 rounded-full bg-[var(--tb-primary-tint)] text-[var(--tb-primary-text)]">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          </span>
          <p className="text-base font-semibold text-[var(--tb-text)]">ยังไม่มีเหตุการณ์ให้วิเคราะห์</p>
          <p className="mt-1 text-sm text-[var(--tb-muted)]">เมื่อระบบตรวจพบเสียงขอความช่วยเหลือ เหตุการณ์จะแสดงที่นี่</p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayRows.map((row) => {
            const levels = hasLevels(row) ? (row.mic_levels as number[]) : null;
            const maxLevel = levels ? Math.max(...levels.slice(0, MIC_LABELS.length)) : 0;
            const maxIndex = levels ? levels.indexOf(maxLevel) : -1;

            return (
              <article
                key={row.id}
                className="rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-card)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 border-b border-[var(--tb-border)]">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-[var(--tb-text)]">
                      {row.patient_name || "ไม่ทราบชื่อผู้ป่วย"}
                      <span className="ml-2 text-sm font-medium text-[var(--tb-muted)]">
                        ห้อง {row.room_number || "—"}
                      </span>
                    </p>
                    <p className="mt-0.5 text-sm text-[var(--tb-muted)]">
                      <span className="font-mono">{row.device_mac || "—"}</span> · {formatTime(row.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={badgeClass}>ความมั่นใจ {Math.round((row.confidence || 0) * 100)}%</span>
                    <span className={badgeClass}>{(row.decibel_level || 0).toFixed(1)} dB</span>
                  </div>
                </div>

                <div className="p-5">
                  {levels ? (
                    <>
                      <MicLevelIndicator levels={levels} compact={false} />
                      <p className="mt-4 text-sm text-[var(--tb-muted)]">
                        ไมค์ที่รับเสียงดังที่สุด:{" "}
                        <span className="font-semibold text-[var(--tb-success-text)]">
                          {MIC_LABELS[maxIndex]} ({Math.round(maxLevel * 100)}%)
                        </span>
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-[var(--tb-muted)]">ยังไม่มีข้อมูลระดับสัญญาณของเหตุการณ์นี้</p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
