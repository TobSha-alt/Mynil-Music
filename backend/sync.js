const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');

const _SEAL_KEY = crypto.createHash('sha256').update('sona-cloud-sync-v1-internal-seal').digest();
const _SEALED_URL = '7MI4kfwkZzNxzSAdNSzMo5CF4hX3L22+tx9mjsoSytbdo2emb0HSbUeswE0J5I6J+1GvelW7Ua+2abkLSYUtnWVZ1G8=';
const _SEALED_KEY = 'NxDlarRFGtqvqDB04x3P8qrbU1MNKYiXgKtApwSQI44w3P2symWh7XFXWY9cxyPXS7as55pFVPeuesUTXqBbeglX9t14j0gkgQc=';

function unseal(b64) {
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const dec = crypto.createDecipheriv('aes-256-gcm', _SEAL_KEY, iv);
  dec.setAuthTag(tag);
  return Buffer.concat([dec.update(enc), dec.final()]).toString('utf8');
}

function normalizeUsername(u) {
  return String(u || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '');
}

function hashPassword(username, password) {
  return crypto
    .pbkdf2Sync(String(password || ''), `sona-v1:${username}`, 100000, 32, 'sha256')
    .toString('hex');
}

function mergeByKey(localArr = [], remoteArr = [], keyFn) {
  const map = new Map();
  for (const item of remoteArr || []) {
    const k = keyFn(item);
    if (k) map.set(k, item);
  }
  for (const item of localArr || []) {
    const k = keyFn(item);
    if (!k) continue;
    if (!map.has(k)) {
      map.set(k, item);
    } else {
      map.set(k, { ...map.get(k), ...item });
    }
  }
  return Array.from(map.values());
}

function mergePlaylists(localPlaylists = [], remotePlaylists = []) {
  const map = new Map();
  for (const pl of remotePlaylists || []) {
    if (pl?.id) map.set(pl.id, pl);
  }
  for (const pl of localPlaylists || []) {
    if (!pl?.id) continue;
    const existing = map.get(pl.id);
    if (!existing) {
      map.set(pl.id, pl);
    } else {
      const mergedTracks = mergeByKey(
        pl.tracks,
        existing.tracks,
        (t) => t?.videoId || `${t?.title}::${t?.artist}`
      );
      map.set(pl.id, {
        ...existing,
        ...pl,
        tracks: mergedTracks,
      });
    }
  }
  return Array.from(map.values());
}

function mergeHistory(localHist = [], remoteHist = []) {
  const combined = [...(localHist || []), ...(remoteHist || [])];
  combined.sort((a, b) => (b.playedAt || 0) - (a.playedAt || 0));
  const seen = new Set();
  const out = [];
  for (const item of combined) {
    const k = item?.videoId || `${item?.title}::${item?.artist}`;
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
    if (out.length >= 120) break;
  }
  return out;
}

function mergePlayCounts(localCounts = {}, remoteCounts = {}) {
  const out = { ...(remoteCounts || {}) };
  for (const [k, v] of Object.entries(localCounts || {})) {
    out[k] = Math.max(Number(out[k] || 0), Number(v || 0));
  }
  return out;
}

class CloudSyncService {
  constructor() {
    this.configPath = null;
    this.runtimeUrl = process.env.SONA_SUPABASE_URL || unseal(_SEALED_URL);
    this.runtimeKey = process.env.SONA_SUPABASE_ANON_KEY || unseal(_SEALED_KEY);
    this.config = {
      account: null, // { username, passwordHash }
      lastSyncAt: 0,
    };
    this.syncing = false;
    this.lastError = null;
    this.pushTimer = null;
    this.suppressPush = false;
  }

  init() {
    const baseDir = store.filePath ? path.dirname(store.filePath) : process.cwd();
    this.configPath = path.join(baseDir, 'sona-account.json');
    try {
      if (fs.existsSync(this.configPath)) {
        const parsed = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        this.config = {
          account: parsed.account || null,
          lastSyncAt: parsed.lastSyncAt || 0,
        };
      }
    } catch {}

    if (this.isSignedIn() && this.isConfigured()) {
      setTimeout(() => {
        this.syncNow().catch(() => {});
      }, 2000);
    }
  }

  saveConfig() {
    if (!this.configPath) return;
    try {
      fs.writeFileSync(
        this.configPath,
        JSON.stringify(
          {
            account: this.config.account,
            lastSyncAt: this.config.lastSyncAt,
          },
          null,
          2
        ),
        'utf8'
      );
    } catch {}
  }

  isConfigured() {
    return Boolean(this.runtimeUrl && this.runtimeKey);
  }

  isSignedIn() {
    return Boolean(this.config.account?.username && this.config.account?.passwordHash);
  }

