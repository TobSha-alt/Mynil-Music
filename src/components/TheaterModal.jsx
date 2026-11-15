import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Heart,
  Film,
  Music,
  Mic2,
  Shuffle,
  Repeat,
  Repeat1,
  SlidersHorizontal,
  Maximize2,
  Minimize2,
  Share2,
  RotateCcw,
  RotateCw,
  Volume2,
  Volume1,
  VolumeX,
  Eye,
  EyeOff,
} from 'lucide-react';
import { usePlayer, usePlaybackTime } from '../context/PlayerContext';
import { formatTime } from '../utils/format';
import Visualizer from './Visualizer';
import CoverArt from './CoverArt';
import PlayingBackdrop from './PlayingBackdrop';
import BackdropMenu from './BackdropMenu';
import SyncedLyrics from './SyncedLyrics';
import { usePanMotion } from '../utils/motion';

export default function TheaterModal({ onOpenArtist }) {
  const {
    theaterOpen,
    setTheaterOpen,
    currentTrack,
    activeVideoId,
    proxyBase,
    isPlaying,
    isBuffering,
    duration,
    mediaMode,
    accentRgb,
    lyrics,
    isTrackLiked,
    library,
    audioRef,
    videoRef,
    togglePlay,
    seek,
    next,
    prev,
    switchMediaMode,
    toggleLike,
    toggleShuffle,
    cycleRepeat,
    updatePref,
    setVolume,
    toggleMute,
    playbackRate,
    setPlaybackRate,
    showToast,
  } = usePlayer();
  const { currentTime } = usePlaybackTime();

  const [dragRatio, setDragRatio] = useState(null);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hideTopControls, setHideTopControls] = useState(false);
  const viewMenuRef = useRef(null);
  const progressRef = useRef(null);
  const fillRef = useRef(null);
  const volRef = useRef(null);
  const theaterPrefs = library.preferences || {};
  const volPct = theaterPrefs.muted ? 0 : Math.round((theaterPrefs.volume ?? 0.85) * 100);
  const VolumeIcon = theaterPrefs.muted || volPct === 0 ? VolumeX : volPct < 50 ? Volume1 : Volume2;

  const handleVolumeMouseDown = (e) => {
    if (!volRef.current) return;
    e.preventDefault();
    const ratio = (ev) => {
      const rect = volRef.current.getBoundingClientRect();
      return rect.width > 0 ? Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width)) : 0;
    };
    setVolume(ratio(e));
    const onMove = (ev) => {
      if (!volRef.current) return;
      setVolume(ratio(ev));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const lyricsBox = theaterPrefs.theaterLyricsBox || 'glass';
  const albumSize = theaterPrefs.theaterAlbumSize || 'medium';
  const albumShape = theaterPrefs.theaterAlbumShape || 'rounded';
  const cleanMode = Boolean(theaterPrefs.theaterCleanMode);
  const hideLabels = Boolean(theaterPrefs.theaterHideLabels) || cleanMode || lyricsBox === 'clear';
  const layout =
    mediaMode === 'video'
      ? 'album'
      : theaterPrefs.theaterLayout || (theaterPrefs.theaterLyricsFocus ? 'lyrics' : 'split');
  const showAlbum = layout !== 'lyrics';
  const showLyrics = mediaMode !== 'video' && layout !== 'album';
  const showVisualizer = theaterPrefs.visualizer !== false && !cleanMode;
  const lyricFontSize = theaterPrefs.lyricFontSize || 'normal';
  const visualizerStyle = theaterPrefs.visualizerStyle || 'bars';
  const visualizerColor = theaterPrefs.visualizerColor || 'accent';
  const visualizerSize = theaterPrefs.visualizerSize || 'medium';
  const visualizerDensity = theaterPrefs.visualizerDensity || 'medium';
  const visualizerPeakDelay = Number(theaterPrefs.visualizerPeakDelay ?? 1.2);
  const visualizerAggression = Number(theaterPrefs.visualizerAggression ?? 1.0);
  const visHeight = visualizerSize === 'compact' ? 42 : visualizerSize === 'tall' ? 92 : 64;
  const visBars = visualizerDensity === 'low' ? 28 : visualizerDensity === 'high' ? 72 : 48;

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    if (!viewMenuOpen) return;
    const onDown = (e) => {
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target)) {
        setViewMenuOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setViewMenuOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [viewMenuOpen]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };
  const panAlbumRef = usePanMotion(
    Boolean(theaterPrefs.panningAlbum) && mediaMode !== 'video',
    theaterPrefs.panFrequency ?? 0.6,
    theaterPrefs.panAmplitude ?? 14,
    isPlaying,
    Boolean(theaterPrefs.panRotation)
  );

  // Sync video element whenever Theater opens in video mode or activeVideoId changes
  useEffect(() => {
    if (!theaterOpen || mediaMode !== 'video' || !videoRef.current || !activeVideoId || !proxyBase) return;
    const v = videoRef.current;
    const expectedSrc = `${proxyBase}/stream/${activeVideoId}?mode=video`;
    if (v.src !== expectedSrc) {
      v.muted = true;
      v.src = expectedSrc;
      v.load();
    }
    const syncAndPlay = () => {
      const audioT = audioRef?.current?.currentTime || 0;
      if (Math.abs((v.currentTime || 0) - audioT) > 0.35) {
        v.currentTime = audioT;
      }
      if (isPlaying) v.play().catch(() => {});
      else v.pause();
    };
    if (v.readyState >= 1) syncAndPlay();
    else v.addEventListener('loadedmetadata', syncAndPlay, { once: true });
  }, [theaterOpen, mediaMode, activeVideoId, proxyBase, audioRef, videoRef]);

  useEffect(() => {
    if (!theaterOpen || !isPlaying || dragRatio != null || !duration) return;
    let rafId = 0;
    const step = () => {
      const dur = audioRef?.current?.duration || duration;
      const t = audioRef?.current?.currentTime || 0;
      const ratio = dur > 0 ? Math.max(0, Math.min(1, t / dur)) : 0;
      if (fillRef.current) {
        fillRef.current.style.transform = `scaleX(${ratio})`;
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [theaterOpen, isPlaying, dragRatio, duration, audioRef]);

  useEffect(() => {
    if (!theaterOpen || mediaMode !== 'video' || !videoRef.current) return;
    if (isPlaying) videoRef.current.play().catch(() => {});
    else videoRef.current.pause();
  }, [theaterOpen, mediaMode, isPlaying, videoRef]);

  if (!theaterOpen || !currentTrack) return null;

  const isLiked = isTrackLiked(currentTrack);
  const prefs = library.preferences;
  const backdropMode = prefs?.backdrop || 'aurora';
  const pct =
    dragRatio != null
      ? dragRatio * 100
      : duration > 0
      ? Math.min(100, (currentTime / duration) * 100)
      : 0;

  const handleSeekMouseDown = (e) => {
    if (!progressRef.current || !duration) return;
    e.preventDefault();
    const ratioFromX = (clientX) => {
      const rect = progressRef.current.getBoundingClientRect();
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    };
    setDragRatio(ratioFromX(e.clientX));
    const onMove = (ev) => progressRef.current && setDragRatio(ratioFromX(ev.clientX));
    const onUp = (ev) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (progressRef.current) seek(ratioFromX(ev.clientX) * duration);
      setDragRatio(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#060609] flex flex-col overflow-hidden animate-theater-enter">
      {/* Dynamic Ambient Backdrop Menu Engine */}
      <PlayingBackdrop mode={backdropMode} />

      {/* Top Bar */}
      <div className="relative z-30 h-16 pl-6 pr-6 grid grid-cols-3 items-center drag-region">
        <div className="justify-self-start flex items-center gap-2">
          {!hideTopControls && (
            <button
              onClick={() => setTheaterOpen(false)}
              className="no-drag p-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/[0.1] text-white transition active:scale-95"
              title="Back to Browse"
            >
              <ArrowLeft size={15} />
            </button>
          )}
          <button
            onClick={() => {
              setHideTopControls((prev) => {
                if (!prev) setViewMenuOpen(false);
                return !prev;
              });
            }}
            className={`no-drag p-2 rounded-full border transition active:scale-95 ${
              hideTopControls
                ? 'bg-white/20 border-white/25 text-white'
                : 'bg-white/10 hover:bg-white/20 border-white/[0.1] text-zinc-300 hover:text-white'
            }`}
            title={hideTopControls ? 'Show Top Controls' : 'Hide Top Controls'}
          >
            {hideTopControls ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
        </div>

        {/* Song / Music Video Mode Switch */}
        {!hideTopControls ? (
          <div className="justify-self-center no-drag relative grid grid-cols-2 w-56 p-1 rounded-full bg-black/50 backdrop-blur-2xl border border-white/10">
          <div
            className={`absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-full bg-white shadow-lg transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              mediaMode === 'video' ? 'translate-x-full' : 'translate-x-0'
            }`}
          />
          <button
            onClick={() => switchMediaMode('song')}
            className={`relative z-10 py-1.5 rounded-full text-xs font-bold flex items-center justify-center gap-1.5 transition-colors duration-200 ${
              mediaMode === 'song' ? 'text-black' : 'text-zinc-300 hover:text-white'
            }`}
          >
            <Music size={13} /> Song
          </button>
          <button
            onClick={() => switchMediaMode('video')}
            className={`relative z-10 py-1.5 rounded-full text-xs font-bold flex items-center justify-center gap-1.5 transition-colors duration-200 ${
              mediaMode === 'video' ? 'text-black' : 'text-zinc-300 hover:text-white'
            }`}
          >
            <Film size={13} /> Video
          </button>
          </div>
        ) : (
          <div />
        )}

        {/* Cool Background, View Settings & Fullscreen */}
        {!hideTopControls ? (
          <div className="justify-self-end flex items-center gap-2 no-drag">
          <BackdropMenu align="right" />

          <div ref={viewMenuRef} className="relative">
            <button
              onClick={() => setViewMenuOpen((o) => !o)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-full border text-xs font-semibold transition active:scale-95 ${
                viewMenuOpen
                  ? 'bg-white/20 border-white/25 text-white shadow-lg'
                  : 'bg-white/[0.08] hover:bg-white/[0.15] border-white/[0.1] text-zinc-200 hover:text-white'
              }`}
              title="Lyrics & View Settings"
            >
              <SlidersHorizontal size={14} className="text-emerald-400" />
              <span className="hidden sm:inline">View</span>
            </button>

            {viewMenuOpen && (
              <div className="glass-menu absolute right-0 top-full mt-2 w-80 max-h-[78vh] overflow-y-auto no-scrollbar rounded-2xl p-3.5 z-50 animate-modal-pop space-y-3.5">
                <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400">
                      Lyrics &amp; Theater View
                    </p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">Customize layout, lyrics &amp; waveform</p>
                  </div>
                </div>

                {/* Layout (Split / Album Only / Lyrics Only) */}
                <div>
                  <p className="text-[11px] font-semibold text-zinc-300 mb-1.5">Layout</p>
                  <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                    {[
                      { id: 'split', label: 'Split' },
                      { id: 'album', label: 'Album Only' },
                      { id: 'lyrics', label: 'Lyrics Only' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() =>
                          updatePref({
                            theaterLayout: opt.id,
                            theaterLyricsFocus: opt.id === 'lyrics',
                          })
                        }
                        className={`py-1.5 rounded-lg text-[11px] font-semibold transition ${
                          layout === opt.id
                            ? 'bg-white text-black shadow'
                            : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Lyrics Box */}
                <div>
                  <p className="text-[11px] font-semibold text-zinc-300 mb-1.5">Lyrics Box</p>
                  <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                    {[
                      { id: 'glass', label: 'Glass' },
                      { id: 'minimal', label: 'Minimal' },
                      { id: 'clear', label: 'Clear' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => updatePref({ theaterLyricsBox: opt.id })}
                        className={`py-1.5 rounded-lg text-[11px] font-semibold transition ${
                          lyricsBox === opt.id
                            ? 'bg-white text-black shadow'
                            : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Lyric Text Size */}
                <div>
                  <p className="text-[11px] font-semibold text-zinc-300 mb-1.5">Lyric Text Size</p>
                  <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                    {[
                      { id: 'compact', label: 'Small' },
                      { id: 'normal', label: 'Normal' },
                      { id: 'large', label: 'Large' },
                      { id: 'xl', label: 'XL' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => updatePref({ lyricFontSize: opt.id })}
                        className={`py-1.5 rounded-lg text-[11px] font-semibold transition ${
                          lyricFontSize === opt.id
                            ? 'bg-white text-black shadow'
                            : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Album Size */}
                <div>
                  <p className="text-[11px] font-semibold text-zinc-300 mb-1.5">Album Size</p>
                  <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                    {[
                      { id: 'compact', label: 'Compact' },
                      { id: 'medium', label: 'Medium' },
                      { id: 'large', label: 'Large' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => updatePref({ theaterAlbumSize: opt.id })}
                        className={`py-1.5 rounded-lg text-[11px] font-semibold transition ${
                          albumSize === opt.id
                            ? 'bg-white text-black shadow'
                            : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Album Shape */}
                <div>
                  <p className="text-[11px] font-semibold text-zinc-300 mb-1.5">Album Shape</p>
                  <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                    {[
                      { id: 'rounded', label: 'Rounded' },
                      { id: 'square', label: 'Square' },
                      { id: 'circle', label: 'Circle' },
                      { id: 'vinyl', label: 'Vinyl' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => updatePref({ theaterAlbumShape: opt.id })}
                        className={`py-1.5 rounded-lg text-[11px] font-semibold transition ${
                          albumShape === opt.id
                            ? 'bg-white text-black shadow'
                            : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Waveform Customization */}
                <div className="space-y-2 pt-1.5 border-t border-white/[0.08]">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400">Waveform</p>
                  <div>
                    <p className="text-[11px] font-semibold text-zinc-300 mb-1">Style</p>
                    <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                      {[
                        { id: 'bars', label: 'Bars' },
                        { id: 'mirror', label: 'Mirror' },
                        { id: 'wave', label: 'Wave' },
                        { id: 'minimal', label: 'Dots' },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => updatePref({ visualizerStyle: opt.id })}
                          className={`py-1.5 rounded-lg text-[11px] font-semibold transition ${
                            visualizerStyle === opt.id
                              ? 'bg-white text-black shadow'
                              : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[11px] font-semibold text-zinc-300 mb-1">Color</p>
                      <div className="grid grid-cols-3 gap-0.5 p-0.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                        {[
                          { id: 'accent', label: 'Glow' },
                          { id: 'white', label: 'White' },
                          { id: 'spectrum', label: 'RGB' },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            onClick={() => updatePref({ visualizerColor: opt.id })}
                            className={`py-1 rounded-lg text-[10px] font-semibold transition ${
                              visualizerColor === opt.id
                                ? 'bg-white text-black shadow'
                                : 'text-zinc-300 hover:text-white'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-zinc-300 mb-1">Height</p>
                      <div className="grid grid-cols-3 gap-0.5 p-0.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                        {[
                          { id: 'compact', label: 'S' },
                          { id: 'medium', label: 'M' },
                          { id: 'tall', label: 'L' },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            onClick={() => updatePref({ visualizerSize: opt.id })}
                            className={`py-1 rounded-lg text-[10px] font-semibold transition ${
                              visualizerSize === opt.id
                                ? 'bg-white text-black shadow'
                                : 'text-zinc-300 hover:text-white'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-zinc-300 mb-1">Bar Density</p>
                    <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                      {[
                        { id: 'low', label: 'Chunky' },
                        { id: 'medium', label: 'Balanced' },
                        { id: 'high', label: 'Fine' },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => updatePref({ visualizerDensity: opt.id })}
                          className={`py-1 rounded-lg text-[11px] font-semibold transition ${
                            visualizerDensity === opt.id
                              ? 'bg-white text-black shadow'
                              : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-semibold text-zinc-300">Waveform Aggression</p>
                      <span className="text-[10px] font-mono text-zinc-400">{visualizerAggression.toFixed(1)}×</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.5"
                      step="0.1"
                      value={visualizerAggression}
                      onChange={(e) => updatePref({ visualizerAggression: Number(e.target.value) })}
                      className="w-full accent-emerald-400 cursor-pointer"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-semibold text-zinc-300">White Bar Delay</p>
                      <span className="text-[10px] font-mono text-zinc-400">{visualizerPeakDelay.toFixed(2)}s</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="3.0"
                      step="0.05"
                      value={visualizerPeakDelay}
                      onChange={(e) => updatePref({ visualizerPeakDelay: Number(e.target.value) })}
                      className="w-full accent-emerald-400 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Mode Toggles */}
                <div className="space-y-1.5 pt-1.5 border-t border-white/[0.08]">
                  {[
                    {
                      key: 'theaterCleanMode',
                      label: 'Clean Mode',
                      desc: 'Hide visualizer, labels & extra chrome',
                      val: cleanMode,
                    },
                    {
                      key: 'theaterHideLabels',
                      label: 'Hide Labels & Hints',
                      desc: 'Remove LYRICS & Click to seek text',
                      val: Boolean(theaterPrefs.theaterHideLabels),
                    },
                    {
                      key: 'visualizer',
                      label: 'Show Waveform',
                      desc: 'Spectrum bars under artwork',
                      val: theaterPrefs.visualizer !== false,
                    },
                  ].map((item) => (
                    <button
                      key={item.key}
                      onClick={() => updatePref({ [item.key]: !item.val })}
                      className="w-full flex items-center justify-between px-2 py-1.5 rounded-xl hover:bg-white/[0.06] transition text-left"
                    >
                      <div>
                        <p className="text-xs font-semibold text-white">{item.label}</p>
                        <p className="text-[10px] text-zinc-400">{item.desc}</p>
                      </div>
                      <div
                        className={`w-8 h-4.5 rounded-full p-0.5 transition-colors ${
                          item.val ? 'bg-emerald-500' : 'bg-white/15'
                        }`}
                      >
                        <div
                          className={`w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${
                            item.val ? 'translate-x-3.5' : 'translate-x-0'
                          }`}
                        />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-full bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.1] text-zinc-200 hover:text-white transition active:scale-95"
            title={isFullscreen ? 'Exit Fullscreen (F11)' : 'Fullscreen (F11)'}
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          </div>
        ) : (
          <div />
        )}
      </div>

      {/* Main Content */}
      <div
        className={`relative z-10 flex-1 min-h-0 px-10 py-4 grid gap-8 items-center mx-auto w-full ${
          layout === 'split'
            ? 'grid-cols-1 lg:grid-cols-12 max-w-7xl'
            : layout === 'lyrics' || mediaMode === 'video'
            ? 'grid-cols-1 max-w-4xl'
            : 'grid-cols-1 max-w-3xl'
        }`}
      >
        {/* Left: Artwork OR Live Music Video + Visualizer */}
        {showAlbum && (
          <div className={`${layout === 'split' ? 'lg:col-span-7' : ''} flex flex-col items-center justify-center`}>
            {mediaMode === 'video' ? (
              <div className="w-full aspect-video rounded-3xl overflow-hidden bg-black/80 border border-white/10 shadow-2xl relative">
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  className="w-full h-full object-contain bg-black"
                />
                {isBuffering && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full border-3 border-emerald-400 border-t-transparent animate-spin" />
                  </div>
                )}
              </div>
            ) : (
              <div
                ref={panAlbumRef}
                className={`relative overflow-hidden shadow-[0_30px_90px_rgba(0,0,0,0.75)] ring-1 ring-white/15 will-change-transform transition-[width,height,border-radius] duration-300 ${
                  albumSize === 'compact'
                    ? 'w-56 h-56 sm:w-64 sm:h-64'
                    : albumSize === 'large'
                    ? 'w-80 h-80 sm:w-[440px] sm:h-[440px]'
                    : 'w-72 h-72 sm:w-96 sm:h-96'
                } ${
                  albumShape === 'circle' || albumShape === 'vinyl'
                    ? 'rounded-full'
                    : albumShape === 'rounded'
                    ? 'rounded-3xl'
                    : 'rounded-none'
                }`}
              >
                {albumShape === 'vinyl' ? (
                  <div
                    className="relative w-full h-full rounded-full flex items-center justify-center animate-[spin_9s_linear_infinite]"
                    style={{
                      animationPlayState: isPlaying ? 'running' : 'paused',
                      backgroundColor: '#0a0a0d',
                      backgroundImage:
                        'conic-gradient(from 35deg, transparent 0deg, rgba(255,255,255,0.09) 28deg, transparent 58deg, transparent 180deg, rgba(255,255,255,0.06) 208deg, transparent 238deg), repeating-radial-gradient(circle, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 4px)',
                    }}
                  >
                    <div className="w-[44%] h-[44%] rounded-full overflow-hidden ring-2 ring-black/80 shadow-2xl relative">
                      <CoverArt
                        item={currentTrack}
                        loading="eager"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="absolute w-3.5 h-3.5 rounded-full bg-zinc-950 ring-1 ring-white/25 shadow-inner pointer-events-none" />
                  </div>
                ) : (
                  <CoverArt
                    item={currentTrack}
                    loading="eager"
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
            )}

            {/* Live Audio Spectrum */}
            {showVisualizer && (
              <div className="w-full max-w-xl mt-6">
                <Visualizer height={visHeight} barCount={visBars} />
              </div>
            )}
          </div>
        )}

        {/* Right: Synced Lyrics Panel */}
        {showLyrics && (
          <div
            className={`${
              layout === 'lyrics' ? 'h-full max-h-[640px]' : 'lg:col-span-5 h-full max-h-[500px]'
            } min-h-0 rounded-3xl p-6 flex flex-col transition-all duration-300 ${
              lyricsBox === 'clear'
                ? 'bg-transparent border border-transparent shadow-none'
                : lyricsBox === 'minimal'
                ? 'bg-black/15 backdrop-blur-sm border border-white/[0.05]'
                : 'bg-black/35 backdrop-blur-xl border border-white/10'
            }`}
          >
            {!hideLabels && (
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2 shrink-0">
                <span className="flex items-center gap-2">
                  <Mic2 size={14} className="text-emerald-400" /> Lyrics
                </span>
              </div>
            )}
            <div className="flex-1 min-h-0">
              <SyncedLyrics variant="theater" hideHeader={hideLabels} />
            </div>
          </div>
        )}
      </div>

      {/* Bottom Transport Controls */}
      <div className="relative z-10 px-10 pb-8 pt-2 max-w-4xl mx-auto w-full">
        <div className="flex items-center justify-between mb-3">
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold text-white truncate">{currentTrack.title}</h2>
            <p
              onClick={() => {
                if (currentTrack.artistId) {
                  setTheaterOpen(false);
                  onOpenArtist(currentTrack.artistId);
                }
              }}
              className="text-sm text-zinc-300 hover:underline cursor-pointer truncate"
            >
              {currentTrack.artist}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Volume Slider */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10">
              <button
                onClick={toggleMute}
                className="text-zinc-300 hover:text-white transition active:scale-90"
                title={theaterPrefs.muted ? 'Unmute' : 'Mute'}
              >
                <VolumeIcon size={16} />
              </button>
              <div
                ref={volRef}
                onMouseDown={handleVolumeMouseDown}
                className="group relative w-24 h-4 flex items-center cursor-pointer"
                title={`Volume ${volPct}%`}
              >
                <div className="w-full h-1 group-hover:h-1.5 rounded-full bg-white/20 overflow-hidden transition-all">
                  <div
                    className="h-full rounded-full bg-zinc-200 group-hover:bg-emerald-400 transition-colors"
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
              onClick={() => {
                const speeds = [0.75, 1, 1.25, 1.5];
                const idx = speeds.indexOf(playbackRate);
                const nextRate = speeds[(idx + 1) % speeds.length];
                setPlaybackRate(nextRate);
                showToast?.(`Playback speed: ${nextRate}x`);
              }}
              className="px-2.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs font-mono font-bold text-zinc-200 transition"
              title="Cycle Playback Speed"
            >
              {playbackRate}x
            </button>
            <button
              onClick={() => {
                const url = `https://music.youtube.com/watch?v=${activeVideoId || currentTrack.videoId}`;
                navigator.clipboard?.writeText(url).then(() => showToast?.('Track link copied to clipboard'));
              }}
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white transition"
              title="Copy Track Link"
            >
              <Share2 size={17} />
            </button>
            <button
              onClick={() => toggleLike(currentTrack)}
              className={`p-2.5 rounded-full bg-white/10 hover:bg-white/20 transition ${
                isLiked ? 'text-emerald-400' : 'text-zinc-300'
              }`}
            >
              <Heart size={20} fill={isLiked ? 'currentColor' : 'none'} />
            </button>
          </div>
        </div>

        {/* Scrubber */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs font-mono text-zinc-400 w-10 text-right">{formatTime(currentTime)}</span>
          <div
            ref={progressRef}
            onMouseDown={handleSeekMouseDown}
            className="flex-1 h-4 flex items-center cursor-pointer group"
          >
            <div className="w-full h-1.5 group-hover:h-2 rounded-full bg-white/15 overflow-hidden transition-[height]">
              <div
                ref={fillRef}
                className="w-full h-full rounded-full origin-left will-change-transform"
                style={{ transform: `scaleX(${pct / 100})`, backgroundColor: 'rgb(var(--accent))' }}
              />
            </div>
          </div>
          <span className="text-xs font-mono text-zinc-400 w-10">{formatTime(duration)}</span>
        </div>

        <div className="flex items-center justify-center gap-6">
          <button
            onClick={toggleShuffle}
            className={`p-2 rounded-full transition ${prefs.shuffle ? 'text-emerald-400' : 'text-zinc-400 hover:text-white'}`}
          >
            <Shuffle size={18} />
          </button>
          <button
            onClick={() => seek(Math.max(0, currentTime - 10))}
            className="p-2 text-zinc-400 hover:text-white transition"
            title="Rewind 10s"
          >
            <RotateCcw size={18} />
          </button>
          <button onClick={prev} className="p-2 text-white hover:scale-110 transition">
            <SkipBack size={26} fill="currentColor" />
          </button>
          <button
            onClick={togglePlay}
            className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center shadow-2xl btn-glow"
          >
            {isBuffering ? (
              <div className="w-6 h-6 rounded-full border-2 border-black border-t-transparent animate-spin" />
            ) : isPlaying ? (
              <Pause size={24} fill="currentColor" />
            ) : (
              <Play size={24} fill="currentColor" className="ml-0.5" />
            )}
          </button>
          <button onClick={next} className="p-2 text-white hover:scale-110 transition">
            <SkipForward size={26} fill="currentColor" />
          </button>
          <button
            onClick={() => seek(Math.min(duration || 0, currentTime + 10))}
            className="p-2 text-zinc-400 hover:text-white transition"
            title="Forward 10s"
          >
            <RotateCw size={18} />
          </button>
          <button
            onClick={cycleRepeat}
            className={`p-2 rounded-full transition ${
              prefs.repeat !== 'off' ? 'text-emerald-400' : 'text-zinc-400 hover:text-white'
            }`}
          >
            {prefs.repeat === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}
