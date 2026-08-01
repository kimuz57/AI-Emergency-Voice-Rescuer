"use client";
/* eslint-disable @next/next/no-img-element, react-hooks/set-state-in-effect */
import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const APP_URL = process.env.FRONTEND_URL || "http://localhost:3000";
// ============================================================
// 🔲 TAB 1: QR Code Generator Component
// ============================================================
function QRGeneratorTab() {
  const [macInput, setMacInput] = useState("");
  const [deviceLabel, setDeviceLabel] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const formatMAC = (value: string) => {
    const cleaned = value.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
    const parts = cleaned.match(/.{1,2}/g) || [];
    return parts.slice(0, 6).join(":");
  };

  const handleMacChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMacInput(formatMAC(e.target.value));
    setError("");
    setQrDataUrl("");
  };

  const isValidMAC = (mac: string) => {
    return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac);
  };

  const generateQR = useCallback(async () => {
    if (!isValidMAC(macInput)) {
      setError("MAC Address ไม่ถูกต้อง ตัวอย่าง: AA:BB:CC:DD:EE:FF");
      return;
    }
    setIsGenerating(true);
    setError("");
    try {
      const qrUrl = `${APP_URL}/register-patient?mac=${macInput}`;
      const dataUrl = await QRCode.toDataURL(qrUrl, {
        width: 400,
        margin: 2,
        color: { dark: "#1e293b", light: "#ffffff" },
        errorCorrectionLevel: "H",
      });
      setQrDataUrl(dataUrl);
    } catch {
      setError("ไม่สามารถสร้าง QR Code ได้ กรุณาลองใหม่");
    } finally {
      setIsGenerating(false);
    }
  }, [macInput]);

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const link = document.createElement("a");
    link.href = qrDataUrl;
    const filename = macInput.replace(/:/g, "") || "device";
    link.download = `qrcode_${filename}.png`;
    link.click();
  };

  const handlePrint = () => {
    if (!qrDataUrl) return;
    const label = deviceLabel || macInput;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QR Code - ${macInput}</title>
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
          <img src="${qrDataUrl}" alt="QR Code" />
          <div class="mac">${macInput}</div>
          ${label !== macInput ? `<div class="label">${label}</div>` : ""}
        </div>
        <script>window.onload = () => { window.print(); window.close(); }<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Input Section */}
      <div className="dark:bg-slate-700/50 bg-white/60 backdrop-blur-md p-6 md:p-8 rounded-2xl shadow-sm border border-white/80 relative overflow-hidden">
        <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-6">
          <span className="text-emerald-500">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 3.5V16M4.5 4.5h3v3h-3v-3zm9 0h3v3h-3v-3zm-9 9h3v3h-3v-3z"
              />
            </svg>
          </span>
          ข้อมูลอุปกรณ์
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* MAC Address Input */}
          <div>
            <label className="dark:text-slate-300 block text-xs font-bold text-slate-600 mb-1 ml-1 uppercase tracking-wide">
              MAC Address <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={macInput}
              onChange={handleMacChange}
              placeholder="เช่น AA:BB:CC:DD:EE:FF"
              maxLength={17}
              className={`dark:bg-slate-800 dark:text-white w-full px-4 py-3 rounded-xl bg-slate-50/50 border outline-none transition-all text-sm font-mono uppercase tracking-widest ${
                error
                  ? "border-red-400 focus:ring-2 focus:ring-red-200"
                  : isValidMAC(macInput)
                    ? "border-emerald-400 focus:ring-2 focus:ring-emerald-200"
                    : "border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
              }`}
            />
            {error && (
              <p className="text-red-500 text-xs font-semibold mt-1.5 ml-1 flex items-center gap-1">
                <svg
                  className="w-3.5 h-3.5"
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
                {error}
              </p>
            )}
            {isValidMAC(macInput) && !error && (
              <p className="text-emerald-600 text-xs font-semibold mt-1.5 ml-1 flex items-center gap-1">
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                รูปแบบถูกต้อง
              </p>
            )}
          </div>

          {/* Device Label */}
          <div>
            <label className="dark:text-slate-300 block text-xs font-bold text-slate-600 mb-1 ml-1 uppercase tracking-wide">
              ชื่อ / Label อุปกรณ์ (ไม่บังคับ)
            </label>
            <input
              type="text"
              value={deviceLabel}
              onChange={(e) => setDeviceLabel(e.target.value)}
              placeholder="เช่น ห้อง 101A, ไมค์หัวเตียง"
              className="dark:bg-slate-800 dark:text-white w-full px-4 py-3 rounded-xl bg-slate-50/50 border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end mt-5">
          <button
            onClick={generateQR}
            disabled={isGenerating || !macInput}
            className="flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-bold text-sm hover:shadow-lg hover:shadow-emerald-500/30 transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            {isGenerating ? (
              <>
                <svg
                  className="animate-spin w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                กำลังสร้าง...
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 3.5V16M4.5 4.5h3v3h-3v-3zm9 0h3v3h-3v-3zm-9 9h3v3h-3v-3z"
                  />
                </svg>
                สร้าง QR Code
              </>
            )}
          </button>
        </div>
      </div>

      {/* QR Code Preview */}
      {qrDataUrl && (
        <div className="dark:bg-slate-700/50 bg-white/60 backdrop-blur-md p-6 md:p-8 rounded-2xl shadow-sm border border-white/80 flex flex-col items-center gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h2 className="w-full text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <span className="text-purple-500">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            </span>
            ตัวอย่าง QR Code
          </h2>

          <div className="relative group">
            <div className="relative bg-white p-5 rounded-2xl shadow-xl border-2 border-emerald-100">
              <img
                src={qrDataUrl}
                alt="QR Code"
                className="w-56 h-56 md:w-64 md:h-64"
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>
          </div>

          <div className="text-center">
            <p className="font-mono text-xl font-bold text-slate-800 dark:text-white tracking-widest">
              {macInput}
            </p>
            {deviceLabel && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {deviceLabel}
              </p>
            )}
            <p className="text-xs text-slate-400 mt-2 break-all max-w-xs">
              🔗 {APP_URL}/register-patient?mac={macInput}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <button
              onClick={handleDownload}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-bold text-sm hover:shadow-lg hover:shadow-purple-500/30 transition-all hover:-translate-y-0.5"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              ดาวน์โหลด PNG
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-white dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-white rounded-xl font-bold text-sm hover:border-emerald-400 hover:text-emerald-600 transition-all hover:-translate-y-0.5"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                />
              </svg>
              พิมพ์ QR Code
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 🛠️ TAB 2: Register Device Form Component (REPLACED)
// ============================================================
function RegisterDeviceTab({ scannedMAC }: { scannedMAC: string }) {
  const [formData, setFormData] = useState({
    macAddress: scannedMAC,
    ipAddress: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync MAC Address ถ้า scannedMAC เปลี่ยน (เมื่อเปิดมาจากลิงก์ QR)
  useEffect(() => {
    if (scannedMAC) {
      setFormData((prev) => ({ ...prev, macAddress: scannedMAC }));
    }
  }, [scannedMAC]);

  const formatMAC = (value: string) => {
    const cleaned = value.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
    const parts = cleaned.match(/.{1,2}/g) || [];
    return parts.slice(0, 6).join(":");
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;

    // ดักการพิมพ์ MAC Address และบังคับจัดฟอร์แมตใส่ : อัตโนมัติ
    if (e.target.name === "macAddress") {
      value = formatMAC(value);
    }

    setFormData({ ...formData, [e.target.name]: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // 🟢 ดึง Token ด้วยวิธีเดียวกับหน้าอื่นๆ
      const getAuthToken = () => {
        if (typeof window === "undefined") return "";
        const fromStorage = localStorage.getItem("token");
        if (fromStorage) return fromStorage;
        const match = document.cookie.match(/(?:^|; )token_public=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : "";
      };

      const token = getAuthToken();

      // 🛑 ยิงไปที่ API สำหรับบันทึกบอร์ดใหม่
      // หมายเหตุ: ต้องแน่ใจว่าฝั่ง Go มี Route รับข้อมูลนี้ (เช่น POST /api/devices)
      const res = await fetch(`${API_BASE_URL}/api/devices`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          mac_address: formData.macAddress,
          ip_address: formData.ipAddress,
          status: "offline", // ค่าเริ่มต้น
          is_verified: true, // 🌟 บังคับตั้งค่าให้ Verify เลยตามที่รีเควส
          is_active: false, // 🌟 บังคับตั้งค่าให้ยังไม่ทำงานตามที่รีเควส
        }),
      });

      const data = await res.json();

      if (res.ok) {
        alert("🎉 ลงทะเบียนบอร์ดสำเร็จ!");
        setFormData({
          macAddress: scannedMAC, // คง MAC ไว้ถ้าสแกนมา
          ipAddress: "",
        });
      } else {
        alert(
          "❌ เกิดข้อผิดพลาด: " + (data.error || "ไม่สามารถลงทะเบียนบอร์ดได้"),
        );
      }
    } catch {
      alert("❌ ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ Backend ได้");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500"
    >
      <div className="dark:bg-slate-700/50 bg-white/60 backdrop-blur-md p-6 md:p-8 rounded-2xl shadow-sm border border-white/80 flex flex-col gap-5 relative overflow-hidden">
        <h2 className="dark:text-white text-xl font-bold text-slate-800 flex items-center gap-2 mb-2">
          <span className="text-purple-500">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
              />
            </svg>
          </span>
          ข้อมูลลงทะเบียนบอร์ด (ESP32)
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* MAC Address */}
          <div>
            <label className="dark:text-slate-300 block text-xs font-bold text-slate-600 mb-1 ml-1 uppercase tracking-wide">
              รหัสบอร์ด (MAC Address) <span className="text-red-500">*</span>
            </label>
            {scannedMAC ? (
              <div className="relative">
                <div className="dark:bg-purple-900/30 w-full px-4 py-3 rounded-xl bg-purple-50 border-2 border-purple-400 flex items-center justify-between">
                  <span className="font-mono text-sm font-bold text-purple-700 dark:text-purple-400 tracking-widest uppercase">
                    {scannedMAC}
                  </span>
                  <span className="flex items-center gap-1 text-xs font-bold text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/50 px-2 py-1 rounded-lg">
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                    สแกนแล้ว
                  </span>
                </div>
              </div>
            ) : (
              <input
                type="text"
                name="macAddress"
                value={formData.macAddress}
                onChange={handleChange}
                required
                maxLength={17}
                placeholder="เช่น AA:BB:CC:DD:EE:FF"
                className="dark:bg-slate-800 dark:text-white w-full px-4 py-3 rounded-xl bg-slate-50/50 border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all text-sm text-slate-700 uppercase font-mono tracking-widest"
              />
            )}
          </div>

          {/* IP Address */}
          <div>
            <label className="dark:text-slate-300 block text-xs font-bold text-slate-600 mb-1 ml-1 uppercase tracking-wide">
              IP Address (ถ้ามี)
            </label>
            <input
              type="text"
              name="ipAddress"
              value={formData.ipAddress}
              onChange={handleChange}
              placeholder="เช่น 192.168.1.10"
              className="dark:bg-slate-800 dark:text-white w-full px-4 py-3 rounded-xl bg-slate-50/50 border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all text-sm text-slate-700 font-mono"
            />
          </div>
        </div>

        {/* Note Information */}
        <div className="mt-4 p-4 rounded-xl bg-blue-50 border border-blue-100 dark:bg-slate-800 dark:border-slate-700">
          <p className="text-xs text-blue-700 dark:text-blue-400 flex items-start gap-2">
            <svg
              className="w-4 h-4 mt-0.5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>
              <strong>หมายเหตุ:</strong>{" "}
              บอร์ดที่ลงทะเบียนผ่านหน้านี้จะถูกตั้งค่า{" "}
              <code className="font-bold">is_verified = true</code> และ{" "}
              <code className="font-bold">is_active = false</code> โดยอัตโนมัติ
              (รอการผูกกับผู้ป่วยเพื่อเปิดใช้งาน)
            </span>
          </p>
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={isSubmitting || (!scannedMAC && !formData.macAddress)}
          className="w-full md:w-auto flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl font-bold text-lg hover:shadow-xl hover:shadow-purple-500/30 transition-all hover:-translate-y-1 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <svg
                className="animate-spin w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              กำลังบันทึก...
            </>
          ) : (
            <>
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                />
              </svg>
              ลงทะเบียนบอร์ดเข้าระบบ
            </>
          )}
        </button>
      </div>
    </form>
  );
}

