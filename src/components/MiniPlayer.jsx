import React from 'react';
import { Play, Pause, SkipBack, SkipForward, X } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import CoverArt from './CoverArt';
import Visualizer from './Visualizer';

export default function MiniPlayer() {
  const { currentTrack, isPlaying, togglePlay, next, prev, library, updatePref } = usePlayer();
  if (!library.preferences?.miniPlayerEnabled || !currentTrack) return null;

  return (
    <div className="fixed bottom-24 right-5 z-40 w-80 rounded-2xl bg-[#101018]/95 backdrop-blur-2xl border border-white/15 shadow-[0_20px_60px_rgba(0,0,0,0.75)] p-3 space-y-2.5 animate-modal-pop">
      <div className="flex items-center gap-3">
        <CoverArt item={currentTrack} className="w-11 h-11 rounded-xl object-cover shrink-0 ring-1 ring-white/15" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-white truncate">{currentTrack.title}</p>
          <p className="text-[11px] text-zinc-400 truncate">{currentTrack.artist}</p>
        </div>
        <button
          onClick={() => updatePref({ miniPlayerEnabled: false })}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition"
          title="Close Mini-Player"
        >
          <X size={14} />
        </button>
      </div>
      <Visualizer height={24} barCount={22} />
      <div className="flex items-center justify-center gap-3 pt-0.5">
        <button onClick={prev} className="p-1.5 rounded-full text-zinc-300 hover:text-white hover:bg-white/10 transition">
          <SkipBack size={15} fill="currentColor" />
        </button>
        <button
          onClick={togglePlay}
          className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition"
        >
          {isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
        </button>
        <button onClick={next} className="p-1.5 rounded-full text-zinc-300 hover:text-white hover:bg-white/10 transition">
          <SkipForward size={15} fill="currentColor" />
        </button>
      </div>
    </div>
  );
}
