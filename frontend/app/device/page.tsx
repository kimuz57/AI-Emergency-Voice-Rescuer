"use client";

import { useState, useEffect } from "react";

interface DeviceData {
  id: number;
  mac_address: string;
  patient_name: string | null; // รองรับค่า null
  device_name: string | null;
  status: string;
  is_active: boolean;
  is_verified: boolean;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// ==========================================
// 📌 กำหนด Type ของข้อมูล
// ==========================================
type UserProfile = {
  name: string;
  email: string;
  role: string;
};


export default function DevicesPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [devices, setDevices] = useState<DeviceData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [wifiModalDevice, setWifiModalDevice] = useState<DeviceData | null>(null);
  const [wifiQrUrl, setWifiQrUrl] = useState<string>("");
  const [wifiInfo, setWifiInfo] = useState({ ssid: "", pass: "" });

  // 🟢 2. ฟังก์ชันคำนวณรหัสและเจน QR Code
  const handleOpenWifiQr = async (device: DeviceData) => {
    // ลบเครื่องหมาย : ออกให้เหลือแค่ตัวอักษร 12 ตัวติดกัน
    const cleanMac = device.mac_address.replace(/:/g, "").toUpperCase();
    if (cleanMac.length !== 12) {
      alert("MAC Address ไม่ถูกต้อง");
      return;
    }

    // ดึง 6 ตัวหน้า และ 6 ตัวท้าย
    const first6 = cleanMac.substring(0, 6);
    const last6 = cleanMac.substring(6, 12);

    // สร้าง SSID และ Password ตามแพทเทิร์น
    const ssid = `Smartvoice-${last6}`;
    const pass = `SV-${first6}`;

    // สร้าง String รูปแบบมาตรฐานสำหรับต่อ WiFi
    const wifiString = `WIFI:T:WPA;S:${ssid};P:${pass};;`;

    setWifiInfo({ ssid, pass });
    setWifiDevice(device);

    try {
      // 💡 ต้องแน่ใจว่า import QRCode from "qrcode" ไว้ที่ด้านบนสุดของไฟล์แล้ว
      // @ts-ignore (เผื่อ type ไม่เป๊ะ)
      const QRCode = (await import("qrcode")).default; 
      const url = await QRCode.toDataURL(wifiString, { 
        width: 300, 
        margin: 2,
        color: { dark: '#1e293b', light: '#ffffff' }
      });
      setWifiQrUrl(url);
      setWifiModalDevice(device);
    } catch (err) {
      console.error("QR Gen Error", err);
      alert("ไม่สามารถสร้าง QR Code ได้");
    }
  };
  // ==========================================
  // 🔄 ฟังก์ชันดึงข้อมูล User และ Devices
  // ==========================================
  const fetchData = async () => {
    setIsLoading(true);
    setError("");

    try {
      // 1. ดึง Email
      let targetEmail = localStorage.getItem("userEmail");

      if (!targetEmail || targetEmail === "null") {
        const sessionRes = await fetch("/api/auth/session");
        const session = await sessionRes.json();
        if (session?.user?.email) {
          targetEmail = session.user.email;
          localStorage.setItem("userEmail", targetEmail || "");
        }
      }

      if (!targetEmail) {
        throw new Error("ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่");
      }

      // 🌟 2. ดึง Token ด้วยวิธีเดียวกับหน้า Dashboard (เช็คทั้ง Storage และ Cookie)
      const getAuthToken = () => {
        if (typeof window === "undefined") return "";
        const fromStorage = localStorage.getItem("token");
        if (fromStorage) return fromStorage;
        const match = document.cookie.match(/(?:^|; )token_public=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : "";
      };

      const token = getAuthToken();

      // 3. ดึงข้อมูล User Profile
      const userRes = await fetch(
        `${API_BASE_URL}/api/user/profile?email=${targetEmail}`,
        {
          method: "GET",
          credentials: "include", // 🔑 ใส่เพื่อให้แนบ Cookie ไปด้วย
        },
      );
      if (userRes.ok) {
        const userData = await userRes.json();
        setUser(userData);
      }

      // 🌟 4. ดึงข้อมูลอุปกรณ์ (ใช้โครงสร้าง Header แบบเดียวกับ Dashboard)
      const deviceRes = await fetch(`${API_BASE_URL}/api/devices`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}), // 🔑 ถ้ามี Token ถึงค่อยแนบ Header
        },
        credentials: "include", // 🔑 หัวใจสำคัญ! บังคับส่ง HTTP-Only Cookie ไปหา Go Backend
      });

      if (!deviceRes.ok) {
        throw new Error("ไม่สามารถดึงข้อมูลอุปกรณ์ได้");
      }

      const deviceData = await deviceRes.json();
      setDevices(deviceData.data || deviceData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // เช็คว่าเป็น Admin หรือไม่
  const isAdmin = user?.role?.toLowerCase() === "admin";

  return (
    <div className="relative min-h-screen p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto">
        {/* ========================================== */}
        {/* 🏷️ ส่วนหัวของหน้า (Header) */}
        {/* ========================================== */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold bg-gradient-to-r from-blue-700 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
              จัดการอุปกรณ์รับเสียง
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
              แสดงสถานะอุปกรณ์ที่ผูกกับผู้ป่วย
              {/* {isAdmin ? (
                <span className="bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-400 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Admin Mode (All Devices)
                </span>
              ) : (
                <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  My Patients Only
                </span>
              )} */}
            </p>
          </div>

          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
          >
            <svg
              className={`w-4 h-4 ${isLoading ? "animate-spin text-blue-500" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            รีเฟรชข้อมูล
          </button>
        </div>

        {/* ========================================== */}
        {/* 📦 ส่วนแสดงผล (Loading / Error / Data) */}
        {/* ========================================== */}
        {isLoading ? (
          // สถานะกำลังโหลด
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {[1, 2, 3].map((skeleton) => (
              <div
                key={skeleton}
                className="bg-white/60 dark:bg-slate-800/60 rounded-2xl p-6 border border-slate-100 dark:border-slate-700 h-32 animate-pulse flex flex-col justify-between"
              >
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
                <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-2/3"></div>
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : error ? (
          // สถานะ Error
          <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-2xl p-8 text-center">
            <svg
              className="w-12 h-12 text-red-500 mx-auto mb-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <h3 className="text-lg font-bold text-red-800 dark:text-red-400">
              เกิดข้อผิดพลาด
            </h3>
            <p className="text-red-600 dark:text-red-300 mt-1">{error}</p>
          </div>
        ) : devices.length === 0 ? (
          // สถานะไม่มีข้อมูล
          <div className="bg-white/60 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-12 text-center shadow-sm">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-slate-700 dark:text-slate-300">
              ยังไม่มีอุปกรณ์ในระบบ
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mt-2">
              {isAdmin
                ? "ยังไม่มีการลงทะเบียนอุปกรณ์ใดๆ ในระบบ"
                : "ยังไม่มีอุปกรณ์ของผู้ป่วยที่อยู่ภายใต้การดูแลของคุณ"}
            </p>
          </div>
        ) : (
          // สถานะมีข้อมูล -> วนลูปแสดง Block
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {devices.map((device, index) => (
              <div
                key={device.id || index}
                className="group bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-xl hover:border-blue-300 dark:hover:border-blue-500/50 transition-all duration-300 relative overflow-hidden"
              >
                {/* 🟢 Status Badges (Is Active & Online/Offline) */}
                <div className="absolute top-5 right-5 flex items-center gap-2">
                  {/* ป้ายสถานะ Activated / Not Active */}
                  {device.is_active ? (
                    <span className="px-2 py-1 bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 text-[10px] font-bold rounded-md uppercase tracking-wide">
                      Activated
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400 text-[10px] font-bold rounded-md uppercase tracking-wide">
                      Not Active
                    </span>
                  )}

                  {/* ป้ายสถานะ Online / Offline */}
                  <div className="flex items-center gap-1.5 ml-1">
                    {device.status?.toLowerCase() === "online" ? (
                      <>
                        <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </span>
                        <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                          Online
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="h-3 w-3 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                          Offline
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="mb-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-5 h-5 text-blue-600 dark:text-blue-400"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect
                        x="4"
                        y="4"
                        width="16"
                        height="16"
                        rx="2"
                        ry="2"
                      ></rect>
                      <rect x="9" y="9" width="6" height="6"></rect>
                      <line x1="9" y1="1" x2="9" y2="4"></line>
                      <line x1="15" y1="1" x2="15" y2="4"></line>
                      <line x1="9" y1="20" x2="9" y2="23"></line>
                      <line x1="15" y1="20" x2="15" y2="23"></line>
                      <line x1="20" y1="9" x2="23" y2="9"></line>
                      <line x1="20" y1="14" x2="23" y2="14"></line>
                      <line x1="1" y1="9" x2="4" y2="9"></line>
                      <line x1="1" y1="14" x2="4" y2="14"></line>
                    </svg>
                  </div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                    MAC ADDRESS
                  </h4>
                  <p className="font-mono font-bold text-lg text-slate-800 dark:text-slate-100">
                    {device.mac_address}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    ผู้ป่วยที่ผูกกับบอร์ดนี้
                  </h4>

                  {/* 🟢 ดักจับกรณีที่บอร์ดยังไม่ถูกผูก (patient_name เป็น null หรือว่าง) */}
                  {device.patient_name ? (
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold text-xs">
                        {device.patient_name.charAt(0)}
                      </div>
                      <p className="font-medium text-slate-700 dark:text-slate-300 text-sm truncate">
                        {device.patient_name}
                      </p>
                    </div>
                  ) : (
                    <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 border-dashed rounded-lg flex items-center gap-2">
                      <svg
                        className="w-4 h-4 text-amber-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        ยังไม่ถูกผูกกับผู้ป่วย (รอการลงทะเบียน)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
