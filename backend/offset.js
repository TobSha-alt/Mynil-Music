const { spawn } = require('child_process');

const offsetCache = new Map();

function fetchAudioEnvelope(url, durationSec, userAgent) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const args = ['-loglevel', 'error'];
    if (userAgent) {
      args.push('-user_agent', userAgent);
    }
    args.push(
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '2',
      '-i', url,
      '-t', String(durationSec),
      '-vn',
      '-ac', '1',
      '-ar', '4000',
      '-f', 'f32le',
      'pipe:1'
    );

    const proc = spawn('ffmpeg', args, { windowsHide: true });
    const chunks = [];
    let totalBytes = 0;
    const maxBytes = durationSec * 4000 * 4 + 65536;

    const killTimer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
    }, 8000);

    proc.stdout.on('data', (chunk) => {
      if (totalBytes < maxBytes) {
        chunks.push(chunk);
        totalBytes += chunk.length;
      }
    });

    proc.on('error', () => {
      clearTimeout(killTimer);
      resolve(null);
    });

    proc.on('close', () => {
      clearTimeout(killTimer);
      if (totalBytes < 4000 * 4 * 5) return resolve(null);
      const buf = Buffer.concat(chunks);
      const samples = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
      const frameSize = 200; // 50ms at 4000Hz (20 fps)
      const numFrames = Math.floor(samples.length / frameSize);
      const env = new Float32Array(numFrames);
      for (let f = 0; f < numFrames; f++) {
        let sumSq = 0;
        const base = f * frameSize;
        for (let i = 0; i < frameSize; i++) {
          const s = samples[base + i];
          sumSq += s * s;
        }
        env[f] = Math.log1p(Math.sqrt(sumSq / frameSize) * 40);
      }
      resolve(env);
    });
  });
}

function correlateEnvelopes(songEnv, videoEnv) {
  if (!songEnv || !videoEnv || songEnv.length < 100 || videoEnv.length <= songEnv.length) {
    return { offsetSec: 0, confidence: 0 };
  }
  const N = songEnv.length;
  const maxLag = videoEnv.length - N;

  let songMean = 0;
  for (let i = 0; i < N; i++) songMean += songEnv[i];
  songMean /= N;

  let songVar = 0;
  const songNorm = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const d = songEnv[i] - songMean;
    songNorm[i] = d;
    songVar += d * d;
  }
  if (songVar <= 1e-6) return { offsetSec: 0, confidence: 0 };

  let bestLag = 0;
  let bestR = -1;

  for (let lag = 0; lag <= maxLag; lag++) {
    let vMean = 0;
    for (let i = 0; i < N; i++) vMean += videoEnv[lag + i];
    vMean /= N;

    let num = 0;
    let vVar = 0;
    for (let i = 0; i < N; i++) {
      const vd = videoEnv[lag + i] - vMean;
      num += songNorm[i] * vd;
      vVar += vd * vd;
    }
    if (vVar <= 1e-6) continue;
    const r = num / Math.sqrt(songVar * vVar);
    if (r > bestR) {
      bestR = r;
      bestLag = lag;
    }
  }

  return {
    offsetSec: Number((bestLag / 20).toFixed(2)),
    confidence: Number(bestR.toFixed(3)),
  };
}

async function querySponsorBlock(videoId) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(
      `https://sponsor.ajay.app/api/skipSegments?videoID=${encodeURIComponent(videoId)}&category=music_offtopic`,
      { signal: ctrl.signal }
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const segments = await res.json().catch(() => []);
    const intro = Array.isArray(segments)
      ? segments.find((s) => {
          const seg = s?.segment;
          return Array.isArray(seg) && seg.length >= 2 && seg[0] <= 5 && seg[1] > 2 && seg[1] <= 240;
        })
      : null;
    if (intro) {
      return {
        offsetSec: Number(Number(intro.segment[1]).toFixed(2)),
        source: 'sponsorblock',
        segment: intro.segment,
      };
    }
  } catch {}
  return null;
}

async function matchAudioIntro({ videoId, songVideoId, resolver }) {
  if (!videoId || !songVideoId || videoId === songVideoId || !resolver) return null;
  try {
    const [songStream, videoStream] = await Promise.all([
      resolver.resolve(songVideoId).catch(() => null),
      resolver.resolve(videoId).catch(() => null),
    ]);
    const songUrl = songStream?.audio?.url;
    const videoUrl = videoStream?.audio?.url;
    if (!songUrl || !videoUrl) return null;

    const [songEnv, videoEnv] = await Promise.all([
      fetchAudioEnvelope(songUrl, 35, songStream?.audio?.httpHeaders?.['User-Agent']),
      fetchAudioEnvelope(videoUrl, 150, videoStream?.audio?.httpHeaders?.['User-Agent']),
    ]);
    const { offsetSec, confidence } = correlateEnvelopes(songEnv, videoEnv);
    if (confidence >= 0.45 && offsetSec >= 2) {
      return { offsetSec, source: 'audio-match', confidence };
    }
  } catch {}
  return null;
}

async function detectVideoIntroOffset({ videoId, songVideoId, resolver }) {
  if (!videoId) return { offsetSec: 0, source: 'none' };
  const cacheKey = `${videoId}:${songVideoId || ''}`;
  if (offsetCache.has(cacheKey)) {
    return offsetCache.get(cacheKey);
  }

  const sb = await querySponsorBlock(videoId);
  if (sb) {
    offsetCache.set(cacheKey, sb);
    return sb;
  }

  const audioMatch = await matchAudioIntro({ videoId, songVideoId, resolver });
  if (audioMatch) {
    offsetCache.set(cacheKey, audioMatch);
    return audioMatch;
  }

  const none = { offsetSec: 0, source: 'none' };
  offsetCache.set(cacheKey, none);
  return none;
}

module.exports = {
  detectVideoIntroOffset,
  matchAudioIntro,
};
