const fs = require('fs');
const path = require('path');
const os = require('os');

const CACHE_BASE =
  process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Sona', 'Caches')
    : process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Caches', 'Sona')
      : path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'Sona');
const CACHE_DIR = CACHE_BASE;
fs.mkdirSync(CACHE_DIR, { recursive: true });

const LISTENERS_CACHE_FILE = path.join(CACHE_DIR, 'kworb-listeners.json');
const YTM_STREAMS_CACHE_FILE = path.join(CACHE_DIR, 'ytm-streams.json');
const TTL_MS = 6 * 60 * 60 * 1000;

const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

let listenersIndex = null; // Map<normalizedName, { spotifyId, name, listenersNum, listenersText }>
let listenersPromise = null;
let kworbDownUntil = 0;

const artistIdCache = new Map(); // normalizedName -> spotifyId | null
const artistPageCache = new Map(); // spotifyId -> { monthlyListeners, avatarUrl, expires }
const artistSongsCache = new Map(); // spotifyId -> { songs: Map<normTitle, { title, streams }>, rawList: [], expires }
const deezerAvatarCache = new Map(); // normalizedName -> url | null
const ytmStreamsCache = new Map(); // videoId -> number

try {
  if (fs.existsSync(YTM_STREAMS_CACHE_FILE)) {
    const raw = JSON.parse(fs.readFileSync(YTM_STREAMS_CACHE_FILE, 'utf8'));
    if (raw && typeof raw === 'object') {
      for (const [k, v] of Object.entries(raw)) {
        const num = Number(v);
        if (k && num > 0) ytmStreamsCache.set(k, num);
      }
    }
  }
} catch {}

function saveYtmStreamsCache() {
  try {
    const obj = Object.fromEntries(ytmStreamsCache.entries());
    fs.writeFileSync(YTM_STREAMS_CACHE_FILE, JSON.stringify(obj), 'utf8');
  } catch {}
}

async function fetchYtmTrackStreamCount(videoId) {
  if (!videoId) return 0;
  if (ytmStreamsCache.has(videoId)) return ytmStreamsCache.get(videoId) || 0;
  try {
    const res = await fetch('https://music.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        Origin: 'https://music.youtube.com',
        Referer: 'https://music.youtube.com/',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB_REMIX',
            clientVersion: '1.20241106.01.00',
            hl: 'en',
            gl: 'US',
          },
        },
        videoId,
      }),
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const data = await res.json();
      const count =
        Number(data?.videoDetails?.viewCount) ||
        Number(data?.microformat?.microformatDataRenderer?.viewCount) ||
        0;
      if (count > 0) {
        ytmStreamsCache.set(videoId, count);
        return count;
      }
    }
  } catch {}
  return 0;
}

