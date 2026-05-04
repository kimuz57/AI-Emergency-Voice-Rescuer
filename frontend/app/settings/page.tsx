"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import MobileNav from "@/components/MobileNav";
import AmbientOrbs from "@/components/AmbientOrbs";
import ToggleSwitch from "@/components/ToggleSwitch";

export default function SettingsPage() {
  useAuth();

  const [notifications, setNotifications] = useState({
    critical: true,
    abnormal: true,
    device: true,
    pet: false,
  });

  const [darkMode, setDarkMode] = useState(false);
  const [sensitivity, setSensitivity] = useState("ปานกลาง (45 dB)");
  const [language, setLanguage] = useState("ไทย");
  const [retention, setRetention] = useState("30 วัน");

  return (
    <div className="relative min-h-screen flex flex-col">
      <AmbientOrbs />
      <Navbar />

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 md:px-10 py-12">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-3xl font-semibold tracking-tight mb-2">การตั้งค่า</h1>
          <p className="text-base text-gray-500">จัดการบัญชี การแจ้งเตือน และค่ากำหนดระบบของคุณ</p>
        </div>

        {/* Profile */}
        <div className="lucid-glass rounded-3xl overflow-hidden mb-8 deep-shadow">
          <div className="settings-section">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
              <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center shrink-0 border-3 border-white/60 shadow-lg">
                <span className="material-symbols-outlined text-3xl text-primary">person</span>
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-semibold tracking-tight mb-1">ผู้ดูแลระบบ</h3>
                <p className="text-base text-gray-500">admin@guardian-ai.com</p>
                <p className="text-xs font-medium text-gray-400 mt-1">บทบาท: ผู้ดูแลระบบหลัก</p>
              </div>
              <button className="px-6 py-2.5 rounded-2xl bg-primary/10 text-primary font-semibold text-sm hover:bg-primary/20 transition-all border border-primary/20">
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg">edit</span>
                  แก้ไขโปรไฟล์
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="lucid-glass rounded-3xl overflow-hidden mb-8 deep-shadow">
          <div className="settings-section border-b-0">
            <h3 className="text-xl font-medium tracking-tight mb-1 flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">notifications_active</span>
              การแจ้งเตือน
            </h3>
            <p className="text-sm text-gray-500 ml-9">ตั้งค่าการแจ้งเตือนสำหรับเหตุการณ์ต่าง ๆ</p>
          </div>
          <div className="px-8 pb-6">
            <ToggleSwitch
              checked={notifications.critical}
              onChange={(v) => setNotifications({ ...notifications, critical: v })}
              icon="emergency"
              iconColor="text-red-500"
              label="การแจ้งเตือนวิกฤต"
              description="แจ้งเตือนเมื่อตรวจพบเสียงขอความช่วยเหลือ"
            />
            <ToggleSwitch
              checked={notifications.abnormal}
              onChange={(v) => setNotifications({ ...notifications, abnormal: v })}
              icon="warning"
              iconColor="text-orange-500"
              label="แจ้งเตือนเสียงผิดปกติ"
              description="แจ้งเตือนเมื่อตรวจพบเสียงที่ไม่รู้จัก"
            />
            <ToggleSwitch
              checked={notifications.device}
              onChange={(v) => setNotifications({ ...notifications, device: v })}
              icon="memory"
              iconColor="text-blue-500"
              label="สถานะอุปกรณ์"
              description="แจ้งเตือนเมื่ออุปกรณ์ออฟไลน์หรือมีปัญหา"
            />
            <ToggleSwitch
              checked={notifications.pet}
              onChange={(v) => setNotifications({ ...notifications, pet: v })}
              icon="pets"
              iconColor="text-green-500"
              label="กิจกรรมสัตว์เลี้ยง"
              description="แจ้งเตือนกิจกรรมที่เกี่ยวกับสัตว์เลี้ยง"
            />
          </div>
        </div>

        {/* System Preferences */}
        <div className="lucid-glass rounded-3xl overflow-hidden mb-8 deep-shadow">
          <div className="settings-section border-b-0">
            <h3 className="text-xl font-medium tracking-tight mb-1 flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">tune</span>
              ค่ากำหนดระบบ
            </h3>
            <p className="text-sm text-gray-500 ml-9">ปรับแต่งการทำงานของระบบตามต้องการ</p>
          </div>
          <div className="px-8 pb-6">
            <div className="settings-row">
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-gray-400 text-2xl">volume_up</span>
                <div>
                  <p className="text-base font-medium">ความไวในการตรวจจับเสียง</p>
                  <p className="text-xs font-medium text-gray-400">ระดับ dB ที่จะเริ่มวิเคราะห์</p>
                </div>
              </div>
              <select
                value={sensitivity}
                onChange={(e) => setSensitivity(e.target.value)}
                className="bg-white/40 border border-white/50 rounded-xl px-4 py-2 text-sm font-medium text-gray-700 outline-none cursor-pointer"
              >
                <option>ต่ำ (60 dB)</option>
                <option>ปานกลาง (45 dB)</option>
                <option>สูง (30 dB)</option>
              </select>
            </div>
            <div className="settings-row">
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-gray-400 text-2xl">translate</span>
                <div>
                  <p className="text-base font-medium">ภาษา</p>
                  <p className="text-xs font-medium text-gray-400">ภาษาที่ใช้แสดงผลในระบบ</p>
                </div>
              </div>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="bg-white/40 border border-white/50 rounded-xl px-4 py-2 text-sm font-medium text-gray-700 outline-none cursor-pointer"
              >
                <option>ไทย</option>
                <option>English</option>
              </select>
            </div>
            <div className="settings-row">
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-gray-400 text-2xl">schedule</span>
                <div>
                  <p className="text-base font-medium">เก็บบันทึกกิจกรรม</p>
                  <p className="text-xs font-medium text-gray-400">ระยะเวลาเก็บรักษาข้อมูลประวัติ</p>
                </div>
              </div>
              <select
                value={retention}
                onChange={(e) => setRetention(e.target.value)}
                className="bg-white/40 border border-white/50 rounded-xl px-4 py-2 text-sm font-medium text-gray-700 outline-none cursor-pointer"
              >
                <option>7 วัน</option>
                <option>30 วัน</option>
                <option>90 วัน</option>
                <option>1 ปี</option>
              </select>
            </div>
            <ToggleSwitch
              checked={darkMode}
              onChange={setDarkMode}
              icon="dark_mode"
              iconColor="text-gray-400"
              label="โหมดมืด"
              description="เปลี่ยนธีมเป็นโทนมืด"
            />
          </div>
        </div>

        {/* Security */}
        <div className="lucid-glass rounded-3xl overflow-hidden mb-8 deep-shadow">
          <div className="settings-section border-b-0">
            <h3 className="text-xl font-medium tracking-tight mb-1 flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">security</span>
              ความปลอดภัย
            </h3>
            <p className="text-sm text-gray-500 ml-9">จัดการรหัสผ่านและการยืนยันตัวตน</p>
          </div>
          <div className="px-8 pb-6">
            <div className="settings-row">
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-gray-400 text-2xl">lock</span>
                <div>
                  <p className="text-base font-medium">เปลี่ยนรหัสผ่าน</p>
                  <p className="text-xs font-medium text-gray-400">เปลี่ยนรหัสผ่านล่าสุดเมื่อ 30 วันที่แล้ว</p>
                </div>
              </div>
              <button className="px-5 py-2 rounded-xl bg-white/40 border border-white/50 text-sm font-semibold text-gray-700 hover:bg-white/60 transition-all">
                เปลี่ยนรหัสผ่าน
              </button>
            </div>
            <div className="settings-row">
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-gray-400 text-2xl">smartphone</span>
                <div>
                  <p className="text-base font-medium">Two-Factor Authentication</p>
                  <p className="text-xs font-medium text-gray-400">เพิ่มความปลอดภัยด้วยการยืนยัน 2 ขั้นตอน</p>
                </div>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="lucid-glass rounded-3xl overflow-hidden mb-8 deep-shadow">
          <div className="settings-section border-b-0">
            <h3 className="text-xl font-medium tracking-tight mb-1 flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">link</span>
              ลิงก์ด่วน
            </h3>
          </div>
          <div className="px-8 pb-6">
            <Link
              href="/devices"
              className="settings-row group cursor-pointer hover:bg-white/20 -mx-4 px-4 rounded-xl transition-all"
            >
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-gray-400 text-2xl group-hover:text-primary transition-colors">
                  memory
                </span>
                <div>
                  <p className="text-base font-medium group-hover:text-primary transition-colors">
                    จัดการอุปกรณ์ ESP32
                  </p>
                  <p className="text-xs font-medium text-gray-400">เชื่อมต่อแล้ว 124 จาก 128 โหนด</p>
                </div>
              </div>
              <span className="material-symbols-outlined text-gray-300 group-hover:text-primary transition-colors">
                chevron_right
              </span>
            </Link>
            <Link
              href="/history"
              className="settings-row group cursor-pointer hover:bg-white/20 -mx-4 px-4 rounded-xl transition-all"
            >
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-gray-400 text-2xl group-hover:text-primary transition-colors">
                  history
                </span>
                <div>
                  <p className="text-base font-medium group-hover:text-primary transition-colors">
                    ดูประวัติเหตุการณ์
                  </p>
                  <p className="text-xs font-medium text-gray-400">ไทม์ไลน์บันทึกกิจกรรมทั้งหมด</p>
                </div>
              </div>
              <span className="material-symbols-outlined text-gray-300 group-hover:text-primary transition-colors">
                chevron_right
              </span>
            </Link>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="lucid-glass rounded-3xl overflow-hidden mb-8 danger-zone">
          <div className="settings-section border-b-0">
            <h3 className="text-xl font-medium tracking-tight mb-1 flex items-center gap-3 text-red-600">
              <span className="material-symbols-outlined">dangerous</span>
              โซนอันตราย
            </h3>
            <p className="text-sm text-red-400 ml-9">การดำเนินการเหล่านี้ไม่สามารถย้อนกลับได้</p>
          </div>
          <div className="px-8 pb-6">
            <div className="settings-row">
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-red-400 text-2xl">restart_alt</span>
                <div>
                  <p className="text-base font-medium text-red-600">รีเซ็ตข้อมูลระบบ</p>
                  <p className="text-xs font-medium text-red-400">ลบประวัติเหตุการณ์และการตั้งค่าทั้งหมด</p>
                </div>
              </div>
              <button className="px-5 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-sm font-semibold text-red-600 hover:bg-red-500/20 transition-all">
                รีเซ็ต
              </button>
            </div>
            <div className="settings-row">
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-red-400 text-2xl">delete_forever</span>
                <div>
                  <p className="text-base font-medium text-red-600">ลบบัญชีผู้ใช้</p>
                  <p className="text-xs font-medium text-red-400">ลบบัญชีและข้อมูลทั้งหมดอย่างถาวร</p>
                </div>
              </div>
              <button className="px-5 py-2 rounded-xl bg-red-600 border border-red-600 text-sm font-semibold text-white hover:bg-red-700 transition-all">
                ลบบัญชี
              </button>
            </div>
          </div>
        </div>
      </main>

      <footer className="py-12 mt-auto border-t border-white/10">
        <div className="max-w-7xl mx-auto px-10 flex flex-col md:flex-row justify-between items-center gap-4 text-gray-500 text-xs uppercase tracking-[0.2em] font-bold">
          <p>© 2024 Guardian AI</p>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">lock</span>
            <p>สภาพแวดล้อมที่เป็นส่วนตัวและปลอดภัย</p>
          </div>
        </div>
      </footer>

      <MobileNav />
    </div>
  );
}
