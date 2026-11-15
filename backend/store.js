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
    this.state.playCounts[track.videoId] = (this.state.playCounts[track.videoId] || 0) + 1;
    this.state.history = [
      { ...track, playedAt: Date.now() },
      ...this.state.history.filter((t) => t.videoId !== track.videoId),
    ].slice(0, 60);
    this.save();
    return this.state;
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
