import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Heart,
  Volume2,
  Volume1,
  VolumeX,
  ListMusic,
  Mic2,
  Maximize2,
  Film,
  Music,
  Activity,
} from 'lucide-react';
import { usePlayer, usePlaybackTime } from '../context/PlayerContext';
import { formatTime } from '../utils/format';
import CoverArt from './CoverArt';
import BackdropMenu from './BackdropMenu';
import AudioToolsMenu from './AudioToolsMenu';

export default function PlayerBar({ onOpenArtist }) {
  const {
    currentTrack,
    isPlaying,
    isBuffering,
    duration,
    mediaMode,
    accentRgb,
    library,
    isTrackLiked,
    rightDrawer,
    setRightDrawer,
    setTheaterOpen,
    errorMsg,
    audioRef,
    togglePlay,
    seek,
    next,
    prev,
    switchMediaMode,
    setVolume,
    toggleMute,
    updatePref,
    toggleShuffle,
    cycleRepeat,
    toggleLike,
  } = usePlayer();
  const { currentTime } = usePlaybackTime();

  const [hoverRatio, setHoverRatio] = useState(null);
  const [dragRatio, setDragRatio] = useState(null);
  const [showRemaining, setShowRemaining] = useState(false);
  const [heartPop, setHeartPop] = useState(false);
  const progressRef = useRef(null);
  const fillRef = useRef(null);
  const thumbRef = useRef(null);
  const volRef = useRef(null);

  const prefs = library.preferences;
  const isLiked = currentTrack ? isTrackLiked(currentTrack) : false;
  const pct =
    dragRatio != null
      ? dragRatio * 100
      : duration > 0
      ? Math.min(100, (currentTime / duration) * 100)
      : 0;
  const volPct = prefs.muted ? 0 : Math.round((prefs.volume ?? 0.85) * 100);

  // 60-120fps silky scrubber bar animation directly via GPU transform
  useEffect(() => {
    if (!isPlaying || dragRatio != null || !duration) return;
    let rafId = 0;
    const step = () => {
      const dur = audioRef?.current?.duration || duration;
      const t = audioRef?.current?.currentTime || 0;
      const ratio = dur > 0 ? Math.max(0, Math.min(1, t / dur)) : 0;
      if (fillRef.current) {
        fillRef.current.style.transform = `scaleX(${ratio})`;
      }
      if (thumbRef.current) {
        thumbRef.current.style.left = `${ratio * 100}%`;
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, dragRatio, duration, audioRef]);

  const ratioFromPointer = (el, clientX) => {
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const handleSeekMouseDown = (e) => {
    if (!progressRef.current || !duration) return;
    e.preventDefault();
    const initial = ratioFromPointer(progressRef.current, e.clientX);
    setDragRatio(initial);

    const onMove = (ev) => {
      if (!progressRef.current) return;
      const nextRatio = ratioFromPointer(progressRef.current, ev.clientX);
      setDragRatio(nextRatio);
      setHoverRatio(nextRatio);
    };
    const onUp = (ev) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (progressRef.current) {
        const finalRatio = ratioFromPointer(progressRef.current, ev.clientX);
        seek(finalRatio * duration);
      }
      setDragRatio(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleProgressMove = (e) => {
    if (!progressRef.current || !duration) return;
    setHoverRatio(ratioFromPointer(progressRef.current, e.clientX));
  };

  const handleVolumeMouseDown = (e) => {
    if (!volRef.current) return;
    e.preventDefault();
    setVolume(ratioFromPointer(volRef.current, e.clientX));

    const onMove = (ev) => {
      if (!volRef.current) return;
      setVolume(ratioFromPointer(volRef.current, ev.clientX));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleLike = () => {
    if (!currentTrack) return;
    setHeartPop(true);
    setTimeout(() => setHeartPop(false), 440);
    toggleLike(currentTrack);
  };

  const VolumeIcon = prefs.muted || volPct === 0 ? VolumeX : volPct < 50 ? Volume1 : Volume2;

  return (
    <footer className="h-[92px] shrink-0 px-6 pb-3.5 pt-1 z-40">
      <div
        className="relative h-full max-w-6xl mx-auto rounded-2xl bg-[#070709]/92 backdrop-blur-2xl border border-white/[0.09] shadow-[0_24px_64px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.06)] px-5 flex items-center justify-between gap-4"
      >
        {/* Subtle ambient accent rim glow clipped cleanly inside card radius */}
        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
          {currentTrack && (
            <div
              className="absolute inset-x-0 top-0 h-[1px] opacity-65 transition-all duration-700"
              style={{
                background: `linear-gradient(90deg, transparent, rgba(${accentRgb}, 0.85), transparent)`,
              }}
            />
          )}
        </div>

        {/* Left: Track Info */}
        <div className="w-[28%] min-w-[200px] flex items-center gap-3">
          {currentTrack ? (
            <>
              <button
                onClick={() => setTheaterOpen(true)}
                className="relative w-12 h-12 rounded-lg overflow-hidden bg-zinc-900 shrink-0 group shadow-lg ring-1 ring-white/15"
                title="Open Theater View"
              >
                <CoverArt
                  item={currentTrack}
                  loading="eager"
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                />
                <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                  <Maximize2 size={14} className="text-white" />
                </div>
              </button>
              <div className="min-w-0 flex-1">
                <p
                  onClick={() => setTheaterOpen(true)}
                  className="text-sm font-bold text-white truncate cursor-pointer hover:underline"
                >
                  {currentTrack.title}
                </p>
                <p
                  onClick={() => currentTrack.artistId && onOpenArtist(currentTrack.artistId)}
                  className={`text-xs text-zinc-400 truncate ${
                    currentTrack.artistId ? 'hover:text-white hover:underline cursor-pointer' : ''
                  }`}
                >
                  {currentTrack.artist}
                </p>
                {errorMsg && <p className="text-[10px] text-zinc-200 truncate">{errorMsg}</p>}
              </div>
              <button
                onClick={handleLike}
                className={`p-2 rounded-xl transition-all duration-150 active:scale-90 ${
                  isLiked ? 'text-white' : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
                } ${heartPop ? 'animate-heart-pop' : ''}`}
                title={isLiked ? 'Unlike' : 'Like'}
              >
                <Heart size={17} fill={isLiked ? 'currentColor' : 'none'} />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3 text-zinc-500">
              <div className="w-12 h-12 bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
                <Music size={18} />
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-300">Ready to stream</p>
                <p className="text-[11px] text-zinc-500">Pick any song or music video</p>
              </div>
            </div>
          )}
        </div>

        {/* Center: Controls & Scrubber */}
        <div className="flex-1 max-w-[540px] flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-3.5">
            <button
              onClick={toggleShuffle}
              className={`p-1.5 rounded-xl transition-all duration-150 active:scale-90 ${
                prefs.shuffle
                  ? 'text-white bg-white/15'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
              }`}
              title="Shuffle"
            >
              <Shuffle size={15} />
            </button>

            <button
              onClick={prev}
              disabled={!currentTrack}
              className="p-1.5 rounded-xl text-zinc-200 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 transition-all duration-150 active:scale-90"
              title="Previous"
            >
              <SkipBack size={19} fill="currentColor" />
            </button>

            <button
              onClick={togglePlay}
              disabled={!currentTrack}
              className="relative w-10 h-10 rounded-xl bg-white text-black flex items-center justify-center shadow-lg btn-glow disabled:opacity-40"
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isBuffering ? (
                <div className="w-5 h-5 rounded-full border-2 border-black border-t-transparent animate-spin" />
              ) : isPlaying ? (
                <Pause size={18} fill="currentColor" />
              ) : (
                <Play size={18} fill="currentColor" className="ml-0.5" />
              )}
            </button>

            <button
              onClick={next}
              disabled={!currentTrack}
              className="p-1.5 rounded-xl text-zinc-200 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 transition-all duration-150 active:scale-90"
              title="Next"
            >
              <SkipForward size={19} fill="currentColor" />
            </button>

            <button
              onClick={cycleRepeat}
              className={`p-1.5 rounded-xl transition-all duration-150 active:scale-90 ${
                prefs.repeat !== 'off'
                  ? 'text-white bg-white/15'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
              }`}
              title={`Repeat: ${prefs.repeat}`}
            >
              {prefs.repeat === 'one' ? <Repeat1 size={15} /> : <Repeat size={15} />}
            </button>
          </div>

          {/* Interactive Scrubber */}
          <div className="w-full flex items-center gap-2.5">
            <span className="w-10 text-right text-[11px] font-mono tabular-nums text-zinc-400">
              {formatTime(currentTime)}
            </span>
            <div
              ref={progressRef}
              onMouseDown={handleSeekMouseDown}
              onMouseMove={handleProgressMove}
              onMouseLeave={() => setHoverRatio(null)}
              className="group relative flex-1 h-4 flex items-center cursor-pointer"
            >
              <div className="w-full h-1 group-hover:h-1.5 rounded-full bg-white/15 overflow-hidden transition-[height] duration-150">
                <div
                  ref={fillRef}
                  className="w-full h-full rounded-full origin-left will-change-transform"
                  style={{
                    transform: `scaleX(${pct / 100})`,
                    backgroundColor: 'rgb(var(--accent))',
                  }}
                />
              </div>
              <div
                ref={thumbRef}
                className="absolute w-3 h-3 rounded-full bg-white shadow-md scale-0 group-hover:scale-100 transition-transform duration-150 -translate-x-1/2 pointer-events-none"
                style={{ left: `${pct}%` }}
              />
              {hoverRatio != null && duration > 0 && (
                <div
                  className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded-lg bg-[#161622]/95 border border-white/15 shadow-lg text-[10px] font-mono text-white pointer-events-none"
                  style={{ left: `${hoverRatio * 100}%` }}
                >
                  {formatTime(hoverRatio * duration)}
                </div>
              )}
            </div>
            <button
              onClick={() => setShowRemaining((r) => !r)}
              className="w-11 text-left text-[11px] font-mono tabular-nums text-zinc-400 hover:text-white transition"
              title="Toggle remaining time"
            >
              {showRemaining && duration > 0
                ? `-${formatTime(Math.max(0, duration - currentTime))}`
                : formatTime(duration)}
            </button>
          </div>
        </div>

        {/* Right: Lyrics Button, Visualizer, Backdrop, Audio Tools, Queue, Volume */}
        <div className="w-[30%] min-w-[240px] flex items-center justify-end gap-1.5 shrink-0">
          <button
            onClick={() => setRightDrawer((d) => (d === 'lyrics' ? null : 'lyrics'))}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold border flex items-center gap-1.5 transition-all duration-150 active:scale-95 ${
              rightDrawer === 'lyrics'
                ? 'bg-white text-black border-white shadow'
                : 'bg-white/[0.04] hover:bg-white/[0.1] border-white/[0.1] text-zinc-200 hover:text-white'
            }`}
            title="Lyrics (L)"
          >
            <Mic2 size={13} />
            Lyrics
          </button>

          <button
            onClick={() => updatePref({ visualizer: !prefs.visualizer })}
            className={`shrink-0 p-2 rounded-xl transition-all duration-150 active:scale-90 ${
              prefs.visualizer
                ? 'text-white bg-white/12'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.08]'
            }`}
            title="Toggle Live Visualizer"
          >
            <Activity size={16} />
          </button>

          {currentTrack && <BackdropMenu align="right" direction="up" compact />}

          <AudioToolsMenu align="right" direction="up" />

          <button
            onClick={() => setRightDrawer((d) => (d === 'queue' ? null : 'queue'))}
            className={`shrink-0 p-2 rounded-xl transition-all duration-150 active:scale-90 ${
              rightDrawer === 'queue'
                ? 'text-white bg-white/12'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.08]'
            }`}
            title="Queue & Up Next (Q)"
          >
            <ListMusic size={16} />
          </button>

          {/* Sleek Custom Volume Bar */}
          <div className="hidden md:flex items-center gap-2 pl-1 shrink-0">
            <button
              onClick={toggleMute}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.07] transition active:scale-90"
              title={prefs.muted ? 'Unmute' : 'Mute'}
            >
              <VolumeIcon size={16} />
            </button>
            <div
              ref={volRef}
              onMouseDown={handleVolumeMouseDown}
              className="group relative w-20 h-4 flex items-center cursor-pointer"
              title={`Volume ${volPct}%`}
            >
              <div className="w-full h-1 group-hover:h-1.5 rounded-full bg-white/15 overflow-hidden transition-all">
                <div
                  className="h-full rounded-full bg-zinc-200 group-hover:bg-white transition-colors"
                  style={{ width: `${volPct}%` }}
                />
              </div>
              <div
                className="absolute w-2.5 h-2.5 rounded-full bg-white shadow scale-0 group-hover:scale-100 transition-transform -translate-x-1/2 pointer-events-none"
                style={{ left: `${volPct}%` }}
              />
            </div>
          </div>

          <button
            onClick={() => setTheaterOpen(true)}
            disabled={!currentTrack}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.08] disabled:opacity-30 transition-all duration-150 active:scale-90"
            title="Fullscreen Theater"
          >
            <Maximize2 size={15} />
          </button>
        </div>
      </div>
    </footer>
  );
}
