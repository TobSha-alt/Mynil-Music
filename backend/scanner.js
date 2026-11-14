const fs = require('fs');
const path = require('path');
const store = require('./store');
const spotify = require('./spotify');
const ytm = require('./ytm');

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

class StatsScanner {
  constructor() {
    this.metaPath = null;
    this.meta = {
      lastScanAt: 0,
      lastSummary: null,
      lastError: null,
    };
    this.scanning = false;
    this.inflight = null;
    this.timer = null;
    this.onAfterScan = null;
  }

  init({ onAfterScan } = {}) {
    this.onAfterScan = onAfterScan || null;
    const baseDir = store.filePath ? path.dirname(store.filePath) : process.cwd();
    this.metaPath = path.join(baseDir, 'stats-scan-meta.json');
    try {
      if (fs.existsSync(this.metaPath)) {
        const parsed = JSON.parse(fs.readFileSync(this.metaPath, 'utf8'));
        this.meta = { ...this.meta, ...parsed };
      }
    } catch {}

    // Check shortly after startup, then periodically every 6 hours
    setTimeout(() => {
      this.checkAndScanIfDue().catch(() => {});
    }, 8000);

    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.checkAndScanIfDue().catch(() => {});
    }, CHECK_INTERVAL_MS);
    if (this.timer.unref) this.timer.unref();
  }

  saveMeta() {
    if (!this.metaPath) return;
    try {
      fs.writeFileSync(this.metaPath, JSON.stringify(this.meta, null, 2), 'utf8');
    } catch {}
  }

  getStatus() {
    const autoMonthlyScan = store.state.preferences?.autoMonthlyScan !== false;
    const lastScanAt = this.meta.lastScanAt || 0;
    const nextScanAt = lastScanAt ? lastScanAt + MONTH_MS : Date.now();
    return {
      scanning: this.scanning,
      autoMonthlyScan,
      lastScanAt,
      nextScanAt,
      lastSummary: this.meta.lastSummary,
      lastError: this.meta.lastError,
    };
  }

  async checkAndScanIfDue() {
    if (store.state.preferences?.autoMonthlyScan === false) return null;
    const last = this.meta.lastScanAt || 0;
    if (!last || Date.now() - last >= MONTH_MS) {
      return this.runScan();
    }
    return null;
  }

  async runScan() {
    if (this.inflight) return this.inflight;

    this.scanning = true;
    this.meta.lastError = null;

    this.inflight = (async () => {
      let artistsUpdated = 0;
      let tracksUpdated = 0;

      spotify.clearStatCaches();
      await spotify.loadListenersIndex({ forceRefresh: true }).catch(() => {});

      // 1. Refresh followed artists (monthly listeners / followers + avatar)
      const artists = store.state.followedArtists || [];
      for (let i = 0; i < artists.length; i++) {
        const artist = artists[i];
        if (!artist?.name) continue;
        try {
          const bundle = await spotify.getArtistSpotifyBundle(artist.name, { forceRefresh: true });
          let nextSubs = bundle?.monthlyListeners || '';
          let nextAvatar = bundle?.avatarUrl || artist.avatar || '';

          if (!nextSubs && artist.artistId) {
            const ytmInfo = await ytm.getArtist(artist.artistId).catch(() => null);
            if (ytmInfo?.subscribers) nextSubs = ytmInfo.subscribers;
          }

          if (
            (nextSubs && nextSubs !== artist.subscribers) ||
            (nextAvatar && nextAvatar !== artist.avatar)
          ) {
            artists[i] = {
              ...artist,
              ...(nextSubs ? { subscribers: nextSubs } : {}),
              ...(nextAvatar ? { avatar: nextAvatar } : {}),
              statsUpdatedAt: Date.now(),
            };
            artistsUpdated++;
          }
        } catch {}
      }

      // 2. Refresh stream counts for liked songs, playlists, and saved albums
      const refreshTrackList = async (list) => {
        if (!Array.isArray(list) || list.length === 0) return;
        for (let i = 0; i < list.length; i += 25) {
          const chunk = list.slice(i, i + 25);
          const enriched = await spotify.enrichTracksWithSpotifyStreams(chunk).catch(() => chunk);
          for (let j = 0; j < chunk.length; j++) {
            const nextStreams = enriched[j]?.spotifyStreams;
            if (nextStreams && nextStreams !== list[i + j]?.spotifyStreams) {
              list[i + j] = { ...list[i + j], spotifyStreams: nextStreams };
              tracksUpdated++;
            }
          }
        }
      };

      await refreshTrackList(store.state.likedSongs);
      for (const pl of store.state.playlists || []) {
        await refreshTrackList(pl.tracks);
      }
      for (const alb of store.state.savedAlbums || []) {
        await refreshTrackList(alb.tracks);
      }

      store.save();

      this.meta.lastScanAt = Date.now();
      this.meta.lastSummary = {
        artistsUpdated,
        tracksUpdated,
        totalArtists: artists.length,
      };
      this.meta.lastError = null;
      this.saveMeta();

      if (typeof this.onAfterScan === 'function') {
        try {
          this.onAfterScan();
        } catch {}
      }

      return this.getStatus();
    })()
      .catch((err) => {
        this.meta.lastError = err?.message || 'Stats scan failed';
        this.saveMeta();
        throw err;
      })
      .finally(() => {
        this.scanning = false;
        this.inflight = null;
      });

    return this.inflight;
  }
}

module.exports = new StatsScanner();
