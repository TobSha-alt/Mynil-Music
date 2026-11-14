const fs = require('fs');
const path = require('path');
const os = require('os');
const resolver = require('./resolver');

const OFFLINE_BASE =
  process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Sona', 'Offline')
    : process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support', 'Sona', 'Offline')
      : path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'Sona', 'Offline');

const INDEX_FILE = path.join(OFFLINE_BASE, 'offline-index.json');

class OfflineManager {
  constructor() {
    this.tracks = {}; // videoId -> { videoId, title, artist, album, thumbnail, duration, sizeBytes, downloadedAt }
    this.downloadingIds = new Set();
  }

  init() {
    fs.mkdirSync(OFFLINE_BASE, { recursive: true });
    try {
      if (fs.existsSync(INDEX_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
        const tracks = parsed?.tracks || {};
        // Prune entries whose .sona file is missing
        for (const [vid, meta] of Object.entries(tracks)) {
          const p = this.getFilePath(vid);
          if (fs.existsSync(p) && fs.statSync(p).size > 1024) {
            this.tracks[vid] = meta;
          }
        }
      }
    } catch {
      this.tracks = {};
    }
    this.save();
  }

  save() {
    try {
      fs.mkdirSync(OFFLINE_BASE, { recursive: true });
      const tmp = `${INDEX_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ tracks: this.tracks }, null, 2), 'utf8');
      fs.renameSync(tmp, INDEX_FILE);
    } catch {}
  }

  getFilePath(videoId) {
    return path.join(OFFLINE_BASE, `${videoId}.sona`);
  }

  getOfflineFile(videoId) {
    if (!videoId || !/^[a-zA-Z0-9_-]+$/.test(videoId)) return null;
    if (!this.tracks[videoId]) return null;
    const p = this.getFilePath(videoId);
    if (fs.existsSync(p) && fs.statSync(p).size > 1024) {
      return p;
    }
    return null;
  }

  getStatus() {
    const list = Object.values(this.tracks).sort((a, b) => (b.downloadedAt || 0) - (a.downloadedAt || 0));
    const totalBytes = list.reduce((sum, t) => sum + Number(t.sizeBytes || 0), 0);
    return {
      downloadedIds: Object.keys(this.tracks),
      downloadingIds: Array.from(this.downloadingIds),
      tracks: list,
      totalBytes,
    };
  }

  async downloadOne(track) {
    const videoId = track?.videoId;
    if (!videoId || !/^[a-zA-Z0-9_-]+$/.test(videoId)) return false;
    if (this.getOfflineFile(videoId)) return true;
    if (this.downloadingIds.has(videoId)) return false;

    this.downloadingIds.add(videoId);
    try {
      const fastFile = await resolver.getFastAudioFile(videoId);
      if (!fastFile || !fs.existsSync(fastFile)) {
        throw new Error(`Could not cache audio for ${track.title || videoId}`);
      }
      const dest = this.getFilePath(videoId);
      const tmp = `${dest}.tmp`;
      fs.copyFileSync(fastFile, tmp);
      fs.renameSync(tmp, dest);
      const sizeBytes = fs.statSync(dest).size;

      this.tracks[videoId] = {
        videoId,
        title: track.title || 'Unknown Track',
        artist: track.artist || track.artists?.[0]?.name || 'Unknown Artist',
        album: track.album || '',
        thumbnail: track.thumbnail || '',
        duration: track.duration || 0,
        sizeBytes,
        downloadedAt: Date.now(),
      };
      this.save();
      return true;
    } finally {
      this.downloadingIds.delete(videoId);
    }
  }

  async downloadTracks(tracks = []) {
    const list = Array.isArray(tracks) ? tracks : [tracks];
    const valid = list.filter((t) => t?.videoId);
    let completed = 0;
    for (let i = 0; i < valid.length; i += 3) {
      const chunk = valid.slice(i, i + 3);
      const results = await Promise.allSettled(chunk.map((t) => this.downloadOne(t)));
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) completed++;
      }
    }
    return { completed, status: this.getStatus() };
  }

  deleteTracks(videoIds = []) {
    const ids = Array.isArray(videoIds) ? videoIds : [videoIds];
    for (const vid of ids) {
      if (!vid) continue;
      delete this.tracks[vid];
      const p = this.getFilePath(vid);
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
        } catch {}
      }
    }
    this.save();
    return this.getStatus();
  }

  clearAll() {
    for (const vid of Object.keys(this.tracks)) {
      const p = this.getFilePath(vid);
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
        } catch {}
      }
    }
    this.tracks = {};
    this.save();
    return this.getStatus();
  }
}

module.exports = new OfflineManager();
