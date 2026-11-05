"use client";
/* eslint-disable react-hooks/set-state-in-effect, @typescript-eslint/no-explicit-any */
import { useEffect, useState, useRef, useSyncExternalStore } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import WaveformAudioPlayer from "@/components/WaveformAudioPlayer";
import { authHeaders } from "@/lib/auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type DetectionLogResponse = {
  id: number;
  created_at: string;
  device_mac: string;
  event_type: string;
  confidence: number;
  decibel_level: number;
  is_resolved: boolean;
  audio_url: string;
  status: string;
  patient_name: string;
  room_number: string;
};

type StatItem = {
  label: string;
  count: number;
};

type StatsResponse = {
  daily: StatItem[];
  hourly: StatItem[];
  monthly: StatItem[];
  summary: {
    today: number;
    this_week: number;
    this_month: number;
    unresolved: number;
    total: number;
  };
};

// อ่านว่าจอแคบไหมโดยไม่ใช้ effect — snapshot ฝั่ง server คืน false เสมอ
// จึงไม่เกิด hydration mismatch และไม่ชนกฎ set-state-in-effect ของ React 19
const MOBILE_QUERY = "(max-width: 767px)";
const subscribeToWidth = (onChange: () => void) => {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};
const useIsNarrow = () =>
  useSyncExternalStore(
    subscribeToWidth,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );

