import React, { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal, Moon, Gauge, Check } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

const SPEEDS = [0.8, 1, 1.15, 1.25, 1.5];
const TIMER_OPTIONS = [
  { id: null, label: 'Off' },
  { id: 'end', label: 'End of track' },
  { id: 15, label: '15 min' },
  { id: 30, label: '30 min' },
  { id: 45, label: '45 min' },
  { id: 60, label: '1 hour' },
];

export default function AudioToolsMenu({ direction = 'up', align = 'right' }) {
  const { playbackRate, setPlaybackRate, sleepTimer, sleepRemainingMins, setSleepTimer } = usePlayer();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const hasActiveSetting = playbackRate !== 1 || Boolean(sleepTimer?.mode);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative no-drag">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`relative p-2 rounded-xl transition-all duration-150 active:scale-90 flex items-center gap-1 ${
          hasActiveSetting || open
            ? 'text-emerald-400 bg-emerald-400/12'
            : 'text-zinc-400 hover:text-white hover:bg-white/[0.08]'
        }`}
        title="Playback Speed & Sleep Timer"
      >
        <SlidersHorizontal size={15} />
        {sleepTimer?.mode && (
          <span className="text-[10px] font-mono font-bold tabular-nums">
            {sleepTimer.mode === 'end' ? 'End' : `${sleepRemainingMins}m`}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`glass-menu absolute ${
            align === 'left' ? 'left-0' : 'right-0'
          } ${
            direction === 'up' ? 'bottom-full mb-2.5' : 'top-full mt-2'
          } w-64 rounded-2xl p-3 z-50 animate-modal-pop space-y-3`}
        >
          <div>
            <div className="flex items-center gap-1.5 px-1 mb-2">
              <Gauge size={12} className="text-emerald-400" />
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">
                Playback Speed
              </p>
            </div>
            <div className="grid grid-cols-5 gap-1">
              {SPEEDS.map((r) => (
                <button
                  key={r}
                  onClick={() => setPlaybackRate(r)}
                  className={`py-1.5 rounded-lg text-[11px] font-mono font-semibold transition ${
                    playbackRate === r
                      ? 'bg-emerald-400 text-black shadow'
                      : 'bg-white/[0.05] hover:bg-white/[0.12] text-zinc-300'
                  }`}
                >
                  {r}×
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2.5 border-t border-white/[0.08]">
            <div className="flex items-center justify-between px-1 mb-1.5">
              <div className="flex items-center gap-1.5">
                <Moon size={12} className="text-violet-400" />
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">
                  Sleep Timer
                </p>
              </div>
              {sleepTimer?.mode && (
                <span className="text-[10px] font-mono text-emerald-400">
                  {sleepTimer.mode === 'end' ? 'End of track' : `${sleepRemainingMins}m left`}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1">
              {TIMER_OPTIONS.map((opt) => {
                const active =
                  (opt.id === null && !sleepTimer?.mode) ||
                  (opt.id === 'end' && sleepTimer?.mode === 'end') ||
                  (typeof opt.id === 'number' &&
                    sleepTimer?.mode === 'timed' &&
                    sleepTimer?.minutes === opt.id);
                return (
                  <button
                    key={String(opt.id)}
                    onClick={() => {
                      setSleepTimer(opt.id);
                      setOpen(false);
                    }}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                      active
                        ? 'bg-white/[0.14] text-white'
                        : 'text-zinc-300 hover:bg-white/[0.08] hover:text-white'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {active && <Check size={12} className="text-emerald-400" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
