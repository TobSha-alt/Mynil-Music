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

// Remove legacy YouTube stream fallback cache if present
try {
  const legacyYtmFile = path.join(CACHE_DIR, 'ytm-streams.json');
  if (fs.existsSync(legacyYtmFile)) fs.unlinkSync(legacyYtmFile);
} catch {}

const LISTENERS_CACHE_FILE = path.join(CACHE_DIR, 'kworb-listeners.json');
const TRACK_STREAMS_CACHE_FILE = path.join(CACHE_DIR, 'spotify-track-streams.json');
const ARTIST_BUNDLES_CACHE_FILE = path.join(CACHE_DIR, 'spotify-artist-bundles.json');

// 30-day monthly refresh TTL
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const HASH_SEARCH_DESKTOP = 'fcad5a3e0d5af727fb76966f06971c19cfa2275e6ff7671196753e008611873c';
const HASH_GET_TRACK = 'e101aead6d78faa11d75bec5e36385a07b2f1c4a0420932d374d89ee17c70dd6';
const HASH_ARTIST_OVERVIEW = '35648a112beb1794e39ab931365f6ae4a8d45e65396d641eeda94e4003d41497';

let listenersIndex = null;
let listenersPromise = null;
let kworbDownUntil = 0;

let spotifyToken = null;
let spotifyTokenExpiresAt = 0;
let spotifyTokenPromise = null;

const artistIdCache = new Map();
const artistPageCache = new Map();
const artistSongsCache = new Map();
const deezerAvatarCache = new Map();

// Persistent disk-backed Spotify stream caches (30-day monthly TTL)
// key ("artist::title" or "vid:<videoId>") -> { streams: number, updatedAt: number }
const trackStreamsCache = new Map();
// key (normalizedArtist) -> { spotifyId, monthlyListeners, avatarUrl, songs: { [normTitle]: number }, updatedAt }
const artistBundlesDiskCache = new Map();

try {
  if (fs.existsSync(TRACK_STREAMS_CACHE_FILE)) {
    const raw = JSON.parse(fs.readFileSync(TRACK_STREAMS_CACHE_FILE, 'utf8'));
    if (raw && typeof raw === 'object') {
      for (const [k, v] of Object.entries(raw)) {
        if (v && typeof v === 'object' && Number(v.streams) > 0) {
          trackStreamsCache.set(k, {
            streams: Number(v.streams),
            updatedAt: Number(v.updatedAt) || Date.now(),
          });
        } else if (Number(v) > 0) {
          trackStreamsCache.set(k, { streams: Number(v), updatedAt: Date.now() });
        }
      }
    }
  }
} catch {}

try {
  if (fs.existsSync(ARTIST_BUNDLES_CACHE_FILE)) {
    const raw = JSON.parse(fs.readFileSync(ARTIST_BUNDLES_CACHE_FILE, 'utf8'));
    if (raw && typeof raw === 'object') {
      for (const [k, v] of Object.entries(raw)) {
        if (v && typeof v === 'object') {
          artistBundlesDiskCache.set(k, v);
        }
      }
    }
  }
} catch {}

let saveTracksTimer = null;
function scheduleSaveTrackStreamsCache() {
  if (saveTracksTimer) return;
  saveTracksTimer = setTimeout(() => {
    saveTracksTimer = null;
    try {
      const obj = Object.fromEntries(trackStreamsCache.entries());
      fs.writeFileSync(TRACK_STREAMS_CACHE_FILE, JSON.stringify(obj), 'utf8');
    } catch {}
  }, 250);
  if (saveTracksTimer.unref) saveTracksTimer.unref();
}

