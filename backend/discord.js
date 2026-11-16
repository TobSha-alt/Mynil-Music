const net = require('net');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1297631691394322503';

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

class DiscordRpc {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.connecting = false;
    this.lastConnectAttempt = 0;
  }

  async ensureConnected() {
    if (this.connected && this.socket && !this.socket.destroyed) return true;
    if (this.connecting) return false;
    if (Date.now() - this.lastConnectAttempt < 20_000) return false;

    this.connecting = true;
    this.lastConnectAttempt = Date.now();

    const paths = getIpcPaths();
    for (const ipcPath of paths) {
      const ok = await new Promise((resolve) => {
        let settled = false;
        const sock = net.createConnection(ipcPath);
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            try { sock.destroy(); } catch {}
            resolve(false);
          }
        }, 1200);

        sock.once('connect', () => {
          try {
            sock.write(encodeFrame(0, { v: 1, client_id: DEFAULT_CLIENT_ID }));
          } catch {}
        });

        sock.on('data', (buf) => {
          if (!settled && buf.length >= 8) {
            settled = true;
            clearTimeout(timer);
            this.socket = sock;
            this.connected = true;
            sock.on('close', () => {
              this.connected = false;
              this.socket = null;
            });
            sock.on('error', () => {
              this.connected = false;
              this.socket = null;
            });
            resolve(true);
          }
        });

        sock.once('error', () => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            try { sock.destroy(); } catch {}
            resolve(false);
          }
        });
      });

      if (ok) {
        this.connecting = false;
        return true;
      }
    }

    this.connecting = false;
    return false;
  }

  async updatePresence({ title, artist, album, thumbnail, durationSec = 0, positionSec = 0, isPlaying = false } = {}) {
    if (!title) return this.clearPresence();
    const ok = await this.ensureConnected();
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