function normalizeName(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTrackTitle(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\((feat\.|ft\.|with|remaster|remastered|official|audio|video|single|album|version|edit|radio|explicit|clean|deluxe|bonus|from|live)[^)]*\)/gi, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s*-\s*(remaster|remastered|single version|album version|radio edit|mono|stereo|\d{4}\s*remaster).*$/i, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatCompactListeners(num) {
  if (!num || !Number.isFinite(num)) return '';
  if (num >= 1_000_000) {
    const m = num / 1_000_000;
    return `${m >= 100 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, '')}M monthly listeners`;
  }
  if (num >= 1_000) {
    return `${Math.round(num / 1_000)}K monthly listeners`;
  }
  return `${num.toLocaleString()} monthly listeners`;
}

async function loadListenersIndex({ forceRefresh = false } = {}) {
  if (!forceRefresh && listenersIndex) return listenersIndex;
  if (!forceRefresh && listenersPromise) return listenersPromise;

  listenersPromise = (async () => {
    // Try disk cache first for 0ms startup
    if (!forceRefresh) {
      try {
        if (fs.existsSync(LISTENERS_CACHE_FILE)) {
          const stat = fs.statSync(LISTENERS_CACHE_FILE);
          if (Date.now() - stat.mtimeMs < TTL_MS) {
            const arr = JSON.parse(fs.readFileSync(LISTENERS_CACHE_FILE, 'utf8'));
            const map = new Map();
            for (const item of arr) {
              map.set(normalizeName(item.name), item);
            }
            listenersIndex = map;
            return map;
          }
        }
      } catch {}
    }

    const map = new Map();
    const arr = [];
    if (Date.now() >= kworbDownUntil) {
      try {
        const res = await fetch('https://kworb.net/spotify/listeners.html', {
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) {
          const html = await res.text();
          const matches = html.matchAll(
            /href="artist\/([a-zA-Z0-9]+)_songs\.html">([^<]+)<\/a><\/div><\/td><td[^>]*>([\d,]+)<\/td>/g
          );
          for (const m of matches) {
            const spotifyId = m[1];
            const name = m[2].replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&quot;/g, '"').trim();
            const listenersNum = Number(m[3].replace(/,/g, '')) || 0;
            const entry = {
              spotifyId,
              name,
              listenersNum,
              listenersText: formatCompactListeners(listenersNum),
            };
            arr.push(entry);
            const key = normalizeName(name);
            if (!map.has(key)) map.set(key, entry);
          }
          if (arr.length > 0) {
            try {
              fs.writeFileSync(LISTENERS_CACHE_FILE, JSON.stringify(arr), 'utf8');
            } catch {}
          } else {
            kworbDownUntil = Date.now() + 60_000;
          }
        } else {
          kworbDownUntil = Date.now() + 60_000;
        }
      } catch {
        kworbDownUntil = Date.now() + 60_000;
      }
    }

    // Fallback to stale disk cache if network fetch failed
    if (map.size === 0) {
      try {
        if (fs.existsSync(LISTENERS_CACHE_FILE)) {
          const staleArr = JSON.parse(fs.readFileSync(LISTENERS_CACHE_FILE, 'utf8'));
          for (const item of staleArr) {
            map.set(normalizeName(item.name), item);
          }
        }
      } catch {}
    }

    if (map.size > 0) {
      listenersIndex = map;
    }
    return map;
  })().finally(() => {
    listenersPromise = null;
  });

  return listenersPromise;
}

async function findSpotifyArtistId(artistName) {
  const key = normalizeName(artistName);
  if (!key) return null;

  const idx = await loadListenersIndex();
  const hit = idx.get(key);
  if (hit) return hit.spotifyId;

  if (artistIdCache.has(key)) return artistIdCache.get(key);

  let foundId = null;
  try {
    const q = encodeURIComponent(`artist:"${artistName}"`);
    const mb = await fetch(`https://musicbrainz.org/ws/2/artist/?query=${q}&fmt=json&limit=3`, {
      headers: { 'User-Agent': 'SonaMusicApp/1.0 (local)' },
    }).then((r) => (r.ok ? r.json() : null));

    const candidate = mb?.artists?.[0];
    if (candidate?.id) {
      const detail = await fetch(
        `https://musicbrainz.org/ws/2/artist/${candidate.id}?inc=url-rels&fmt=json`,
        { headers: { 'User-Agent': 'SonaMusicApp/1.0 (local)' } }
      ).then((r) => (r.ok ? r.json() : null));

      const spRel = detail?.relations?.find((r) => r.url?.resource?.includes('open.spotify.com/artist/'));
      const m = spRel?.url?.resource?.match(/artist\/([a-zA-Z0-9]+)/);
      if (m) foundId = m[1];
    }
  } catch {}

  artistIdCache.set(key, foundId);
  return foundId;
}

async function fetchSpotifyArtistPage(spotifyId) {
  if (!spotifyId) return { monthlyListeners: '', avatarUrl: '' };
  const cached = artistPageCache.get(spotifyId);
  if (cached && cached.expires > Date.now()) return cached;

  let monthlyListeners = '';
  let avatarUrl = '';

  try {
    const res = await fetch(`https://open.spotify.com/artist/${spotifyId}`, {
      headers: { 'User-Agent': GOOGLEBOT_UA },
    });
    if (res.ok) {
      const html = await res.text();
      const desc =
        html.match(/name="description"\s+content="([^"]+)"/)?.[1] ||
        html.match(/content="([^"]+)"\s+name="description"/)?.[1] ||
        '';
      const mlMatch = desc.match(/([\d.,]+[KMB]?\s+monthly listeners)/i);
      if (mlMatch) monthlyListeners = mlMatch[1];

      const img =
        html.match(/property="og:image"\s+content="([^"]+)"/)?.[1] ||
        html.match(/content="([^"]+)"\s+property="og:image"/)?.[1] ||
        '';
      if (img && img.includes('i.scdn.co/image/') && !img.includes('download-page-image')) {
        avatarUrl = img;
      }
    }
  } catch {}

  const result = { monthlyListeners, avatarUrl, expires: Date.now() + TTL_MS };
  artistPageCache.set(spotifyId, result);
  return result;
}

