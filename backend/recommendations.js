const ytm = require('./ytm');
const spotify = require('./spotify');

const CACHE_TTL_MS = 15 * 60 * 1000;
const ARTIST_GENRE_TTL_MS = 24 * 60 * 60 * 1000;

const artistGenreCache = new Map(); // normArtist -> { genres: string[], deezerArtistId: number|null, expires: number }
const trackAlbumGenreCache = new Map(); // normArtist::normTitle -> { genres: string[], deezerArtistId: number|null, expires: number }
const upNextCache = new Map(); // videoId -> { tracks, expires }
const playlistTracksCache = new Map(); // query -> { tracks, expires }
const inFlightArtistLookup = new Map(); // normArtist -> Promise

let homeMixCache = { key: '', result: null, expires: 0 };

const JUNK_TAGS = new Set([
  'seen live',
  'mix',
  'pop and chart',
  'spotify',
  'favorites',
  'favourite',
  'american',
  'british',
  'canadian',
  'australian',
  'english',
  'uk',
  'us',
  'usa',
  'german',
  'french',
  'japanese',
  'korean',
  'male vocalists',
  'female vocalists',
  'band',
  'music',
  'artist',
  '00s',
  '90s',
  '80s',
  '70s',
  '60s',
  '2000s',
  '2010s',
  '2020s',
  '20s',
  '10s',
  'songwriter',
  'singer-songwriter',
  'under 2000 listeners',
  'english lyrics',
  'official',
]);

const BROAD_GENRES = new Set(['Pop', 'Rock', 'Alternative', 'Electronic', 'Dance', 'Music']);

const JUNK_PLAYLIST_RE = /(karaoke|tribute|lullaby|8-bit|ringtone|instrumental cover|covers only|nightcore|sped up|slowed|workout remix|vlog|podcast)/i;
const JUNK_TRACK_RE = /(karaoke|instrumental version|made famous by|8-bit|ringtone|tribute to|nightcore|sped up|slowed \+ reverb|\blive at\b|\blive from\b|\(live\)|\b86 mix\b|\bdemo\b|\bacoustic version\b|\binstrumental\b|\bvlog\b|\breview\b|\bepisode\b|\bpart\s*\d+\b|\bpt\.\s*\d+\b|\bwith lyrics\b|\blyric video\b|\(lyrics\))/i;
const ELECTRONIC_GENRE_RE = /(edm|electronic|house|techno|trance|dubstep|drum and bass|dance|synth|electro)/i;

function normalizeText(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSongTitle(str) {
  return normalizeText(
    (str || '')
      .replace(/\((feat\.|ft\.|with|remaster|remastered|official|audio|video|single|album|version|edit|radio|explicit|clean|deluxe|bonus|from|live)[^)]*\)/gi, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/\s*-\s*(remaster|remastered|single version|album version|radio edit|mono|stereo|\d{4}\s*remaster).*$/i, '')
  );
}

