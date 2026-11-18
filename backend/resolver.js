const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const STREAM_TTL_MS = 2.5 * 60 * 60 * 1000; // 2.5 hours
const MAX_CACHE_ENTRIES = 250;
const CACHE_BASE =
  process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Sona', 'Caches')
    : process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Caches', 'Sona')
      : path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'Sona');
const AUDIO_DISK_CACHE_DIR = path.join(CACHE_BASE, 'streams');
const MAX_DISK_CACHE_BYTES = 800 * 1024 * 1024; // 800 MB

fs.mkdirSync(AUDIO_DISK_CACHE_DIR, { recursive: true });

function getAugmentedPath() {
  if (process.platform === 'win32') return process.env.PATH || '';
  return [process.env.PATH, '/opt/homebrew/bin', '/usr/local/bin'].filter(Boolean).join(path.delimiter);
}

let cachedPython = null;
function findPythonWithYtdlp() {
  if (cachedPython) return cachedPython;
  const candidates = (
    process.platform === 'win32'
      ? [process.env.SONA_PYTHON, 'python', 'python3', 'py']
      : [
          process.env.SONA_PYTHON,
          '/Library/Frameworks/Python.framework/Versions/3.14/bin/python3',
          '/Library/Frameworks/Python.framework/Versions/3.13/bin/python3',
          '/Library/Frameworks/Python.framework/Versions/3.12/bin/python3',
          '/opt/homebrew/bin/python3',
          '/usr/local/bin/python3',
          'python3',
          'python',
        ]
  ).filter(Boolean);

  const envPath = getAugmentedPath();
  for (const bin of candidates) {
    try {
      execSync(`"${bin}" -c "import yt_dlp"`, {
        stdio: 'ignore',
        env: { ...process.env, PATH: envPath },
      });
      cachedPython = bin;
      return bin;
    } catch {}
  }
  throw new Error('Could not find Python 3 with yt-dlp installed.');
}

let cachedFfmpeg = null;
function findFfmpeg() {
  if (cachedFfmpeg !== null) return cachedFfmpeg;
  const candidates =
    process.platform === 'win32'
      ? ['ffmpeg', 'ffmpeg.exe']
      : ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg'];
  const envPath = getAugmentedPath();
  for (const bin of candidates) {
    try {
      execSync(`${bin.includes('/') ? `"${bin}"` : bin} -version`, {
        stdio: 'ignore',
        env: { ...process.env, PATH: envPath },
      });
      cachedFfmpeg = bin;
      return bin;
    } catch {}
  }
  cachedFfmpeg = '';
  return '';
}

function pruneDiskCache() {
  try {
    const files = fs
      .readdirSync(AUDIO_DISK_CACHE_DIR)
      .filter((f) => (f.endsWith('.m4a') || f.endsWith('.mp4')) && !f.includes('.tmp'))
      .map((f) => {
        const full = path.join(AUDIO_DISK_CACHE_DIR, f);
        const st = fs.statSync(full);
        return { full, size: st.size, mtime: st.mtimeMs };
      });
    let total = files.reduce((sum, f) => sum + f.size, 0);
    if (total <= MAX_DISK_CACHE_BYTES) return;
    files.sort((a, b) => a.mtime - b.mtime);
    for (const f of files) {
      if (total <= MAX_DISK_CACHE_BYTES * 0.8) break;
      try {
        fs.unlinkSync(f.full);
        total -= f.size;
      } catch {}
    }
  } catch {}
}

class StreamResolver {
  constructor() {
    this.cache = new Map();
    this.inflight = new Map();
    this.remuxInflight = new Map();
    this.videoRemuxInflight = new Map();
    this.pending = new Map();
    this.nextReqId = 1;
    this.worker = null;
    this.buffer = '';
    this.readyPromise = null;
  }