  getStatus() {
    return {
      mode: this.isSignedIn() ? 'account' : 'guest',
      configured: true,
      user: this.isSignedIn()
        ? {
            id: this.config.account.id || this.config.account.username,
            username: this.config.account.username,
            displayName: this.config.account.username,
          }
        : null,
      syncing: this.syncing,
      lastSyncAt: this.config.lastSyncAt || 0,
      lastError: this.lastError,
    };
  }

  configure() {
    return this.getStatus();
  }

  headers(extra = {}) {
    const key = this.runtimeKey || '';
    const h = {
      'Content-Type': 'application/json',
      apikey: key,
      ...extra,
    };
    if (key.startsWith('eyJ')) {
      h.Authorization = `Bearer ${key}`;
    }
    return h;
  }

  async signUp({ username, password }) {
    if (!this.isConfigured()) {
      throw new Error('Cloud sync is not configured yet. Click Setup Cloud Sync first.');
    }
    const cleanUser = normalizeUsername(username);
    if (cleanUser.length < 3) {
      throw new Error('Username must be at least 3 characters (letters, numbers, _, ., -).');
    }
    if (String(password || '').length < 4) {
      throw new Error('Password must be at least 4 characters.');
    }

    const checkUrl = `${this.runtimeUrl}/rest/v1/sona_accounts?username=eq.${encodeURIComponent(cleanUser)}&select=username`;
    const checkRes = await fetch(checkUrl, { headers: this.headers() });
    if (!checkRes.ok) {
      const t = await checkRes.text().catch(() => '');
      throw new Error(`Supabase error (${checkRes.status}): ${t}`);
    }
    const existing = await checkRes.json();
    if (existing?.length > 0) {
      throw new Error(`Username "${cleanUser}" is already in use.`);
    }

    const passwordHash = hashPassword(cleanUser, password);
    const insertRes = await fetch(`${this.runtimeUrl}/rest/v1/sona_accounts`, {
      method: 'POST',
      headers: this.headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        username: cleanUser,
        password_hash: passwordHash,
        data: store.state,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!insertRes.ok) {
      const t = await insertRes.text().catch(() => '');
      throw new Error(`Could not create account (${insertRes.status}): ${t}`);
    }

    this.config.account = { username: cleanUser, passwordHash };
    this.config.lastSyncAt = Date.now();
    this.lastError = null;
    this.saveConfig();
    return { status: this.getStatus(), needsEmailConfirm: false };
  }

  async signIn({ username, password }) {
    if (!this.isConfigured()) {
      throw new Error('Cloud sync is not configured yet. Click Setup Cloud Sync first.');
    }
    const cleanUser = normalizeUsername(username);
    if (!cleanUser) throw new Error('Enter your username.');

    const url = `${this.runtimeUrl}/rest/v1/sona_accounts?username=eq.${encodeURIComponent(cleanUser)}&select=username,password_hash,data`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Sign in failed (${res.status}): ${t}`);
    }
    const rows = await res.json();
    if (!rows || rows.length === 0) {
      throw new Error(`Account "${cleanUser}" not found.`);
    }

    const row = rows[0];
    const passwordHash = hashPassword(cleanUser, password);
    if (row.password_hash !== passwordHash) {
      throw new Error('Incorrect password.');
    }

    this.config.account = { username: cleanUser, passwordHash };
    this.lastError = null;
    this.saveConfig();
    await this.syncNow();
    return this.getStatus();
  }

  signOut() {
    this.config.account = null;
    this.config.lastSyncAt = 0;
    this.lastError = null;
    if (this.pushTimer) {
      clearTimeout(this.pushTimer);
      this.pushTimer = null;
    }
    this.saveConfig();
    return this.getStatus();
  }

  async fetchRemoteLibrary() {
    const accountKey = this.config.account.id || this.config.account.username;
    const { passwordHash } = this.config.account;
    const url = `${this.runtimeUrl}/rest/v1/sona_accounts?username=eq.${encodeURIComponent(accountKey)}&password_hash=eq.${encodeURIComponent(passwordHash)}&select=data`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Sync fetch failed (${res.status}): ${t}`);
    }
    const rows = await res.json();
    return rows?.[0]?.data || null;
  }

  async pushRemoteLibrary(libraryData) {
    const accountKey = this.config.account.id || this.config.account.username;
    const { passwordHash } = this.config.account;
    const url = `${this.runtimeUrl}/rest/v1/sona_accounts?username=eq.${encodeURIComponent(accountKey)}&password_hash=eq.${encodeURIComponent(passwordHash)}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: this.headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        data: libraryData,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Sync push failed (${res.status}): ${t}`);
    }
  }

  async syncNow() {
    if (!this.isSignedIn() || !this.isConfigured()) return this.getStatus();
    if (this.syncing) return this.getStatus();

    this.syncing = true;
    this.lastError = null;
    try {
      const remote = await this.fetchRemoteLibrary();
      const local = store.state;
      let merged = local;

      if (remote && typeof remote === 'object') {
        merged = {
          likedSongs: mergeByKey(
            local.likedSongs,
            remote.likedSongs,
            (t) => t?.videoId || `${t?.title}::${t?.artist}`
          ),
          followedArtists: mergeByKey(
            local.followedArtists,
            remote.followedArtists,
            (a) => a?.artistId || a?.name
          ),
          savedAlbums: mergeByKey(
            local.savedAlbums,
            remote.savedAlbums,
            (a) => a?.albumId || a?.title
          ),
          playlists: mergePlaylists(local.playlists, remote.playlists),
          history: mergeHistory(local.history, remote.history),
          playCounts: mergePlayCounts(local.playCounts, remote.playCounts),
          preferences: {
            ...(remote.preferences || {}),
            ...(local.preferences || {}),
            trackSyncOffsets: {
              ...(remote.preferences?.trackSyncOffsets || {}),
              ...(local.preferences?.trackSyncOffsets || {}),
            },
          },
        };

        this.suppressPush = true;
        store.state = merged;
        store.save();
        this.suppressPush = false;
      }

      await this.pushRemoteLibrary(merged);
      this.config.lastSyncAt = Date.now();
      this.saveConfig();
    } catch (err) {
      this.suppressPush = false;
      this.lastError = err?.message || 'Sync failed';
    } finally {
      this.syncing = false;
    }

    return this.getStatus();
  }

  async resetAccount() {
    if (!this.isSignedIn()) {
      throw new Error('Sign in to an account first to reset your account.');
    }
    if (this.pushTimer) {
      clearTimeout(this.pushTimer);
      this.pushTimer = null;
    }
    this.suppressPush = true;
    const fresh = store.resetToDefault();
    this.suppressPush = false;
    await this.pushRemoteLibrary(fresh);
    this.config.lastSyncAt = Date.now();
    this.lastError = null;
    this.saveConfig();
    return { status: this.getStatus(), library: fresh };
  }

  resetDevice({ onClearExtras } = {}) {
    this.signOut();
    if (this.configPath && fs.existsSync(this.configPath)) {
      try {
        fs.unlinkSync(this.configPath);
      } catch {}
    }
    const baseDir = store.filePath ? path.dirname(store.filePath) : process.cwd();
    const metaFile = path.join(baseDir, 'stats-scan-meta.json');
    if (fs.existsSync(metaFile)) {
      try {
        fs.unlinkSync(metaFile);
      } catch {}
    }
    if (typeof onClearExtras === 'function') {
      try {
        onClearExtras();
      } catch {}
    }
    this.suppressPush = true;
    const fresh = store.resetToDefault();
    this.suppressPush = false;
    return { status: this.getStatus(), library: fresh };
  }

  async resetAccount() {
    if (!this.isSignedIn()) {
      throw new Error('Sign in to an account first to reset your account.');
    }
    if (this.pushTimer) {
      clearTimeout(this.pushTimer);
      this.pushTimer = null;
    }
    this.suppressPush = true;
    const fresh = store.resetToDefault();
    this.suppressPush = false;
    await this.pushRemoteLibrary(fresh);
    this.config.lastSyncAt = Date.now();
    this.lastError = null;
    this.saveConfig();
    return { status: this.getStatus(), library: fresh };
  }

  resetDevice({ onClearExtras } = {}) {
    this.signOut();
    if (this.configPath && fs.existsSync(this.configPath)) {
      try {
        fs.unlinkSync(this.configPath);
      } catch {}
    }
    const baseDir = store.filePath ? path.dirname(store.filePath) : process.cwd();
    const metaFile = path.join(baseDir, 'stats-scan-meta.json');
    if (fs.existsSync(metaFile)) {
      try {
        fs.unlinkSync(metaFile);
      } catch {}
    }
    if (typeof onClearExtras === 'function') {
      try {
        onClearExtras();
      } catch {}
    }
    this.suppressPush = true;
    const fresh = store.resetToDefault();
    this.suppressPush = false;
    return { status: this.getStatus(), library: fresh };
  }

  schedulePush() {
    if (this.suppressPush || !this.isSignedIn() || !this.isConfigured()) return;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      this.pushRemoteLibrary(store.state)
        .then(() => {
          this.config.lastSyncAt = Date.now();
          this.lastError = null;
          this.saveConfig();
        })
        .catch((err) => {
          this.lastError = err?.message || 'Sync push failed';
        });
    }, 2500);
  }
}

module.exports = new CloudSyncService();
