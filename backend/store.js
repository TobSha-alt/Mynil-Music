const fs = require('fs');
const path = require('path');
const os = require('os');

const GENERIC_ARTISTS = new Set(['', 'artist', 'unknown artist', 'various artists']);

function normalizeTrackTitle(rawTitle) {
  if (!rawTitle || typeof rawTitle !== 'string') return '';
  return rawTitle
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019']/g, '')
    .replace(
      /\((?:feat\.?|ft\.?|with|from|official|audio|video|music video|lyrics?|lyric video|visualizer|explicit|clean|album version|single version|remaster(?:ed)?(?:\s*\d{4})?|\d{4}\s*remaster(?:ed)?)[^)]*\)/gi,
      ''
    )
    .replace(
      /\[(?:feat\.?|ft\.?|with|from|official|audio|video|music video|lyrics?|lyric video|visualizer|explicit|clean|album version|single version|remaster(?:ed)?(?:\s*\d{4})?|\d{4}\s*remaster(?:ed)?)[^\]]*\]/gi,
      ''
    )
    .replace(
      /\s*-\s*(?:\d{4}\s*)?(?:remaster(?:ed)?(?:\s*\d{4})?|single version|album version|explicit|clean|official (?:audio|video))\s*$/i,
      ''
    )
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePrimaryArtist(track) {
  const raw =
    (Array.isArray(track?.artists) && track.artists[0]?.name) ||
    track?.artist ||
    '';
  if (!raw || typeof raw !== 'string') return '';
  const first = raw.split(/\s*(?:,|;|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b)\s*/i)[0] || raw;
  const norm = first
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return GENERIC_ARTISTS.has(norm) ? '' : norm;
}

function getTrackIdentityKey(track) {
  if (!track) return '';
  const title = normalizeTrackTitle(track.title);
  const artist = normalizePrimaryArtist(track);
  if (!title || !artist) return '';
  return `${title}::${artist}`;
}

function tracksMatch(a, b) {
  if (!a || !b) return false;
  if (a.videoId && b.videoId && a.videoId === b.videoId) return true;
  const keyA = getTrackIdentityKey(a);
  const keyB = getTrackIdentityKey(b);
  return Boolean(keyA && keyB && keyA === keyB);
}

const DEFAULT_STATE = {
  likedSongs: [],
  followedArtists: [],
  savedAlbums: [],
  playlists: [],
  history: [],
  playCounts: {},
  playLog: [],
  preferences: {
    volume: 0.85,
    muted: false,
    shuffle: false,
    repeat: 'off',
    autoplay: true,
    visualizer: true,
    backdrop: 'bokeh',
    accentMode: 'adaptive',
    customAccent: '16, 185, 129',
    crossfadeEnabled: false,
    crossfadeSec: 5,
    gaplessEnabled: true,
    miniPlayerEnabled: false,
    discordRpcEnabled: true,
    minimizeToTray: false,
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
    autoMonthlyScan: true,
    trackSyncOffsets: {},
    videoIntroOffsets: {},
  },
};

class LibraryStore {
  constructor() {
    this.filePath = null;
    this.state = structuredClone(DEFAULT_STATE);
    this._onSaveListeners = [];
  }

  onSave(cb) {
    if (typeof cb === 'function') this._onSaveListeners.push(cb);
  }