function formatGenreLabel(raw) {
  const clean = (raw || '').trim().toLowerCase();
  if (!clean || JUNK_TAGS.has(clean)) return '';
  if (/^\d{2,4}s$/.test(clean)) return '';

  const special = {
    'r&b': 'R&B',
    rnb: 'R&B',
    'hip hop': 'Hip-Hop',
    'hip-hop': 'Hip-Hop',
    'rap/hip hop': 'Hip-Hop',
    edm: 'EDM',
    'k-pop': 'K-Pop',
    'j-pop': 'J-Pop',
    'j-rock': 'J-Rock',
    'lo-fi': 'Lo-Fi',
    lofi: 'Lo-Fi',
    'alt rock': 'Alternative Rock',
    'pop-punk': 'Pop Punk',
    synthpop: 'Synth-Pop',
    'synth-pop': 'Synth-Pop',
    'post-punk': 'Post-Punk',
    'nu-metal': 'Nu Metal',
    electro: 'Electronic',
  };
  if (special[clean]) return special[clean];

  return clean
    .split(/\s+/)
    .map((word) =>
      word.includes('-')
        ? word
            .split('-')
            .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
            .join('-')
        : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(' ');
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function lookupArtistMBGenres(primaryArtist, artistKey, delayMs = 0) {
  const cached = artistGenreCache.get(artistKey);
  if (cached && cached.expires > Date.now()) return cached.genres;

  if (inFlightArtistLookup.has(artistKey)) {
    return inFlightArtistLookup.get(artistKey);
  }

  const p = (async () => {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    const mb = await fetchJsonWithTimeout(
      `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(`artist:"${primaryArtist}"`)}&fmt=json&limit=3`,
      { headers: { 'User-Agent': 'SonaMusicApp/1.0 (local)' } },
      4000
    );
    const candidate =
      (mb?.artists || []).find((a) => normalizeText(a.name) === artistKey) || mb?.artists?.[0];
    const tags = (candidate?.tags || [])
      .filter((t) => t?.name && (t.count == null || t.count >= 1))
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .map((t) => formatGenreLabel(t.name))
      .filter(Boolean);
    const unique = [...new Set(tags)].slice(0, 5);
    artistGenreCache.set(artistKey, {
      genres: unique,
      deezerArtistId: cached?.deezerArtistId || null,
      expires: Date.now() + ARTIST_GENRE_TTL_MS,
    });
    return unique;
  })().finally(() => {
    inFlightArtistLookup.delete(artistKey);
  });

  inFlightArtistLookup.set(artistKey, p);
  return p;
}

async function lookupTrackGenres(track, artistDelayMs = 0) {
  const primaryArtist = (track.artists?.[0]?.name || track.artist?.split(',')[0] || '').trim();
  const artistKey = normalizeText(primaryArtist);
  const titleKey = normalizeSongTitle(track.title || '');
  const pairKey = `${artistKey}::${titleKey}`;

  if (!artistKey) return { genres: [], deezerArtistId: null };

  const cachedPair = trackAlbumGenreCache.get(pairKey);
  if (cachedPair && cachedPair.expires > Date.now()) {
    return { genres: cachedPair.genres, deezerArtistId: cachedPair.deezerArtistId };
  }

  const [mbGenres, dzInfo, itGenre] = await Promise.all([
    lookupArtistMBGenres(primaryArtist, artistKey, artistDelayMs),
    (async () => {
      const dzSearch = await fetchJsonWithTimeout(
        `https://api.deezer.com/search/track?q=${encodeURIComponent(`${primaryArtist} ${track.title || ''}`)}&limit=3`,
        {},
        3000
      );
      const hit =
        (dzSearch?.data || []).find((d) => normalizeText(d.artist?.name) === artistKey) ||
        dzSearch?.data?.[0];
      let deezerArtistId = hit?.artist?.id || null;
      let genres = [];
      if (hit?.album?.id) {
        const alb = await fetchJsonWithTimeout(`https://api.deezer.com/album/${hit.album.id}`, {}, 3000);
        genres = (alb?.genres?.data || []).map((g) => formatGenreLabel(g.name)).filter(Boolean);
      }
      if (!deezerArtistId) {
        const dzArt = await fetchJsonWithTimeout(
          `https://api.deezer.com/search/artist?q=${encodeURIComponent(primaryArtist)}&limit=1`,
          {},
          3000
        );
        deezerArtistId = dzArt?.data?.[0]?.id || null;
      }
      return { genres, deezerArtistId };
    })(),
    (async () => {
      const it = await fetchJsonWithTimeout(
        `https://itunes.apple.com/search?term=${encodeURIComponent(`${primaryArtist} ${track.title || ''}`)}&entity=song&limit=2`,
        {},
        3000
      );
      const hit =
        (it?.results || []).find((r) => normalizeText(r.artistName) === artistKey) || it?.results?.[0];
      const g = formatGenreLabel(hit?.primaryGenreName || '');
      return g && g !== 'Music' ? [g] : [];
    })(),
  ]);

  const combined = [];
  const seen = new Set();
  for (const g of [...mbGenres, ...(dzInfo?.genres || []), ...itGenre]) {
    const k = g.toLowerCase();
    if (g && !seen.has(k)) {
      seen.add(k);
      combined.push(g);
    }
  }

  const deezerArtistId = dzInfo?.deezerArtistId || null;

  trackAlbumGenreCache.set(pairKey, {
    genres: combined,
    deezerArtistId,
    expires: Date.now() + ARTIST_GENRE_TTL_MS,
  });

  return { genres: combined, deezerArtistId };
}

function rankGenres(trackGenreResults) {
  const scores = new Map();
  const displayNames = new Map();

  trackGenreResults.forEach((res, idx) => {
    const recencyWeight = Math.max(0.85, 1.3 - idx * 0.1);
    (res.genres || []).forEach((g, gIdx) => {
      const key = g.toLowerCase();
      displayNames.set(key, g);
      const specificityBoost = BROAD_GENRES.has(g) ? 0.65 : 1.4;
      const rankDecay = Math.max(0.45, 1 - gIdx * 0.15);
      scores.set(key, (scores.get(key) || 0) + recencyWeight * specificityBoost * rankDecay);
    });
  });

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => displayNames.get(k))
    .slice(0, 4);
}

function parsePlaylistViews(sub = '') {
  const m = String(sub).match(/([\d.]+)\s*([KM])?\s*views/i);
  if (!m) return 0;
  const num = parseFloat(m[1]) || 0;
  const unit = (m[2] || '').toUpperCase();
  if (unit === 'M') return num * 1_000_000;
  if (unit === 'K') return num * 1_000;
  return num;
}

function isCleanSongCandidate(track, blockedVideoIds, blockedSongKeys, allowRemixes = false) {
  if (!track || !track.videoId) return false;
  if (blockedVideoIds.has(track.videoId)) return false;
  const title = track.title || '';
  const artist = track.artist || '';
  if (!artist || /\d+:\d{2}$/.test(artist) || /lyrics/i.test(artist) || /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}/.test(artist)) {
    return false;
  }
  if (JUNK_TRACK_RE.test(title)) return false;
  if (!allowRemixes && /\b(remix|club mix|radio mix|86 mix|extended mix)\b/i.test(title)) return false;
  if (track.durationSec && (track.durationSec < 75 || track.durationSec > 540)) return false;
  const primaryArtist = normalizeText(track.artists?.[0]?.name || artist.split(',')[0] || '');
  const normTitle = normalizeSongTitle(title);
  if (!normTitle || !primaryArtist) return false;
  if (blockedSongKeys.has(`${primaryArtist}::${normTitle}`)) return false;
  if (blockedSongKeys.has(`::${normTitle}`)) return false;
  return true;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function fetchGenrePlaylistTracks(query, limit = 16) {
  const cached = playlistTracksCache.get(query);
  if (cached && cached.expires > Date.now()) return cached.tracks.slice(0, limit);
  try {
    const plSearch = await ytm.search(query, 'playlists');
    const candidates = (plSearch?.items || [])
      .filter((p) => p?.id && !JUNK_PLAYLIST_RE.test(p.title || ''))
      .map((p) => ({
        ...p,
        _score:
          parsePlaylistViews(p.subtitle) +
          (/youtube music/i.test(p.subtitle || p.author || '') ? 5_000_000 : 0),
      }))
      .sort((a, b) => b._score - a._score);

    const bestPl = candidates[0];
    if (!bestPl?.id) return [];
    const pl = await ytm.getPlaylist(bestPl.id, { skipSpotifyEnrich: true });
    // Require official studio song items with an artistId or album to avoid user vlog playlists
    const songs = (pl?.tracks || []).filter(
      (t) => t.kind === 'song' && (t.artistId || t.album)
    );
    playlistTracksCache.set(query, { tracks: songs, expires: Date.now() + CACHE_TTL_MS });
    return songs.slice(0, limit);
  } catch {
    return [];
  }
}

async function fetchUpNextCached(videoId) {
  if (!videoId) return [];
  const cached = upNextCache.get(videoId);
  if (cached && cached.expires > Date.now()) return cached.tracks;
  try {
    const res = await ytm.getUpNext(videoId);
    const tracks = res?.tracks || [];
    upNextCache.set(videoId, { tracks, expires: Date.now() + CACHE_TTL_MS });
    return tracks;
  } catch {
    return [];
  }
}

async function resolveDeezerTracksToYtm(dzTracks, maxCount = 6) {
  const picked = dzTracks.slice(0, maxCount);
  const results = await Promise.all(
    picked.map(async (dt) => {
      const artist = dt.artist?.name || '';
      const title = dt.title_short || dt.title || '';
      if (!artist || !title) return null;
      try {
        const res = await ytm.search(`${title} ${artist}`, 'songs');
        const targetArtist = normalizeText(artist);
        const match =
          (res?.items || []).find(
            (item) =>
              item.kind === 'song' &&
              normalizeText(item.artists?.[0]?.name || item.artist || '').includes(
                targetArtist.split(' ')[0] || ''
              )
          ) || (res?.items || []).find((item) => item.kind === 'song');
        if (!match) return null;
        return {
          ...match,
          _pool: dt._pool || 'niche',
          discoveryGenre: dt.discoveryGenre,
        };
      } catch {
        return null;
      }
    })
  );
  return results.filter(Boolean);
}

async function enrichTracksFast(tracks) {
  if (!tracks.length) return tracks;
  const idx = await spotify.loadListenersIndex().catch(() => new Map());
  const chunks = [];
  for (let i = 0; i < tracks.length; i += 6) {
    chunks.push(tracks.slice(i, i + 6));
  }
  const enrichedChunks = await Promise.all(
    chunks.map((chunk) => {
      const hasKnownArtists = chunk.filter((t) => {
        const name = normalizeText(t.artists?.[0]?.name || t.artist?.split(',')[0] || '');
        return idx.has(name);
      });
      if (!hasKnownArtists.length) return Promise.resolve(chunk);
      return spotify.enrichTracksWithSpotifyStreams(chunk).catch(() => chunk);
    })
  );
  return enrichedChunks.flat();
}

async function getBasedOnLastListened(history = [], { refresh = false } = {}) {
  const recentFive = (Array.isArray(history) ? history : []).slice(0, 5);
  const historyKey = recentFive.map((t) => t.videoId).join(',') || 'empty';

  if (
    !refresh &&
    homeMixCache.result &&
    homeMixCache.key === historyKey &&
    homeMixCache.expires > Date.now()
  ) {
    return homeMixCache.result;
  }

  const blockedVideoIds = new Set((history || []).slice(0, 15).map((t) => t.videoId).filter(Boolean));
  const blockedSongKeys = new Set();
  for (const t of (history || []).slice(0, 5)) {
    const nt = normalizeSongTitle(t.title);
    const na = normalizeText(t.artists?.[0]?.name || t.artist?.split(',')[0] || '');
    if (nt) blockedSongKeys.add(`::${nt}`);
    if (na && nt) blockedSongKeys.add(`${na}::${nt}`);
  }

  let genres = ['Pop', 'Alternative Rock', 'Indie Pop', 'Hip-Hop'];
  let deezerArtistIds = [];
  const artistToGenres = new Map();
  let seed0Genre = null;
  let seed1Genre = null;

  if (recentFive.length > 0) {
    const uniqueArtistsOrder = [];
    for (const t of recentFive) {
      const k = normalizeText(t.artists?.[0]?.name || t.artist?.split(',')[0] || '');
      if (k && !uniqueArtistsOrder.includes(k)) uniqueArtistsOrder.push(k);
    }

    const trackGenreResults = await Promise.all(
      recentFive.map((t) => {
        const k = normalizeText(t.artists?.[0]?.name || t.artist?.split(',')[0] || '');
        const artistIdx = Math.max(0, uniqueArtistsOrder.indexOf(k));
        return lookupTrackGenres(t, artistIdx * 350);
      })
    );
    const detected = rankGenres(trackGenreResults);
    if (detected.length > 0) genres = detected;

    seed0Genre =
      (trackGenreResults[0]?.genres || []).find((g) => !BROAD_GENRES.has(g)) ||
      trackGenreResults[0]?.genres?.[0] ||
      genres[0];
    seed1Genre =
      (trackGenreResults[1]?.genres || []).find((g) => !BROAD_GENRES.has(g)) ||
      trackGenreResults[1]?.genres?.[0] ||
      genres[1] ||
      genres[0];

    recentFive.forEach((t, idx) => {
      const id = trackGenreResults[idx]?.deezerArtistId;
      if (id && !deezerArtistIds.includes(id)) {
        deezerArtistIds.push(id);
        artistToGenres.set(id, trackGenreResults[idx]?.genres || []);
      }
    });
    deezerArtistIds = deezerArtistIds.slice(0, 3);
  }

  const topGenres = genres.slice(0, 4);
  const g1 = topGenres[0] || 'Rock';
  const g2 = topGenres[1] || g1;
  const g3 = topGenres[2] || g2;
  const g2Or3 = g2 !== g1 ? g2 : g3;
  const upNext0Genre = seed0Genre || g1;
  const upNext1Genre = seed1Genre || g2Or3;
  const allowRemixes = topGenres.some((g) => ELECTRONIC_GENRE_RE.test(g));

  const [
    popPl1,
    popPl2,
    nichePl1,
    nichePl2,
    upNext1,
    upNext2,
    dzPool,
  ] = await Promise.all([
    fetchGenrePlaylistTracks(`${g1} essentials hits`, 16),
    g2Or3 !== g1 ? fetchGenrePlaylistTracks(`${g2Or3} hits classics`, 16) : Promise.resolve([]),
    fetchGenrePlaylistTracks(`${g1} deep cuts hidden gems`, 16),
    fetchGenrePlaylistTracks(`underrated ${g2Or3} songs`, 16),
    fetchUpNextCached(recentFive[0]?.videoId),
    recentFive.length > 1 &&
    recentFive[1]?.videoId &&
    normalizeText(recentFive[1].artist) !== normalizeText(recentFive[0].artist)
      ? fetchUpNextCached(recentFive[1].videoId)
      : Promise.resolve([]),
    (async () => {
      if (!deezerArtistIds.length) return { pop: [], niche: [] };
      const relatedResponses = await Promise.all(
        deezerArtistIds.map((id) =>
          fetchJsonWithTimeout(`https://api.deezer.com/artist/${id}/related?limit=16`, {}, 3000)
            .then((resp) => ({ seedId: id, list: resp?.data || [] }))
        )
      );
      const relatedArtists = [];
      const seenRel = new Set();
      for (const { seedId, list } of relatedResponses) {
        const seedGenres = artistToGenres.get(seedId) || [];
        const label = seedGenres.find((g) => topGenres.includes(g)) || g1;
        for (const a of list) {
          if (a?.id && !seenRel.has(a.id) && (a.nb_fan || 0) >= 1500) {
            seenRel.add(a.id);
            relatedArtists.push({ ...a, _seedGenre: label });
          }
        }
      }
      relatedArtists.sort((a, b) => (a.nb_fan || 0) - (b.nb_fan || 0));
      let nicheArtists = relatedArtists.filter((a) => (a.nb_fan || 0) < 300_000).slice(0, 6);
      if (nicheArtists.length < 4 && relatedArtists.length > 0) {
        nicheArtists = relatedArtists.slice(0, 6);
      }
      const popArtists = relatedArtists.filter((a) => (a.nb_fan || 0) >= 250_000).slice(-2);

      const [nicheFetches, popFetches] = await Promise.all([
        Promise.all(
          nicheArtists.map(async (art) => {
            const top = await fetchJsonWithTimeout(
              `https://api.deezer.com/artist/${art.id}/top?limit=10`,
              {},
              3000
            );
            const list = top?.data || [];
            const deepCuts = list.length > 3 ? list.slice(2, 6) : list.slice(0, 2);
            return deepCuts.map((dt) => ({
              ...dt,
              _pool: 'niche',
              discoveryGenre: art._seedGenre || g1,
            }));
          })
        ),
        Promise.all(
          popArtists.map(async (art) => {
            const top = await fetchJsonWithTimeout(
              `https://api.deezer.com/artist/${art.id}/top?limit=5`,
              {},
              3000
            );
            return (top?.data || []).slice(0, 2).map((dt) => ({
              ...dt,
              _pool: 'popular',
              discoveryGenre: art._seedGenre || g1,
            }));
          })
        ),
      ]);

      const nicheFlat = nicheFetches.flat();
      const popFlat = popFetches.flat();
      if (refresh) {
        shuffleInPlace(nicheFlat);
        shuffleInPlace(popFlat);
      }
      const [nicheResolved, popResolved] = await Promise.all([
        resolveDeezerTracksToYtm(nicheFlat, 9),
        resolveDeezerTracksToYtm(popFlat, 4),
      ]);
      return { pop: popResolved, niche: nicheResolved };
    })(),
  ]);

  const popularRaw = [
    ...dzPool.pop,
    ...popPl1.map((t) => ({ ...t, _pool: 'popular', discoveryGenre: g1 })),
    ...popPl2.map((t) => ({ ...t, _pool: 'popular', discoveryGenre: g2Or3 })),
    ...upNext2.slice(0, 8).map((t) => ({ ...t, _pool: 'popular', discoveryGenre: upNext1Genre })),
    ...upNext1.slice(0, 10).map((t) => ({ ...t, _pool: 'popular', discoveryGenre: upNext0Genre })),
  ];

  const nicheRaw = [
    ...dzPool.niche,
    ...nichePl2.map((t) => ({ ...t, _pool: 'niche', discoveryGenre: g2Or3 })),
    ...nichePl1.map((t) => ({ ...t, _pool: 'niche', discoveryGenre: g1 })),
    ...upNext1.slice(18, 32).map((t) => ({ ...t, _pool: 'niche', discoveryGenre: upNext0Genre })),
  ];

  if (refresh) {
    shuffleInPlace(popularRaw);
    shuffleInPlace(nicheRaw);
  }

  const dedupePool = (list, maxKeep = 10) => {
    const seenIds = new Set();
    const seenKeys = new Set();
    const artistCounts = new Map();
    const out = [];
    for (const t of list) {
      if (!isCleanSongCandidate(t, blockedVideoIds, blockedSongKeys, allowRemixes)) continue;
      if (seenIds.has(t.videoId)) continue;
      const art = normalizeText(t.artists?.[0]?.name || t.artist?.split(',')[0] || '');
      const title = normalizeSongTitle(t.title);
      const key = `${art}::${title}`;
      if (seenKeys.has(key)) continue;
      if ((artistCounts.get(art) || 0) >= 1 && out.length < 8) continue;
      if ((artistCounts.get(art) || 0) >= 2) continue;
      seenIds.add(t.videoId);
      seenKeys.add(key);
      artistCounts.set(art, (artistCounts.get(art) || 0) + 1);
      out.push(t);
      if (out.length >= maxKeep) break;
    }
    return out;
  };

  // Interleave g1 and g2Or3 inside popularRaw so multiple genres surface cleanly
  const popByGenre = [
    popularRaw.filter((t) => t.discoveryGenre === g1),
    popularRaw.filter((t) => t.discoveryGenre !== g1),
  ];
  const balancedPopularRaw = [];
  for (let i = 0; i < Math.max(popByGenre[0].length, popByGenre[1].length); i++) {
    if (popByGenre[0][i]) balancedPopularRaw.push(popByGenre[0][i]);
    if (popByGenre[1][i]) balancedPopularRaw.push(popByGenre[1][i]);
  }

  const popCandidates = dedupePool(balancedPopularRaw, 9);
  const popKeys = new Set(
    popCandidates.map((t) => `${normalizeText(t.artist)}::${normalizeSongTitle(t.title)}`)
  );
  const nicheFiltered = nicheRaw.filter(
    (t) => !popKeys.has(`${normalizeText(t.artist)}::${normalizeSongTitle(t.title)}`)
  );
  const nicheCandidates = dedupePool(nicheFiltered, 9);

  const enrichedAll = await enrichTracksFast([...popCandidates, ...nicheCandidates]);

  const popularFinal = [];
  const nicheFinal = [];

  for (const track of enrichedAll) {
    const streams = Number(track.spotifyStreams || 0);
    let tag = track._pool === 'niche' ? 'Niche' : 'Popular';
    if (streams >= 60_000_000) tag = 'Popular';
    else if (streams > 0 && streams < 22_000_000) tag = 'Niche';
    else if (!streams && track._pool !== 'popular') tag = 'Niche';

    const cleanTrack = {
      ...track,
      discoveryTag: tag,
      discoveryGenre: track.discoveryGenre || g1,
    };
    delete cleanTrack._pool;

    if (tag === 'Popular') popularFinal.push(cleanTrack);
    else nicheFinal.push(cleanTrack);
  }

  if (!refresh) {
    popularFinal.sort((a, b) => (b.spotifyStreams || 0) - (a.spotifyStreams || 0));
    nicheFinal.sort((a, b) => (a.spotifyStreams || 0) - (b.spotifyStreams || 0));
  }

  const combined = [];
  const usedIds = new Set();
  const finalArtistCounts = new Map();

  const takeNext = (arr, targetTag, preferGenre = null) => {
    const tryPick = (requireGenre) => {
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        if (usedIds.has(item.videoId)) continue;
        if (requireGenre && item.discoveryGenre !== requireGenre) continue;
        const art = normalizeText(item.artists?.[0]?.name || item.artist?.split(',')[0] || '');
        if ((finalArtistCounts.get(art) || 0) >= 2) continue;
        usedIds.add(item.videoId);
        finalArtistCounts.set(art, (finalArtistCounts.get(art) || 0) + 1);
        combined.push(targetTag ? { ...item, discoveryTag: targetTag } : item);
        arr.splice(i, 1);
        return true;
      }
      return false;
    };
    return (preferGenre && tryPick(preferGenre)) || tryPick(null);
  };

  while (combined.length < 12 && (popularFinal.length > 0 || nicheFinal.length > 0)) {
    const wantNiche = combined.length % 2 === 1;
    const targetGenre = Math.floor(combined.length / 2) % 2 === 1 && g2Or3 !== g1 ? g2Or3 : g1;
    const picked = wantNiche
      ? takeNext(nicheFinal, 'Niche', targetGenre) || takeNext(popularFinal, 'Popular')
      : takeNext(popularFinal, 'Popular', targetGenre) || takeNext(nicheFinal, 'Niche');
    if (!picked) break;
  }

  const shelf = {
    title: 'Based on what you last listened to',
    kind: 'basedOnHistory',
    genres: topGenres,
    seedCount: recentFive.length,
    seedTitles: recentFive.slice(0, 3).map((t) => t.title).filter(Boolean),
    items: combined,
  };

  homeMixCache = {
    key: historyKey,
    result: shelf,
    expires: Date.now() + CACHE_TTL_MS,
  };

  return shelf;
}

