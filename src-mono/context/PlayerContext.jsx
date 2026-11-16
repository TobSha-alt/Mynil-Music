import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { extractDominantColor } from '../utils/color';
import { getCoverUrl } from '../utils/cover';
import { getTrackIdentityKey, tracksMatch } from '../utils/trackIdentity';

const PlayerContext = createContext(null);
const PlaybackTimeContext = createContext({ currentTime: 0 });

export const EQ_PRESETS = {
  flat: { label: 'Flat', desc: 'Original uncolored mix', low: 0, mid: 0, high: 0 },
  bass: { label: 'Bass Boost', desc: 'Punchy low-end warmth', low: 5.5, mid: -1, high: 1 },
  vocal: { label: 'Vocal Clarity', desc: 'Forward mids & crisp lyrics', low: -2, mid: 4.5, high: 2 },
  warm: { label: 'Warm', desc: 'Smooth analog roll-off', low: 3.5, mid: 1, high: -2.5 },
  treble: { label: 'Crisp Treble', desc: 'Airy highs & sparkle', low: -1, mid: 1, high: 5 },
  'late-night': { label: 'Late Night', desc: 'Softened lows for quiet listening', low: -4.5, mid: 2.5, high: -1 },
};

export function PlayerProvider({ children }) {
  const [proxyBase, setProxyBase] = useState('');
  const [library, setLibrary] = useState({
    likedSongs: [],
    followedArtists: [],
    savedAlbums: [],
    playlists: [],
    history: [],
    playCounts: {},
    preferences: {
      volume: 0.85,
      muted: false,
      shuffle: false,
      repeat: 'off',
      autoplay: true,
      visualizer: true,
      backdrop: 'bokeh',
      theaterLayout: 'split',
      theaterLyricsBox: 'glass',
      theaterAlbumSize: 'medium',
      theaterAlbumShape: 'rounded',
      theaterCleanMode: false,
      theaterHideLabels: false,
      visualizerColor: 'accent',
      visualizerSize: 'medium',
      visualizerDensity: 'medium',
      visualizerPeakDelay: 1.2,
      lyricSyncOffset: 0,
      lyricTransitionMs: 550,
      showLyricTimings: false,
      showLyricProgress: false,
      panningAlbum: false,
      panningWaveform: false,
      panFrequency: 0.6,
      panAmplitude: 14,
      panRotation: false,
      showPlayCounts: false,
      playbackRate: 1,
      sidebarCollapsed: false,
      eqPreset: 'flat',
      visualizerStyle: 'bars',
      lyricFontSize: 'normal',
      lyricAlign: 'left',
      blurInactiveLyrics: false,
      restoreLastTrack: true,
      autoTheaterOnPlay: false,
      keyboardShortcuts: true,
      trackSyncOffsets: {},
      videoIntroOffsets: {},
    },
  });

  // Playback state
  const [currentTrack, setCurrentTrack] = useState(null);
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [mediaMode, setMediaMode] = useState('song'); // 'song' | 'video'
  const [activeVideoId, setActiveVideoId] = useState(null);
  const [videoIntroOffset, setVideoIntroOffset] = useState(0);
  const [accentRgb, setAccentRgb] = useState('244, 244, 245');
  const [errorMsg, setErrorMsg] = useState('');
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [sleepTimer, setSleepTimerState] = useState({ mode: null, endAt: null }); // mode: null | 'end' | 'timed'
  const [sleepRemainingMins, setSleepRemainingMins] = useState(0);
  const [toast, setToast] = useState(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [offlineStatus, setOfflineStatus] = useState({ downloadedIds: [], tracks: [], totalBytes: 0 });
  const [downloadingIds, setDownloadingIds] = useState(() => new Set());

  // Lyrics & UI state
  const [lyrics, setLyrics] = useState({
    videoId: null,
    synced: false,
    lines: [],
    text: null,
    source: null,
    loading: false,
  });
  const [rightDrawer, setRightDrawer] = useState(null); // null | 'queue' | 'lyrics'
  const [theaterOpen, setTheaterOpen] = useState(false);

  const audioRef = useRef(null);
  const videoRef = useRef(null);
  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const gainNodeRef = useRef(null);
  const eqFiltersRef = useRef(null);
  const counterpartCacheRef = useRef(new Map());
  const videoOffsetCacheRef = useRef(new Map());
  const songOverrideCacheRef = useRef(new Map());
  const libraryRef = useRef(library);
  libraryRef.current = library;
  const currentTrackRef = useRef(currentTrack);
  currentTrackRef.current = currentTrack;
  const pendingSeekRef = useRef(null);
  const pendingVideoSeekRef = useRef(null);
  const lastVideoSyncAtRef = useRef(0);
  const videoBufferingPauseRef = useRef(false);
  const radioFetchingRef = useRef(false);
  const toastTimerRef = useRef(null);
  const pauseFadeTimerRef = useRef(null);
  const pendingPrefPatchRef = useRef({});
  const prefFlushTimerRef = useRef(null);

  const showToast = useCallback((message) => {
    if (!message) return;
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), message });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 2400);
  }, []);

  // Initialize proxy base, library & offline status
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    let mounted = true;
    (async () => {
      const [base, lib, off] = await Promise.all([
        window.sona.getProxyBase(),
        window.sona.getLibrary(),
        window.sona.getOfflineStatus?.().catch(() => null),
      ]);
      if (!mounted) return;
      setProxyBase(base);
      if (off) setOfflineStatus(off);
      if (lib) {
        setLibrary(lib);
        const isMuted = Boolean(lib.preferences?.muted);
        const vol = lib.preferences?.volume ?? 0.85;
        const savedRate = Number(lib.preferences?.playbackRate ?? 1);
        const clampedRate = Math.max(0.5, Math.min(2, savedRate || 1));
        setPlaybackRateState(clampedRate);
        if (audioRef.current) {
          audioRef.current.muted = gainNodeRef.current ? false : isMuted;
          audioRef.current.volume = gainNodeRef.current ? 1 : isMuted ? 0 : vol;
          audioRef.current.playbackRate = clampedRate;
        }
        if (videoRef.current) {
          videoRef.current.playbackRate = clampedRate;
        }
        if (gainNodeRef.current) {
          gainNodeRef.current.gain.value = isMuted ? 0 : vol;
        }

        // Restore last played track on startup (paused and ready to resume immediately)
        const lastTrack = lib.history?.[0];
        if (lib.preferences?.restoreLastTrack !== false && lastTrack?.videoId) {
          setCurrentTrack((prev) => prev || lastTrack);
          setQueue((prev) => (prev.length > 0 ? prev : [lastTrack]));
          setQueueIndex((prev) => (prev >= 0 ? prev : 0));
          setActiveVideoId((prev) => prev || lastTrack.videoId);
          setMediaMode(lastTrack.isVideo ? 'video' : 'song');
          setDuration((prev) => prev || lastTrack.durationSec || 0);

          window.sona.prewarm([lastTrack.videoId]);
          if ('mediaSession' in navigator) {
            const safeCover = `${base}${getCoverUrl(lastTrack)}`;
            try {
              navigator.mediaSession.metadata = new window.MediaMetadata({
                title: lastTrack.title || 'Unknown Track',
                artist: lastTrack.artist || 'Unknown Artist',
                album: lastTrack.album || 'Mynil Music',
                artwork: [{ src: safeCover, sizes: '544x544', type: 'image/jpeg' }],
              });
            } catch {}
          }
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Setup Web Audio Analyser + GainNode so volume & mute work reliably in WKWebView
  const ensureAudioAnalyser = useCallback(() => {
    if (!audioRef.current || analyserRef.current) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.minDecibels = -85;
      analyser.maxDecibels = -10;
      analyser.smoothingTimeConstant = 0.45;

      const eq = EQ_PRESETS[library.preferences?.eqPreset || 'flat'] || EQ_PRESETS.flat;
      const lowFilter = ctx.createBiquadFilter();
      lowFilter.type = 'lowshelf';
      lowFilter.frequency.value = 110;
      lowFilter.gain.value = eq.low;

      const midFilter = ctx.createBiquadFilter();
      midFilter.type = 'peaking';
      midFilter.frequency.value = 1000;
      midFilter.Q.value = 0.9;
      midFilter.gain.value = eq.mid;

      const highFilter = ctx.createBiquadFilter();
      highFilter.type = 'highshelf';
      highFilter.frequency.value = 7500;
      highFilter.gain.value = eq.high;

      const gainNode = ctx.createGain();
      const isMuted = Boolean(library.preferences?.muted);
      const vol = library.preferences?.volume ?? 0.85;
      gainNode.gain.value = isMuted ? 0 : vol;
      const src = ctx.createMediaElementSource(audioRef.current);
      src.connect(lowFilter);
      lowFilter.connect(midFilter);
      midFilter.connect(highFilter);
      highFilter.connect(analyser);
      analyser.connect(gainNode);
      gainNode.connect(ctx.destination);
      // Let GainNode handle smooth volume & mute scaling cleanly so analyser stays active when muted
      audioRef.current.muted = false;
      audioRef.current.volume = 1;
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      sourceNodeRef.current = src;
      gainNodeRef.current = gainNode;
      eqFiltersRef.current = { low: lowFilter, mid: midFilter, high: highFilter };
    } catch {
      // Fallback gracefully if Web Audio fails
    }
  }, [library.preferences?.muted, library.preferences?.volume, library.preferences?.eqPreset]);

  useEffect(() => {
    const filters = eqFiltersRef.current;
    const ctx = audioCtxRef.current;
    if (!filters || !ctx) return;
    const eq = EQ_PRESETS[library.preferences?.eqPreset || 'flat'] || EQ_PRESETS.flat;
    const now = ctx.currentTime;
    try {
      filters.low.gain.setTargetAtTime(eq.low, now, 0.03);
      filters.mid.gain.setTargetAtTime(eq.mid, now, 0.03);
      filters.high.gain.setTargetAtTime(eq.high, now, 0.03);
    } catch {
      filters.low.gain.value = eq.low;
      filters.mid.gain.value = eq.mid;
      filters.high.gain.value = eq.high;
    }
  }, [library.preferences?.eqPreset]);

  const rampGain = useCallback((targetGain, durationSec = 0.025) => {
    const gainNode = gainNodeRef.current;
    const ctx = audioCtxRef.current;
    if (!gainNode || !ctx) return false;
    const now = ctx.currentTime;
    try {
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(Math.max(0, targetGain), now + durationSec);
      return true;
    } catch {
      gainNode.gain.value = Math.max(0, targetGain);
      return false;
    }
  }, []);

  // Update dynamic monochrome luminance accent from cover art via local same-origin cover proxy
  useEffect(() => {
    if (!currentTrack) return;
    const coverSrc = getCoverUrl(currentTrack);
    extractDominantColor(coverSrc).then((rgb) => {
      const [r = 244, g = 244, b = 245] = String(rgb || '')
        .split(',')
        .map((n) => Number(n.trim()) || 0);
      const mono = Math.max(220, Math.min(248, Math.round(0.299 * r + 0.587 * g + 0.114 * b + 90)));
      const monoRgb = `${mono}, ${mono}, ${mono}`;
      setAccentRgb(monoRgb);
      document.documentElement.style.setProperty('--accent', monoRgb);
    });
  }, [currentTrack?.videoId, currentTrack?.thumbnail]);

  // Fetch synced/plain lyrics whenever currentTrack or newly-resolved duration updates
  const lyricsFetchedKeyRef = useRef('');
  const activeLyricsVidRef = useRef('');
  const lyricsLoadedOkRef = useRef('');
  useEffect(() => {
    const vid = currentTrack?.videoId;
    activeLyricsVidRef.current = vid || '';
    if (!vid) {
      lyricsFetchedKeyRef.current = '';
      lyricsLoadedOkRef.current = '';
      setLyrics({ videoId: null, synced: false, lines: [], text: null, source: null, loading: false });
      return;
    }

    const streamDur = mediaMode === 'song' && duration > 0 ? Math.round(duration) : 0;
    const metaDur = !currentTrack.isVideo && currentTrack.durationSec > 0 ? Math.round(currentTrack.durationSec) : 0;
    const songCounterpartDur =
      currentTrack.isVideo && counterpartCacheRef.current.get(`${vid}:song`)?.durationSec
        ? Math.round(counterpartCacheRef.current.get(`${vid}:song`).durationSec)
        : 0;
    const durSec = streamDur || metaDur || songCounterpartDur;
    const reqKey = `${vid}:${durSec}`;

    const isSameVidLoaded = lyricsLoadedOkRef.current === vid;
    // Skip if already fetched for this exact duration or within 1s when stream duration arrives
    if (lyricsFetchedKeyRef.current === reqKey && isSameVidLoaded) return;
    const prevParts = lyricsFetchedKeyRef.current.split(':');
    if (prevParts[0] === vid) {
      const prevDur = Number(prevParts[1]) || 0;
      if (prevDur > 0 && Math.abs(prevDur - durSec) < 2 && (isSameVidLoaded || prevDur === durSec)) {
        return;
      }
      if (lyricsFetchedKeyRef.current === reqKey) return;
    }

    const isRefinement = prevParts[0] === vid && durSec > 0;
    lyricsFetchedKeyRef.current = reqKey;

    if (!isRefinement) {
      lyricsLoadedOkRef.current = '';
      setLyrics({ videoId: vid, synced: false, lines: [], text: null, source: null, loading: true });
    }
    window.sona
      .getLyrics({
        videoId: vid,
        title: currentTrack.title || '',
        artist: currentTrack.artist || '',
        album: currentTrack.album || '',
        duration: durSec,
      })
      .then((res) => {
        if (activeLyricsVidRef.current !== vid) return;
        lyricsLoadedOkRef.current = vid;
        setLyrics({
          videoId: vid,
          synced: Boolean(res?.synced),
          lines: Array.isArray(res?.lines) ? res.lines : [],
          text: res?.lyrics || null,
          source: res?.source || null,
          loading: false,
        });
      })
      .catch(() => {
        if (activeLyricsVidRef.current === vid && lyricsLoadedOkRef.current !== vid) {
          setLyrics({ videoId: vid, synced: false, lines: [], text: null, source: null, loading: false });
        }
      });
  }, [currentTrack?.videoId, currentTrack?.title, currentTrack?.artist, currentTrack?.durationSec, currentTrack?.isVideo, mediaMode, duration]);

  // Prewarm next 2 tracks in queue whenever queueIndex changes
  useEffect(() => {
    if (queueIndex < 0 || queue.length === 0) return;
    const upcoming = queue
      .slice(queueIndex + 1, queueIndex + 4)
      .map((t) => t.videoId)
      .filter(Boolean);
    if (upcoming.length > 0) window.sona.prewarm(upcoming);
  }, [queue, queueIndex]);

  const startPlayback = useCallback(
    async (track, { mode = null, seekTo = 0, skipRecord = false } = {}) => {
      if (!track?.videoId || !proxyBase) return;
      const audio = audioRef.current;
      if (!audio) return;

      ensureAudioAnalyser();
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }

      const desiredMode = mode || (track.isVideo ? 'video' : 'song');
      setMediaMode(desiredMode);
      setErrorMsg('');
      setIsBuffering(true);
      setCurrentTime(seekTo || 0);
      setDuration(track.durationSec || 0);

      const findCachedCounterpart = async (baseTrack, targetKind) => {
        const cacheKey = `${baseTrack.videoId}:${targetKind}`;
        if (counterpartCacheRef.current.has(cacheKey)) {
          return counterpartCacheRef.current.get(cacheKey);
        }
        try {
          const hit = await window.sona.findCounterpart(baseTrack.title, baseTrack.artist, targetKind);
          if (hit?.videoId) {
            counterpartCacheRef.current.set(cacheKey, hit);
            return hit;
          }
        } catch {}
        return null;
      };

      const resolveTrackVideoOffset = async (baseTrack) => {
        if (!baseTrack?.videoId) return 0;
        const trackKey = getTrackIdentityKey(baseTrack) || baseTrack.videoId || '';
        const manual = libraryRef.current?.preferences?.videoIntroOffsets?.[trackKey];
        if (manual !== undefined && manual !== null && Number.isFinite(Number(manual))) {
          return Math.max(0, Number(manual));
        }

        let mvVideoId = baseTrack.isVideo ? baseTrack.videoId : '';
        let songVideoId = baseTrack.isVideo ? '' : baseTrack.videoId;

        if (baseTrack.isVideo) {
          const songHit = await findCachedCounterpart(baseTrack, 'song');
          if (songHit?.videoId) songVideoId = songHit.videoId;
        } else {
          const mvHit = await findCachedCounterpart(baseTrack, 'video');
          if (mvHit?.videoId) mvVideoId = mvHit.videoId;
        }

        if (!mvVideoId) return 0;
        const cacheKey = `${mvVideoId}:${songVideoId}`;
        if (videoOffsetCacheRef.current.has(cacheKey)) {
          return videoOffsetCacheRef.current.get(cacheKey);
        }
        try {
          const res = await window.sona.getVideoOffset(mvVideoId, songVideoId);
          const off = Math.max(0, Number(res?.offsetSec || 0));
          videoOffsetCacheRef.current.set(cacheKey, off);
          return off;
        } catch {
          return 0;
        }
      };

      let streamVideoId = track.videoId;
      if (desiredMode === 'video' && !track.isVideo) {
        const mv = await findCachedCounterpart(track, 'video');
        if (mv?.videoId) streamVideoId = mv.videoId;
      } else if (desiredMode === 'song') {
        if (track.isVideo) {
          const song = await findCachedCounterpart(track, 'song');
          if (song?.videoId) streamVideoId = song.videoId;
        } else if (songOverrideCacheRef.current.has(track.videoId)) {
          streamVideoId = songOverrideCacheRef.current.get(track.videoId);
        }
      }

      setActiveVideoId(streamVideoId);
      setVideoIntroOffset(0);
      resolveTrackVideoOffset(track).then(async (off) => {
        if (currentTrackRef.current?.videoId !== track.videoId) return;
        setVideoIntroOffset(off);

        // Some YT Music album/song entries (e.g. Blur - No Distance Left to Run) link the longer
        // music video ID instead of the studio audio. Detect & swap to the clean song counterpart.
        if (desiredMode === 'song' && !track.isVideo && !songOverrideCacheRef.current.has(track.videoId)) {
          try {
            const songHit = await findCachedCounterpart(track, 'song');
            if (songHit?.videoId && songHit.videoId !== streamVideoId) {
              const durMismatch =
                track.durationSec > 0 &&
                audio.duration > 0 &&
                Number.isFinite(audio.duration) &&
                audio.duration > track.durationSec + 12 &&
                songHit.durationSec > 0 &&
                songHit.durationSec <= track.durationSec + 8;
              let isDisguisedMv = durMismatch || off > 3;
              if (!isDisguisedMv) {
                const vo = await window.sona.getVideoOffset(track.videoId, songHit.videoId).catch(() => null);
                if (Number(vo?.offsetSec || 0) > 3) isDisguisedMv = true;
              }
              if (isDisguisedMv && currentTrackRef.current?.videoId === track.videoId) {
                songOverrideCacheRef.current.set(track.videoId, songHit.videoId);
                const curT = audio.currentTime || 0;
                const cleanT = off > 0 ? Math.max(0, curT - off) : 0;
                pendingSeekRef.current = cleanT > 0 ? cleanT : null;
                setActiveVideoId(songHit.videoId);
                audio.src = `${proxyBase}/stream/${songHit.videoId}?mode=audio`;
                audio.load();
                audio.play().catch(() => {});
              }
            }
          } catch {}
        }
      });
      pendingSeekRef.current = seekTo > 0 ? seekTo : null;

      if (pauseFadeTimerRef.current) {
        clearTimeout(pauseFadeTimerRef.current);
        pauseFadeTimerRef.current = null;
      }

      const isMutedNow = Boolean(library.preferences?.muted);
      const targetVol = library.preferences?.volume ?? 0.85;
      audio.muted = gainNodeRef.current ? false : isMutedNow;
      audio.volume = gainNodeRef.current ? 1 : isMutedNow ? 0 : targetVol;
      if (gainNodeRef.current) {
        rampGain(isMutedNow ? 0 : targetVol, 0.015);
      }

      audio.src = `${proxyBase}/stream/${streamVideoId}?mode=audio`;
      audio.playbackRate = playbackRate;
      audio.load();
      audio.play().catch((err) => {
        if (err?.name !== 'AbortError') {
          setErrorMsg('Stream interrupted — retrying...');
        }
      });

      if (desiredMode === 'video' && videoRef.current) {
        const v = videoRef.current;
        v.muted = true;
        v.playbackRate = playbackRate;
        v.src = `${proxyBase}/stream/${streamVideoId}?mode=video`;
        v.load();
        v.play().catch(() => {});
      } else if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
      }

      if (!skipRecord) {
        window.sona.recordPlay(track).then((nextLib) => {
          if (nextLib) setLibrary(nextLib);
        });
      }

      // macOS Media Session metadata
      if ('mediaSession' in navigator) {
        const safeCover = `${proxyBase}${getCoverUrl(track)}`;
        navigator.mediaSession.metadata = new window.MediaMetadata({
          title: track.title || 'Unknown Track',
          artist: track.artist || 'Unknown Artist',
          album: track.album || 'Mynil Music',
          artwork: [{ src: safeCover, sizes: '544x544', type: 'image/jpeg' }],
        });
      }
    },
    [proxyBase, ensureAudioAnalyser]
  );

  // Fetch Up Next Radio automatically when playing single song or nearing queue end
  const fillRadioQueue = useCallback(async (seedTrack, existingQueue = []) => {
    if (!seedTrack?.videoId || radioFetchingRef.current) return;
    radioFetchingRef.current = true;
    try {
      const res = await window.sona.getUpNext(seedTrack.videoId);
      const radioTracks = (res?.tracks || []).filter(
        (rt) => rt.videoId && !existingQueue.some((eq) => eq.videoId === rt.videoId)
      );
      if (radioTracks.length > 0) {
        setQueue((prev) => [...prev, ...radioTracks.slice(0, 20)]);
      }
    } catch {}
    radioFetchingRef.current = false;
  }, []);

  const playTrack = useCallback(
    async (track, trackList = null, options = {}) => {
      if (!track?.videoId) return;
      if (!isOnline && !offlineStatus.downloadedIds.includes(track.videoId)) {
        showToast('Offline mode — only downloaded songs can be played');
        return;
      }
      let newQueue = queue;
      let newIdx = queueIndex;

      if (Array.isArray(trackList) && trackList.length > 0) {
        newQueue = trackList;
        newIdx = trackList.findIndex((t) => t.videoId === track.videoId);
        if (newIdx === -1) {
          newQueue = [track, ...trackList];
          newIdx = 0;
        }
      } else {
        const existingIdx = queue.findIndex((t) => t.videoId === track.videoId);
        if (existingIdx >= 0) {
          newIdx = existingIdx;
        } else {
          newQueue = [track];
          newIdx = 0;
        }
      }

      setQueue(newQueue);
      setQueueIndex(newIdx);
      setCurrentTrack(track);
      if (library.preferences?.autoTheaterOnPlay && options.openTheater !== false) {
        setTheaterOpen(true);
      }
      await startPlayback(track, options);

      if (newQueue.length - newIdx <= 2 && library.preferences.autoplay) {
        fillRadioQueue(track, newQueue);
      }
    },
    [queue, queueIndex, startPlayback, library.preferences.autoplay, library.preferences?.autoTheaterOnPlay, fillRadioQueue]
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    ensureAudioAnalyser();
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    if (!audio.src) {
      startPlayback(currentTrack, { mode: mediaMode, skipRecord: true });
      if (queue.length <= 1 && library.preferences.autoplay) {
        fillRadioQueue(currentTrack, queue);
      }
      return;
    }

    const isMutedNow = Boolean(library.preferences.muted);
    const targetGain = isMutedNow ? 0 : (library.preferences.volume ?? 0.85);
    const hasPendingPause = pauseFadeTimerRef.current != null;

    if (audio.paused || hasPendingPause) {
      if (hasPendingPause) {
        clearTimeout(pauseFadeTimerRef.current);
        pauseFadeTimerRef.current = null;
      }
      if (gainNodeRef.current && audioCtxRef.current) {
        if (audio.paused) {
          gainNodeRef.current.gain.setValueAtTime(0, audioCtxRef.current.currentTime);
        }
        rampGain(targetGain, 0.028);
      }
      setIsPlaying(true);
      if (audio.paused) {
        audio.play().catch(() => {});
      }
      if (mediaMode === 'video' && videoRef.current?.src) {
        videoRef.current.currentTime = audio.currentTime;
        if (videoRef.current.paused) videoRef.current.play().catch(() => {});
      }
      if (queue.length <= 1 && library.preferences.autoplay) {
        fillRadioQueue(currentTrack, queue);
      }
    } else {
      setIsPlaying(false);
      if (mediaMode === 'video' && videoRef.current) {
        videoRef.current.pause();
      }
      if (gainNodeRef.current && audioCtxRef.current && targetGain > 0.001) {
        rampGain(0, 0.024);
        pauseFadeTimerRef.current = setTimeout(() => {
          pauseFadeTimerRef.current = null;
          audio.pause();
        }, 28);
      } else {
        audio.pause();
      }
    }
  }, [
    currentTrack,
    mediaMode,
    queue,
    library.preferences.autoplay,
    library.preferences.muted,
    library.preferences.volume,
    ensureAudioAnalyser,
    startPlayback,
    fillRadioQueue,
    rampGain,
  ]);

  const seek = useCallback((timeSec) => {
    const audio = audioRef.current;
    if (!audio) return;
    const clamped = Math.max(0, Math.min(timeSec, audio.duration || duration || 0));
    lastVideoSyncAtRef.current = Date.now();
    audio.currentTime = clamped;
    setCurrentTime(clamped);
    const v = videoRef.current;
    if (v && v.src) {
      if (v.readyState >= 1) {
        pendingVideoSeekRef.current = null;
        v.currentTime = clamped;
      } else {
        pendingVideoSeekRef.current = clamped;
      }
    }
  }, [duration]);

  const next = useCallback(async () => {
    if (queue.length === 0) return;
    const repeat = library.preferences.repeat;
    if (repeat === 'one' && currentTrack) {
      seek(0);
      audioRef.current?.play().catch(() => {});
      if (mediaMode === 'video' && videoRef.current?.src) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(() => {});
      }
      return;
    }

    let nextIdx;
    if (library.preferences.shuffle && queue.length > 1) {
      do {
        nextIdx = Math.floor(Math.random() * queue.length);
      } while (nextIdx === queueIndex);
    } else {
      nextIdx = queueIndex + 1;
    }

    if (nextIdx >= queue.length) {
      if (repeat === 'all') {
        nextIdx = 0;
      } else {
        setIsPlaying(false);
        return;
      }
    }

    const nextTrack = queue[nextIdx];
    setQueueIndex(nextIdx);
    setCurrentTrack(nextTrack);
    await startPlayback(nextTrack);

    if (queue.length - nextIdx <= 2 && library.preferences.autoplay) {
      fillRadioQueue(nextTrack, queue);
    }
  }, [queue, queueIndex, library.preferences, currentTrack, seek, mediaMode, startPlayback, fillRadioQueue]);

  const prev = useCallback(async () => {
    if (!currentTrack) return;
    if ((audioRef.current?.currentTime || 0) > 3) {
      seek(0);
      return;
    }
    if (queue.length === 0) return;
    const prevIdx = queueIndex > 0 ? queueIndex - 1 : library.preferences.repeat === 'all' ? queue.length - 1 : 0;
    const prevTrack = queue[prevIdx];
    setQueueIndex(prevIdx);
    setCurrentTrack(prevTrack);
    await startPlayback(prevTrack);
  }, [currentTrack, queue, queueIndex, library.preferences.repeat, seek, startPlayback]);

  const switchMediaMode = useCallback(
    async (targetMode) => {
      if (!currentTrack || targetMode === mediaMode) return;
      const rawTime = audioRef.current?.currentTime || 0;

      // Ensure we know the video intro offset before jumping between song and video
      let offset = videoIntroOffset;
      const trackKey = getTrackIdentityKey(currentTrack) || currentTrack.videoId || '';
      const manual = libraryRef.current?.preferences?.videoIntroOffsets?.[trackKey];
      if (manual !== undefined && manual !== null && Number.isFinite(Number(manual))) {
        offset = Math.max(0, Number(manual));
      } else {
        try {
          let mvVideoId = currentTrack.isVideo ? currentTrack.videoId : '';
          let songVideoId = currentTrack.isVideo ? '' : currentTrack.videoId;
          if (currentTrack.isVideo) {
            const ck = `${currentTrack.videoId}:song`;
            const hit = counterpartCacheRef.current.get(ck) || (await window.sona.findCounterpart(currentTrack.title, currentTrack.artist, 'song'));
            if (hit?.videoId) {
              counterpartCacheRef.current.set(ck, hit);
              songVideoId = hit.videoId;
            }
          } else {
            const ck = `${currentTrack.videoId}:video`;
            const hit = counterpartCacheRef.current.get(ck) || (await window.sona.findCounterpart(currentTrack.title, currentTrack.artist, 'video'));
            if (hit?.videoId) {
              counterpartCacheRef.current.set(ck, hit);
              mvVideoId = hit.videoId;
            }
          }
          if (mvVideoId) {
            const cacheKey = `${mvVideoId}:${songVideoId}`;
            if (videoOffsetCacheRef.current.has(cacheKey)) {
              offset = videoOffsetCacheRef.current.get(cacheKey);
            } else {
              const res = await window.sona.getVideoOffset(mvVideoId, songVideoId);
              offset = Math.max(0, Number(res?.offsetSec || 0));
              videoOffsetCacheRef.current.set(cacheKey, offset);
            }
          }
        } catch {}
      }

      const resumeAt =
        mediaMode === 'video' && targetMode === 'song'
          ? Math.max(0, rawTime - offset)
          : mediaMode === 'song' && targetMode === 'video'
          ? rawTime + offset
          : rawTime;

      if (targetMode === 'video') {
        setTheaterOpen(true);
      }
      await startPlayback(currentTrack, { mode: targetMode, seekTo: resumeAt, skipRecord: true });
    },
    [currentTrack, mediaMode, videoIntroOffset, startPlayback]
  );

  // Sync audio element events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => {
      ensureAudioAnalyser();
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
      videoBufferingPauseRef.current = false;
      setIsPlaying(true);
    };
    const onPause = () => {
      if (videoBufferingPauseRef.current) return;
      setIsPlaying(false);
    };
    const onWaiting = () => {
      if (!audio.paused) setIsBuffering(true);
    };
    const onCanPlay = () => {
      setIsBuffering(false);
      if (pendingSeekRef.current != null) {
        const target = pendingSeekRef.current;
        pendingSeekRef.current = null;
        lastVideoSyncAtRef.current = Date.now();
        audio.currentTime = target;
        const v = videoRef.current;
        if (v?.src) {
          if (v.readyState >= 1) {
            pendingVideoSeekRef.current = null;
            v.currentTime = target;
          } else {
            pendingVideoSeekRef.current = target;
          }
        }
      }
    };
    const onPlaying = () => {
      videoBufferingPauseRef.current = false;
      setIsBuffering(false);
      setIsPlaying(true);
      const v = videoRef.current;
      if (mediaMode === 'video' && v?.src && v.paused && !v.seeking) {
        lastVideoSyncAtRef.current = Date.now();
        if (v.readyState >= 1 && Math.abs((v.currentTime || 0) - (audio.currentTime || 0)) > 0.65) {
          v.currentTime = audio.currentTime;
        }
        v.play().catch(() => {});
      }
    };
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime || 0);
      if (audio.duration && Number.isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
      // Gently keep video clock in sync without interrupting active seeks/buffering
      const v = videoRef.current;
      if (
        mediaMode === 'video' &&
        v?.src &&
        !v.paused &&
        !v.seeking &&
        v.readyState >= 3 &&
        Date.now() - lastVideoSyncAtRef.current > 2500
      ) {
        const drift = Math.abs((v.currentTime || 0) - (audio.currentTime || 0));
        if (drift > 0.65) {
          lastVideoSyncAtRef.current = Date.now();
          v.currentTime = audio.currentTime;
        }
      }
    };
    const onEnded = () => {
      if (sleepTimer.mode === 'end') {
        setSleepTimerState({ mode: null, endAt: null });
        setSleepRemainingMins(0);
        setIsPlaying(false);
        if (videoRef.current) videoRef.current.pause();
        showToast('Sleep timer finished');
        return;
      }
      next();
    };
    const onError = () => {
      setIsBuffering(false);
      setErrorMsg('Could not play stream. Skipping or click retry.');
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [mediaMode, next, sleepTimer.mode, showToast]);

  // Coordinate <video> buffering/seeking with <audio> so neither stalls or fights
  useEffect(() => {
    const v = videoRef.current;
    const audio = audioRef.current;
    if (mediaMode !== 'video' || !v || !audio) return;

    const applyPendingSeek = () => {
      if (pendingVideoSeekRef.current != null && v.readyState >= 1) {
        const target = pendingVideoSeekRef.current;
        pendingVideoSeekRef.current = null;
        lastVideoSyncAtRef.current = Date.now();
        v.currentTime = target;
      }
    };

    const onVideoWaiting = () => {
      if (!audio.paused && v.src) {
        videoBufferingPauseRef.current = true;
        setIsBuffering(true);
        audio.pause();
      }
    };

    const onVideoReady = () => {
      applyPendingSeek();
      if (videoBufferingPauseRef.current) {
        videoBufferingPauseRef.current = false;
        setIsBuffering(false);
        lastVideoSyncAtRef.current = Date.now();
        if (Math.abs((v.currentTime || 0) - (audio.currentTime || 0)) > 0.65) {
          audio.currentTime = v.currentTime || audio.currentTime;
        }
        audio.play().catch(() => {});
        if (v.paused) v.play().catch(() => {});
      } else {
        setIsBuffering(false);
      }
    };

    const onVideoSeeking = () => {
      lastVideoSyncAtRef.current = Date.now();
    };

    v.addEventListener('loadedmetadata', applyPendingSeek);
    v.addEventListener('canplay', onVideoReady);
    v.addEventListener('playing', onVideoReady);
    v.addEventListener('waiting', onVideoWaiting);
    v.addEventListener('seeking', onVideoSeeking);

    return () => {
      v.removeEventListener('loadedmetadata', applyPendingSeek);
      v.removeEventListener('canplay', onVideoReady);
      v.removeEventListener('playing', onVideoReady);
      v.removeEventListener('waiting', onVideoWaiting);
      v.removeEventListener('seeking', onVideoSeeking);
      videoBufferingPauseRef.current = false;
    };
  }, [mediaMode, activeVideoId]);

  // Countdown tick for timed sleep timer
  useEffect(() => {
    if (sleepTimer.mode !== 'timed' || !sleepTimer.endAt) {
      setSleepRemainingMins(0);
      return;
    }
    const updateRemaining = () => {
      const msLeft = sleepTimer.endAt - Date.now();
      if (msLeft <= 0) {
        if (audioRef.current) audioRef.current.pause();
        if (videoRef.current) videoRef.current.pause();
        setSleepTimerState({ mode: null, endAt: null });
        setSleepRemainingMins(0);
        showToast('Sleep timer paused playback');
        return;
      }
      setSleepRemainingMins(Math.max(1, Math.ceil(msLeft / 60000)));
    };
    updateRemaining();
    const id = setInterval(updateRemaining, 5000);
    return () => clearInterval(id);
  }, [sleepTimer, showToast]);

  // Native Media Session controls
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('play', togglePlay);
    navigator.mediaSession.setActionHandler('pause', togglePlay);
    navigator.mediaSession.setActionHandler('nexttrack', next);
    navigator.mediaSession.setActionHandler('previoustrack', prev);
    try {
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (typeof details.seekTime === 'number') seek(details.seekTime);
      });
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        seek((audioRef.current?.currentTime || 0) - (details.seekOffset || 10));
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        seek((audioRef.current?.currentTime || 0) + (details.seekOffset || 10));
      });
    } catch {}
  }, [togglePlay, next, prev, seek]);

  // Queue helpers
  const addToQueue = useCallback(
    (track) => {
      if (!track?.videoId) return;
      window.sona.prewarm([track.videoId]);
      setQueue((prev) => [...prev, track]);
      showToast(`Added "${track.title}" to queue`);
    },
    [showToast]
  );

  const playNextInQueue = useCallback(
    (track) => {
      if (!track?.videoId) return;
      if (!currentTrack) {
        playTrack(track, [track]);
        return;
      }
      window.sona.prewarm([track.videoId]);
      setQueue((prev) => {
        const copy = [...prev];
        const insertAt = Math.max(0, queueIndex + 1);
        copy.splice(insertAt, 0, track);
        return copy;
      });
      showToast(`Playing "${track.title}" next`);
    },
    [currentTrack, playTrack, queueIndex, showToast]
  );

  const removeFromQueue = useCallback(
    (idx) => {
      if (idx === queueIndex) return;
      setQueue((prev) => prev.filter((_, i) => i !== idx));
      if (idx < queueIndex) setQueueIndex((i) => i - 1);
    },
    [queueIndex]
  );

  const clearUpcomingQueue = useCallback(() => {
    setQueue((prev) => (queueIndex >= 0 ? prev.slice(0, queueIndex + 1) : []));
    showToast('Cleared upcoming queue');
  }, [queueIndex, showToast]);

  const persistPrefs = useCallback((patch) => {
    pendingPrefPatchRef.current = { ...pendingPrefPatchRef.current, ...patch };
    if (prefFlushTimerRef.current) clearTimeout(prefFlushTimerRef.current);
    prefFlushTimerRef.current = setTimeout(() => {
      prefFlushTimerRef.current = null;
      const batch = pendingPrefPatchRef.current;
      pendingPrefPatchRef.current = {};
      if (Object.keys(batch).length > 0) {
        window.sona.setPreferences(batch);
      }
    }, 60);
  }, []);

  useEffect(() => {
    const flushPending = () => {
      const batch = pendingPrefPatchRef.current;
      pendingPrefPatchRef.current = {};
      if (prefFlushTimerRef.current) {
        clearTimeout(prefFlushTimerRef.current);
        prefFlushTimerRef.current = null;
      }
      if (Object.keys(batch).length > 0) {
        window.sona.setPreferences(batch);
      }
    };
    window.addEventListener('pagehide', flushPending);
    window.addEventListener('beforeunload', flushPending);
    return () => {
      flushPending();
      window.removeEventListener('pagehide', flushPending);
      window.removeEventListener('beforeunload', flushPending);
    };
  }, []);

  const setPlaybackRate = useCallback(
    (rate) => {
      const clamped = Math.max(0.5, Math.min(2, Number(rate) || 1));
      setPlaybackRateState(clamped);
      if (audioRef.current) audioRef.current.playbackRate = clamped;
      if (videoRef.current) videoRef.current.playbackRate = clamped;
      setLibrary((prev) => ({
        ...prev,
        preferences: { ...prev.preferences, playbackRate: clamped },
      }));
      persistPrefs({ playbackRate: clamped });
      showToast(`Speed ${clamped}×`);
    },
    [persistPrefs, showToast]
  );

  const setSleepTimer = useCallback(
    (option) => {
      if (!option) {
        setSleepTimerState({ mode: null, endAt: null });
        showToast('Sleep timer turned off');
        return;
      }
      if (option === 'end') {
        setSleepTimerState({ mode: 'end', endAt: null });
        showToast('Playback stops after this track');
        return;
      }
      const mins = Number(option);
      if (mins > 0) {
        setSleepTimerState({ mode: 'timed', minutes: mins, endAt: Date.now() + mins * 60 * 1000 });
        showToast(`Sleep timer set for ${mins}m`);
      }
    },
    [showToast]
  );

  // Preferences & Library actions
  const setVolume = useCallback(
    (vol) => {
      const clamped = Math.max(0, Math.min(1, vol));
      const isMuted = clamped === 0;
      if (audioRef.current) {
        audioRef.current.muted = gainNodeRef.current ? false : isMuted;
        audioRef.current.volume = gainNodeRef.current ? 1 : clamped;
      }
      if (gainNodeRef.current) {
        rampGain(clamped, 0.015);
      }
      setLibrary((prev) => ({
        ...prev,
        preferences: { ...prev.preferences, volume: clamped, muted: isMuted },
      }));
      persistPrefs({ volume: clamped, muted: isMuted });
    },
    [persistPrefs, rampGain]
  );

  const toggleMute = useCallback(() => {
    const nextMuted = !library.preferences.muted;
    const restoredVol = library.preferences.volume > 0 ? library.preferences.volume : 0.85;
    if (audioRef.current) {
      audioRef.current.muted = gainNodeRef.current ? false : nextMuted;
      audioRef.current.volume = gainNodeRef.current ? 1 : nextMuted ? 0 : restoredVol;
    }
    if (gainNodeRef.current) {
      rampGain(nextMuted ? 0 : restoredVol, 0.018);
    }
    const patch = nextMuted
      ? { muted: true }
      : { muted: false, volume: restoredVol };
    setLibrary((prev) => ({ ...prev, preferences: { ...prev.preferences, ...patch } }));
    persistPrefs(patch);
    showToast(nextMuted ? 'Muted' : 'Unmuted');
  }, [library.preferences.muted, library.preferences.volume, persistPrefs, rampGain, showToast]);

  const updatePref = useCallback(
    (patch) => {
      setLibrary((prev) => {
        const nextPrefs = { ...prev.preferences, ...patch };
        if (patch?.trackSyncOffsets && typeof patch.trackSyncOffsets === 'object') {
          nextPrefs.trackSyncOffsets = {
            ...(prev.preferences?.trackSyncOffsets || {}),
            ...patch.trackSyncOffsets,
          };
        }
        if (patch?.videoIntroOffsets && typeof patch.videoIntroOffsets === 'object') {
          nextPrefs.videoIntroOffsets = {
            ...(prev.preferences?.videoIntroOffsets || {}),
            ...patch.videoIntroOffsets,
          };
          const ct = currentTrackRef.current;
          if (ct) {
            const tk = getTrackIdentityKey(ct) || ct.videoId || '';
            if (tk && tk in patch.videoIntroOffsets) {
              const v = patch.videoIntroOffsets[tk];
              setVideoIntroOffset(v == null ? 0 : Math.max(0, Number(v)));
            }
          }
        }
        return { ...prev, preferences: nextPrefs };
      });
      persistPrefs(patch);
    },
    [persistPrefs]
  );

  const refreshLibrary = useCallback(async (nextLib = null) => {
    const lib = nextLib || (await window.sona.getLibrary());
    if (lib) setLibrary(lib);
    return lib;
  }, []);

  const streamRetryRef = useRef(0);
  useEffect(() => {
    const onFocus = () => {
      streamRetryRef.current = 0;
      refreshLibrary().catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshLibrary]);

  useEffect(() => {
    const hasMissingLikedStreams = (library.likedSongs || []).some((t) => t && !t.spotifyStreams);
    // Bounded retries: songs Spotify can't match must not cause endless polling
    if (!hasMissingLikedStreams || streamRetryRef.current >= 4) return;
    const timer = setTimeout(() => {
      streamRetryRef.current += 1;
      refreshLibrary().catch(() => {});
    }, 4000 * (streamRetryRef.current + 1));
    return () => clearTimeout(timer);
  }, [library.likedSongs, refreshLibrary]);

  const downloadedIds = useMemo(
    () => new Set(offlineStatus.downloadedIds || []),
    [offlineStatus.downloadedIds]
  );

  const refreshOfflineStatus = useCallback(async () => {
    const off = await window.sona.getOfflineStatus().catch(() => null);
    if (off) setOfflineStatus(off);
    return off;
  }, []);

  const downloadOfflineTracks = useCallback(
    async (tracks) => {
      const list = (Array.isArray(tracks) ? tracks : [tracks]).filter((t) => t?.videoId);
      if (list.length === 0) return;
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        list.forEach((t) => next.add(t.videoId));
        return next;
      });
      try {
        const res = await window.sona.downloadOffline(list);
        if (res?.status) setOfflineStatus(res.status);
        showToast(
          list.length === 1
            ? `Downloaded "${list[0].title}" for offline playback`
            : `Downloaded ${res?.completed ?? list.length} songs for offline playback`
        );
      } catch (err) {
        showToast(err?.message || 'Offline download failed');
      } finally {
        setDownloadingIds((prev) => {
          const next = new Set(prev);
          list.forEach((t) => next.delete(t.videoId));
          return next;
        });
      }
    },
    [showToast]
  );

  const deleteOfflineTracks = useCallback(
    async (videoIds) => {
      const ids = (Array.isArray(videoIds) ? videoIds : [videoIds]).filter(Boolean);
      if (ids.length === 0) return;
      const st = await window.sona.deleteOffline(ids).catch(() => null);
      if (st) setOfflineStatus(st);
      showToast(ids.length === 1 ? 'Removed offline download' : `Removed ${ids.length} downloads`);
    },
    [showToast]
  );

  const clearOfflineDownloads = useCallback(async () => {
    const st = await window.sona.clearOffline().catch(() => null);
    if (st) setOfflineStatus(st);
    showToast('Cleared all offline downloads');
  }, [showToast]);

  const clearHistory = useCallback(async () => {
    const next = await window.sona.clearHistory();
    if (next) setLibrary(next);
    showToast('Listening history cleared');
  }, [showToast]);

  const clearLyricsCache = useCallback(async () => {
    await window.sona.clearLyricsCache();
    lyricsFetchedKeyRef.current = '';
    if (currentTrack?.videoId) {
      const durSec = duration > 0 ? Math.round(duration) : Math.round(currentTrack.durationSec || 0);
      setLyrics({ videoId: currentTrack.videoId, synced: false, lines: [], text: null, source: null, loading: true });
      window.sona
        .getLyrics({
          videoId: currentTrack.videoId,
          title: currentTrack.title || '',
          artist: currentTrack.artist || '',
          album: currentTrack.album || '',
          duration: durSec,
        })
        .then((res) => {
          setLyrics({
            videoId: currentTrack.videoId,
            synced: Boolean(res?.synced),
            lines: Array.isArray(res?.lines) ? res.lines : [],
            text: res?.lyrics || null,
            source: res?.source || null,
            loading: false,
          });
        })
        .catch(() => {
          setLyrics({ videoId: currentTrack.videoId, synced: false, lines: [], text: null, source: null, loading: false });
        });
    }
    showToast('Lyrics cache cleared & refreshed');
  }, [currentTrack, duration, showToast]);

  const toggleShuffle = useCallback(() => {
    updatePref({ shuffle: !library.preferences.shuffle });
  }, [library.preferences.shuffle, updatePref]);

  const cycleRepeat = useCallback(() => {
    const order = ['off', 'all', 'one'];
    const nextMode = order[(order.indexOf(library.preferences.repeat) + 1) % order.length];
    updatePref({ repeat: nextMode });
  }, [library.preferences.repeat, updatePref]);

  const toggleLike = useCallback(
    async (track) => {
      const wasLiked = library.likedSongs.some((t) => tracksMatch(t, track));
      const next = await window.sona.toggleLike(track);
      setLibrary(next);
      showToast(wasLiked ? 'Removed from Liked Songs' : 'Added to Liked Songs');
    },
    [library.likedSongs, showToast]
  );

  const toggleFollowArtist = useCallback(
    async (artist) => {
      const wasFollowed = library.followedArtists.some((a) => a.id === artist?.id);
      const next = await window.sona.toggleFollowArtist(artist);
      setLibrary(next);
      showToast(wasFollowed ? `Unfollowed ${artist?.name || 'artist'}` : `Following ${artist?.name || 'artist'}`);
    },
    [library.followedArtists, showToast]
  );

  const toggleSaveAlbum = useCallback(
    async (album) => {
      const wasSaved = library.savedAlbums.some((a) => a.id === album?.id);
      const next = await window.sona.toggleSaveAlbum(album);
      setLibrary(next);
      showToast(wasSaved ? 'Removed album from Library' : 'Saved album to Library');
    },
    [library.savedAlbums, showToast]
  );

  const createPlaylist = useCallback(async (payload) => {
    const res = await window.sona.createPlaylist(payload);
    if (res?.state) setLibrary(res.state);
    return res?.playlist;
  }, []);

  const importPlaylist = useCallback(async (payload) => {
    const res = await window.sona.importPlaylist(payload);
    if (res?.state) setLibrary(res.state);
    return res;
  }, []);

  const importMusicTaste = useCallback(async (payload) => {
    const res = await window.sona.importMusicTaste(payload);
    if (res?.state) setLibrary(res.state);
    return res;
  }, []);

  const dedupePlaylists = useCallback(async () => {
    const res = await window.sona.dedupePlaylists();
    if (res?.state) setLibrary(res.state);
    return res;
  }, []);

  const updatePlaylist = useCallback(async (id, patch) => {
    const next = await window.sona.updatePlaylist(id, patch);
    setLibrary(next);
  }, []);

  const deletePlaylist = useCallback(async (id) => {
    const next = await window.sona.deletePlaylist(id);
    setLibrary(next);
  }, []);

  const addToPlaylist = useCallback(
    async (playlistId, track) => {
      const next = await window.sona.addToPlaylist(playlistId, track);
      setLibrary(next);
      const plName = next?.playlists?.find((p) => p.id === playlistId)?.name;
      showToast(plName ? `Added to ${plName}` : 'Added to playlist');
    },
    [showToast]
  );

  const removeFromPlaylist = useCallback(async (playlistId, videoId) => {
    const next = await window.sona.removeFromPlaylist(playlistId, videoId);
    setLibrary(next);
  }, []);

  const reorderPlaylistTrack = useCallback(async (playlistId, fromIdx, toIdx) => {
    const next = await window.sona.reorderPlaylistTrack(playlistId, fromIdx, toIdx);
    setLibrary(next);
  }, []);

  const likedIds = useMemo(() => new Set(library.likedSongs.map((t) => t.videoId)), [library.likedSongs]);
  const likedKeys = useMemo(
    () => new Set(library.likedSongs.map(getTrackIdentityKey).filter(Boolean)),
    [library.likedSongs]
  );
  const isTrackLiked = useCallback(
    (track) => {
      if (!track) return false;
      if (track.videoId && likedIds.has(track.videoId)) return true;
      const key = getTrackIdentityKey(track);
      return Boolean(key && likedKeys.has(key));
    },
    [likedIds, likedKeys]
  );
  const followedArtistIds = useMemo(() => new Set(library.followedArtists.map((a) => a.id)), [library.followedArtists]);
  const savedAlbumIds = useMemo(() => new Set(library.savedAlbums.map((a) => a.id)), [library.savedAlbums]);

  const timeValue = useMemo(() => ({ currentTime }), [currentTime]);

  const value = useMemo(
    () => ({
      proxyBase,
      library,
      likedIds,
      likedKeys,
      isTrackLiked,
      followedArtistIds,
      savedAlbumIds,
      currentTrack,
      activeVideoId,
      queue,
      queueIndex,
      isPlaying,
      isBuffering,
      duration,
      mediaMode,
      videoIntroOffset,
      accentRgb,
      errorMsg,
      toast,
      isOnline,
      offlineStatus,
      downloadedIds,
      downloadingIds,
      refreshOfflineStatus,
      downloadOfflineTracks,
      deleteOfflineTracks,
      clearOfflineDownloads,
      playbackRate,
      sleepTimer,
      sleepRemainingMins,
      lyrics,
      rightDrawer,
      setRightDrawer,
      theaterOpen,
      setTheaterOpen,
      analyserRef,
      audioCtxRef,
      audioRef,
      videoRef,
      playTrack,
      togglePlay,
      seek,
      next,
      prev,
      switchMediaMode,
      addToQueue,
      playNextInQueue,
      removeFromQueue,
      clearUpcomingQueue,
      setPlaybackRate,
      setSleepTimer,
      showToast,
      setVolume,
      toggleMute,
      updatePref,
      refreshLibrary,
      clearHistory,
      clearLyricsCache,
      toggleShuffle,
      cycleRepeat,
      toggleLike,
      toggleFollowArtist,
      toggleSaveAlbum,
      createPlaylist,
      importPlaylist,
      importMusicTaste,
      dedupePlaylists,
      updatePlaylist,
      deletePlaylist,
      addToPlaylist,
      removeFromPlaylist,
      reorderPlaylistTrack,
    }),
    [
      proxyBase,
      library,
      likedIds,
      likedKeys,
      isTrackLiked,
      followedArtistIds,
      savedAlbumIds,
      currentTrack,
      activeVideoId,
      queue,
      queueIndex,
      isPlaying,
      isBuffering,
      duration,
      mediaMode,
      videoIntroOffset,
      accentRgb,
      errorMsg,
      toast,
      isOnline,
      offlineStatus,
      downloadedIds,
      downloadingIds,
      refreshOfflineStatus,
      downloadOfflineTracks,
      deleteOfflineTracks,
      clearOfflineDownloads,
      playbackRate,
      sleepTimer,
      sleepRemainingMins,
      lyrics,
      rightDrawer,
      theaterOpen,
      playTrack,
      togglePlay,
      seek,
      next,
      prev,
      switchMediaMode,
      addToQueue,
      playNextInQueue,
      removeFromQueue,
      clearUpcomingQueue,
      setPlaybackRate,
      setSleepTimer,
      showToast,
      setVolume,
      toggleMute,
      updatePref,
      refreshLibrary,
      clearHistory,
      clearLyricsCache,
      toggleShuffle,
      cycleRepeat,
      toggleLike,
      toggleFollowArtist,
      toggleSaveAlbum,
      createPlaylist,
      importPlaylist,
      importMusicTaste,
      dedupePlaylists,
      updatePlaylist,
      deletePlaylist,
      addToPlaylist,
      removeFromPlaylist,
      reorderPlaylistTrack,
    ]
  );

  return (
    <PlayerContext.Provider value={value}>
      <PlaybackTimeContext.Provider value={timeValue}>
        <audio ref={audioRef} crossOrigin="anonymous" preload="auto" />
        {children}
      </PlaybackTimeContext.Provider>
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  return useContext(PlayerContext);
}

export function usePlaybackTime() {
  return useContext(PlaybackTimeContext);
}
