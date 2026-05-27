"use client";

import { useState } from "react";

type HistoryLog = {
  id: number;
  timestamp: string;
  room: string;
  deviceId: string;
  classification: "Emergency" | "Normal";
  confidence: number;
  audioFile: string;
};

const mockLogs: HistoryLog[] = [
  { id: 1, timestamp: "2026-05-27 06:14:32", room: "A-101", deviceId: "EE:01", classification: "Emergency", confidence: 0.9998, audioFile: "rec_20260527_061432.wav" },
  { id: 2, timestamp: "2026-05-27 06:02:11", room: "B-201", deviceId: "EE:03", classification: "Normal",    confidence: 0.9871, audioFile: "rec_20260527_060211.wav" },
  { id: 3, timestamp: "2026-05-26 23:47:05", room: "A-102", deviceId: "EE:02", classification: "Emergency", confidence: 0.9952, audioFile: "rec_20260526_234705.wav" },
  { id: 4, timestamp: "2026-05-26 21:33:19", room: "C-301", deviceId: "EE:05", classification: "Normal",    confidence: 0.9743, audioFile: "rec_20260526_213319.wav" },
  { id: 5, timestamp: "2026-05-26 18:55:44", room: "B-202", deviceId: "EE:04", classification: "Emergency", confidence: 0.9989, audioFile: "rec_20260526_185544.wav" },
  { id: 6, timestamp: "2026-05-26 14:21:08", room: "A-101", deviceId: "EE:01", classification: "Normal",    confidence: 0.9612, audioFile: "rec_20260526_142108.wav" },
  { id: 7, timestamp: "2026-05-26 09:08:53", room: "B-201", deviceId: "EE:03", classification: "Emergency", confidence: 0.9977, audioFile: "rec_20260526_090853.wav" },
];

function WaveformIcon() {
  return (
    <svg width="40" height="20" viewBox="0 0 40 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      {[2,5,3,8,12,7,4,10,6,3,9,5,2,7,4,11,8,3,6,4].map((h, i) => (
        <rect key={i} x={i * 2} y={(20 - h) / 2} width="1.2" height={h} rx="0.6" fill="#6366f1" opacity="0.7"/>
      ))}
    </svg>
  );
}

export default function HistoryPage() {
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<"All" | "Emergency" | "Normal">("All");

  const filtered = filter === "All" ? mockLogs : mockLogs.filter((l) => l.classification === filter);

  const emergencyCount = mockLogs.filter((l) => l.classification === "Emergency").length;
  const normalCount = mockLogs.filter((l) => l.classification === "Normal").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">ประวัติการตรวจจับเสียง</h1>
        <p className="text-slate-500 text-sm mt-1">คลังบันทึกไฟล์เสียงและผลวิเคราะห์จากโมเดล AI (BCResNet)</p>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center shadow-sm">
          <p className="text-3xl font-bold text-slate-800">{mockLogs.length}</p>
          <p className="text-xs text-slate-500 mt-1 font-medium uppercase tracking-wide">บันทึกทั้งหมด</p>
        </div>
        <div className="bg-red-50 rounded-2xl border border-red-100 p-4 text-center shadow-sm">
          <p className="text-3xl font-bold text-red-600">{emergencyCount}</p>
          <p className="text-xs text-red-500 mt-1 font-medium uppercase tracking-wide">Emergency</p>
        </div>
        <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-4 text-center shadow-sm">
          <p className="text-3xl font-bold text-emerald-600">{normalCount}</p>
          <p className="text-xs text-emerald-500 mt-1 font-medium uppercase tracking-wide">Normal</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(["All", "Emergency", "Normal"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors border ${
              filter === f
                ? f === "Emergency"
                  ? "bg-red-600 text-white border-red-600"
                  : f === "Normal"
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {f === "All" ? "ทั้งหมด" : f}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-6 py-4 text-slate-500 font-semibold uppercase tracking-wide text-xs">เวลาเกิดเหตุ</th>
                <th className="text-left px-6 py-4 text-slate-500 font-semibold uppercase tracking-wide text-xs">ห้อง</th>
                <th className="text-left px-6 py-4 text-slate-500 font-semibold uppercase tracking-wide text-xs">Device</th>
                <th className="text-left px-6 py-4 text-slate-500 font-semibold uppercase tracking-wide text-xs">ผล AI</th>
                <th className="text-left px-6 py-4 text-slate-500 font-semibold uppercase tracking-wide text-xs">ค่าความมั่นใจ</th>
                <th className="text-left px-6 py-4 text-slate-500 font-semibold uppercase tracking-wide text-xs">เล่นไฟล์เสียง</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((log) => (
                <tr key={log.id} className={`transition-colors ${log.classification === "Emergency" ? "hover:bg-red-50/50" : "hover:bg-slate-50"}`}>
                  <td className="px-6 py-4 font-mono text-xs text-slate-600 whitespace-nowrap">{log.timestamp}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                      {log.room}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-500">{log.deviceId}</td>
                  <td className="px-6 py-4">
                    {log.classification === "Emergency" ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
                        Emergency
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                        Normal
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-slate-100 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${log.classification === "Emergency" ? "bg-red-500" : "bg-emerald-500"}`}
                          style={{ width: `${log.confidence * 100}%` }}
                        />
                      </div>
                      <span className={`text-xs font-bold ${log.classification === "Emergency" ? "text-red-600" : "text-emerald-600"}`}>
                        {log.confidence.toFixed(4)}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="opacity-60">
                        <WaveformIcon />
                      </div>
                      <button
                        onClick={() => setPlayingId(playingId === log.id ? null : log.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          playingId === log.id
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600"
                        }`}
                      >
                        {playingId === log.id ? (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                              <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                            </svg>
                            หยุด
                          </>
                        ) : (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                              <polygon points="5 3 19 12 5 21 5 3"/>
                            </svg>
                            เล่น
                          </>
                        )}
                      </button>
                    </div>
                    {playingId === log.id && (
                      <p className="text-xs text-indigo-500 mt-1 font-mono">{log.audioFile}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
