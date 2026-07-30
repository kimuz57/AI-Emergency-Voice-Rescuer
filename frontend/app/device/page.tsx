"use client";

import { useState, useEffect } from "react";
import QRCode from "qrcode";

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

  // 🟢 ฟังก์ชันคำนวณรหัสและเจน QR Code
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

    try {
      const url = await QRCode.toDataURL(wifiString, {
        width: 300,
        margin: 2,
        color: { dark: "#1e293b", light: "#ffffff" },
      });
      setWifiQrUrl(url);
      setWifiModalDevice(device);
    } catch (err) {
      console.error("QR Gen Error", err);
      alert("ไม่สามารถสร้าง QR Code ได้");
    }
  };

  // 📥 ฟังก์ชันดาวน์โหลด WiFi QR Code
  const handleDownloadWifiQr = () => {
    if (!wifiQrUrl || !wifiModalDevice) return;
    const link = document.createElement("a");
    link.href = wifiQrUrl;
    const cleanMac = wifiModalDevice.mac_address.replace(/:/g, "");
    link.download = `wifi_setup_${cleanMac}.png`;
    link.click();
  };

  // 🖨️ ฟังก์ชันพิมพ์ WiFi QR Code
  const handlePrintWifiQr = () => {
    if (!wifiQrUrl || !wifiModalDevice) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>WiFi QR - ${wifiModalDevice.mac_address}</title>
        <style>
          body { font-family: 'Segoe UI', sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: white; }
          .card { text-align: center; padding: 24px; border: 2px solid #e2e8f0; border-radius: 16px; display: inline-block; }
          img { width: 280px; height: 280px; display: block; margin: 0 auto; }
          .mac { font-family: monospace; font-size: 18px; font-weight: bold; color: #1e293b; margin-top: 12px; letter-spacing: 2px; }
          .label { font-size: 14px; color: #64748b; margin-top: 6px; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>
        <div class="card">
          <img src="${wifiQrUrl}" alt="WiFi QR Code" />
          <div class="mac">SSID: ${wifiInfo.ssid}</div>
          <div class="label">Password: ${wifiInfo.pass}</div>
          <div class="label" style="font-size: 12px; margin-top: 12px;">MAC: ${wifiModalDevice.mac_address}</div>
        </div>
        <script>window.onload = () => { window.print(); window.close(); }<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // ==========================================
  // 🔄 ฟังก์ชันดึงข้อมูล User และ Devices
  // ==========================================
  const fetchData = async () => {
    setIsLoading(true);
    setError("");

    try {
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

      const getAuthToken = () => {
        if (typeof window === "undefined") return "";
        const fromStorage = localStorage.getItem("token");
        if (fromStorage) return fromStorage;
        const match = document.cookie.match(/(?:^|; )token_public=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : "";
      };

      const token = getAuthToken();

      const userRes = await fetch(
        `${API_BASE_URL}/api/user/profile?email=${targetEmail}`,
        {
          method: "GET",
          credentials: "include",
        }
      );
      if (userRes.ok) {
        const userData = await userRes.json();
        setUser(userData);
      }

      const deviceRes = await fetch(`${API_BASE_URL}/api/devices`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            รีเฟรชข้อมูล
          </button>
        </div>

        {/* ========================================== */}
        {/* 📦 ส่วนแสดงผล (Loading / Error / Data) */}
        {/* ========================================== */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {[1, 2, 3].map((skeleton) => (
              <div key={skeleton} className="bg-white/60 dark:bg-slate-800/60 rounded-2xl p-6 border border-slate-100 dark:border-slate-700 h-32 animate-pulse flex flex-col justify-between">
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
                <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-2/3"></div>
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-2xl p-8 text-center">
            <svg className="w-12 h-12 text-red-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h3 className="text-lg font-bold text-red-800 dark:text-red-400">เกิดข้อผิดพลาด</h3>
            <p className="text-red-600 dark:text-red-300 mt-1">{error}</p>
          </div>
        ) : devices.length === 0 ? (
          <div className="bg-white/60 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-12 text-center shadow-sm">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-slate-700 dark:text-slate-300">ยังไม่มีอุปกรณ์ในระบบ</h3>
            <p className="text-slate-500 dark:text-slate-400 mt-2">
              {isAdmin ? "ยังไม่มีการลงทะเบียนอุปกรณ์ใดๆ ในระบบ" : "ยังไม่มีอุปกรณ์ของผู้ป่วยที่อยู่ภายใต้การดูแลของคุณ"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {devices.map((device, index) => (
              <div
                key={device.id || index}
                className="group bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-xl hover:border-blue-300 dark:hover:border-blue-500/50 transition-all duration-300 relative overflow-hidden"
              >
                {/* 🟢 Status Badges */}
                <div className="absolute top-5 right-5 flex items-center gap-2">
                  {device.is_active ? (
                    <span className="px-2 py-1 bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 text-[10px] font-bold rounded-md uppercase tracking-wide">
                      Activated
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400 text-[10px] font-bold rounded-md uppercase tracking-wide">
                      Not Active
                    </span>
                  )}
                  <div className="flex items-center gap-1.5 ml-1">
                    {device.status?.toLowerCase() === "online" ? (
                      <>
                        <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </span>
                        <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">Online</span>
                      </>
                    ) : (
                      <>
                        <span className="h-3 w-3 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Offline</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="mb-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
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
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">MAC ADDRESS</h4>
                  <p className="font-mono font-bold text-lg text-slate-800 dark:text-slate-100">{device.mac_address}</p>
                  
                  {/* ปุ่มเจน QR */}
                  <button
                    onClick={() => handleOpenWifiQr(device)}
                    className="flex items-center gap-1.5 px-2 py-1 mt-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 dark:text-indigo-400 rounded-md transition-colors w-fit"
                    title="สร้าง QR สแกนต่อ WiFi บอร์ด"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 3.5V16M4.5 4.5h3v3h-3v-3zm9 0h3v3h-3v-3zm-9 9h3v3h-3v-3z" />
                    </svg>
                    <span className="text-[10px] font-bold tracking-wide">WIFI QR</span>
                  </button>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">ผู้ป่วยที่ผูกกับบอร์ดนี้</h4>
                  {device.patient_name ? (
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold text-xs">
                        {device.patient_name.charAt(0)}
                      </div>
                      <p className="font-medium text-slate-700 dark:text-slate-300 text-sm truncate">{device.patient_name}</p>
                    </div>
                  ) : (
                    <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 border-dashed rounded-lg flex items-center gap-2">
                      <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">ยังไม่ถูกผูกกับผู้ป่วย (รอการลงทะเบียน)</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================== */}
      {/* 📱 Modal แสดง WiFi QR Code (Popup กลางจอ) */}
      {/* ========================================== */}
      {wifiModalDevice && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          
          <div className="dark:bg-slate-700/50 bg-white/60 backdrop-blur-md p-6 md:p-8 rounded-2xl shadow-xl border border-white/80 flex flex-col items-center gap-6 animate-in zoom-in-95 duration-200 relative w-full max-w-md">
            
            {/* ปุ่มปิด Modal (กากบาท) */}
            <button 
              onClick={() => setWifiModalDevice(null)}
              className="absolute top-4 right-4 p-2 bg-white/50 dark:bg-slate-700/50 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/40 text-slate-500 rounded-full transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h2 className="w-full text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <span className="text-purple-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </span>
              WiFi Setup QR Code
            </h2>

            <div className="relative group w-full flex justify-center">
              <div className="relative bg-white p-5 rounded-2xl shadow-xl border-2 border-emerald-100">
                {wifiQrUrl ? (
                  <img src={wifiQrUrl} alt="WiFi QR Code" className="w-56 h-56 md:w-64 md:h-64" />
                ) : (
                  <div className="w-56 h-56 md:w-64 md:h-64 flex items-center justify-center text-slate-400">กำลังสร้าง...</div>
                )}
              </div>
            </div>

            <div className="text-center w-full">
              <p className="font-mono text-xl font-bold text-slate-800 dark:text-white tracking-widest">
                {wifiModalDevice.mac_address}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                SSID: <span className="font-bold text-indigo-600 dark:text-indigo-400">{wifiInfo.ssid}</span>
              </p>
              {/* <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Password: <span className="font-bold text-indigo-600 dark:text-indigo-400">{wifiInfo.pass}</span>
              </p> */}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
              <button
                onClick={handleDownloadWifiQr}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-bold text-sm hover:shadow-lg hover:shadow-purple-500/30 transition-all hover:-translate-y-0.5 w-full sm:w-auto"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                ดาวน์โหลด PNG
              </button>
              <button
                onClick={handlePrintWifiQr}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-white dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-white rounded-xl font-bold text-sm hover:border-emerald-400 hover:text-emerald-600 transition-all hover:-translate-y-0.5 w-full sm:w-auto"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                พิมพ์ QR Code
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}