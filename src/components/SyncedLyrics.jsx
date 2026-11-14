import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, Minus, Plus } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { formatTime } from '../utils/format';
import { getTrackIdentityKey } from '../utils/trackIdentity';

function playingLatency(ctx, playing) {
  if (!playing || !ctx) return 0;
  const raw = Number(ctx.outputLatency || ctx.baseLatency || 0);
  return Number.isFinite(raw) ? Math.max(0, Math.min(0.35, raw)) : 0;
}

function InstrumentalWaveform({ variant = 'drawer', progress = 0, progressRef = null, active = true }) {
  const { analyserRef, isPlaying, accentRgb } = usePlayer();
  const canvasRef = useRef(null);

  const liveRef = useRef({
    isPlaying,
    accentRgb,
    active,
    progress,
  });
  liveRef.current = { isPlaying, accentRgb, active, progress };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let phase = 0;
    let lastTs = performance.now();
    const barCount = variant === 'theater' ? 22 : 16;
    const smoothBars = new Float32Array(barCount);
    let bins = null;

    let w = variant === 'theater' ? 184 : 136;
    let h = variant === 'theater' ? 34 : 26;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const syncSize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth || (variant === 'theater' ? 184 : 136);
      h = canvas.clientHeight || (variant === 'theater' ? 34 : 26);
      const pw = Math.max(1, Math.round(w * dpr));
      const ph = Math.max(1, Math.round(h * dpr));
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
    };
    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(canvas);

    const draw = (now) => {
      const dt = Math.min(0.05, Math.max(0.0005, (now - lastTs) / 1000));
      lastTs = now;

      const {
        isPlaying: playing,
        accentRgb: rgb,
        active: rowActive,
        progress: propProgress,
      } = liveRef.current;

      const prog = progressRef ? progressRef.current : propProgress;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const analyser = analyserRef?.current;
      let hasSignal = false;
      if (analyser && playing) {
        if (!bins || bins.length !== analyser.frequencyBinCount) {
          bins = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(bins);
        for (let k = 0; k < bins.length; k++) {
          if (bins[k] > 2) {
            hasSignal = true;
            break;
          }
        }
      }

      // Freeze waveform shape when paused; resume smoothly when playing again (never pan inline lyric bar)
      if (playing && rowActive) {
        phase += dt * 6.8;
      }
      const smoothFactor = 1 - Math.exp(-dt * 18);
      const gap = 3;
      const barW = Math.max(2, (w - gap * (barCount - 1)) / barCount);

      for (let i = 0; i < barCount; i++) {
        if (playing) {
          const centerFactor = 1 - Math.abs((i - (barCount - 1) / 2) / (barCount / 2)) * 0.38;
          let energy = smoothBars[i] > 0 ? smoothBars[i] : 0.24 * centerFactor;
          if (rowActive) {
            if (hasSignal) {
              const binIdx = Math.min(bins.length - 1, Math.floor((i / barCount) * (bins.length * 0.55)));
              energy = (bins[binIdx] / 255) * 0.85 + 0.2;
            } else {
              energy =
                (0.46 +
                  0.28 * Math.sin(phase + i * 0.62) +
                  0.18 * Math.cos(phase * 1.45 - i * 0.38) +
                  0.1 * Math.sin(phase * 0.55 + i * 1.1)) *
                centerFactor;
            }
          }
          const target = Math.max(0.18, Math.min(1, energy * centerFactor));
          smoothBars[i] += (target - smoothBars[i]) * smoothFactor;
        } else if (smoothBars[i] === 0) {
          // Initialize clean resting bars if mounted already paused
          const centerFactor = 1 - Math.abs((i - (barCount - 1) / 2) / (barCount / 2)) * 0.45;
          smoothBars[i] = (0.28 + 0.14 * Math.sin(i * 0.7)) * centerFactor;
        }

        const barH = Math.max(3, smoothBars[i] * (h - 2));
        const x = i * (barW + gap);
        const y = (h - barH) / 2;

        const lit = rowActive && prog > 0 ? (i + 1) / barCount <= prog : false;
        ctx.fillStyle = lit
          ? `rgba(${rgb}, 0.95)`
          : rowActive
          ? `rgba(255, 255, 255, ${0.35 + smoothBars[i] * 0.55})`
          : 'rgba(255, 255, 255, 0.28)';

        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, barW / 2);
        ctx.fill();
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [analyserRef, variant, progressRef]);

  return (
    <div className="inline-flex items-center">
      <canvas
        ref={canvasRef}
        style={{
          width: variant === 'theater' ? 184 : 136,
          height: variant === 'theater' ? 34 : 26,
        }}
        className="block"
      />
    </div>
  );
}

