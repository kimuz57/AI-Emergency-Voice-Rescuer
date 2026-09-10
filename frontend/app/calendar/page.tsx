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

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold neu-text">ปฏิทินเหตุการณ์</h1>
          <p className="text-sm neu-text-muted mt-1">
            ดูว่าเดือนไหนวันไหนมีการแจ้งเตือนบ้าง กดที่วันเพื่อดูรายการของวันนั้น
          </p>
        </div>
        <Link href="/history" className="neu-btn px-4 py-2.5 text-sm font-medium">
          ดูแบบรายการ
        </Link>
      </div>

      {/* ---------- ตัวควบคุมเดือน ---------- */}
      <div className="neu-card p-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => move(-1)}
          aria-label="เดือนก่อนหน้า"
          className="neu-icon-btn p-2.5"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div className="text-center">
          <p className="text-lg font-bold neu-text">
            {TH_MONTHS[month]} {year + 543}
          </p>
          <p className="text-xs neu-text-muted mt-0.5">
            {hasLoaded ? `${monthTotal} เหตุการณ์ในเดือนนี้` : "กำลังโหลด..."}
          </p>
        </div>

        <button
          type="button"
          onClick={() => move(1)}
          aria-label="เดือนถัดไป"
          className="neu-icon-btn p-2.5"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {loadError && (
        <div className="neu-inset p-4">
          <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{loadError}</p>
        </div>
      )}

      {/* ---------- ตารางปฏิทิน ---------- */}
      <div className="neu-card p-4">
        <div className="grid grid-cols-7 gap-2 mb-2">
          {TH_DAYS.map((d) => (
            <div key={d} className="text-center text-[11px] font-bold neu-text-muted uppercase tracking-wide py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
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
                className={`relative aspect-square rounded-xl flex flex-col items-center justify-center gap-1 text-sm transition-all ${
                  isSelected ? "neu-inset-sm neu-text-accent font-bold" : "neu-card-sm neu-text"
                }`}
              >
                <span className={isToday ? "underline underline-offset-4" : ""}>{day}</span>
                {count > 0 && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-rose-500"
                    title={`${count} เหตุการณ์`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------- รายการของวันที่เลือก ---------- */}
      <div className="neu-card p-5 space-y-3">
        <p className="text-sm font-bold neu-text">
          เหตุการณ์วันที่ {selected.split("-").reverse().join("/")}
        </p>

        {selectedRows.length === 0 ? (
          <p className="text-sm neu-text-muted">ไม่มีเหตุการณ์ในวันนี้</p>
        ) : (
          <div className="space-y-2">
            {selectedRows.map((r) => (
              <div key={r.id} className="neu-inset-sm p-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold neu-text">
                    {r.patient_name || "ไม่ทราบชื่อผู้ป่วย"}
                    <span className="ml-2 text-xs font-medium neu-text-muted">
                      ห้อง {r.room_number || "—"}
                    </span>
                  </p>
                  <p className="text-[11px] neu-text-muted mt-0.5">
                    {new Date(r.created_at).toLocaleTimeString("th-TH", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })} น.
                  </p>
                </div>
                <span
                  className={`text-[11px] font-bold px-3 py-1 rounded-full ${
                    r.is_resolved
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {r.is_resolved ? "รับทราบแล้ว" : "ยังไม่รับทราบ"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
