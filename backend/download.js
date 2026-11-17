const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const resolver = require('./resolver');

function sanitizeFilename(str = '') {
  return String(str || '')
    .replace(/[\\/:*?"<>|\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function buildTrackFilename(title, artist, ext) {
  const t = sanitizeFilename(title) || 'Track';
  const a = sanitizeFilename(artist);
  const base = a ? `${a} - ${t}` : t;
  return `${base}.${ext}`;
}

function transcodeToMp3(inputPath, outPath) {
  return new Promise((resolve, reject) => {
    const ffmpegBin = process.platform === 'win32' ? 'ffmpeg' : 'ffmpeg';
    execFile(
      ffmpegBin,
      ['-y', '-i', inputPath, '-vn', '-codec:a', 'libmp3lame', '-q:a', '2', outPath],
      { timeout: 120_000 },
      (err) => {
        if (err || !fs.existsSync(outPath) || fs.statSync(outPath).size < 1024) {
          reject(err || new Error('MP3 conversion failed'));
        } else {
          resolve(outPath);
        }
      }
    );
  });
}

async function prepareTrackFile(videoId, format = 'mp3', { title = '', artist = '' } = {}) {
  if (!videoId || !/^[a-zA-Z0-9_-]+$/.test(videoId)) {
    throw new Error('Invalid videoId');
  }
  const fmt = ['mp3', 'm4a', 'mp4'].includes(String(format).toLowerCase())
    ? String(format).toLowerCase()
    : 'mp3';

  if (fmt === 'mp4') {
    const filePath = await resolver.getFastVideoFile(videoId);
    if (!filePath || !fs.existsSync(filePath)) throw new Error('Could not download MP4 video');
    return {
      filePath,
      filename: buildTrackFilename(title, artist, 'mp4'),
      mime: 'video/mp4',
      cleanup: false,
    };
  }

  const audioPath = await resolver.getFastAudioFile(videoId);
  if (!audioPath || !fs.existsSync(audioPath)) throw new Error('Could not download audio');

  if (fmt === 'mp3') {
    const tmpMp3 = path.join(os.tmpdir(), `mynil-${videoId}-${Date.now()}.mp3`);
    try {
      await transcodeToMp3(audioPath, tmpMp3);
      return {
        filePath: tmpMp3,
        filename: buildTrackFilename(title, artist, 'mp3'),
        mime: 'audio/mpeg',
        cleanup: true,
      };
    } catch {
      // Fallback to M4A if ffmpeg/libmp3lame is unavailable
    }
  }

  return {
    filePath: audioPath,
    filename: buildTrackFilename(title, artist, 'm4a'),
    mime: 'audio/mp4',
    cleanup: false,
  };
}

// Pure-JS STORE ZIP builder (zero dependencies)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function buildZipBuffer(entries = []) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const data = entry.data;
    const crc = crc32(data);
    const size = data.length;

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4); // version needed
    lh.writeUInt16LE(0x0800, 6); // UTF-8 flag
    lh.writeUInt16LE(0, 8); // STORE
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(size, 18);
    lh.writeUInt32LE(size, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    localParts.push(lh, nameBuf, data);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(size, 20);
    ch.writeUInt32LE(size, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    centralParts.push(ch, nameBuf);

    offset += lh.length + nameBuf.length + size;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

module.exports = {
  prepareTrackFile,
  buildZipBuffer,
  sanitizeFilename,
};