export default function SyncedLyrics({ variant = 'drawer', hideHeader = false }) {
  const { currentTrack, lyrics, isPlaying, audioRef, audioCtxRef, seek, library, updatePref, accentRgb, mediaMode, videoIntroOffset } =
    usePlayer();
  const scrollRef = useRef(null);
  const lineRefs = useRef([]);
  const [userScrolling, setUserScrolling] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [inLeadIntro, setInLeadIntro] = useState(false);

  const activeIndexRef = useRef(-1);
  const inLeadIntroRef = useRef(false);
  const activeProgressRef = useRef(0);
  const introProgressRef = useRef(0);
  const activeProgressFillRef = useRef(null);
  const introCountdownRef = useRef(null);
  const lastCountdownSecRef = useRef(-1);
  const resumeTimerRef = useRef(null);
  const scrollAnimRef = useRef(0);

  const prefs = library.preferences || {};
  const globalOffset = Number(prefs.lyricSyncOffset || 0);
  const trackKey = currentTrack ? getTrackIdentityKey(currentTrack) || currentTrack.videoId || '' : '';
  const trackOffset = trackKey ? Number(prefs.trackSyncOffsets?.[trackKey] || 0) : 0;
  const syncOffset = globalOffset + trackOffset;
  const showLyricTimings = Boolean(prefs.showLyricTimings);
  const showLyricProgress = Boolean(prefs.showLyricProgress);
  const blurInactiveLyrics = Boolean(prefs.blurInactiveLyrics);
  const lyricFontSize = prefs.lyricFontSize || 'normal';
  const lyricAlign = prefs.lyricAlign || 'left';
  const lyricTransitionMs = Math.max(150, Math.min(1200, Number(prefs.lyricTransitionMs ?? 550)));
  const lines = lyrics.lines || [];
  const isSynced = Boolean(lyrics.synced && lines.length > 0);
  const firstVocalTime = lines[0]?.time ?? 0;
  const activeVideoOffset = 0;

  // Sync active lyric index & GPU progress bar straight from <audio>.currentTime without per-frame React re-renders
  const syncFromAudioTime = useCallback(() => {
    if (!isSynced) {
      if (activeIndexRef.current !== -1) {
        activeIndexRef.current = -1;
        setActiveIndex(-1);
      }
      if (inLeadIntroRef.current) {
        inLeadIntroRef.current = false;
        setInLeadIntro(false);
      }
      return;
    }

    const rawT = audioRef?.current?.currentTime ?? 0;
    const outputLatency = playingLatency(audioCtxRef?.current, isPlaying);
    const effectiveTime = rawT - activeVideoOffset - outputLatency + syncOffset + 0.04;

    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time != null && lines[i].time <= effectiveTime) idx = i;
      else break;
    }

    const nextInIntro = idx === -1 && firstVocalTime > 1.8 && effectiveTime >= 0;
    const nextIntroProg = nextInIntro ? Math.max(0, Math.min(1, effectiveTime / firstVocalTime)) : 0;
    introProgressRef.current = nextIntroProg;

    if (idx >= 0 && idx < lines.length) {
      const start = lines[idx].time ?? 0;
      const nextLine = lines[idx + 1];
      const end = nextLine?.time != null ? nextLine.time : start + 4.5;
      const span = Math.max(0.35, end - start);
      const prog = Math.max(0, Math.min(1, (effectiveTime - start) / span));
      activeProgressRef.current = prog;
      if (activeProgressFillRef.current) {
        activeProgressFillRef.current.style.transform = `scaleX(${prog})`;
      }
    } else {
      activeProgressRef.current = 0;
      if (activeProgressFillRef.current) {
        activeProgressFillRef.current.style.transform = 'scaleX(0)';
      }
    }

    if (nextInIntro && introCountdownRef.current) {
      const secs = Math.max(0, Math.ceil(firstVocalTime - effectiveTime));
      if (secs !== lastCountdownSecRef.current) {
        lastCountdownSecRef.current = secs;
        introCountdownRef.current.textContent = formatTime(secs);
      }
    }

    if (idx !== activeIndexRef.current) {
      activeIndexRef.current = idx;
      setActiveIndex(idx);
    }
    if (nextInIntro !== inLeadIntroRef.current) {
      inLeadIntroRef.current = nextInIntro;
      setInLeadIntro(nextInIntro);
    }
  }, [isSynced, lines, firstVocalTime, syncOffset, activeVideoOffset, audioRef, audioCtxRef, isPlaying]);

  // Keep synced when paused, seeking, or track/offset changes
  useEffect(() => {
    syncFromAudioTime();
    const audio = audioRef?.current;
    if (!audio) return;
    audio.addEventListener('seeked', syncFromAudioTime);
    audio.addEventListener('timeupdate', syncFromAudioTime);
    return () => {
      audio.removeEventListener('seeked', syncFromAudioTime);
      audio.removeEventListener('timeupdate', syncFromAudioTime);
    };
  }, [syncFromAudioTime, audioRef, currentTrack?.videoId]);

  // 120fps lock-step clock when playing (triggers React re-render ONLY when active line index flips)
  useEffect(() => {
    if (!isSynced || !isPlaying) return;
    let rafId = 0;
    const tick = () => {
      syncFromAudioTime();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isSynced, isPlaying, syncFromAudioTime]);

  const cancelScrollAnim = useCallback(() => {
    if (scrollAnimRef.current) {
      cancelAnimationFrame(scrollAnimRef.current);
      scrollAnimRef.current = 0;
    }
  }, []);

  const smoothScrollTo = useCallback(
    (container, rawTargetTop, durationMs) => {
      cancelScrollAnim();
      const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const targetTop = Math.max(0, Math.min(maxTop, rawTargetTop));
      const startTop = container.scrollTop;
      const delta = targetTop - startTop;
      if (Math.abs(delta) < 1 || durationMs <= 0) {
        container.scrollTop = targetTop;
        return;
      }
      const startTs = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - startTs) / durationMs);
        const eased = 1 - Math.pow(1 - t, 3.4);
        container.scrollTop = startTop + delta * eased;
        if (t < 1) {
          scrollAnimRef.current = requestAnimationFrame(step);
        } else {
          scrollAnimRef.current = 0;
        }
      };
      scrollAnimRef.current = requestAnimationFrame(step);
    },
    [cancelScrollAnim]
  );

  // Reset scroll & user-scroll state when track changes
  useEffect(() => {
    cancelScrollAnim();
    setUserScrolling(false);
    activeIndexRef.current = -1;
    inLeadIntroRef.current = false;
    lastCountdownSecRef.current = -1;
    setActiveIndex(-1);
    setInLeadIntro(false);
    lineRefs.current = [];
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [currentTrack?.videoId, cancelScrollAnim]);

  // Center active line smoothly inside container unless user manually scrolled
  useEffect(() => {
    if (!isSynced || userScrolling || activeIndex < 0) return;
    const container = scrollRef.current;
    const activeEl = lineRefs.current[activeIndex];
    if (!container || !activeEl) return;

    const targetTop =
      activeEl.offsetTop - container.clientHeight * 0.38 + activeEl.clientHeight / 2;
    smoothScrollTo(container, targetTop, Math.round(lyricTransitionMs * 1.15));
  }, [activeIndex, isSynced, userScrolling, lyricTransitionMs, smoothScrollTo]);

  useEffect(() => {
    return () => {
      cancelScrollAnim();
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, [cancelScrollAnim]);

  const handleManualScrollIntent = () => {
    if (!isSynced) return;
    cancelScrollAnim();
    setUserScrolling(true);
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      setUserScrolling(false);
    }, 4500);
  };

  const handleResync = () => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    setUserScrolling(false);
    const container = scrollRef.current;
    const activeEl = lineRefs.current[activeIndex];
    if (container && activeEl) {
      const targetTop =
        activeEl.offsetTop - container.clientHeight * 0.38 + activeEl.clientHeight / 2;
      smoothScrollTo(container, targetTop, Math.round(lyricTransitionMs * 1.15));
    }
  };

  if (!currentTrack) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <p className="text-xs text-zinc-500 text-center">Play a song to view synced lyrics.</p>
      </div>
    );
  }

  if (lyrics.loading) {
    return (
      <div className={variant === 'theater' ? 'space-y-4 py-8 px-2' : 'space-y-3 py-4 px-5'}>
        {[...Array(variant === 'theater' ? 11 : 10)].map((_, i) => (
          <div
            key={i}
            className={`${variant === 'theater' ? 'h-5' : 'h-3.5'} rounded-full skeleton-shimmer`}
            style={{ width: `${46 + ((i * 19) % 44)}%` }}
          />
        ))}
      </div>
    );
  }

  if (lines.length === 0 && !lyrics.text) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12 gap-4">
        <InstrumentalWaveform variant={variant} progress={1} active={isPlaying} />
        <p className="text-sm font-medium text-zinc-400">Instrumental / no lyrics for this track</p>
      </div>
    );
  }

  const padY = variant === 'theater' ? 'py-24' : 'py-14';
  const gapY = variant === 'theater' ? 'space-y-4' : 'space-y-2.5';
  const isCentered = lyricAlign === 'center';
  const fontSizeClass =
    variant === 'theater'
      ? lyricFontSize === 'compact'
        ? 'font-extrabold text-[17px] sm:text-[19px]'
        : lyricFontSize === 'large'
        ? 'font-extrabold text-[25px] sm:text-[29px]'
        : lyricFontSize === 'xl'
        ? 'font-extrabold text-[30px] sm:text-[36px]'
        : 'font-extrabold text-[21px] sm:text-[23px]'
      : lyricFontSize === 'compact'
      ? 'font-bold text-[13px]'
      : lyricFontSize === 'large'
      ? 'font-bold text-[18px]'
      : lyricFontSize === 'xl'
      ? 'font-bold text-[21px]'
      : 'font-bold text-[15px]';

  const adjustTrackOffset = (delta) => {
    if (!trackKey) return;
    const nextVal = Math.max(-5, Math.min(5, Math.round((trackOffset + delta) * 100) / 100));
    updatePref({ trackSyncOffsets: { [trackKey]: nextVal } });
  };

  return (
    <div className="relative h-full min-h-0 flex flex-col">
      {/* Subtle lyric header (Per-song micro-sync + seek hint) */}
      {isSynced && !hideHeader && (
        <div
          className={`group/hdr shrink-0 flex items-center justify-between ${
            variant === 'theater' ? 'pb-3' : 'px-5 pt-3 pb-1'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <div
              className={`flex items-center gap-1 transition-opacity duration-200 ${
                syncOffset !== 0 ? 'opacity-100' : 'opacity-0 group-hover/hdr:opacity-100'
              }`}
            >
              <button
                type="button"
                onClick={() => adjustTrackOffset(-0.25)}
                className="w-5 h-5 rounded-md bg-white/[0.06] hover:bg-white/[0.15] text-zinc-400 hover:text-white flex items-center justify-center transition"
                title="Delay this song's lyrics by 0.25s"
              >
                <Minus size={10} />
              </button>
              <span className="text-[10px] font-mono tabular-nums text-zinc-400 min-w-[38px] text-center">
                {syncOffset > 0 ? `+${syncOffset.toFixed(2)}s` : `${syncOffset.toFixed(2)}s`}
              </span>
              <button
                type="button"
                onClick={() => adjustTrackOffset(0.25)}
                className="w-5 h-5 rounded-md bg-white/[0.06] hover:bg-white/[0.15] text-zinc-400 hover:text-white flex items-center justify-center transition"
                title="Advance this song's lyrics by 0.25s"
              >
                <Plus size={10} />
              </button>
            </div>
          </div>
          <span className="text-[10px] text-zinc-500 font-medium">Click any line to seek</span>
        </div>
      )}

      {/* Scrollable Lyric Lines (horizontal negative bleed prevents glow/text clipping at scroll box edges) */}
      <div
        ref={scrollRef}
        onWheel={handleManualScrollIntent}
        onTouchStart={handleManualScrollIntent}
        className={`relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden no-scrollbar lyrics-mask ${
          variant === 'theater' ? '-mx-5 px-7' : 'px-5'
        }`}
      >
        <div className={`${padY} ${gapY}`}>
          {/* Neat song-matched audio waveform during intro before first vocal */}
          {inLeadIntro && (
            <div className="flex items-center gap-3 px-3 py-2 transition-opacity duration-300">
              <InstrumentalWaveform variant={variant} progressRef={introProgressRef} active />
              {showLyricTimings && (
                <span
                  ref={introCountdownRef}
                  className="text-[11px] font-mono text-white/40 tabular-nums"
                >
                  {formatTime(Math.max(0, Math.ceil(firstVocalTime)))}
                </span>
              )}
            </div>
          )}

          {lines.length > 0 ? (
            lines.map((line, i) => {
              const isActive = isSynced && i === activeIndex;
              const isPast = isSynced && activeIndex >= 0 && i < activeIndex;
              const dist = activeIndex >= 0 ? Math.abs(i - activeIndex) : 0;

              if (line.isInstrumental) {
                return (
                  <div
                    key={`${i}-${line.time ?? 'plain'}`}
                    ref={(el) => {
                      lineRefs.current[i] = el;
                    }}
                    onClick={() => isSynced && line.time != null && seek(Math.max(0, line.time - syncOffset + activeVideoOffset))}
                    style={{
                      transitionProperty: 'opacity, transform',
                      transitionDuration: `${lyricTransitionMs}ms`,
                      transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                    className={`px-3 py-2 flex items-center gap-2 ${
                      isCentered ? 'justify-center' : ''
                    } ${
                      isSynced ? 'cursor-pointer' : ''
                    } ${
                      isActive
                        ? `opacity-100 scale-[1.03] ${isCentered ? 'origin-center' : 'origin-left'}`
                        : `opacity-45 ${isCentered ? 'origin-center' : 'origin-left'}`
                    }`}
                  >
                    <InstrumentalWaveform
                      variant={variant}
                      progressRef={isActive ? activeProgressRef : null}
                      progress={isPast ? 1 : 0}
                      active={isActive}
                    />
                  </div>
                );
              }

              if (!isSynced) {
                return (
                  <p
                    key={i}
                    className={
                      variant === 'theater'
                        ? 'px-3 text-lg leading-8 text-zinc-100/90 font-semibold'
                        : 'px-3 text-sm leading-6 text-zinc-200/90 font-medium'
                    }
                  >
                    {line.text}
                  </p>
                );
              }

              const glowStyle =
                variant === 'theater'
                  ? isActive
                    ? `0 0 12px rgba(${accentRgb}, 0.55), 0 0 22px rgba(${accentRgb}, 0.25)`
                    : '0 0 0px rgba(0, 0, 0, 0)'
                  : isActive
                  ? `0 0 10px rgba(${accentRgb}, 0.52), 0 0 18px rgba(${accentRgb}, 0.24)`
                  : '0 0 0px rgba(0, 0, 0, 0)';

              const lineTransform = isActive
                ? 'translate3d(0, -1px, 0) scale(1.03)'
                : isPast
                ? 'translate3d(0, 0, 0) scale(0.985)'
                : 'translate3d(0, 0, 0) scale(1)';

              const lineColorClass = isActive
                ? 'text-white'
                : isPast
                ? 'text-white/30 group-hover:text-white/80'
                : dist <= 1
                ? 'text-white/70 group-hover:text-white'
                : dist === 2
                ? 'text-white/50 group-hover:text-white/95'
                : 'text-white/35 group-hover:text-white/85';

              return (
                <button
                  key={`${i}-${line.time}`}
                  ref={(el) => {
                    lineRefs.current[i] = el;
                  }}
                  onClick={() => {
                    if (line.time != null) {
                      seek(Math.max(0, line.time - syncOffset + activeVideoOffset));
                      handleResync();
                    }
                  }}
                  style={{
                    transitionProperty: 'background-color',
                    transitionDuration: '200ms',
                    transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                  className={`group relative w-full flex flex-col gap-1.5 rounded-xl px-3 py-1.5 hover:bg-white/[0.06] ${
                    isCentered ? 'text-center items-center' : 'text-left'
                  }`}
                >
                  <div
                    className={`w-full flex items-baseline gap-3 ${
                      isCentered ? 'justify-center' : 'pr-3 justify-between'
                    }`}
                  >
                    <span
                      className={`block tracking-tight leading-snug break-words will-change-transform ${
                        isCentered ? 'origin-center' : 'origin-left'
                      } ${lineColorClass} ${fontSizeClass} ${
                        blurInactiveLyrics && !isActive && dist > 1 ? 'blur-[1.2px] group-hover:blur-none' : ''
                      }`}
                      style={{
                        transform: lineTransform,
                        textShadow: glowStyle,
                        transitionProperty: 'color, transform, text-shadow, filter',
                        transitionDuration: `${lyricTransitionMs}ms`,
                        transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
                      }}
                    >
                      {line.text}
                    </span>
                    {showLyricTimings && line.time != null && (
                      <span
                        className={`shrink-0 text-[10px] font-mono tabular-nums transition-opacity duration-300 ${
                          isActive
                            ? 'text-emerald-300/90 opacity-100'
                            : 'text-zinc-500 opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        {formatTime(line.time)}
                      </span>
                    )}
                  </div>

                  {/* Subtle spoken line progress sweep (120fps GPU scaleX transform, optional via Settings) */}
                  {isActive && showLyricProgress && (
                    <div className="w-full h-[2px] rounded-full bg-white/15 overflow-hidden">
                      <div
                        ref={activeProgressFillRef}
                        className="w-full h-full rounded-full origin-left will-change-transform"
                        style={{
                          transform: `scaleX(${activeProgressRef.current})`,
                          backgroundColor: `rgb(${accentRgb})`,
                          boxShadow: `0 0 10px rgba(${accentRgb}, 0.8)`,
                        }}
                      />
                    </div>
                  )}
                </button>
              );
            })
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-zinc-200 font-medium">
              {lyrics.text}
            </pre>
          )}

          {lyrics.source && (
            <p className="text-[11px] text-zinc-500 pt-6 mt-4 border-t border-white/10">
              {lyrics.source}
            </p>
          )}
        </div>
      </div>

      {/* Floating Re-sync button when scrolled away */}
      {isSynced && userScrolling && activeIndex >= 0 && (
        <button
          onClick={handleResync}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full glass-menu text-xs font-semibold text-white hover:scale-105 active:scale-95 transition-transform animate-modal-pop"
        >
          <RotateCcw size={12} className="text-emerald-400" />
          Re-sync
        </button>
      )}
    </div>
  );
}