let saveArtistsTimer = null;
function scheduleSaveArtistBundlesCache() {
  if (saveArtistsTimer) return;
  saveArtistsTimer = setTimeout(() => {
    saveArtistsTimer = null;
    try {
      const obj = Object.fromEntries(artistBundlesDiskCache.entries());
      fs.writeFileSync(ARTIST_BUNDLES_CACHE_FILE, JSON.stringify(obj), 'utf8');
    } catch {}
  }, 250);
  if (saveArtistsTimer.unref) saveArtistsTimer.unref();
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
    .replace(
      /\((feat\.|ft\.|with|remaster|remastered|official|audio|video|music video|lyric|lyrics|visualizer|single|album|version|edit|radio|explicit|clean|deluxe|bonus|from|live|anniversary)[^)]*\)/gi,
      ''
    )
    .replace(/\[[^\]]*\]/g, '')
    .replace(
      /\s*-\s*(remaster|remastered|single version|album version|radio edit|mono|stereo|\d{4}\s*remaster).*$/i,
      ''
    )
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTrackCacheKey(title, artist) {
  const nt = normalizeTrackTitle(title);
  const na = normalizeName(String(artist || '').split(/,|&|\bfeat\.?\b|\bft\.?\b/i)[0] || artist);
  if (!nt) return '';
  return `${na}::${nt}`;
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

async function getSpotifyAccessToken(forceRefresh = false) {
  if (!forceRefresh && spotifyToken && Date.now() < spotifyTokenExpiresAt - 120_000) {
    return spotifyToken;
  }
  if (!forceRefresh && spotifyTokenPromise) return spotifyTokenPromise;

  spotifyTokenPromise = (async () => {
    const embedUrls = [
      'https://open.spotify.com/embed/artist/6XyY86QOPPrYVGvF9ch6wz',
      'https://open.spotify.com/embed/track/2nLtzopw4rPReszdYBJU6h',
    ];
    for (const url of embedUrls) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': BROWSER_UA },
          signal: AbortSignal.timeout(4500),
        });
        if (!res.ok) continue;
        const html = await res.text();
        const tokMatch = html.match(/"accessToken":"([^"]+)"/);
        if (tokMatch?.[1]) {
          spotifyToken = tokMatch[1];
          const expMatch = html.match(/"accessTokenExpirationTimestampMs":(\d+)/);
          spotifyTokenExpiresAt = expMatch ? Number(expMatch[1]) : Date.now() + 30 * 60 * 1000;
          return spotifyToken;
        }
      } catch {}
    }
    return null;
  })().finally(() => {
    spotifyTokenPromise = null;
  });

  return spotifyTokenPromise;
}

// Global limiter so parallel shelves/pages never flood Spotify (avoids 429s)
const MAX_SPOTIFY_CONCURRENCY = 10;
let spotifyActive = 0;
const spotifyWaiters = [];
function acquireSpotifySlot() {
  if (spotifyActive < MAX_SPOTIFY_CONCURRENCY) {
    spotifyActive++;
    return Promise.resolve();
  }
  return new Promise((resolve) => spotifyWaiters.push(resolve));
}
function releaseSpotifySlot() {
  const next = spotifyWaiters.shift();
  if (next) next();
  else spotifyActive = Math.max(0, spotifyActive - 1);
}

async function spotifyPathfinder(operationName, variables, sha256Hash, retry = true) {
  const token = await getSpotifyAccessToken(!retry);
  if (!token) return null;
  const url =
    'https://api-partner.spotify.com/pathfinder/v1/query?operationName=' +
    encodeURIComponent(operationName) +
    '&variables=' +
    encodeURIComponent(JSON.stringify(variables)) +
    '&extensions=' +
    encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash } }));

  let status = 0;
  let json = null;
  await acquireSpotifySlot();
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': BROWSER_UA,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(4500),
    });
    status = res.status;
    if (res.ok) json = await res.json();
  } catch {
    json = null;
  } finally {
    releaseSpotifySlot();
  }
  if (status === 401 && retry) {
    return spotifyPathfinder(operationName, variables, sha256Hash, false);
  }
  return json;
}

const inflightPlaycounts = new Map();
function fetchSpotifyTrackPlaycount(title, artist) {
  const key = getTrackCacheKey(title, artist);
  if (!key) return Promise.resolve(0);
  if (inflightPlaycounts.has(key)) return inflightPlaycounts.get(key);
  const p = (async () => {
    const direct = await fetchSpotifyTrackPlaycountUncached(title, artist);
    if (direct > 0) return direct;
    // YouTube-style titles: "Artist & Guest - Song (Official Video)" -> search "Song" by "Artist"
    const m = String(title || '').match(/^(.{2,80}?)\s[-–—]\s(.{2,})$/);
    if (m) {
      const leftArtist = m[1].split(/,|&|\bfeat\.?\b|\bft\.?\b|\bx\b/i)[0].trim();
      if (leftArtist) return fetchSpotifyTrackPlaycountUncached(m[2], leftArtist);
    }
    return 0;
  })().finally(() => inflightPlaycounts.delete(key));
  inflightPlaycounts.set(key, p);
  return p;
}

