'use client';

import { useEffect, useRef, useState } from 'react';
import { useWavesurfer } from '@wavesurfer/react';

export default function WaveformAudioPlayer({ src }: { src: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [volume, setVolume] = useState(1);
  const [showVolume, setShowVolume] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [loadError, setLoadError] = useState(false);

  const { wavesurfer, isPlaying } = useWavesurfer({
    container: containerRef,
    url: src,
    waveColor: '#94a3b8',
    progressColor: '#2563eb',
    cursorColor: '#1d4ed8',
    height: 32,
    barWidth: 2,
    barGap: 1,
    barRadius: 2,
    normalize: true,
  });

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
    <div className="dark:bg-slate-700 flex items-center gap-2 bg-gray-100 p-1.5 px-3 rounded-full w-full max-w-sm mt-2 relative shadow-sm border border-gray-200">
      <button
        onClick={togglePlay}
        disabled={loadError}
        className="shrink-0 p-1.5 hover:bg-gray-200 rounded-full transition-colors text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
      >
        {isPlaying ? (
          <svg className="dark:text-white w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
        ) : (
          <svg className="dark:text-white w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
        )}
      </button>

      {!loadError && (
        <div className="dark:text-white shrink-0 text-xs font-medium text-gray-600 min-w-[65px] text-center">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      )}

      {/* Kept mounted even on error — wavesurfer owns the DOM inside it */}
      <div
        ref={containerRef}
        className={`flex-1 w-full min-w-0 cursor-pointer ${loadError ? 'hidden' : ''}`}
      />

      {loadError && (
        <div className="flex-1 min-w-0 h-8 flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
          <svg
            className="w-4 h-4 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z"
            />
          </svg>
          <span className="truncate">โหลดไฟล์เสียงไม่สำเร็จ</span>
        </div>
      )}

      <div
        className="relative flex items-center shrink-0"
        onMouseEnter={() => setShowVolume(!loadError)}
        onMouseLeave={() => setShowVolume(false)}
      >
        <button
          disabled={loadError}
          className="p-1.5 hover:bg-gray-200 rounded-full transition-colors text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        >
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