// ============================================================
// 🏠 Main Page (Tabs Controller) — wrapped in Suspense
// ============================================================
function DevicesPageContent() {
  const searchParams = useSearchParams();
  const scannedMAC = searchParams.get("mac")?.toUpperCase() || "";

  // ถ้ามี ?mac= → เปิด Tab ลงทะเบียนบอร์ด, ถ้าไม่มี → เปิด Tab สร้าง QR
  const [activeTab, setActiveTab] = useState<"qr" | "register">(
    scannedMAC ? "register" : "qr",
  );

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 md:p-8 font-sans overflow-hidden">
      {/* 📦 Main Container */}
      <div className="dark:bg-slate-800 relative z-10 w-full max-w-4xl bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl p-6 md:p-10 border border-white/60">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="dark:bg-slate-700 inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-100 to-purple-100 mb-4 shadow-sm">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-8 h-8 text-blue-600 dark:text-blue-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 11h4M12 16h4"
              />
              <circle cx="8" cy="11" r="1" fill="currentColor" stroke="none" />
              <circle cx="8" cy="16" r="1" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold bg-gradient-to-r from-blue-700 to-purple-600 bg-clip-text text-transparent">
            จัดการอุปกรณ์
          </h1>
          <p className="text-slate-500 dark:text-slate-300 mt-2">
            สร้าง QR Code หรือลงทะเบียนบอร์ด ESP32 ใหม่เข้าระบบ
          </p>
        </div>

        {/* ===== TABS ===== */}
        <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-700/60 rounded-2xl mb-8">
          {/* Tab: QR Code */}
          <button
            id="tab-qr"
            onClick={() => setActiveTab("qr")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
              activeTab === "qr"
                ? "bg-white dark:bg-slate-600 text-emerald-600 dark:text-emerald-400 shadow-md"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 3.5V16M4.5 4.5h3v3h-3v-3zm9 0h3v3h-3v-3zm-9 9h3v3h-3v-3z"
              />
            </svg>
            สร้าง QR Code
          </button>

          {/* Tab: ลงทะเบียนบอร์ด */}
          <button
            id="tab-register"
            onClick={() => setActiveTab("register")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
              activeTab === "register"
                ? "bg-white dark:bg-slate-600 text-purple-600 dark:text-purple-400 shadow-md"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
              />
            </svg>
            ลงทะเบียนบอร์ด
            {scannedMAC && (
              <span className="bg-emerald-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full ml-1 animate-pulse">
                QR
              </span>
            )}
          </button>
        </div>

        {/* ===== TAB CONTENT ===== */}
        <div>
          {activeTab === "qr" && <QRGeneratorTab />}
          {activeTab === "register" && (
            <RegisterDeviceTab scannedMAC={scannedMAC} />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Export default
// ============================================================
export default function DeviceRegistrationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <svg
              className="animate-spin w-10 h-10 text-purple-500"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <p className="text-slate-500 font-medium">กำลังโหลด...</p>
          </div>
        </div>
      }
    >
      <DevicesPageContent />
    </Suspense>
  );
}
