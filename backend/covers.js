const coverCache = new Map(); // cacheKey -> { contentType, buffer, expires }
const inFlight = new Map();
const MAX_CACHE = 450;
const TTL_MS = 24 * 60 * 60 * 1000;

function stripTitleNoise(raw = '') {
  return String(raw)
    .replace(/\s*[\(\[]\s*(?:official\s*(?:music\s*)?(?:video|audio|lyric\s*video|visualizer)|lyrics?|audio|hd|4k|explicit|clean|remaster(?:ed)?(?:\s*\d{4})?|live(?:\s*at[^\)\]]*)?|feat\.?[^\)\]]*|ft\.?[^\)\]]*)\s*[\)\]]/gi, '')
    .replace(/\s+(?:feat\.?|ft\.?)\s+[^-–—]+$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripArtistNoise(raw = '') {
  return String(raw)
    .replace(/\s*-\s*Topic$/i, '')
    .split(/\s*(?:,|&|feat\.?|ft\.?|•)\s*/i)[0]
    .replace(/\s+/g, ' ')
    .trim();
}

function setCached(key, entry) {
  if (!key || !entry?.buffer) return;
  if (coverCache.size >= MAX_CACHE) {
    const oldest = coverCache.keys().next().value;
    coverCache.delete(oldest);
  }
  coverCache.set(key, { ...entry, expires: Date.now() + TTL_MS });
}

async function fetchImageBuffer(url, timeoutMs = 4500) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
        Accept: 'image/jpeg,image/png,image/webp,image/gif,image/*;q=0.8',
      },
    });
    if (!res.ok) return null;
    const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (ct && !ct.startsWith('image/')) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 200) return null;
    // Guard against HTML/JSON disguised as image
    const head = buffer.slice(0, 16).toString('utf8').trimStart().toLowerCase();
    if (head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('{')) return null;
    return {
      contentType: ct || 'image/jpeg',
      buffer,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function findItunesCover(title, artist) {
  const q = `${stripTitleNoise(title)} ${stripArtistNoise(artist)}`.trim();
  if (!q) return '';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=3`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (!res.ok) return '';
    const data = await res.json();
    const art = data?.results?.[0]?.artworkUrl100;
    return art ? art.replace(/100x100bb/i, '600x600bb') : '';
  } catch {
    return '';
  }
}

async function findDeezerCover(title, artist) {
  const q = `${stripTitleNoise(title)} ${stripArtistNoise(artist)}`.trim();
  if (!q) return '';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=3`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return '';
    const data = await res.json();
    const hit = data?.data?.[0];
    return hit?.album?.cover_big || hit?.album?.cover_xl || hit?.album?.cover_medium || '';
  } catch {
    return '';
  }
}

function buildFallbackSvg(title = '', artist = '') {
  const palette = [
    ['#10b981', '#0ea5e9'],
    ['#8b5cf6', '#ec4899'],
    ['#f59e0b', '#ef4444'],
    ['#06b6d4', '#6366f1'],
    ['#14b8a6', '#84cc16'],
  ];
  const seed = [...`${title}${artist}`].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const [c1, c2] = palette[seed % palette.length];
  const letter = (stripTitleNoise(title) || artist || 'S')[0].toUpperCase().replace(/[^A-Z0-9]/g, '♪') || '♪';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="544" height="544" viewBox="0 0 544 544">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}" stop-opacity="0.38"/>
      <stop offset="100%" stop-color="${c2}" stop-opacity="0.22"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="45%" r="55%">
      <stop offset="0%" stop-color="${c1}" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#0b0b12" stop-opacity="1"/>
    </radialGradient>
  </defs>
  <rect width="544" height="544" fill="#0d0d16"/>
  <rect width="544" height="544" fill="url(#glow)"/>
  <rect width="544" height="544" fill="url(#bg)"/>
  <circle cx="272" cy="272" r="150" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
  <circle cx="272" cy="272" r="108" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.15)" stroke-width="1.5"/>
  <text x="272" y="302" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="112" font-weight="800" fill="#ffffff">${letter}</text>
</svg>`;
  return {
    contentType: 'image/svg+xml',
    buffer: Buffer.from(svg, 'utf8'),
  };
}

function isVideoFrameUrl(url = '') {
  return /(?:i\.ytimg\.com|img\.youtube\.com)/i.test(String(url || ''));
}

async function resolveCover({ url = '', videoId = '', title = '', artist = '' } = {}) {
  const preferSquareArt = (isVideoFrameUrl(url) || !url) && Boolean(title || artist);
  const cacheKey = preferSquareArt
    ? `sq:${stripTitleNoise(title).toLowerCase()}|${stripArtistNoise(artist).toLowerCase()}`
    : url || (videoId ? `vid:${videoId}` : `${title}|${artist}`);
  const cached = cacheKey ? coverCache.get(cacheKey) : null;
  if (cached && cached.expires > Date.now()) {
    return { contentType: cached.contentType, buffer: cached.buffer };
  }

  if (cacheKey && inFlight.has(cacheKey)) {
    return inFlight.get(cacheKey);
  }

  const job = (async () => {
    // If the input URL is a letterboxed YouTube video frame (i.ytimg.com), prefer official square album art first.
    if (preferSquareArt) {
      const itunesUrl = await findItunesCover(title, artist);
      if (itunesUrl) {
        const hit = await fetchImageBuffer(itunesUrl);
        if (hit) {
          setCached(cacheKey, hit);
          return hit;
        }
      }
      const deezerUrl = await findDeezerCover(title, artist);
      if (deezerUrl) {
        const hit = await fetchImageBuffer(deezerUrl);
        if (hit) {
          setCached(cacheKey, hit);
          return hit;
        }
      }
    }

    const candidates = [];
    if (url) {
      candidates.push(url);
      // If an upscaled googleusercontent URL used -rj, also queue plain =s544 fallback
      if (/(yt3|lh3)\.googleusercontent\.com/i.test(url) && /=w\d+-h\d+/.test(url)) {
        candidates.push(url.replace(/=w\d+-h\d+[^&]*/, '=s544'));
      }
    }

    for (const cand of candidates) {
      const hit = await fetchImageBuffer(cand);
      if (hit) {
        setCached(cacheKey, hit);
        return hit;
      }
    }

    // Fallback 1: Official album artwork via iTunes / Deezer
    if (!preferSquareArt && (title || artist)) {
      const itunesUrl = await findItunesCover(title, artist);
      if (itunesUrl) {
        const hit = await fetchImageBuffer(itunesUrl);
        if (hit) {
          setCached(cacheKey, hit);
          return hit;
        }
      }
      const deezerUrl = await findDeezerCover(title, artist);
      if (deezerUrl) {
        const hit = await fetchImageBuffer(deezerUrl);
        if (hit) {
          setCached(cacheKey, hit);
          return hit;
        }
      }
    }

    // Fallback 2: Standard YouTube video thumbnail (reliable JPEG)
    if (videoId) {
      for (const ytUrl of [
        `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`,
        `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`,
      ]) {
        const hit = await fetchImageBuffer(ytUrl);
        if (hit) {
          setCached(cacheKey, hit);
          return hit;
        }
      }
    }

    // Final guaranteed SVG cover (cached briefly so repeated retries stay fast)
    return buildFallbackSvg(title, artist);
  })();

  if (cacheKey) {
    inFlight.set(cacheKey, job);
  }
  try {
    return await job;
  } finally {
    if (cacheKey) inFlight.delete(cacheKey);
  }
}

module.exports = { resolveCover };
