const net = require('net');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1572346742488432710';

function getIpcPaths() {
  if (process.platform === 'win32') {
    return Array.from({ length: 10 }, (_, i) => `\\\\?\\pipe\\discord-ipc-${i}`);
  }
  const base =
    process.env.XDG_RUNTIME_DIR ||
    process.env.TMPDIR ||
    process.env.TMP ||
    process.env.TEMP ||
    '/tmp';
  return Array.from({ length: 10 }, (_, i) => path.join(base, `discord-ipc-${i}`));
}

function encodeFrame(op, payloadObj) {
  const json = Buffer.from(JSON.stringify(payloadObj), 'utf8');
  const header = Buffer.alloc(8);
  header.writeInt32LE(op, 0);
  header.writeInt32LE(json.length, 4);
  return Buffer.concat([header, json]);
}

function decodeFrame(buf) {
  if (!buf || buf.length < 8) return null;
  const op = buf.readInt32LE(0);
  const len = buf.readInt32LE(4);
  if (buf.length < 8 + len) return null;
  try {
    const data = JSON.parse(buf.slice(8, 8 + len).toString('utf8'));
    return { op, data };
  } catch {
    return { op, data: null };
  }
}

class DiscordRpc {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.connecting = false;
    this.lastConnectAttempt = 0;
    this.activeClientId = '';
    this.lastError = '';
  }

  getStatus() {
    return {
      connected: this.connected,
      clientId: this.activeClientId || DEFAULT_CLIENT_ID,
      lastError: this.lastError,
    };
  }

  disconnect() {
    if (this.socket) {
      try { this.socket.destroy(); } catch {}
    }
    this.socket = null;
    this.connected = false;
  }

  async ensureConnected(clientId = '') {
    const resolvedId = String(clientId || DEFAULT_CLIENT_ID || '').trim();
    if (!resolvedId) {
      this.lastError = 'No Discord Application ID set (create one at discord.com/developers/applications and paste it in Settings)';
      this.disconnect();
      return false;
    }

    if (this.activeClientId && this.activeClientId !== resolvedId) {
      this.disconnect();
      this.lastConnectAttempt = 0;
    }

    if (this.connected && this.socket && !this.socket.destroyed) return true;
    if (this.connecting) return false;
    if (Date.now() - this.lastConnectAttempt < 10_000) return false;

    this.connecting = true;
    this.lastConnectAttempt = Date.now();
    this.activeClientId = resolvedId;

    const paths = getIpcPaths();
    let sawPipe = false;

    for (const ipcPath of paths) {
      const result = await new Promise((resolve) => {
        let settled = false;
        const sock = net.createConnection(ipcPath);
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            try { sock.destroy(); } catch {}
            resolve({ ok: false, error: 'Handshake timeout' });
          }
        }, 1500);

        sock.once('connect', () => {
          sawPipe = true;
          try {
            sock.write(encodeFrame(0, { v: 1, client_id: resolvedId }));
          } catch {}
        });

        sock.on('data', (buf) => {
          if (settled) return;
          const frame = decodeFrame(buf);
          if (!frame) return;
          settled = true;
          clearTimeout(timer);
          if (frame.op === 1 && frame.data?.evt === 'READY') {
            this.socket = sock;
            this.connected = true;
            this.lastError = '';
            sock.on('close', () => {
              this.connected = false;
              this.socket = null;
            });
            sock.on('error', () => {
              this.connected = false;
              this.socket = null;
            });
            resolve({ ok: true });
          } else {
            const msg = frame.data?.message || frame.data?.data?.message || `Discord rejected handshake (op ${frame.op})`;
            try { sock.destroy(); } catch {}
            resolve({ ok: false, error: msg, fatal: true });
          }
        });

        sock.once('error', () => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            try { sock.destroy(); } catch {}
            resolve({ ok: false });
          }
        });
      });

      if (result.ok) {
        this.connecting = false;
        return true;
      }
      if (result.fatal) {
        this.lastError = result.error || 'Discord rejected Client ID';
        this.connecting = false;
        return false;
      }
    }

    if (!sawPipe) {
      this.lastError = 'Discord desktop app not detected';
    }
    this.connecting = false;
    return false;
  }

  async updatePresence({ clientId, title, artist, album, thumbnail, durationSec = 0, positionSec = 0, isPlaying = false } = {}) {
    if (!title) return this.clearPresence();
    const ok = await this.ensureConnected(clientId);
    if (!ok || !this.socket || this.socket.destroyed) return false;

    const nowSec = Math.floor(Date.now() / 1000);
    const pos = Math.max(0, Math.floor(Number(positionSec) || 0));
    const dur = Math.max(0, Math.floor(Number(durationSec) || 0));

    const activity = {
      type: 2, // Listening
      details: String(title).slice(0, 128),
      state: String(artist || 'Unknown Artist').slice(0, 128),
      assets: {
        large_image: thumbnail && /^https?:\/\//i.test(thumbnail) ? thumbnail : 'mynil',
        large_text: String(album || 'Mynil Music').slice(0, 128),
      },
    };

    if (isPlaying && dur > 0) {
      activity.timestamps = {
        start: nowSec - pos,
        end: nowSec + Math.max(1, dur - pos),
      };
    }

    try {
      this.socket.write(
        encodeFrame(1, {
          cmd: 'SET_ACTIVITY',
          args: { pid: process.pid, activity },
          nonce: crypto.randomUUID(),
        })
      );
      return true;
    } catch {
      this.connected = false;
      return false;
    }
  }

  async clearPresence() {
    if (!this.connected || !this.socket || this.socket.destroyed) return false;
    try {
      this.socket.write(
        encodeFrame(1, {
          cmd: 'SET_ACTIVITY',
          args: { pid: process.pid },
          nonce: crypto.randomUUID(),
        })
      );
      return true;
    } catch {
      this.connected = false;
      return false;
    }
  }
}

module.exports = new DiscordRpc();
