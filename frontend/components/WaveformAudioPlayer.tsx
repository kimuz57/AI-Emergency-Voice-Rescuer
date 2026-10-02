'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useWavesurfer } from '@wavesurfer/react';
import { getAuthToken } from '@/lib/auth';

// wavesurfer วาดคลื่นลง canvas จึงรับ var(--tb-*) ตรงๆ ไม่ได้ ต้องส่งเป็นค่าสีจริง
// ธีมสว่าง: สีหลักตรงกับ --tb-primary / --tb-primary-hover ส่วนคลื่นใช้เทาเข้มกว่า
// --tb-border-strong เล็กน้อยให้มองเห็นบนพื้นขาว · ธีมมืด: คงสีเดิมไว้
const WAVE_COLORS = {
  light: { waveColor: '#9aa5b4', progressColor: '#066fd1', cursorColor: '#0560b5' },
  dark: { waveColor: '#94a3b8', progressColor: '#2563eb', cursorColor: '#1d4ed8' },
} as const;

export default function WaveformAudioPlayer({ src }: { src: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [volume, setVolume] = useState(1);
  const [showVolume, setShowVolume] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [loadError, setLoadError] = useState(false);

  // GET /api/audio/:filename ต้องมีสิทธิ์ (ไม่มี static public แล้ว) — wavesurfer v7 fetch ไฟล์ทั้งก้อนด้วย
  // fetchParams แล้วเล่นจาก blob URL จึงส่ง Authorization header ได้โดยไม่ต้องใส่ JWT ใน URL.
  // memo ตาม src: useWavesurfer สร้าง instance ใหม่เมื่อ reference ของ option เปลี่ยน.
  // ใส่ signal เองเพราะ wavesurfer เขียน signal ของตัวเองลงใน object นี้ แล้ว abort ตอน destroy —
  // StrictMode (mount→unmount→mount) จะได้ instance ที่สองที่ใช้ signal ที่ถูก abort ไปแล้ว
  const fetchParams = useMemo<RequestInit | undefined>(() => {
    const token = getAuthToken();
    if (!token || !src) return undefined;
    return {
      headers: { Authorization: `Bearer ${token}` },
      signal: new AbortController().signal,
    };
  }, [src]);

  const { wavesurfer, isPlaying } = useWavesurfer({
    container: containerRef,
    url: src,
    fetchParams,
    // สีตั้งต้น (ธีมสว่าง) — ห้ามคำนวณสีจากธีมตรงนี้ เพราะ useWavesurfer จะสร้าง
    // instance ใหม่ทุกครั้งที่ค่าใน options เปลี่ยน (โหลดไฟล์ใหม่ + เสียงที่เล่นอยู่หยุด)
    ...WAVE_COLORS.light,
    height: 32,
    barWidth: 2,
    barGap: 1,
    barRadius: 2,
    normalize: true,
  });

  // เปลี่ยนสีคลื่นตามธีมด้วย setOptions แทน — next-themes สลับคลาส .dark บน <html>
  useEffect(() => {
    if (!wavesurfer) return;
    const root = document.documentElement;
    let applied: keyof typeof WAVE_COLORS | null = null;
    const applyTheme = () => {
      const next = root.classList.contains('dark') ? 'dark' : 'light';
      if (next === applied) return;
      applied = next;
      wavesurfer.setOptions(WAVE_COLORS[next]);
    };
    applyTheme();
    const observer = new MutationObserver(applyTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [wavesurfer]);

  // wavesurfer only fires 'timeupdate' during playback, so a paused seek
  // (click/drag on the waveform) needs 'interaction'/'seeking' too or the
  // time label stays stuck at the pre-seek value.
  useEffect(() => {
    if (!wavesurfer) return;
    const update = () => setCurrentTime(wavesurfer.getCurrentTime());
    const unsubscribers = [
      wavesurfer.on('timeupdate', update),
      wavesurfer.on('interaction', update),
      wavesurfer.on('seeking', update),
      // wavesurfer swallows load failures internally (404, network error,
      // undecodable file) and only reports them through the 'error' event.
      wavesurfer.on('load', () => setLoadError(false)),
      wavesurfer.on('error', () => setLoadError(true)),
    ];
    return () => unsubscribers.forEach((unsub) => unsub());
  }, [wavesurfer]);

  const duration = wavesurfer?.getDuration() ?? 0;

  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const togglePlay = () => {
    if (!wavesurfer || loadError) return;
    // playPause() rejects when the media never loaded — swallow it here or it
    // surfaces as an unhandled rejection (full-screen overlay in dev).
    wavesurfer.playPause().catch(() => setLoadError(true));
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = Number(e.target.value);
    setVolume(vol);
    wavesurfer?.setVolume(vol);
  };

  return (
    <div className="relative flex items-center gap-2 w-full p-1.5 rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-xs)]">
      {/* ปุ่มเล่น/หยุด — ปุ่มกลมสีหลัก 40px */}
      <button
        type="button"
        onClick={togglePlay}
        disabled={loadError}
        aria-label={isPlaying ? 'หยุดเสียงชั่วคราว' : 'เล่นเสียง'}
        className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full bg-[var(--tb-primary)] text-[var(--tb-primary-contrast)] hover:bg-[var(--tb-primary-hover)] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[var(--tb-primary)]"
      >
        {isPlaying ? (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.29-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14z" />
          </svg>
        )}
      </button>

      {!loadError && (
        <div className="shrink-0 min-w-[68px] text-center text-xs font-medium tabular-nums text-[var(--tb-muted)]">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      )}

      {/* Kept mounted even on error — wavesurfer owns the DOM inside it */}
      <div
        ref={containerRef}
        className={`flex-1 w-full min-w-0 cursor-pointer ${loadError ? 'hidden' : ''}`}
      />

      {loadError && (
        <div className="flex-1 min-w-0 h-10 flex items-center gap-1.5 text-sm font-medium text-[var(--tb-warning-text)]">
          <svg
            className="w-4 h-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
          <span className="truncate">โหลดไฟล์เสียงไม่สำเร็จ</span>
        </div>
      )}

      <div
        className="relative flex items-center shrink-0"
        onMouseEnter={() => setShowVolume(!loadError)}
        onMouseLeave={() => setShowVolume(false)}
      >
        {/* ปุ่มระดับเสียง — ปุ่มไอคอนแบบโปร่ง 40px ชี้เมาส์ค้างเพื่อเปิดแถบปรับ */}
        <button
          type="button"
          disabled={loadError}
          aria-label="ระดับเสียง"
          className="inline-flex items-center justify-center w-10 h-10 rounded-full text-[var(--tb-muted)] hover:bg-[var(--tb-surface-2)] hover:text-[var(--tb-text)] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--tb-primary-ring)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M11 5 6 9H2v6h4l5 4V5z" />
            {volume === 0 ? (
              <>
                <path d="m22 9-6 6" />
                <path d="m16 9 6 6" />
              </>
            ) : (
              <>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </>
            )}
          </svg>
        </button>

        {showVolume && (
          // pb-2 เป็นสะพานโปร่งใส ลากเมาส์จากปุ่มขึ้นไปหาแถบได้โดยป๊อปอัปไม่ปิดก่อน
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 pb-2 z-50">
            <div className="w-10 h-28 flex justify-center items-center rounded-[var(--tb-radius)] border border-[var(--tb-border)] bg-[var(--tb-surface)] shadow-[var(--tb-shadow-pop)]">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={handleVolume}
                aria-label="ปรับระดับเสียง"
                className="w-20 h-1.5 rounded-full appearance-none cursor-pointer -rotate-90 origin-center bg-[var(--tb-border-strong)] accent-[var(--tb-primary)]"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