export default function HistoryPage() {
  const [activeTab, setActiveTab] = useState<"calendar" | "analytics">(
    "calendar",
  );
  const [historyEvents, setHistoryEvents] = useState<DetectionLogResponse[]>(
    [],
  );
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [selectedEvent, setSelectedEvent] =
    useState<DetectionLogResponse | null>(null);

  const calendarRef = useRef<FullCalendar>(null);

  const isNarrow = useIsNarrow();

  const handleDateJump = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    if (newDate && calendarRef.current) {
      calendarRef.current.getApi().gotoDate(newDate);
    }
  };

  const fetchHistoryAndStats = async () => {
    setLoading(true);
    try {
      const email = localStorage.getItem("userEmail");
      if (!email) return;

      // ดึงประวัติ (เอาเฉพาะ 6 เดือนล่าสุดให้ไม่หนักเกินไป)
      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setMonth(fromDate.getMonth() - 6);

      // วันที่ตามเวลาเครื่อง (ไทย) — toISOString() เป็น UTC ช่วง 00:00-07:00 จะได้ "เมื่อวาน" แล้วเหตุของวันนี้หาย
      const localDate = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const fromStr = localDate(fromDate);
      const toStr = localDate(toDate);

      const historyRes = await fetch(
        `${API_BASE_URL}/api/alerts/history?email=${encodeURIComponent(email)}&from=${fromStr}&to=${toStr}`,
        {
          credentials: "include",
          headers: authHeaders(),
        },
      );
      if (historyRes.ok) {
        const data = await historyRes.json();
        setHistoryEvents(data);
      }

      // ดึงสถิติ
      const statsRes = await fetch(
        `${API_BASE_URL}/api/alerts/stats?email=${encodeURIComponent(email)}&days=30`,
        {
          credentials: "include",
          headers: authHeaders(),
        },
      );
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch history data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistoryAndStats();
  }, []);

  const handleResolve = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/alerts/${id}/resolve`, {
        method: "PUT",
        credentials: "include",
        headers: authHeaders(),
      });
      if (res.ok) {
        // อัปเดต state ทันทีเพื่อไม่ต้องโหลดใหม่หมด
        setHistoryEvents((prev) =>
          prev.map((ev) =>
            ev.id === id
              ? { ...ev, status: "resolved", is_resolved: true }
              : ev,
          ),
        );
        if (selectedEvent && selectedEvent.id === id) {
          setSelectedEvent({
            ...selectedEvent,
            status: "resolved",
            is_resolved: true,
          });
        }
        // อัปเดต summary stat คร่าวๆ
        if (stats) {
          setStats({
            ...stats,
            summary: {
              ...stats.summary,
              unresolved: Math.max(0, stats.summary.unresolved - 1),
            },
          });
        }
      } else {
        alert("ปิดเหตุการณ์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      }
    } catch (error) {
      console.error("Failed to resolve alert", error);
      alert("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง");
    }
  };

  // แปลงข้อมูลให้ FullCalendar
  const calendarEvents = historyEvents.map((event) => ({
    id: String(event.id),
    title: `${event.patient_name} (${event.room_number})`,
    start: event.created_at,
    // สีเขียวถ้า resolved, สีแดงถ้า unresolved — อ่านจากตัวแปรธีม จึงเปลี่ยนตามโหมดมืดเอง
    backgroundColor: event.is_resolved ? "var(--tb-success)" : "var(--tb-danger)",
    borderColor: event.is_resolved ? "var(--tb-success)" : "var(--tb-danger)",
    extendedProps: event,
  }));

  const handleEventClick = (clickInfo: any) => {
    setSelectedEvent(clickInfo.event.extendedProps as DetectionLogResponse);
  };

  // คลาสที่ใช้ซ้ำในหน้านี้ — Tailwind + ตัวแปร --tb-* ตามแบบหน้า patients / dashboard
  const card =
    "rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-card)]";
  const tabBtn =
    "whitespace-nowrap inline-flex items-center justify-center gap-2 h-9 min-h-[44px] sm:min-h-0 px-3 sm:px-4 rounded-[calc(var(--tb-radius)-2px)] text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]";
  const tabActive =
    "bg-[var(--tb-surface)] text-[var(--tb-text)] shadow-[var(--tb-shadow-xs)] border border-[var(--tb-border)]";
  const tabIdle =
    "border border-transparent text-[var(--tb-muted)] hover:text-[var(--tb-text)]";
  const btnPrimary =
    "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-[var(--tb-radius)] bg-[var(--tb-primary)] text-sm font-semibold text-[var(--tb-primary-contrast)] shadow-[var(--tb-shadow-xs)] hover:bg-[var(--tb-primary-hover)] transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]";

  // ทูลทิปของกราฟ — อ่านสีจากธีม จึงอ่านออกทั้งโหมดสว่างและมืด
  const tooltipStyle = {
    borderRadius: "var(--tb-radius)",
    border: "1px solid var(--tb-border)",
    background: "var(--tb-surface)",
    color: "var(--tb-text)",
    boxShadow: "var(--tb-shadow-pop)",
    fontSize: "0.8125rem",
  };
  const axisTick = { fontSize: 12, fill: "var(--tb-muted)" };

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      {/* หัวหน้า */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--tb-muted)]">ประวัติ</p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--tb-text)]">
            ประวัติและสถิติเหตุการณ์
          </h1>
          <p className="mt-1 text-sm font-medium text-[var(--tb-muted)]">
            ดูประวัติการขอความช่วยเหลือย้อนหลังและวิเคราะห์แนวโน้ม
          </p>
        </div>

        {/* สลับมุมมอง */}
        <div className="flex w-full sm:w-auto shrink-0 gap-1 p-1 rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface-2)]">
          <button
            type="button"
            onClick={() => setActiveTab("calendar")}
            aria-pressed={activeTab === "calendar"}
            className={`${tabBtn} flex-1 sm:flex-none ${activeTab === "calendar" ? tabActive : tabIdle}`}
          >
            <svg className="hidden sm:block w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            ปฏิทิน (Calendar)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("analytics")}
            aria-pressed={activeTab === "analytics"}
            className={`${tabBtn} flex-1 sm:flex-none ${activeTab === "analytics" ? tabActive : tabIdle}`}
          >
            <svg className="hidden sm:block w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            สถิติ (Analytics)
          </button>
        </div>
      </div>

      {loading ? (
        <div className={`${card} min-h-[400px] flex items-center justify-center`}>
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-[var(--tb-border)] border-t-[var(--tb-primary)] animate-spin" />
            <p className="text-sm text-[var(--tb-muted)]">
              กำลังโหลดข้อมูลประวัติ...
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Calendar View */}
          <div
            className={`transition-opacity duration-300 w-full max-w-full ${activeTab === "calendar" ? "block" : "hidden"}`}
          >
            <div className={`${card} w-full overflow-hidden`}>
              {/* ส่วนหัวของปฏิทิน (คำอธิบายสี และ ช่องค้นหาวันที่) */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-[var(--tb-border)]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-[var(--tb-danger-tint)] text-[var(--tb-danger-text)]">
                    <span aria-hidden="true" className="w-2 h-2 rounded-full bg-[var(--tb-danger)]" />
                    ยังไม่ช่วยเหลือ
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-[var(--tb-success-tint)] text-[var(--tb-success-text)]">
                    <span aria-hidden="true" className="w-2 h-2 rounded-full bg-[var(--tb-success)]" />
                    ช่วยเหลือแล้ว
                  </span>
                </div>

                {/* Date Picker */}
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <label
                    htmlFor="jumpDate"
                    className="text-sm font-semibold text-[var(--tb-muted)] whitespace-nowrap inline-flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    ค้นหาวันที่:
                  </label>
                  <input
                    type="date"
                    id="jumpDate"
                    onChange={handleDateJump}
                    className="w-full sm:w-auto min-w-0 h-10 min-h-[44px] sm:min-h-0 px-3 rounded-[var(--tb-radius)] border border-[var(--tb-border-strong)] bg-[var(--tb-surface)] text-sm text-[var(--tb-text)] shadow-[var(--tb-shadow-xs)] outline-none cursor-pointer transition [color-scheme:light] dark:[color-scheme:dark] focus:border-[var(--tb-primary)] focus:ring-4 focus:ring-[var(--tb-primary-ring)]"
                  />
                </div>
              </div>

              {/* คอนเทนเนอร์ปฏิทิน (overflow-x-auto ให้เลื่อนซ้ายขวาได้ในการ์ด ถ้าจอมือถือเล็กมาก) */}
              <div className="calendar-container w-full overflow-x-auto custom-scrollbar p-3 sm:p-5">
                <style
                  dangerouslySetInnerHTML={{
                    __html: `
                  .fc {
                    --fc-border-color: var(--tb-border);
                    --fc-page-bg-color: var(--tb-surface);
                    --fc-neutral-bg-color: var(--tb-surface-2);
                    --fc-neutral-text-color: var(--tb-muted);
                    --fc-list-event-hover-bg-color: var(--tb-surface-2);
                    --fc-today-bg-color: var(--tb-primary-tint);
                    color: var(--tb-text);
                  }
                  .fc-theme-standard th { padding: 8px 0; background-color: var(--tb-surface-2); font-weight: 600; font-size: 0.8125rem; color: var(--tb-muted); }
                  .fc a { color: inherit; }
                  .fc-daygrid-event { border-radius: 6px; padding: 2px 4px; font-size: 0.75rem; border: none !important; transition: filter 0.15s; cursor: pointer; }
                  .fc-daygrid-event:hover { filter: brightness(1.08); }
                  .fc-event-title { font-weight: 600; white-space: normal; line-height: 1.2; }
                  .fc-toolbar-title { font-size: 1.125rem !important; }
                  .fc-day-today .fc-daygrid-day-number { background-color: var(--tb-primary); color: var(--tb-primary-contrast); border-radius: 50%; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; margin: 4px; font-weight: 700; }
                  .fc-list-day-cushion { font-weight: 600; }

                  /* ตั้งค่าสำหรับจอมือถือ (Responsive) */
                  @media (max-width: 640px) {
                    /* จัด Toolbar ให้เรียงเป็นแนวตั้ง */
                    .fc-header-toolbar {
                      flex-direction: column !important;
                      gap: 0.75rem !important;
                      align-items: center !important;
                    }
                    /* บังคับปุ่มแต่ละกลุ่มให้อยู่ตรงกลางและห่อตัว (wrap) */
                    .fc-toolbar-chunk {
                      width: 100% !important;
                      display: flex !important;
                      justify-content: center !important;
                      flex-wrap: wrap !important;
                      gap: 0.25rem !important;
                    }
                    /* ย่อขนาดตัวอักษรของปุ่มลง */
                    .fc-button {
                      font-size: 0.8125rem !important;
                    }
                    .fc-toolbar-title {
                      font-size: 1rem !important;
                      text-align: center !important;
                    }
                    .fc-col-header-cell-cushion {
                      font-size: 0.75rem;
                    }
                    /* ตั้งค่าความกว้างตารางขั้นต่ำ (ถ้าจอเล็กกว่านี้ให้ใช้นิ้วปัดซ้ายขวาเอา) */
                    .fc-scrollgrid {
                      min-width: 500px !important;
                    }
                  }
                `,
                  }}
                />

                <FullCalendar
                  /* key บังคับ mount ใหม่ตอนข้ามจุดตัด เพราะ initialView
                     มีผลเฉพาะตอน mount ครั้งแรกเท่านั้น */
                  key={isNarrow ? "cal-narrow" : "cal-wide"}
                  ref={calendarRef}
                  plugins={[
                    dayGridPlugin,
                    timeGridPlugin,
                    interactionPlugin,
                    listPlugin,
                  ]}
                  /* ตารางเดือน 7 คอลัมน์บีบลงจอมือถือแล้วอ่านไม่ออก
                     จอแคบจึงใช้มุมมองรายการ และเหลือปุ่มเท่าที่จำเป็น */
                  initialView={isNarrow ? "listWeek" : "dayGridMonth"}
                  headerToolbar={
                    isNarrow
                      ? { left: "prev,next", center: "title", right: "today" }
                      : {
                          left: "prev,next today",
                          center: "title",
                          right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
                        }
                  }
                  noEventsContent="ไม่มีเหตุการณ์ในช่วงเวลานี้"
                  buttonText={{
                    today: "วันนี้",
                    month: "เดือน",
                    week: "สัปดาห์",
                    day: "วัน",
                    list: "รายการ",
                  }}
                  dayHeaderContent={(arg) => {
                    const shortDays = [
                      "อา.",
                      "จ.",
                      "อ.",
                      "พ.",
                      "พฤ.",
                      "ศ.",
                      "ส.",
                    ];
                    return shortDays[arg.date.getDay()];
                  }}
                  events={calendarEvents}
                  eventClick={handleEventClick}
                  contentHeight="auto"
                  dayMaxEvents={2}
                  locale="th"
                />
              </div>
            </div>
          </div>

          {/* Analytics View */}
          {activeTab === "analytics" && (
            <div>
              {stats && (
                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                    {[
                      {
                        label: "วันนี้",
                        value: stats.summary.today,
                        icon: "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z",
                        chip: "bg-[var(--tb-warning-tint)] text-[var(--tb-warning-text)]",
                      },
                      {
                        label: "สัปดาห์นี้",
                        value: stats.summary.this_week,
                        icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
                        chip: "bg-[var(--tb-primary-tint)] text-[var(--tb-primary-text)]",
                      },
                      //{ label: "ยังไม่ช่วยเหลือ", value: stats.summary.unresolved, icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z", chip: "bg-[var(--tb-danger-tint)] text-[var(--tb-danger-text)]" },
                      {
                        label: "รวมทั้งหมด",
                        value: stats.summary.total,
                        icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
                        chip: "bg-[var(--tb-success-tint)] text-[var(--tb-success-text)]",
                      },
                    ].map((stat, idx) => (
                      <div
                        key={idx}
                        className={`${card} p-4 sm:p-5 ${idx === 2 ? "col-span-2 sm:col-span-1" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-[var(--tb-muted)]">
                              {stat.label}
                            </p>
                            <p className="mt-1 text-2xl sm:text-3xl font-bold leading-tight tabular-nums text-[var(--tb-text)]">
                              {stat.value}
                            </p>
                          </div>
                          <span
                            aria-hidden="true"
                            className={`hidden sm:inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-[var(--tb-radius)] ${stat.chip}`}
                          >
                            <svg
                              className="w-5 h-5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth="2"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d={stat.icon}
                              />
                            </svg>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                    {/* Daily Trends (Bar Chart) */}
                    <section className={`${card} min-w-0`}>
                      <h3 className="px-5 py-4 border-b border-[var(--tb-border)] text-base font-semibold text-[var(--tb-text)]">
                        จำนวนเหตุการณ์รายวัน (30 วันล่าสุด)
                      </h3>
                      <div className="h-72 p-4 sm:p-5">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={stats.daily}
                            margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              vertical={false}
                              stroke="var(--tb-border)"
                            />
                            <XAxis
                              dataKey="label"
                              axisLine={false}
                              tickLine={false}
                              tick={axisTick}
                              tickFormatter={(val) =>
                                val.split("-").slice(1).join("/")
                              }
                            />
                            <YAxis
                              axisLine={false}
                              tickLine={false}
                              tick={axisTick}
                            />
                            <RechartsTooltip
                              cursor={{ fill: "var(--tb-primary-tint)" }}
                              contentStyle={tooltipStyle}
                              labelStyle={{ color: "var(--tb-text)", fontWeight: 600 }}
                              formatter={(value: any) => [
                                `${value} ครั้ง`,
                                "เหตุการณ์",
                              ]}
                              labelFormatter={(label) => `วันที่: ${label}`}
                            />
                            <Bar
                              dataKey="count"
                              fill="var(--tb-primary)"
                              radius={[4, 4, 0, 0]}
                              maxBarSize={40}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </section>

                    {/* Hourly Heatmap/Pattern (Area Chart) */}
                    <section className={`${card} min-w-0`}>
                      <h3 className="px-5 py-4 border-b border-[var(--tb-border)] text-base font-semibold text-[var(--tb-text)]">
                        ช่วงเวลาที่เกิดเหตุบ่อย (รูปแบบรายชั่วโมง)
                      </h3>
                      <div className="h-72 p-4 sm:p-5">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={stats.hourly}
                            margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                          >
                            <defs>
                              <linearGradient
                                id="colorHourly"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                              >
                                <stop
                                  offset="5%"
                                  stopColor="var(--tb-danger)"
                                  stopOpacity={0.3}
                                />
                                <stop
                                  offset="95%"
                                  stopColor="var(--tb-danger)"
                                  stopOpacity={0}
                                />
                              </linearGradient>
                            </defs>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              vertical={false}
                              stroke="var(--tb-border)"
                            />
                            <XAxis
                              dataKey="label"
                              axisLine={false}
                              tickLine={false}
                              tick={axisTick}
                              interval={3}
                            />
                            <YAxis
                              axisLine={false}
                              tickLine={false}
                              tick={axisTick}
                            />
                            <RechartsTooltip
                              cursor={{ stroke: "var(--tb-border-strong)" }}
                              contentStyle={tooltipStyle}
                              labelStyle={{ color: "var(--tb-text)", fontWeight: 600 }}
                              formatter={(value: any) => [
                                `${value} ครั้ง`,
                                "ความถี่",
                              ]}
                              labelFormatter={(label) => `เวลา: ${label} น.`}
                            />
                            <Area
                              type="monotone"
                              dataKey="count"
                              stroke="var(--tb-danger)"
                              strokeWidth={2}
                              fillOpacity={1}
                              fill="url(#colorHourly)"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </section>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4 py-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-event-title"
            className="w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[var(--tb-radius-lg)] border border-[var(--tb-border)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-pop)]"
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--tb-border)]">
              <div className="flex gap-3 items-center min-w-0">
                <span
                  aria-hidden="true"
                  className={`inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-full ${
                    selectedEvent.is_resolved
                      ? "bg-[var(--tb-success-tint)] text-[var(--tb-success-text)]"
                      : "bg-[var(--tb-danger-tint)] text-[var(--tb-danger-text)]"
                  }`}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                    />
                  </svg>
                </span>
                <div className="min-w-0">
                  <h2
                    id="history-event-title"
                    className="text-lg font-bold text-[var(--tb-text)]"
                  >
                    {selectedEvent.is_resolved
                      ? "ประวัติ (ช่วยเหลือแล้ว)"
                      : "เหตุฉุกเฉิน"}
                  </h2>
                  <p className="text-sm text-[var(--tb-muted)]">
                    {new Date(selectedEvent.created_at).toLocaleString(
                      "th-TH",
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                aria-label="ปิด"
                className="inline-flex items-center justify-center w-11 h-11 sm:w-9 sm:h-9 shrink-0 rounded-[var(--tb-radius)] text-[var(--tb-muted)] hover:bg-[var(--tb-surface-2)] hover:text-[var(--tb-text)] transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)]"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    selectedEvent.is_resolved
                      ? "bg-[var(--tb-success-tint)] text-[var(--tb-success-text)]"
                      : "bg-[var(--tb-danger-tint)] text-[var(--tb-danger-text)]"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`w-2 h-2 rounded-full ${selectedEvent.is_resolved ? "bg-[var(--tb-success)]" : "bg-[var(--tb-danger)]"}`}
                  />
                  {selectedEvent.is_resolved ? "ช่วยเหลือแล้ว" : "ยังไม่ช่วยเหลือ"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0 p-3 rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface-2)]">
                  <p className="text-xs font-semibold text-[var(--tb-muted)] mb-1">
                    ผู้ป่วย
                  </p>
                  <p className="text-base font-semibold text-[var(--tb-text)] break-words">
                    {selectedEvent.patient_name}
                  </p>
                </div>
                <div className="min-w-0 p-3 rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface-2)]">
                  <p className="text-xs font-semibold text-[var(--tb-muted)] mb-1">
                    สถานที่
                  </p>
                  <p className="text-base font-semibold text-[var(--tb-text)] break-words">
                    {selectedEvent.room_number}
                  </p>
                </div>
              </div>

              <section className="p-4 rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface-2)]">
                <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold text-[var(--tb-muted)]">
                  <span aria-hidden="true" className="w-2 h-2 rounded-full bg-[var(--tb-primary)]" />
                  ไฟล์เสียงบันทึกเหตุการณ์
                </h3>
                <WaveformAudioPlayer
                  src={`${API_BASE_URL}${selectedEvent.audio_url}`}
                />
              </section>
            </div>

            {!selectedEvent.is_resolved && (
              <div className="px-5 py-4 border-t border-[var(--tb-border)]">
                <button
                  type="button"
                  onClick={() => handleResolve(selectedEvent.id)}
                  className={`${btnPrimary} w-full h-11 text-base`}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  รับทราบ & ช่วยเหลือ
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
