"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const getAuthToken = () => {
  if (typeof window === "undefined") return "";
  const fromStorage = localStorage.getItem("token");
  if (fromStorage) return fromStorage;
  const match = document.cookie.match(/(?:^|; )token_public=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
};

// รูปร่างเดียวกับ models.HistoryResponse ฝั่ง Go
type HistoryRow = {
  id: number;
  created_at: string;
  patient_name: string;
  room_number: string;
  is_resolved: boolean;
};

const TH_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const TH_DAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function CalendarPage() {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [selected, setSelected] = useState<string>(() => ymd(new Date()));
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  // ทุก setState อยู่หลัง await ทั้งหมด — ถ้าเรียกจาก effect แล้ว setState
  // แบบ synchronous จะโดนกฎ react-hooks/set-state-in-effect ของ React 19
  const fetchMonth = useCallback(async (y: number, m: number) => {
    try {
      const from = ymd(new Date(y, m, 1));
      const to = ymd(new Date(y, m + 1, 0));
      const token = getAuthToken();
      const res = await fetch(
        `${API_URL}/api/alerts/history?from=${from}&to=${to}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: "include",
        },
      );
      if (!res.ok) {
        setLoadError(`ดึงข้อมูลไม่สำเร็จ (HTTP ${res.status})`);
        setRows([]);
        return;
      }
      const data = await res.json();
      setLoadError("");
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setLoadError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
      setRows([]);
    } finally {
      setHasLoaded(true);
    }
  }, []);

  useEffect(() => {
    // fetchMonth แตะ state หลัง await ทั้งหมดแล้ว แต่ตัวกฎมองทะลุเข้าไปใน
    // ฟังก์ชันไม่ได้เลยยังเตือนอยู่ — ปิดเฉพาะบรรทัดนี้
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMonth(year, month);
  }, [year, month, fetchMonth]);

  // นับจำนวนเหตุการณ์ต่อวัน เพื่อระบายความเข้มบนช่องปฏิทิน
  const byDay = useMemo(() => {
    const map = new Map<string, HistoryRow[]>();
    for (const r of rows) {
      const d = new Date(r.created_at);
      if (Number.isNaN(d.getTime())) continue;
      const key = ymd(d);
      const list = map.get(key);
      if (list) list.push(r);
      else map.set(key, [r]);
    }
    return map;
  }, [rows]);

  // ช่องว่างหน้าวันที่ 1 ให้ตรงกับวันในสัปดาห์
  const cells = useMemo(() => {
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out: (number | null)[] = Array(firstWeekday).fill(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(d);
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [year, month]);

  const move = (delta: number) => setCursor(new Date(year, month + delta, 1));

  const selectedRows = byDay.get(selected) ?? [];
  const monthTotal = rows.length;

  // คลาสที่ใช้ซ้ำในหน้านี้ — Tailwind + ตัวแปร --tb-* ตามแบบหน้า patients
  const card =
    "rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-card)]";
  const btnSecondary =
    "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface)] text-sm font-semibold text-[var(--tb-text)] shadow-[var(--tb-shadow-xs)] hover:bg-[var(--tb-surface-2)] transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]";
  const iconBtn =
    "inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface)] text-[var(--tb-text)] shadow-[var(--tb-shadow-xs)] hover:bg-[var(--tb-surface-2)] transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]";

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      {/* ---------- หัวหน้า ---------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--tb-muted)]">ประวัติ</p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--tb-text)]">ปฏิทินเหตุการณ์</h1>
          <p className="mt-1 text-sm font-medium text-[var(--tb-muted)]">
            ดูว่าเดือนไหนวันไหนมีการแจ้งเตือนบ้าง กดที่วันเพื่อดูรายการของวันนั้น
          </p>
        </div>
        <Link href="/history" className={`${btnSecondary} self-start sm:self-auto`}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
          ดูแบบรายการ
        </Link>
      </div>

      {loadError && (
        <div role="alert" className="mb-6 rounded-[var(--tb-radius-lg)] border border-[var(--tb-danger)]/25 bg-[var(--tb-danger-tint)] p-4 text-sm font-medium text-[var(--tb-danger-text)]">
          {loadError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        {/* ---------- ตารางปฏิทิน ---------- */}
        <div className={card}>
          {/* ---------- ตัวควบคุมเดือน ---------- */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--tb-border)]">
            <button
              type="button"
              onClick={() => move(-1)}
              aria-label="เดือนก่อนหน้า"
              className={iconBtn}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>

            <div className="text-center min-w-0" aria-live="polite">
              <p className="text-base sm:text-lg font-bold text-[var(--tb-text)]">
                {TH_MONTHS[month]} {year + 543}
              </p>
              <p className="text-xs font-medium text-[var(--tb-muted)] mt-0.5">
                {hasLoaded ? `${monthTotal} เหตุการณ์ในเดือนนี้` : "กำลังโหลด..."}
              </p>
            </div>

            <button
              type="button"
              onClick={() => move(1)}
              aria-label="เดือนถัดไป"
              className={iconBtn}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          <div className="p-2 sm:p-4">
            <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-1">
              {TH_DAYS.map((d) => (
                <div key={d} className="text-center text-xs font-semibold text-[var(--tb-muted)] py-1.5">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {cells.map((day, i) => {
                if (day === null) return <div key={`pad-${i}`} />;

                const key = ymd(new Date(year, month, day));
                const count = byDay.get(key)?.length ?? 0;
                const isToday = key === ymd(today);
                const isSelected = key === selected;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelected(key)}
                    aria-current={isSelected ? "date" : undefined}
                    className={`relative aspect-square rounded-[var(--tb-radius)] border flex flex-col items-center justify-center gap-1 text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)] ${
                      isSelected
                        ? "border-[var(--tb-primary)] bg-[var(--tb-primary)] text-[var(--tb-primary-contrast)] font-bold"
                        : isToday
                          ? "border-[var(--tb-primary)]/40 bg-[var(--tb-primary-tint)] text-[var(--tb-primary-text)] font-semibold hover:bg-[var(--tb-surface-2)]"
                          : "border-transparent text-[var(--tb-text)] hover:border-[var(--tb-border)] hover:bg-[var(--tb-surface-2)]"
                    }`}
                  >
                    <span className={isToday ? "underline underline-offset-4" : ""}>{day}</span>
                    {count > 0 && (
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isSelected ? "bg-[var(--tb-primary-contrast)]" : "bg-[var(--tb-danger)]"
                        }`}
                        title={`${count} เหตุการณ์`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ---------- รายการของวันที่เลือก ---------- */}
        <div className={card}>
          <div className="px-5 py-4 border-b border-[var(--tb-border)]">
            <p className="text-xs font-semibold text-[var(--tb-muted)]">วันที่เลือก</p>
            <p className="mt-0.5 text-base font-semibold text-[var(--tb-text)]">
              เหตุการณ์วันที่ {selected.split("-").reverse().join("/")}
            </p>
          </div>

          {selectedRows.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <span className="inline-flex items-center justify-center w-10 h-10 mb-2 rounded-full bg-[var(--tb-surface-2)] text-[var(--tb-muted)]">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </span>
              <p className="text-sm text-[var(--tb-muted)]">ไม่มีเหตุการณ์ในวันนี้</p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--tb-border)]">
              {selectedRows.map((r) => (
                <li key={r.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--tb-text)]">
                      {r.patient_name || "ไม่ทราบชื่อผู้ป่วย"}
                      <span className="ml-2 text-xs font-medium text-[var(--tb-muted)]">
                        ห้อง {r.room_number || "—"}
                      </span>
                    </p>
                    <p className="text-xs text-[var(--tb-muted)] mt-0.5 tabular-nums">
                      {new Date(r.created_at).toLocaleTimeString("th-TH", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })} น.
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      r.is_resolved
                        ? "bg-[var(--tb-success-tint)] text-[var(--tb-success-text)]"
                        : "bg-[var(--tb-danger-tint)] text-[var(--tb-danger-text)]"
                    }`}
                  >
                    {r.is_resolved ? "รับทราบแล้ว" : "ยังไม่รับทราบ"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