async function fetchSpotifyTrackPlaycountUncached(title, artist) {
  const cleanTitle = normalizeTrackTitle(title);
  if (!cleanTitle) return 0;
  const primaryArtist = String(artist || '')
    .split(/,|&|\bfeat\.?\b|\bft\.?\b/i)[0]
    .trim();
  const normTargetArtist = normalizeName(primaryArtist);

  const searchData = await spotifyPathfinder(
    'searchDesktop',
    {
      searchTerm: `${title} ${primaryArtist}`.trim(),
      offset: 0,
      limit: 6,
      numberOfTopResults: 3,
      includeAudiobooks: false,
      includeArtistHasConcertsField: false,
      includePreReleases: false,
      includeLocalConcertsField: false,
    },
    HASH_SEARCH_DESKTOP
  );

  const trackItems = searchData?.data?.searchV2?.tracksV2?.items || [];
  if (!trackItems.length) return 0;

  let chosenUri = null;
  for (const entry of trackItems) {
    const d = entry?.item?.data;
    if (!d?.uri || !d.uri.startsWith('spotify:track:')) continue;
    const candTitle = normalizeTrackTitle(d.name || '');
    const candArtists = (d.artists?.items || []).map((a) => normalizeName(a?.profile?.name || ''));
    const artistMatches =
      !normTargetArtist ||
      candArtists.some(
        (ca) => ca && (ca === normTargetArtist || ca.includes(normTargetArtist) || normTargetArtist.includes(ca))
      );
    const titleMatches =
      candTitle === cleanTitle || candTitle.startsWith(cleanTitle) || cleanTitle.startsWith(candTitle);
    if (artistMatches && titleMatches) {
      chosenUri = d.uri;
      break;
    }
  }
  if (!chosenUri) {
    // Fallback to first track if artist matches
    for (const entry of trackItems) {
      const d = entry?.item?.data;
      if (!d?.uri?.startsWith('spotify:track:')) continue;
      const candArtists = (d.artists?.items || []).map((a) => normalizeName(a?.profile?.name || ''));
      if (
        !normTargetArtist ||
        candArtists.some((ca) => ca && (ca === normTargetArtist || ca.includes(normTargetArtist) || normTargetArtist.includes(ca)))
      ) {
        chosenUri = d.uri;
        break;
      }
    }
  }
  if (!chosenUri) {
    // Last resort: only accept a result whose title matches exactly (never a different song)
    for (const entry of trackItems) {
      const d = entry?.item?.data;
      if (d?.uri?.startsWith('spotify:track:') && normalizeTrackTitle(d.name || '') === cleanTitle) {
        chosenUri = d.uri;
        break;
      }
    }
  }
  if (!chosenUri) return 0;

  const trackData = await spotifyPathfinder('getTrack', { uri: chosenUri }, HASH_GET_TRACK);
  const playcount = Number(trackData?.data?.trackUnion?.playcount || 0);
  return playcount > 0 ? playcount : 0;
}

