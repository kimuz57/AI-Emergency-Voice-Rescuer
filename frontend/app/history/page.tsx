"use client";
/* eslint-disable react-hooks/set-state-in-effect, @typescript-eslint/no-explicit-any */
import { useEffect, useState, useRef } from "react";
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
import CustomAudioPlayer from "@/components/CustomAudioPlayer";

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

      const fromStr = fromDate.toISOString().split("T")[0];
      const toStr = toDate.toISOString().split("T")[0];

      const historyRes = await fetch(
        `${API_BASE_URL}/api/alerts/history?email=${email}&from=${fromStr}&to=${toStr}`,
        {
          credentials: "include",
        },
      );
      if (historyRes.ok) {
        const data = await historyRes.json();
        setHistoryEvents(data);
      }

      // ดึงสถิติ
      const statsRes = await fetch(
        `${API_BASE_URL}/api/alerts/stats?email=${email}&days=30`,
        {
          credentials: "include",
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
      }
    } catch (error) {
      console.error("Failed to resolve alert", error);
    }
  };

  // แปลงข้อมูลให้ FullCalendar
  const calendarEvents = historyEvents.map((event) => ({
    id: String(event.id),
    title: `${event.patient_name} (${event.room_number})`,
    start: event.created_at,
    backgroundColor: event.is_resolved ? "#10b981" : "#ef4444", // สีเขียวถ้า resolved, สีแดงถ้า unresolved
    borderColor: event.is_resolved ? "#059669" : "#dc2626",
    extendedProps: event,
  }));

  const handleEventClick = (clickInfo: any) => {
    setSelectedEvent(clickInfo.event.extendedProps as DetectionLogResponse);
  };

  return (
    <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in duration-500 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-8 h-8 text-indigo-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            ประวัติและสถิติเหตุการณ์
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            ดูประวัติการขอความช่วยเหลือย้อนหลังและวิเคราะห์แนวโน้ม
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl shadow-inner border border-slate-200 dark:border-slate-700 shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab("calendar")}
            className={`whitespace-nowrap px-5 py-2 text-sm font-semibold rounded-lg transition-all ${
              activeTab === "calendar"
                ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            ปฏิทิน (Calendar)
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className={`whitespace-nowrap px-5 py-2 text-sm font-semibold rounded-lg transition-all ${
              activeTab === "analytics"
                ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            สถิติ (Analytics)
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-[600px] flex items-center justify-center bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            <p className="text-slate-500 font-medium">
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
            <div className="bg-white dark:bg-slate-900 p-3 sm:p-6 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 w-full overflow-hidden">
              {/* ส่วนหัวของปฏิทิน (ปุ่มสถานะ และ ช่องค้นหาวันที่) */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>{" "}
                    ยังไม่ช่วยเหลือ
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <div className="w-3 h-3 rounded-full bg-emerald-500"></div>{" "}
                    ช่วยเหลือแล้ว
                  </div>
                </div>

                {/* Date Picker */}
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 w-full sm:w-auto shadow-sm">
                  <label
                    htmlFor="jumpDate"
                    className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap"
                  >
                    📅 ค้นหาวันที่:
                  </label>
                  <input
                    type="date"
                    id="jumpDate"
                    onChange={handleDateJump}
                    className="bg-transparent text-sm outline-none text-slate-700 dark:text-slate-200 cursor-pointer w-full"
                  />
                </div>
              </div>

              {/* คอนเทนเนอร์ปฏิทิน (เพิ่ม overflow-x-auto ให้เลื่อนซ้ายขวาได้ถ้าจอมือถือเล็กมาก) */}
              <div className="calendar-container w-full overflow-x-auto rounded-xl custom-scrollbar pb-2">
                <style
                  dangerouslySetInnerHTML={{
                    __html: `
                  .fc { --fc-border-color: #e2e8f0; --fc-button-bg-color: #4f46e5; --fc-button-border-color: #4f46e5; --fc-button-hover-bg-color: #4338ca; --fc-button-active-bg-color: #3730a3; --fc-today-bg-color: #f0fdf4; }
                  .dark .fc { --fc-border-color: #334155; --fc-page-bg-color: #0f172a; --fc-today-bg-color: rgba(16, 185, 129, 0.1); --fc-neutral-bg-color: #1e293b; --fc-neutral-text-color: #94a3b8; }
                  .fc-theme-standard th { padding: 8px 0; background-color: #f8fafc; font-weight: 600; font-size: 0.85rem; color: #64748b; }
                  .dark .fc-theme-standard th { background-color: #1e293b; color: #94a3b8; }
                  .fc-daygrid-event { border-radius: 6px; padding: 2px 4px; font-size: 0.75rem; box-shadow: 0 1px 2px rgba(0,0,0,0.1); border: none !important; transition: transform 0.2s; cursor: pointer; }
                  .fc-daygrid-event:hover { transform: translateY(-1px); filter: brightness(1.1); }
                  .fc-event-title { font-weight: 600; white-space: normal; line-height: 1.2; }
                  .fc-toolbar-title { font-size: 1.25rem !important; font-weight: 700 !important; color: #1e293b; }
                  .dark .fc-toolbar-title { color: #f8fafc; }
                  .fc-day-today .fc-daygrid-day-number { background-color: #4f46e5; color: white; border-radius: 50%; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; margin: 4px; font-weight: bold; }
                  
                  .fc-button { border-radius: 8px !important; text-transform: capitalize; }
                  
                  /* 📱 ตั้งค่าสำหรับจอมือถือ (Responsive) */
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
                    /* ย่อขนาดปุ่มและตัวอักษรลง */
                    .fc-button { 
                      padding: 0.3rem 0.5rem !important; 
                      font-size: 0.75rem !important; 
                    }
                    .fc-toolbar-title { 
                      font-size: 1.1rem !important; 
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
                  ref={calendarRef}
                  plugins={[
                    dayGridPlugin,
                    timeGridPlugin,
                    interactionPlugin,
                    listPlugin,
                  ]}
                  initialView="dayGridMonth"
                  headerToolbar={{
                    left: "prev,next today",
                    center: "title",
                    right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
                  }}
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
            <div className="animate-in fade-in duration-300">
              {stats && (
                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      {
                        label: "วันนี้",
                        value: stats.summary.today,
                        icon: "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z",
                        color: "text-blue-500",
                        bg: "bg-blue-50 dark:bg-blue-500/10",
                      },
                      {
                        label: "สัปดาห์นี้",
                        value: stats.summary.this_week,
                        icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
                        color: "text-indigo-500",
                        bg: "bg-indigo-50 dark:bg-indigo-500/10",
                      },
                      //{ label: "ยังไม่ช่วยเหลือ", value: stats.summary.unresolved, icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z", color: "text-red-500", bg: "bg-red-50 dark:bg-red-500/10" },
                      {
                        label: "รวมทั้งหมด",
                        value: stats.summary.total,
                        icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
                        color: "text-emerald-500",
                        bg: "bg-emerald-50 dark:bg-emerald-500/10",
                      },
                    ].map((stat, idx) => (
                      <div
                        key={idx}
                        className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 flex items-center gap-5 hover:-translate-y-1 transition-transform"
                      >
                        <div
                          className={`w-14 h-14 rounded-2xl flex items-center justify-center ${stat.bg} ${stat.color}`}
                        >
                          <svg
                            className="w-7 h-7"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d={stat.icon}
                            />
                          </svg>
                        </div>
                        <div>
                          <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">
                            {stat.label}
                          </p>
                          <h3 className="text-3xl font-extrabold text-slate-800 dark:text-white mt-1">
                            {stat.value}
                          </h3>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Daily Trends (Bar Chart) */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
                      <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6">
                        จำนวนเหตุการณ์รายวัน (30 วันล่าสุด)
                      </h3>
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={stats.daily}
                            margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              vertical={false}
                              stroke="#e2e8f0"
                            />
                            <XAxis
                              dataKey="label"
                              axisLine={false}
                              tickLine={false}
                              tick={{ fontSize: 12, fill: "#94a3b8" }}
                              tickFormatter={(val) =>
                                val.split("-").slice(1).join("/")
                              }
                            />
                            <YAxis
                              axisLine={false}
                              tickLine={false}
                              tick={{ fontSize: 12, fill: "#94a3b8" }}
                            />
                            <RechartsTooltip
                              cursor={{ fill: "rgba(99, 102, 241, 0.1)" }}
                              contentStyle={{
                                borderRadius: "12px",
                                border: "none",
                                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                              }}
                              formatter={(value: any) => [
                                `${value} ครั้ง`,
                                "เหตุการณ์",
                              ]}
                              labelFormatter={(label) => `วันที่: ${label}`}
                            />
                            <Bar
                              dataKey="count"
                              fill="#4f46e5"
                              radius={[4, 4, 0, 0]}
                              maxBarSize={40}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Hourly Heatmap/Pattern (Area Chart) */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
                      <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6">
                        ช่วงเวลาที่เกิดเหตุบ่อย (รูปแบบรายชั่วโมง)
                      </h3>
                      <div className="h-72">
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
                                  stopColor="#f43f5e"
                                  stopOpacity={0.8}
                                />
                                <stop
                                  offset="95%"
                                  stopColor="#f43f5e"
                                  stopOpacity={0}
                                />
                              </linearGradient>
                            </defs>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              vertical={false}
                              stroke="#e2e8f0"
                            />
                            <XAxis
                              dataKey="label"
                              axisLine={false}
                              tickLine={false}
                              tick={{ fontSize: 12, fill: "#94a3b8" }}
                              interval={3}
                            />
                            <YAxis
                              axisLine={false}
                              tickLine={false}
                              tick={{ fontSize: 12, fill: "#94a3b8" }}
                            />
                            <RechartsTooltip
                              contentStyle={{
                                borderRadius: "12px",
                                border: "none",
                                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                              }}
                              formatter={(value: any) => [
                                `${value} ครั้ง`,
                                "ความถี่",
                              ]}
                              labelFormatter={(label) => `เวลา: ${label} น.`}
                            />
                            <Area
                              type="monotone"
                              dataKey="count"
                              stroke="#f43f5e"
                              strokeWidth={3}
                              fillOpacity={1}
                              fill="url(#colorHourly)"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300">
            {/* Modal Header */}
            <div
              className={`p-6 text-white ${selectedEvent.is_resolved ? "bg-gradient-to-r from-emerald-500 to-teal-600" : "bg-gradient-to-r from-red-500 to-rose-600"}`}
            >
              <div className="flex justify-between items-start">
                <div className="flex gap-3 items-center">
                  <div className="bg-white/20 p-2 rounded-xl backdrop-blur-md">
                    <svg
                      className="w-8 h-8"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                      />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold tracking-wide">
                      {selectedEvent.is_resolved
                        ? "ประวัติ (ช่วยเหลือแล้ว)"
                        : "เหตุฉุกเฉิน"}
                    </h2>
                    <p className="text-white/80 text-sm font-medium">
                      {new Date(selectedEvent.created_at).toLocaleString(
                        "th-TH",
                      )}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-1.5 transition-colors"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
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
            </div>

            {/* Modal Body */}
            <div className="p-6 md:p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1 uppercase tracking-wider">
                    ผู้ป่วย
                  </p>
                  <p className="text-lg font-bold text-slate-800 dark:text-white">
                    {selectedEvent.patient_name}
                  </p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1 uppercase tracking-wider">
                    สถานที่
                  </p>
                  <p className="text-lg font-bold text-slate-800 dark:text-white">
                    {selectedEvent.room_number}
                  </p>
                </div>
              </div>

              <div className="bg-indigo-50/50 dark:bg-indigo-900/10 rounded-2xl p-4 border border-indigo-100 dark:border-indigo-800/30">
                <p className="text-xs text-indigo-500 dark:text-indigo-400 font-semibold mb-3 flex items-center gap-2 uppercase tracking-wide">
                  <span className="w-2 h-2 rounded-full bg-indigo-500"></span>{" "}
                  ไฟล์เสียงบันทึกเหตุการณ์
                </p>
                <CustomAudioPlayer
                  src={`${API_BASE_URL}${selectedEvent.audio_url}`}
                />
              </div>

              {!selectedEvent.is_resolved && (
                <button
                  onClick={() => handleResolve(selectedEvent.id)}
                  className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-bold text-lg shadow-lg hover:shadow-indigo-500/40 transition-all hover:-translate-y-1 flex items-center justify-center gap-2"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2.5"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  รับทราบ & ช่วยเหลือ
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