async function getMoreSongsYouMightLike(libraryState, { excludeIds = new Set(), refresh = false } = {}) {
  const liked = Array.isArray(libraryState?.likedSongs) ? libraryState.likedSongs : [];
  const history = Array.isArray(libraryState?.history) ? libraryState.history : [];
  const playlists = Array.isArray(libraryState?.playlists) ? libraryState.playlists : [];
  const followed = Array.isArray(libraryState?.followedArtists) ? libraryState.followedArtists : [];

  const pool = [];
  const seenSeed = new Set();
  for (const t of [...liked.slice(0, 12), ...history.slice(3, 18), ...playlists.flatMap((p) => (p.tracks || []).slice(0, 6))]) {
    if (t?.videoId && !seenSeed.has(t.videoId)) {
      seenSeed.add(t.videoId);
      pool.push(t);
    }
  }

  // Pick up to 3 diverse seed tracks (offset when refreshing)
  const offset = refresh ? Math.floor(Math.random() * Math.max(1, pool.length)) : 0;
  const rotated = pool.length ? [...pool.slice(offset), ...pool.slice(0, offset)] : [];
  const seeds = rotated.slice(0, 3);

  const candidates = [];
  const used = new Set(excludeIds);
  for (const s of seeds) used.add(s.videoId);

  const [upNextResults, artistResults] = await Promise.all([
    Promise.all(
      seeds.map((s) => ytm.getUpNext(s.videoId).catch(() => ({ tracks: [] })))
    ),
    Promise.all(
      followed.slice(0, 2).map((a) =>
        ytm.search(`${a.name} top songs`, 'songs', { skipSpotifyEnrich: true }).catch(() => ({ items: [] }))
      )
    ),
  ]);

  const rawList = [
    ...upNextResults.flatMap((r) => r?.tracks || []),
    ...artistResults.flatMap((r) => r?.items || []),
  ];

  // Fallback curated queries if user has an empty library
  if (rawList.length === 0) {
    const fallback = await ytm.search('indie alternative rock classics', 'songs', { skipSpotifyEnrich: true }).catch(() => ({ items: [] }));
    rawList.push(...(fallback?.items || []));
  }

  const artistCounts = new Map();
  for (const t of rawList) {
    if (!t?.videoId || used.has(t.videoId)) continue;
    if (JUNK_TRACK_RE.test(t.title || '')) continue;
    const art = normalizeText(t.artists?.[0]?.name || t.artist?.split(',')[0] || '');
    if ((artistCounts.get(art) || 0) >= 2) continue;
    used.add(t.videoId);
    artistCounts.set(art, (artistCounts.get(art) || 0) + 1);
    candidates.push({ ...t, kind: 'song' });
    if (candidates.length >= 20) break;
  }

  const enriched = await spotify.enrichTracksWithSpotifyStreams(candidates).catch(() => candidates);
  const shelves = [];
  if (enriched.length > 0) {
    shelves.push({
      title: 'More Songs You Might Like',
      items: enriched.slice(0, 10),
    });
  }
  if (enriched.length > 10) {
    shelves.push({
      title: 'Deep Cuts & Similar Vibes',
      items: enriched.slice(10, 20),
    });
  }
  return shelves;
}

module.exports = {
  getBasedOnLastListened,
  getMoreSongsYouMightLike,
};