  start() {
    if (this.worker && !this.worker.killed) return this.readyPromise;
    const python = findPythonWithYtdlp();
    const scriptPath = path.join(__dirname, 'resolver_worker.py');

    this.readyPromise = new Promise((resolveReady) => {
      const child = spawn(python, ['-u', scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          PATH: getAugmentedPath(),
        },
      });

      this.worker = child;
      this.buffer = '';
      let resolvedReady = false;

      child.stdout.on('data', (chunk) => {
        this.buffer += chunk.toString('utf8');
        let idx;
        while ((idx = this.buffer.indexOf('\n')) !== -1) {
          const line = this.buffer.slice(0, idx).trim();
          this.buffer = this.buffer.slice(idx + 1);
          if (!line) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.ready) {
              if (!resolvedReady) {
                resolvedReady = true;
                resolveReady();
              }
              continue;
            }
            const entry = this.pending.get(msg.id);
            if (entry) {
              clearTimeout(entry.timer);
              this.pending.delete(msg.id);
              if (msg.ok) entry.resolve(msg.data);
              else entry.reject(new Error(msg.error || 'Resolver error'));
            }
          } catch {}
        }
      });

      child.stderr.on('data', () => {});

      child.on('exit', () => {
        this.worker = null;
        for (const [, entry] of this.pending) {
          clearTimeout(entry.timer);
          entry.reject(new Error('Resolver worker exited'));
        }
        this.pending.clear();
        if (!resolvedReady) {
          resolvedReady = true;
          resolveReady();
        }
      });
    });

    return this.readyPromise;
  }

  getCached(videoId) {
    const hit = this.cache.get(videoId);
    if (!hit) return null;
    if (hit.expires > Date.now()) {
      this.cache.delete(videoId);
      this.cache.set(videoId, hit);
      return hit.data;
    }
    this.cache.delete(videoId);
    return null;
  }

  invalidate(videoId) {
    this.cache.delete(videoId);
  }

  setCached(videoId, data) {
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(videoId, { data, expires: Date.now() + STREAM_TTL_MS });
  }

  async resolve(videoId, { forceRefresh = false } = {}) {
    if (!videoId) throw new Error('Missing videoId');
    if (forceRefresh) this.invalidate(videoId);

    const cached = this.getCached(videoId);
    if (cached) return cached;

    if (this.inflight.has(videoId)) return this.inflight.get(videoId);

    const p = (async () => {
      await this.start();
      if (!this.worker || !this.worker.stdin.writable) {
        this.worker = null;
        await this.start();
      }
      return new Promise((resolve, reject) => {
        if (!this.worker || !this.worker.stdin.writable) {
          return reject(new Error('Resolver worker unavailable'));
        }
        const id = this.nextReqId++;
        const timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error(`Timed out resolving ${videoId}`));
        }, 25000);

        this.pending.set(id, { resolve, reject, timer });
        this.worker.stdin.write(JSON.stringify({ id, videoId }) + '\n');
      });
    })()
      .then((data) => {
        this.setCached(videoId, data);
        this.inflight.delete(videoId);
        return data;
      })
      .catch((err) => {
        this.inflight.delete(videoId);
        throw err;
      });

    this.inflight.set(videoId, p);
    return p;
  }

  getCachedAudioFile(videoId) {
    if (!videoId || !/^[a-zA-Z0-9_-]+$/.test(videoId)) return null;
    const finalPath = path.join(AUDIO_DISK_CACHE_DIR, `${videoId}.m4a`);
    if (fs.existsSync(finalPath)) {
      try {
        const st = fs.statSync(finalPath);
        if (st.size > 1024) {
          fs.utimesSync(finalPath, new Date(), new Date());
          return finalPath;
        }
      } catch {}
    }
    return null;
  }

  /**
   * Remuxes YouTube's fragmented DASH m4a into a clean faststart .m4a container.
   * Fixes macOS AVFoundation/WKWebView reading double (2x) duration on DASH audio.
   */
  async getFastAudioFile(videoId) {
    if (!videoId || !/^[a-zA-Z0-9_-]+$/.test(videoId)) return null;
    const existing = this.getCachedAudioFile(videoId);
    if (existing) return existing;

    const ffmpeg = findFfmpeg();
    if (!ffmpeg) return null;

    const finalPath = path.join(AUDIO_DISK_CACHE_DIR, `${videoId}.m4a`);

    if (this.remuxInflight.has(videoId)) {
      return this.remuxInflight.get(videoId);
    }

    const p = (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const info = await this.resolve(videoId, { forceRefresh: attempt > 0 });
        const audio = info?.audio;
        if (!audio?.url) throw new Error('No audio URL');

        const tmpPath = path.join(AUDIO_DISK_CACHE_DIR, `${videoId}.${Date.now()}.tmp.m4a`);
        const ok = await new Promise((resolve) => {
          const args = ['-y', '-v', 'error', '-i', audio.url, '-vn', '-c:a', 'copy', '-movflags', '+faststart', tmpPath];
          const child = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
          const timer = setTimeout(() => {
            child.kill('SIGKILL');
            resolve(false);
          }, 25000);
          child.on('close', (code) => {
            clearTimeout(timer);
            resolve(code === 0 && fs.existsSync(tmpPath) && fs.statSync(tmpPath).size > 1024);
          });
          child.on('error', () => {
            clearTimeout(timer);
            resolve(false);
          });
        });

        if (ok) {
          fs.renameSync(tmpPath, finalPath);
          pruneDiskCache();
          return finalPath;
        }
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch {}
      }
      return null;
    })()
      .catch(() => null)
      .finally(() => {
        this.remuxInflight.delete(videoId);
      });

    this.remuxInflight.set(videoId, p);
    return p;
  }

  getCachedVideoFile(videoId) {
    if (!videoId) return null;
    const finalPath = path.join(AUDIO_DISK_CACHE_DIR, `${videoId}.mp4`);
    if (fs.existsSync(finalPath)) {
      try {
        const st = fs.statSync(finalPath);
        if (st.size > 4096) {
          fs.utimesSync(finalPath, new Date(), new Date());
          return finalPath;
        }
      } catch {}
    }
    return null;
  }

  async getFastVideoFile(videoId) {
    if (!videoId) return null;
    const existing = this.getCachedVideoFile(videoId);
    if (existing) return existing;

    const ffmpeg = findFfmpeg();
    if (!ffmpeg) return null;

    if (this.videoRemuxInflight.has(videoId)) {
      return this.videoRemuxInflight.get(videoId);
    }

    const finalPath = path.join(AUDIO_DISK_CACHE_DIR, `${videoId}.mp4`);
    const p = (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const info = await this.resolve(videoId, { forceRefresh: attempt > 0 });
        const video = info?.video;
        if (!video?.url || video.isHls) return null;

        const tmpPath = path.join(AUDIO_DISK_CACHE_DIR, `${videoId}.${Date.now()}.tmp.mp4`);
        const ok = await new Promise((resolve) => {
          const args = ['-y', '-v', 'error', '-i', video.url, '-c:v', 'copy', '-an', '-movflags', '+faststart', tmpPath];
          const child = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
          const timer = setTimeout(() => {
            try { child.kill('SIGKILL'); } catch {}
            resolve(false);
          }, 45000);
          child.on('close', (code) => {
            clearTimeout(timer);
            resolve(code === 0 && fs.existsSync(tmpPath) && fs.statSync(tmpPath).size > 4096);
          });
          child.on('error', () => {
            clearTimeout(timer);
            resolve(false);
          });
        });

        if (ok) {
          fs.renameSync(tmpPath, finalPath);
          pruneDiskCache();
          return finalPath;
        }
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch {}
      }
      return null;
    })()
      .catch(() => null)
      .finally(() => {
        this.videoRemuxInflight.delete(videoId);
      });

    this.videoRemuxInflight.set(videoId, p);
    return p;
  }

  prewarm(videoIds = []) {
    const unique = [...new Set(videoIds.filter(Boolean))].slice(0, 8);
    unique.forEach((id, idx) => {
      if (idx < 5) {
        // Pre-remux top 5 tracks for 0ms instant play with exact duration
        this.getFastAudioFile(id).catch(() => {});
      } else if (!this.getCached(id) && !this.inflight.has(id)) {
        this.resolve(id).catch(() => {});
      }
    });
  }

  stop() {
    if (this.worker && !this.worker.killed) {
      try {
        this.worker.stdin.write(JSON.stringify({ cmd: 'quit' }) + '\n');
      } catch {}
      this.worker.kill();
    }
  }
}

module.exports = new StreamResolver();
