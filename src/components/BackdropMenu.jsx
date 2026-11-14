import React, { useEffect, useRef, useState } from 'react';
import { Palette, Check, ChevronDown, Minus, Plus, RotateCcw } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { BACKDROP_PRESETS } from './PlayingBackdrop';

export default function BackdropMenu({
  align = 'right',
  direction = 'down',
  compact = false,
  hideStarfield = false,
}) {
  const { library, updatePref, accentRgb } = usePlayer();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const activeBackdrop = library.preferences?.backdrop || 'aurora';
  const syncOffset = Number(library.preferences?.lyricSyncOffset || 0);
  const visiblePresets = hideStarfield
    ? BACKDROP_PRESETS.filter((p) => p.id !== 'starfield')
    : BACKDROP_PRESETS;
  const currentPreset = BACKDROP_PRESETS.find((p) => p.id === activeBackdrop) || BACKDROP_PRESETS[0];

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
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

  const adjustOffset = (delta) => {
    const next = Math.max(-5, Math.min(5, Math.round((syncOffset + delta) * 100) / 100));
    updatePref({ lyricSyncOffset: next });
  };

  return (
    <div ref={wrapRef} className="relative no-drag">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 rounded-full border transition-all duration-200 active:scale-95 ${
          compact ? 'px-2.5 py-1 text-[11px]' : 'px-3.5 py-2 text-xs'
        } ${
          open
            ? 'bg-white/20 border-white/25 text-white shadow-lg'
            : 'bg-white/[0.08] hover:bg-white/[0.15] border-white/[0.1] text-zinc-200 hover:text-white'
        }`}
        title="Background & Lyrics Sync Menu"
      >
        <span
          className={`w-2.5 h-2.5 rounded-full bg-gradient-to-tr ${currentPreset.swatch} ring-1 ring-white/40`}
        />
        <Palette size={compact ? 12 : 14} className="text-emerald-400" />
        {!compact && <span className="font-semibold">{currentPreset.name}</span>}
        <ChevronDown
          size={compact ? 11 : 13}
          className={`text-zinc-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          className={`glass-menu absolute ${
            align === 'left' ? 'left-0' : 'right-0'
          } ${
            direction === 'up' ? 'bottom-full mb-2.5' : 'top-full mt-2'
          } w-72 rounded-2xl p-3 z-50 animate-modal-pop`}
        >
          <div className="flex items-center justify-between px-1 pb-2.5 mb-2.5 border-b border-white/[0.08]">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400">
                Playing Background
              </p>
              <p className="text-[11px] text-zinc-500 mt-0.5">Ambient scene behind lyrics & player</p>
            </div>
            <span
              className="w-3 h-3 rounded-full shadow"
              style={{ backgroundColor: `rgb(${accentRgb})`, boxShadow: `0 0 12px rgba(${accentRgb}, 0.7)` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {visiblePresets.map((preset) => {
              const selected = activeBackdrop === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => updatePref({ backdrop: preset.id })}
                  className={`group text-left p-2 rounded-xl border transition-all duration-150 ${
                    selected
                      ? 'bg-white/[0.12] border-emerald-400/50 shadow-md'
                      : 'bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.06]'
                  }`}
                >
                  <div
                    className={`h-8 rounded-lg mb-1.5 bg-gradient-to-br ${preset.swatch} relative overflow-hidden ring-1 ring-white/15`}
                  >
                    {selected && (
                      <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-black/70 text-emerald-400 flex items-center justify-center">
                        <Check size={10} strokeWidth={3} />
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-white truncate">{preset.name}</p>
                  <p className="text-[10px] text-zinc-400 truncate">{preset.desc}</p>
                </button>
              );
            })}
          </div>

          {/* Synced Lyrics Timing Adjustment */}
          <div className="mt-3 pt-2.5 border-t border-white/[0.08] flex items-center justify-between px-1">
            <div>
              <p className="text-[11px] font-semibold text-zinc-200">Lyrics Timing</p>
              <p className="text-[10px] text-zinc-500">Fine-tune sync offset</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => adjustOffset(-0.25)}
                className="w-6 h-6 rounded-lg bg-white/[0.07] hover:bg-white/[0.15] text-zinc-200 flex items-center justify-center transition active:scale-90"
                title="Delay lyrics 0.25s"
              >
                <Minus size={11} />
              </button>
              <span className="w-12 text-center text-[11px] font-mono tabular-nums text-zinc-300">
                {syncOffset > 0 ? `+${syncOffset.toFixed(2)}s` : `${syncOffset.toFixed(2)}s`}
              </span>
              <button
                onClick={() => adjustOffset(0.25)}
                className="w-6 h-6 rounded-lg bg-white/[0.07] hover:bg-white/[0.15] text-zinc-200 flex items-center justify-center transition active:scale-90"
                title="Advance lyrics 0.25s"
              >
                <Plus size={11} />
              </button>
              {syncOffset !== 0 && (
                <button
                  onClick={() => updatePref({ lyricSyncOffset: 0 })}
                  className="w-6 h-6 rounded-lg bg-white/[0.05] hover:bg-white/[0.14] text-zinc-400 hover:text-white flex items-center justify-center transition"
                  title="Reset sync offset"
                >
                  <RotateCcw size={10} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