async function fetchDeezerArtistAvatar(artistName) {
  const key = normalizeName(artistName);
  if (!key) return '';
  if (deezerAvatarCache.has(key)) return deezerAvatarCache.get(key) || '';

  let url = '';
  try {
    const res = await fetch(
      `https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}&limit=3`
    );
    if (res.ok) {
      const data = await res.json();
      const exact =
        (data.data || []).find((a) => normalizeName(a.name) === key) || (data.data || [])[0];
      const pic = exact?.picture_xl || exact?.picture_big || exact?.picture_medium || '';
      if (pic && !pic.includes('default')) url = pic;
    }
  } catch {}

  deezerAvatarCache.set(key, url);
  return url;
}

async function fetchArtistSongsStreams(spotifyId) {
  if (!spotifyId) return null;
  const cached = artistSongsCache.get(spotifyId);
  if (cached && cached.expires > Date.now()) return cached;
  if (Date.now() < kworbDownUntil) return null;

  const songs = new Map();
  const rawList = [];
  try {
    const res = await fetch(`https://kworb.net/spotify/artist/${spotifyId}_songs.html`, {
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const html = await res.text();
      const rows = html.matchAll(
        /<tr><td class="text"><div><a[^>]*>([^<]+)<\/a><\/div><\/td><td>([\d,]+)<\/td>/g
      );
      for (const r of rows) {
        const title = r[1]
          .replace(/&amp;/g, '&')
          .replace(/&#039;/g, "'")
          .replace(/&quot;/g, '"')
          .trim();
        const streams = Number(r[2].replace(/,/g, '')) || 0;
        if (!title || !streams) continue;
        rawList.push({ title, norm: normalizeTrackTitle(title), streams });
        const norm = normalizeTrackTitle(title);
        if (norm && (!songs.has(norm) || songs.get(norm).streams < streams)) {
          songs.set(norm, { title, streams });
        }
      }
      if (rawList.length === 0) {
        kworbDownUntil = Date.now() + 60_000;
      }
    } else {
      kworbDownUntil = Date.now() + 60_000;
    }
  } catch {
    kworbDownUntil = Date.now() + 60_000;
  }

  const entry = { songs, rawList, expires: Date.now() + TTL_MS };
  if (rawList.length > 0) {
    artistSongsCache.set(spotifyId, entry);
  }
  return entry;
}

function matchStreamCount(trackTitle, artistSongsEntry) {
  if (!artistSongsEntry || !trackTitle) return null;
  const norm = normalizeTrackTitle(trackTitle);
  if (!norm) return null;

  const exact = artistSongsEntry.songs.get(norm);
  if (exact) return exact.streams;

  // Fuzzy prefix/substring match (prefer highest stream match)
  let best = null;
  for (const item of artistSongsEntry.rawList) {
    if (!item.norm) continue;
    if (item.norm === norm || item.norm.startsWith(norm) || norm.startsWith(item.norm)) {
      if (!best || item.streams > best.streams) best = item;
    }
  }
  return best ? best.streams : null;
}

async function getArtistSpotifyBundle(artistName, { forceRefresh = false } = {}) {
  if (forceRefresh) {
    artistPageCache.clear();
    artistSongsCache.clear();
  }
  const idx = await loadListenersIndex({ forceRefresh });
  const key = normalizeName(artistName);
  const idxEntry = idx.get(key) || null;
  const spotifyId = idxEntry?.spotifyId || (await findSpotifyArtistId(artistName));

  const [pageInfo, deezerAvatar, songsEntry] = await Promise.all([
    spotifyId ? fetchSpotifyArtistPage(spotifyId) : Promise.resolve({ monthlyListeners: '', avatarUrl: '' }),
    fetchDeezerArtistAvatar(artistName),
    spotifyId ? fetchArtistSongsStreams(spotifyId) : Promise.resolve(null),
  ]);

  const monthlyListeners = pageInfo.monthlyListeners || idxEntry?.listenersText || '';
  const avatarUrl = pageInfo.avatarUrl || deezerAvatar || '';

  return {
    spotifyId,
    monthlyListeners,
    avatarUrl,
    deezerAvatar,
    songsEntry,
  };
}

async function resolveAvatarForArtist(artistName, fallbackUrl = '') {
  const key = normalizeName(artistName);
  if (key) {
    const idx = await loadListenersIndex();
    const hit = idx.get(key);
    if (hit?.spotifyId) {
      const page = await fetchSpotifyArtistPage(hit.spotifyId);
      if (page.avatarUrl) return page.avatarUrl;
    }
    const dz = await fetchDeezerArtistAvatar(artistName);
    if (dz) return dz;
  }
  return fallbackUrl || '';
}

function extractCandidateArtists(track, fallbackArtistName = '') {
  const candidates = [];
  const push = (val) => {
    const clean = (val || '').trim();
    if (clean && !candidates.includes(clean)) candidates.push(clean);
  };
  if (Array.isArray(track?.artists)) {
    for (const a of track.artists) push(a?.name);
  }
  if (track?.artist) {
    for (const part of String(track.artist).split(/,|&|\bfeat\.?\b|\bft\.?\b|\bx\b/i)) {
      push(part);
    }
  }
  if (fallbackArtistName) push(fallbackArtistName);
  return candidates;
}

async function enrichTracksWithSpotifyStreams(tracks = [], fallbackArtistName = '') {
  if (!Array.isArray(tracks) || tracks.length === 0) return tracks;

  const artistNames = [];
  for (const t of tracks) {
    for (const name of extractCandidateArtists(t, fallbackArtistName)) {
      if (!artistNames.includes(name)) artistNames.push(name);
      if (artistNames.length >= 60) break;
    }
    if (artistNames.length >= 60) break;
  }

  const artistMap = new Map();
  let cursor = 0;
  const concurrency = Math.min(6, Math.max(1, artistNames.length));
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < artistNames.length) {
        const name = artistNames[cursor++];
        try {
          const idx = await loadListenersIndex();
          const spotifyId = idx.get(normalizeName(name))?.spotifyId || (await findSpotifyArtistId(name));
          if (spotifyId) {
            const entry = await fetchArtistSongsStreams(spotifyId);
            if (entry) artistMap.set(normalizeName(name), entry);
          }
        } catch {}
      }
    })
  );

  const afterKworb = tracks.map((t) => {
    if (t?.spotifyStreams) return t;
    for (const name of extractCandidateArtists(t, fallbackArtistName)) {
      const entry = artistMap.get(normalizeName(name));
      const streams = matchStreamCount(t.title, entry);
      if (streams) return { ...t, spotifyStreams: streams };
    }
    return t;
  });

  // Fallback for any track still missing spotifyStreams: query YTM player viewCount
  const needYtm = afterKworb.filter((t) => t && t.videoId && !t.spotifyStreams);
  if (needYtm.length > 0) {
    let ytmCursor = 0;
    let cacheDirty = false;
    const ytmConcurrency = Math.min(8, needYtm.length);
    await Promise.all(
      Array.from({ length: ytmConcurrency }, async () => {
        while (ytmCursor < needYtm.length) {
          const item = needYtm[ytmCursor++];
          const hadCached = ytmStreamsCache.has(item.videoId);
          const count = await fetchYtmTrackStreamCount(item.videoId);
          if (count > 0 && !hadCached) cacheDirty = true;
        }
      })
    );
    if (cacheDirty) saveYtmStreamsCache();
  }

  return afterKworb.map((t) => {
    if (t?.spotifyStreams) return t;
    const ytmCount = t?.videoId ? ytmStreamsCache.get(t.videoId) : 0;
    if (ytmCount > 0) return { ...t, spotifyStreams: ytmCount };
    return t;
  });
}

// Kick off index load immediately on require
loadListenersIndex().catch(() => {});

function clearStatCaches() {
  listenersIndex = null;
  artistPageCache.clear();
  artistSongsCache.clear();
}

module.exports = {
  loadListenersIndex,
  getArtistSpotifyBundle,
  resolveAvatarForArtist,
  enrichTracksWithSpotifyStreams,
  matchStreamCount,
  fetchDeezerArtistAvatar,
  clearStatCaches,
};