  init() {
    const baseDir =
      process.platform === 'win32'
        ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
        : process.platform === 'darwin'
          ? path.join(os.homedir(), 'Library', 'Application Support')
          : process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
    const dir = path.join(baseDir, 'Sona');
    fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, 'sona-library.json');
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        this._lastDiskMtime = fs.statSync(this.filePath).mtimeMs;
        this.state = {
          ...structuredClone(DEFAULT_STATE),
          ...parsed,
          preferences: {
            ...DEFAULT_STATE.preferences,
            ...(parsed.preferences || {}),
          },
        };
        this.syncKnownStreamCounts();
      } else {
        this.save();
      }
    } catch {
      this.state = structuredClone(DEFAULT_STATE);
    }
    return this.state;
  }

  save() {
    if (!this.filePath) return;
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(tmp, this.filePath);
    try {
      this._lastDiskMtime = fs.statSync(this.filePath).mtimeMs;
    } catch {}
    for (const cb of this._onSaveListeners) {
      try {
        cb(this.state);
      } catch {}
    }
  }

  getAll() {
    if (this.filePath) {
      try {
        const mtime = fs.statSync(this.filePath).mtimeMs;
        if (this._lastDiskMtime && mtime > this._lastDiskMtime + 50) {
          const raw = fs.readFileSync(this.filePath, 'utf8');
          const parsed = JSON.parse(raw);
          this._lastDiskMtime = mtime;
          this.state = {
            ...structuredClone(DEFAULT_STATE),
            ...parsed,
            preferences: {
              ...DEFAULT_STATE.preferences,
              ...(parsed.preferences || {}),
            },
          };
        }
      } catch {}
    }
    this.syncKnownStreamCounts();
    return this.state;
  }

  syncKnownStreamCounts() {
    const byId = new Map();
    const byKey = new Map();
    const allLists = [
      this.state.likedSongs || [],
      this.state.history || [],
      ...(this.state.playlists || []).map((p) => p?.tracks || []),
    ];
    for (const list of allLists) {
      for (const t of list) {
        const streams = Number(t?.spotifyStreams || 0);
        if (streams > 0) {
          if (t.videoId && !byId.has(t.videoId)) byId.set(t.videoId, streams);
          const key = getTrackIdentityKey(t);
          if (key && (!byKey.has(key) || byKey.get(key) < streams)) byKey.set(key, streams);
        }
      }
    }
    if (byId.size === 0 && byKey.size === 0) return false;
    let changed = false;
    const apply = (arr) =>
      (arr || []).map((t) => {
        if (!t || t.spotifyStreams) return t;
        const matched = (t.videoId && byId.get(t.videoId)) || byKey.get(getTrackIdentityKey(t)) || 0;
        if (matched > 0) {
          changed = true;
          return { ...t, spotifyStreams: matched };
        }
        return t;
      });
    this.state.likedSongs = apply(this.state.likedSongs);
    this.state.history = apply(this.state.history);
    this.state.playlists = (this.state.playlists || []).map((p) => ({
      ...p,
      tracks: apply(p.tracks),
    }));
    if (changed) this.save();
    return changed;
  }

  resetToDefault() {
    this.state = structuredClone(DEFAULT_STATE);
    this.save();
    return this.state;
  }

  toggleLike(track) {
    if (!track?.videoId) return this.state;
    const idx = this.state.likedSongs.findIndex((t) => tracksMatch(t, track));
    if (idx >= 0) {
      this.state.likedSongs = this.state.likedSongs.filter((t) => !tracksMatch(t, track));
    } else {
      this.state.likedSongs.unshift({ ...track, likedAt: Date.now() });
      this.syncKnownStreamCounts();
    }
    this.save();
    return this.state;
  }

  toggleFollowArtist(artist) {
    if (!artist?.id) return this.state;
    const idx = this.state.followedArtists.findIndex((a) => a.id === artist.id);
    if (idx >= 0) this.state.followedArtists.splice(idx, 1);
    else this.state.followedArtists.unshift({ ...artist, followedAt: Date.now() });
    this.save();
    return this.state;
  }

  toggleSaveAlbum(album) {
    if (!album?.id) return this.state;
    const idx = this.state.savedAlbums.findIndex((a) => a.id === album.id);
    if (idx >= 0) this.state.savedAlbums.splice(idx, 1);
    else this.state.savedAlbums.unshift({ ...album, savedAt: Date.now() });
    this.save();
    return this.state;
  }

  createPlaylist({ name, description = '', gradient, initialTracks = [] }) {
    const gradients = [
      'from-emerald-500 via-teal-600 to-cyan-900',
      'from-rose-500 via-pink-600 to-purple-900',
      'from-amber-500 via-orange-600 to-red-900',
      'from-sky-500 via-blue-600 to-indigo-900',
      'from-violet-600 via-fuchsia-600 to-indigo-900',
    ];
    const uniqueTracks = [];
    for (const t of Array.isArray(initialTracks) ? initialTracks : []) {
      if (t?.videoId && !uniqueTracks.some((u) => tracksMatch(u, t))) {
        uniqueTracks.push(t);
      }
    }
    const pl = {
      id: `pl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: (name || 'Untitled Playlist').trim(),
      description: (description || '').trim(),
      gradient: gradient || gradients[this.state.playlists.length % gradients.length],
      tracks: uniqueTracks,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.state.playlists.unshift(pl);
    this.syncKnownStreamCounts();
    this.save();
    return { state: this.state, playlist: pl };
  }

  updatePlaylist(id, patch) {
    const pl = this.state.playlists.find((p) => p.id === id);
    if (!pl) return this.state;
    if (typeof patch.name === 'string') pl.name = patch.name.trim() || pl.name;
    if (typeof patch.description === 'string') pl.description = patch.description.trim();
    if (typeof patch.gradient === 'string') pl.gradient = patch.gradient;
    pl.updatedAt = Date.now();
    this.save();
    return this.state;
  }

  deletePlaylist(id) {
    this.state.playlists = this.state.playlists.filter((p) => p.id !== id);
    this.save();
    return this.state;
  }

  deleteDuplicatePlaylists() {
    const playlists = Array.isArray(this.state.playlists) ? this.state.playlists : [];
    const bestByKey = new Map();
    for (const pl of playlists) {
      const key = String(pl?.name || '').trim().toLowerCase() || `__untitled__${pl?.id || ''}`;
      const existing = bestByKey.get(key);
      if (!existing) {
        bestByKey.set(key, pl);
        continue;
      }
      const plTracks = Array.isArray(pl?.tracks) ? pl.tracks.length : 0;
      const exTracks = Array.isArray(existing?.tracks) ? existing.tracks.length : 0;
      const plUpdated = Number(pl?.updatedAt || 0);
      const exUpdated = Number(existing?.updatedAt || 0);
      if (plTracks > exTracks || (plTracks === exTracks && plUpdated > exUpdated)) {
        bestByKey.set(key, pl);
      }
    }
    const keptIds = new Set(Array.from(bestByKey.values()).map((p) => p.id));
    const deduped = playlists.filter((p) => keptIds.has(p.id));
    const removedCount = playlists.length - deduped.length;
    if (removedCount > 0) {
      this.state.playlists = deduped;
      this.save();
    }
    return { removedCount, state: this.state };
  }

  addToPlaylist(playlistId, track) {
    const pl = this.state.playlists.find((p) => p.id === playlistId);
    if (!pl || !track?.videoId) return this.state;
    if (!pl.tracks.some((t) => t.videoId === track.videoId)) {
      pl.tracks.push(track);
      pl.updatedAt = Date.now();
      this.syncKnownStreamCounts();
      this.save();
    }
    return this.state;
  }

  removeFromPlaylist(playlistId, videoId) {
    const pl = this.state.playlists.find((p) => p.id === playlistId);
    if (!pl) return this.state;
    pl.tracks = pl.tracks.filter((t) => t.videoId !== videoId);
    pl.updatedAt = Date.now();
    this.save();
    return this.state;
  }

  reorderPlaylistTrack(playlistId, fromIndex, toIndex) {
    const pl = this.state.playlists.find((p) => p.id === playlistId);
    if (!pl) return this.state;
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= pl.tracks.length || toIndex >= pl.tracks.length) {
      return this.state;
    }
    const [moved] = pl.tracks.splice(fromIndex, 1);
    pl.tracks.splice(toIndex, 0, moved);
    pl.updatedAt = Date.now();
    this.save();
    return this.state;
  }

  recordPlay(track) {
    if (!track?.videoId) return this.state;
    const now = Date.now();
    this.state.playCounts[track.videoId] = (this.state.playCounts[track.videoId] || 0) + 1;
    this.state.history = [
      { ...track, playedAt: now },
      ...this.state.history.filter((t) => t.videoId !== track.videoId),
    ].slice(0, 60);
    if (!Array.isArray(this.state.playLog)) this.state.playLog = [];
    this.state.playLog.unshift({
      videoId: track.videoId,
      title: track.title || '',
      artist: track.artist || '',
      artists: track.artists || [],
      album: track.album || '',
      albumId: track.albumId || null,
      artistId: track.artistId || null,
      thumbnail: track.thumbnail || '',
      durationSec: Number(track.durationSec) || 180,
      playedAt: now,
    });
    if (this.state.playLog.length > 5000) {
      this.state.playLog = this.state.playLog.slice(0, 5000);
    }
    this.save();
    return this.state;
  }

  dedupePlaylistTracks(playlistId) {
    const pl = this.state.playlists.find((p) => p.id === playlistId);
    if (!pl || !Array.isArray(pl.tracks)) return { removedCount: 0, state: this.state };
    const unique = [];
    for (const track of pl.tracks) {
      if (!track) continue;
      // Strict match: videoId OR (normalized title AND normalized primary artist) — never title alone
      if (!unique.some((u) => tracksMatch(u, track))) {
        unique.push(track);
      }
    }
    const removedCount = pl.tracks.length - unique.length;
    if (removedCount > 0) {
      pl.tracks = unique;
      pl.updatedAt = Date.now();
      this.save();
    }
    return { removedCount, state: this.state };
  }

  getStats(range = 'month') {
    const now = Date.now();
    const cutoff =
      range === 'week'
        ? now - 7 * 86400_000
        : range === 'month'
        ? now - 30 * 86400_000
        : range === 'year'
        ? now - 365 * 86400_000
        : 0;

    let log = Array.isArray(this.state.playLog) ? this.state.playLog : [];
    if (log.length === 0 && (this.state.history || []).length > 0) {
      log = this.state.history.map((t) => ({ ...t, playedAt: t.playedAt || now }));
    }
    const filtered = cutoff > 0 ? log.filter((e) => (e?.playedAt || 0) >= cutoff) : log;

    const songMap = new Map();
    const artistMap = new Map();
    const albumMap = new Map();
    const daySet = new Set();
    const bucketMap = new Map();
    let totalDurationSec = 0;

    for (const e of filtered) {
      if (!e?.videoId) continue;
      const dur = Number(e.durationSec) || 180;
      totalDurationSec += dur;
      const ts = Number(e.playedAt) || now;
      const d = new Date(ts);
      const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      daySet.add(dayKey);

      const bucketKey =
        range === 'year' || range === 'all'
          ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          : dayKey;
      bucketMap.set(bucketKey, (bucketMap.get(bucketKey) || 0) + 1);

      const sKey = getTrackIdentityKey(e) || e.videoId;
      const prevS = songMap.get(sKey) || { ...e, plays: 0, totalSec: 0 };
      prevS.plays += 1;
      prevS.totalSec += dur;
      if (!prevS.thumbnail && e.thumbnail) prevS.thumbnail = e.thumbnail;
      songMap.set(sKey, prevS);

      const artName = (e.artists?.[0]?.name || e.artist || 'Unknown Artist').split(',')[0].trim();
      const aKey = normalizePrimaryArtist(e) || artName.toLowerCase();
      const prevA = artistMap.get(aKey) || {
        name: artName,
        id: e.artistId || e.artists?.[0]?.id || null,
        thumbnail: e.thumbnail || '',
        plays: 0,
        totalSec: 0,
      };
      prevA.plays += 1;
      prevA.totalSec += dur;
      artistMap.set(aKey, prevA);

      if (e.album) {
        const alKey = `${e.album.toLowerCase()}::${aKey}`;
        const prevAl = albumMap.get(alKey) || {
          title: e.album,
          id: e.albumId || null,
          artist: artName,
          thumbnail: e.thumbnail || '',
          plays: 0,
          totalSec: 0,
        };
        prevAl.plays += 1;
        prevAl.totalSec += dur;
        albumMap.set(alKey, prevAl);
      }
    }

    // Compute current streak (consecutive days up to today/yesterday)
    let streakDays = 0;
    for (let offset = 0; offset < 365; offset++) {
      const d = new Date(now - offset * 86400_000);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (daySet.has(k)) streakDays++;
      else if (offset > 0) break;
    }

    // Smart Playlists
    const knownTracks = [
      ...(this.state.likedSongs || []),
      ...(this.state.history || []),
      ...(this.state.playlists || []).flatMap((p) => p.tracks || []),
    ];
    const byVid = new Map();
    for (const t of knownTracks) {
      if (t?.videoId && !byVid.has(t.videoId)) byVid.set(t.videoId, t);
    }

    const mostPlayed = Object.entries(this.state.playCounts || {})
      .sort((a, b) => b[1] - a[1])
      .map(([vid]) => byVid.get(vid))
      .filter(Boolean)
      .slice(0, 30);

    const recentlyLiked = (this.state.likedSongs || []).slice(0, 30);

    const recentVids = new Set((this.state.history || []).slice(0, 15).map((t) => t.videoId));
    const forgottenFavorites = (this.state.likedSongs || [])
      .filter((t) => t?.videoId && !recentVids.has(t.videoId))
      .slice(-30)
      .reverse();

    return {
      range,
      totalPlays: filtered.length,
      totalDurationSec,
      uniqueTracks: songMap.size,
      uniqueArtists: artistMap.size,
      streakDays,
      topSongs: [...songMap.values()].sort((a, b) => b.plays - a.plays).slice(0, 15),
      topArtists: [...artistMap.values()].sort((a, b) => b.plays - a.plays).slice(0, 12),
      topAlbums: [...albumMap.values()].sort((a, b) => b.plays - a.plays).slice(0, 12),
      timeline: [...bucketMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([label, plays]) => ({ label, plays })),
      smartPlaylists: [
        { id: 'smart-most-played', name: 'Most Played', subtitle: 'Your all-time top tracks', tracks: mostPlayed },
        { id: 'smart-recently-liked', name: 'Recently Liked', subtitle: 'Latest additions to Liked Songs', tracks: recentlyLiked },
        { id: 'smart-forgotten', name: 'Forgotten Favorites', subtitle: 'Liked songs you haven’t played lately', tracks: forgottenFavorites },
      ],
    };
  }

  clearHistory() {
    this.state.history = [];
    this.save();
    return this.state;
  }

  setPreferences(patch) {
    const nextPrefs = { ...this.state.preferences, ...patch };
    if (patch?.trackSyncOffsets && typeof patch.trackSyncOffsets === 'object') {
      nextPrefs.trackSyncOffsets = {
        ...(this.state.preferences.trackSyncOffsets || {}),
        ...patch.trackSyncOffsets,
      };
    }
    if (patch?.videoIntroOffsets && typeof patch.videoIntroOffsets === 'object') {
      nextPrefs.videoIntroOffsets = {
        ...(this.state.preferences.videoIntroOffsets || {}),
        ...patch.videoIntroOffsets,
      };
    }
    this.state.preferences = nextPrefs;
    this.save();
    return this.state;
  }
}

module.exports = new LibraryStore();
