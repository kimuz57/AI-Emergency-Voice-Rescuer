'use client';
import { useState, useRef, useEffect } from 'react';

export default function CustomAudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [showVolume, setShowVolume] = useState(false);

  // ฟังก์ชันแปลงวินาทีเป็นรูปแบบ นาที:วินาที (เช่น 0:02)
  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = Number(e.target.value);
    setVolume(vol);
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
  };

  return (
    <div className="flex items-center gap-2 bg-gray-100 p-1.5 px-3 rounded-full w-full max-w-sm mt-2 relative shadow-sm border border-gray-200">
      
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
        className="hidden"
      />

      {/* 🟢 1. เติม shrink-0 ที่ปุ่ม Play เพื่อไม่ให้ปุ่มเบี้ยว */}
      <button onClick={togglePlay} className="shrink-0 p-1.5 hover:bg-gray-200 rounded-full transition-colors text-gray-700">
        {isPlaying ? (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
        ) : (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
        )}
      </button>

      {/* 🟢 2. เติม shrink-0 ที่ตัวหนังสือบอกเวลา */}
      <div className="shrink-0 text-xs font-medium text-gray-600 min-w-[65px] text-center">
        {formatTime(currentTime)} / {formatTime(duration)}
      </div>

      {/* 🟢 3. พระเอกของเรา: เติม w-full และ min-w-0 บังคับให้แถบกรอหดตัวตามกล่อง */}
      <input
        type="range"
        min="0"
        max={duration || 0}
        value={currentTime}
        onChange={handleSeek}
        className="flex-1 w-full min-w-0 h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-blue-600"
      />

      {/* 🟢 4. เติม shrink-0 ที่กล่องครอบลำโพง */}
      <div
        className="relative flex items-center shrink-0"
        onMouseEnter={() => setShowVolume(true)}
        onMouseLeave={() => setShowVolume(false)}
      >
        <button className="p-1.5 hover:bg-gray-200 rounded-full transition-colors text-gray-700">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
        </button>

        {showVolume && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-white w-7 h-24 rounded-xl shadow-lg border border-gray-100 flex justify-center items-center z-50">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={handleVolume}
              className="w-16 h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-blue-600 -rotate-90 origin-center"
            />
          </div>
        )}
      </div>
    </div>
  );
}