async function loadListenersIndex({ forceRefresh = false } = {}) {
  if (!forceRefresh && listenersIndex) return listenersIndex;
  if (!forceRefresh && listenersPromise) return listenersPromise;

  listenersPromise = (async () => {
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

  const diskBundle = artistBundlesDiskCache.get(key);
  if (diskBundle?.spotifyId) return diskBundle.spotifyId;

  const idx = await loadListenersIndex();
  const hit = idx.get(key);
  if (hit?.spotifyId) return hit.spotifyId;

  if (artistIdCache.has(key)) return artistIdCache.get(key);

  let foundId = null;

  // 1. Try Spotify Pathfinder searchDesktop first
  try {
    const searchData = await spotifyPathfinder(
      'searchDesktop',
      {
        searchTerm: artistName,
        offset: 0,
        limit: 5,
        numberOfTopResults: 3,
        includeAudiobooks: false,
        includeArtistHasConcertsField: false,
        includePreReleases: false,
        includeLocalConcertsField: false,
      },
      HASH_SEARCH_DESKTOP
    );
    const artistItems = searchData?.data?.searchV2?.artists?.items || [];
    for (const item of artistItems) {
      const uri = item?.data?.uri || '';
      const name = item?.data?.profile?.name || '';
      if (uri.startsWith('spotify:artist:') && normalizeName(name) === key) {
        foundId = uri.split(':')[2];
        break;
      }
    }
    if (!foundId && artistItems[0]?.data?.uri?.startsWith('spotify:artist:')) {
      foundId = artistItems[0].data.uri.split(':')[2];
    }
  } catch {}

  // 2. Fallback to MusicBrainz
  if (!foundId) {
    try {
      const q = encodeURIComponent(`artist:"${artistName}"`);
      const mb = await fetch(`https://musicbrainz.org/ws/2/artist/?query=${q}&fmt=json&limit=3`, {
        headers: { 'User-Agent': 'SonaMusicApp/1.0 (local)' },
        signal: AbortSignal.timeout(3000),
      }).then((r) => (r.ok ? r.json() : null));

      const candidate = mb?.artists?.[0];
      if (candidate?.id) {
        const detail = await fetch(
          `https://musicbrainz.org/ws/2/artist/${candidate.id}?inc=url-rels&fmt=json`,
          {
            headers: { 'User-Agent': 'SonaMusicApp/1.0 (local)' },
            signal: AbortSignal.timeout(3000),
          }
        ).then((r) => (r.ok ? r.json() : null));

        const spRel = detail?.relations?.find((r) => r.url?.resource?.includes('open.spotify.com/artist/'));
        const m = spRel?.url?.resource?.match(/artist\/([a-zA-Z0-9]+)/);
        if (m) foundId = m[1];
      }
    } catch {}
  }

  if (foundId) artistIdCache.set(key, foundId);
  return foundId;
}

async function fetchSpotifyArtistOverview(spotifyId, artistName = '') {
  if (!spotifyId) return null;
  const data = await spotifyPathfinder(
    'queryArtistOverview',
    { uri: `spotify:artist:${spotifyId}`, locale: '', includePrerelease: true },
    HASH_ARTIST_OVERVIEW
  );
  const union = data?.data?.artistUnion;
  if (!union) return null;

  const listenersNum = Number(union?.stats?.monthlyListeners || 0);
  const monthlyListeners = listenersNum > 0 ? formatCompactListeners(listenersNum) : '';
  const avatarSources = union?.visuals?.avatarImage?.sources || [];
  const avatarUrl = avatarSources[0]?.url || '';

  const songs = new Map();
  const rawList = [];
  const songsObj = {};
  const topTracks = union?.discography?.topTracks?.items || [];
  const normArt = normalizeName(artistName || union?.profile?.name || '');

  for (const item of topTracks) {
    const tr = item?.track;
    const title = tr?.name || '';
    const streams = Number(tr?.playcount || 0);
    if (!title || !streams) continue;
    const norm = normalizeTrackTitle(title);
    if (!norm) continue;
    rawList.push({ title, norm, streams });
    if (!songs.has(norm) || songs.get(norm).streams < streams) {
      songs.set(norm, { title, streams });
      songsObj[norm] = streams;
    }
    if (normArt) {
      trackStreamsCache.set(`${normArt}::${norm}`, { streams, updatedAt: Date.now() });
    }
  }
  if (rawList.length > 0) scheduleSaveTrackStreamsCache();

  return {
    monthlyListeners,
    avatarUrl,
    songs,
    rawList,
    songsObj,
  };
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
      signal: AbortSignal.timeout(3500),
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
  if (monthlyListeners || avatarUrl) artistPageCache.set(spotifyId, result);
  return result;
}

async function fetchDeezerArtistAvatar(artistName) {
  const key = normalizeName(artistName);
  if (!key) return '';
  if (deezerAvatarCache.has(key)) return deezerAvatarCache.get(key) || '';

  let url = '';
  try {
    const res = await fetch(
      `https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}&limit=3`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (res.ok) {
      const data = await res.json();
      const exact =
        (data.data || []).find((a) => normalizeName(a.name) === key) || (data.data || [])[0];
      const pic = exact?.picture_xl || exact?.picture_big || exact?.picture_medium || '';
      if (pic && !pic.includes('default')) url = pic;
    }
  } catch {}

  if (url) deezerAvatarCache.set(key, url);
  return url;
}

async function fetchArtistSongsStreams(spotifyId, artistName = '') {
  if (!spotifyId) return null;
  const cached = artistSongsCache.get(spotifyId);
  if (cached && cached.expires > Date.now()) return cached;

  const songs = new Map();
  const rawList = [];

  // 1. Try Kworb full artist song table if Kworb is reachable
  if (Date.now() >= kworbDownUntil) {
    try {
      const res = await fetch(`https://kworb.net/spotify/artist/${spotifyId}_songs.html`, {
        signal: AbortSignal.timeout(1800),
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
          const norm = normalizeTrackTitle(title);
          if (!norm) continue;
          rawList.push({ title, norm, streams });
          if (!songs.has(norm) || songs.get(norm).streams < streams) {
            songs.set(norm, { title, streams });
          }
        }
        if (rawList.length === 0) kworbDownUntil = Date.now() + 60_000;
      } else {
        kworbDownUntil = Date.now() + 60_000;
      }
    } catch {
      kworbDownUntil = Date.now() + 60_000;
    }
  }

  // 2. Always supplement/fallback with Spotify Pathfinder queryArtistOverview
  const overview = await fetchSpotifyArtistOverview(spotifyId, artistName);
  if (overview?.rawList?.length) {
    for (const item of overview.rawList) {
      rawList.push(item);
      if (!songs.has(item.norm) || songs.get(item.norm).streams < item.streams) {
        songs.set(item.norm, { title: item.title, streams: item.streams });
      }
    }
  }

  const entry = {
    songs,
    rawList,
    monthlyListeners: overview?.monthlyListeners || '',
    avatarUrl: overview?.avatarUrl || '',
    expires: Date.now() + TTL_MS,
  };
  if (rawList.length > 0) {
    artistSongsCache.set(spotifyId, entry);
  }
  return entry;
}

function matchStreamCount(trackTitle, artistSongsEntry) {
  if (!artistSongsEntry || !trackTitle) return null;
  const norm = normalizeTrackTitle(trackTitle);
  if (!norm) return null;

  const exact = artistSongsEntry.songs?.get(norm);
  if (exact) return exact.streams;

  let best = null;
  for (const item of artistSongsEntry.rawList || []) {
    if (!item.norm) continue;
    if (item.norm === norm || item.norm.startsWith(norm) || norm.startsWith(item.norm)) {
      if (!best || item.streams > best.streams) best = item;
    }
  }
  return best ? best.streams : null;
}

async function getArtistSpotifyBundle(artistName, { forceRefresh = false } = {}) {
  const key = normalizeName(artistName);
  if (forceRefresh) {
    artistPageCache.delete(key);
  } else if (key && artistBundlesDiskCache.has(key)) {
    const cached = artistBundlesDiskCache.get(key);
    if (cached && Date.now() - (cached.updatedAt || 0) < TTL_MS && cached.monthlyListeners && cached.avatarUrl) {
      const songsMap = new Map();
      const rawList = [];
      for (const [norm, streams] of Object.entries(cached.songs || {})) {
        songsMap.set(norm, { title: norm, streams: Number(streams) });
        rawList.push({ title: norm, norm, streams: Number(streams) });
      }
      return {
        spotifyId: cached.spotifyId,
        monthlyListeners: cached.monthlyListeners,
        avatarUrl: cached.avatarUrl,
        deezerAvatar: cached.avatarUrl,
        songsEntry: { songs: songsMap, rawList },
      };
    }
  }

  const idx = await loadListenersIndex({ forceRefresh });
  const idxEntry = idx.get(key) || null;
  const spotifyId = idxEntry?.spotifyId || (await findSpotifyArtistId(artistName));

  const [songsEntry, pageInfo, deezerAvatar] = await Promise.all([
    spotifyId ? fetchArtistSongsStreams(spotifyId, artistName) : Promise.resolve(null),
    spotifyId ? fetchSpotifyArtistPage(spotifyId) : Promise.resolve({ monthlyListeners: '', avatarUrl: '' }),
    fetchDeezerArtistAvatar(artistName),
  ]);

  const monthlyListeners =
    songsEntry?.monthlyListeners || pageInfo.monthlyListeners || idxEntry?.listenersText || '';
  const avatarUrl = songsEntry?.avatarUrl || pageInfo.avatarUrl || deezerAvatar || '';

  if (key && (monthlyListeners || avatarUrl || songsEntry?.songs?.size)) {
    const songsObj = {};
    if (songsEntry?.songs) {
      for (const [k, v] of songsEntry.songs.entries()) {
        songsObj[k] = v.streams;
      }
    }
    artistBundlesDiskCache.set(key, {
      spotifyId,
      monthlyListeners,
      avatarUrl,
      songs: songsObj,
      updatedAt: Date.now(),
    });
    scheduleSaveArtistBundlesCache();
  }

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
    const disk = artistBundlesDiskCache.get(key);
    if (disk?.avatarUrl) return disk.avatarUrl;
    const bundle = await getArtistSpotifyBundle(artistName).catch(() => null);
    if (bundle?.avatarUrl) return bundle.avatarUrl;
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

function lookupCachedSpotifyStreams(track, fallbackArtistName = '', forceRefresh = false) {
  if (forceRefresh || !track) return 0;
  if (track.videoId) {
    const byVid = trackStreamsCache.get(`vid:${track.videoId}`);
    if (byVid && Date.now() - (byVid.updatedAt || 0) < TTL_MS && byVid.streams > 0) {
      return byVid.streams;
    }
  }
  const normTitle = normalizeTrackTitle(track.title);
  if (!normTitle) return 0;

  for (const artistName of extractCandidateArtists(track, fallbackArtistName)) {
    const normArt = normalizeName(artistName);
    const key = `${normArt}::${normTitle}`;
    const byKey = trackStreamsCache.get(key);
    if (byKey && Date.now() - (byKey.updatedAt || 0) < TTL_MS && byKey.streams > 0) {
      return byKey.streams;
    }
    const bundle = artistBundlesDiskCache.get(normArt);
    if (bundle?.songs?.[normTitle] > 0) {
      return Number(bundle.songs[normTitle]);
    }
  }
  return 0;
}

function recordCachedSpotifyStreams(track, fallbackArtistName, streams) {
  const num = Number(streams || 0);
  if (!track || num <= 0) return;
  const now = Date.now();
  if (track.videoId) {
    trackStreamsCache.set(`vid:${track.videoId}`, { streams: num, updatedAt: now });
  }
  const normTitle = normalizeTrackTitle(track.title);
  if (normTitle) {
    for (const artistName of extractCandidateArtists(track, fallbackArtistName)) {
      const normArt = normalizeName(artistName);
      if (normArt) {
        trackStreamsCache.set(`${normArt}::${normTitle}`, { streams: num, updatedAt: now });
      }
    }
  }
  scheduleSaveTrackStreamsCache();
}

async function enrichTracksWithSpotifyStreams(
  tracks = [],
  fallbackArtistName = '',
  { forceRefresh = false, timeBudgetMs = 6000 } = {}
) {
  if (!Array.isArray(tracks) || tracks.length === 0) return tracks;

  // 1. Resolve from persistent 30-day Spotify cache first
  const results = tracks.map((t) => {
    if (!t) return t;
    if (!forceRefresh && t.spotifyStreams > 0) {
      recordCachedSpotifyStreams(t, fallbackArtistName, t.spotifyStreams);
      return t;
    }
    const cachedStreams = lookupCachedSpotifyStreams(t, fallbackArtistName, forceRefresh);
    if (cachedStreams > 0) {
      return { ...t, spotifyStreams: cachedStreams };
    }
    return t;
  });

  // 2. For any tracks still missing spotifyStreams, query Spotify Pathfinder API (searchDesktop + getTrack) in parallel
  const missingIndices = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i]?.title && (!results[i].spotifyStreams || forceRefresh)) {
      missingIndices.push(i);
    }
  }

  if (missingIndices.length === 0) return results;

  // Warm Spotify embed token once before parallel fan-out
  await getSpotifyAccessToken();

  let cursor = 0;
  const concurrency = Math.min(8, missingIndices.length);
  const work = Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < missingIndices.length) {
        const idx = missingIndices[cursor++];
        const item = results[idx];
        const candidates = extractCandidateArtists(item, fallbackArtistName);
        const primaryArtist = candidates[0] || fallbackArtistName || item.artist || '';
        try {
          const playcount = await fetchSpotifyTrackPlaycount(item.title, primaryArtist);
          if (playcount > 0) {
            results[idx] = { ...item, spotifyStreams: playcount };
            recordCachedSpotifyStreams(results[idx], fallbackArtistName, playcount);
          }
        } catch {}
      }
    })
  );

  // Pages must stay responsive: return what's resolved within the budget and let the remaining
  // lookups finish in the background so they're cached for the next load. Monthly rescans
  // (forceRefresh) wait for everything.
  if (forceRefresh || !timeBudgetMs) {
    await work;
    return results;
  }
  let timer;
  await Promise.race([
    work,
    new Promise((resolve) => {
      timer = setTimeout(resolve, timeBudgetMs);
    }),
  ]);
  clearTimeout(timer);
  return results.slice();
}

// Kick off index + token load immediately on require
loadListenersIndex().catch(() => {});
getSpotifyAccessToken().catch(() => {});

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
