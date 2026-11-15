const ytm = require('./ytm');
const spotify = require('./spotify');

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function detectSource(rawInput) {
  const input = (rawInput || '').trim();
  if (!input) return { type: 'unknown' };

  // Spotify playlist or album URL / URI
  const spotifyUri = input.match(/^spotify:(playlist|album):([a-zA-Z0-9]+)/i);
  if (spotifyUri) {
    return { type: 'spotify', kind: spotifyUri[1].toLowerCase(), id: spotifyUri[2] };
  }
  const spotifyUrl = input.match(/open\.spotify\.com\/(?:intl-[^/]+\/)?(playlist|album)\/([a-zA-Z0-9]+)/i);
  if (spotifyUrl) {
    return { type: 'spotify', kind: spotifyUrl[1].toLowerCase(), id: spotifyUrl[2] };
  }

  // YouTube Music / YouTube playlist URL or bare playlist ID
  if (/youtube\.com|youtu\.be|music\.youtube\.com/i.test(input)) {
    try {
      const u = new URL(input.startsWith('http') ? input : `https://${input}`);
      const list = u.searchParams.get('list');
      if (list) return { type: 'ytm', id: list };
    } catch {}
  }
  if (/^(VL|PL|OLAK5uy_|RDCLAK)[A-Za-z0-9_-]{8,}$/.test(input)) {
    return { type: 'ytm', id: input };
  }

  // Amazon Music URL (including regional domains and amzn.to shortlinks)
  if (/music\.amazon\.|amazon\.[a-z.]+\/music|amzn\.to\//i.test(input)) {
    return { type: 'amazon', url: input.startsWith('http') ? input : `https://${input}` };
  }

  // Multi-line tracklist text fallback
  if (input.includes('\n')) {
    return { type: 'text', text: input };
  }

  return { type: 'unknown' };
}

async function resolveTracksOnYtm(rawTracks, concurrency = 5) {
  const resolved = new Array(rawTracks.length).fill(null);
  let cursor = 0;

  async function worker() {
    while (cursor < rawTracks.length) {
      const idx = cursor++;
      const item = rawTracks[idx];
      const query = [item.title, item.artist].filter(Boolean).join(' ').trim();
      if (!query) continue;
      try {
        const res = await ytm.search(query, 'songs', { skipSpotifyEnrich: true });
        const best = res?.items?.[0] || null;
        if (best && best.videoId) {
          resolved[idx] = best;
        }
      } catch {}
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, rawTracks.length)) }, () => worker());
  await Promise.all(workers);
  return resolved.filter(Boolean);
}

async function fetchSpotifyPlaylist(kind, id) {
  const embedUrl = `https://open.spotify.com/embed/${kind}/${id}`;
  const res = await fetch(embedUrl, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) {
    throw new Error(`Spotify returned HTTP ${res.status}. Make sure the playlist is public.`);
  }
  const html = await res.text();
  const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!nextMatch) {
    throw new Error('Could not read Spotify playlist data. Make sure the playlist is public.');
  }

  const json = JSON.parse(nextMatch[1]);
  const entity = json?.props?.pageProps?.state?.data?.entity;
  if (!entity) {
    throw new Error('Spotify playlist is empty or private.');
  }

  const title = entity.name || entity.title || 'Imported Spotify Playlist';
  const subtitle = entity.subtitle || '';
  const trackList = Array.isArray(entity.trackList) ? entity.trackList : [];
  if (trackList.length === 0) {
    throw new Error('No tracks found in this Spotify playlist.');
  }

  const rawTracks = trackList.map((t) => ({
    title: t.title || '',
    artist: t.subtitle || '',
  }));

  const tracks = await resolveTracksOnYtm(rawTracks);
  return {
    source: 'spotify',
    title,
    description: subtitle ? `Imported from Spotify • ${subtitle}` : 'Imported from Spotify',
    totalFound: rawTracks.length,
    tracks,
  };
}

function decodeHtmlEntities(str) {
  return (str || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function parseJsonLdAmazon(html) {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of scripts) {
    try {
      const data = JSON.parse(m[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const obj of items) {
        if (!obj) continue;
        const tracksArr = Array.isArray(obj.track) ? obj.track : Array.isArray(obj.tracks) ? obj.tracks : null;
        if (tracksArr && tracksArr.length > 0) {
          const parsed = tracksArr
            .map((t) => ({
              title: decodeHtmlEntities(t.name || t.title || ''),
              artist: decodeHtmlEntities(
                typeof t.byArtist === 'string'
                  ? t.byArtist
                  : Array.isArray(t.byArtist)
                    ? t.byArtist.map((a) => a?.name || '').filter(Boolean).join(', ')
                    : t.byArtist?.name || ''
              ),
            }))
            .filter((t) => t.title);
          if (parsed.length > 0) {
            return {
              title: decodeHtmlEntities(obj.name || ''),
              tracks: parsed,
            };
          }
        }
      }
    } catch {}
  }
  return null;
}

async function fetchAmazonPlaylist(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) {
    throw new Error(`Amazon Music returned HTTP ${res.status}.`);
  }
  const html = await res.text();

  const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const pageTitle = decodeHtmlEntities(
    (ogTitleMatch?.[1] || '').replace(/\s+on Amazon Music.*$/i, '').replace(/\s*\|\s*Amazon Music.*$/i, '')
  );

  let parsed = parseJsonLdAmazon(html);

  // Fallback: look for embedded track JSON objects in SSR scripts
  if (!parsed || parsed.tracks.length === 0) {
    const rawTracks = [];
    const seen = new Set();
    const trackRegex = /"(?:trackName|title)"\s*:\s*"([^"]{1,120})"[^}]{0,350}"(?:artistName|primaryText|artist)"\s*:\s*"([^"]{1,120})"/g;
    for (const m of html.matchAll(trackRegex)) {
      const title = decodeHtmlEntities(m[1]);
      const artist = decodeHtmlEntities(m[2]);
      const key = `${title.toLowerCase()}::${artist.toLowerCase()}`;
      if (title && artist && !seen.has(key)) {
        seen.add(key);
        rawTracks.push({ title, artist });
      }
      if (rawTracks.length >= 200) break;
    }
    if (rawTracks.length > 0) {
      parsed = { title: pageTitle, tracks: rawTracks };
    }
  }

  if (!parsed || parsed.tracks.length === 0) {
    throw new Error(
      'Amazon Music blocked automated reading of this link (or the playlist is private). You can paste the song list ("Artist - Title", one per line) in the box instead!'
    );
  }

  const tracks = await resolveTracksOnYtm(parsed.tracks);
  return {
    source: 'amazon',
    title: parsed.title || pageTitle || 'Imported Amazon Music Playlist',
    description: 'Imported from Amazon Music',
    totalFound: parsed.tracks.length,
    tracks,
  };
}

async function importFromText(text, customName) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter((l) => l.length >= 2)
    .slice(0, 150);

  if (lines.length === 0) {
    throw new Error('Paste a playlist link or at least one "Title - Artist" line.');
  }

  const rawTracks = lines.map((line) => ({ title: line, artist: '' }));
  const tracks = await resolveTracksOnYtm(rawTracks);
  return {
    source: 'text',
    title: customName || 'Imported Playlist',
    description: 'Imported from tracklist',
    totalFound: rawTracks.length,
    tracks,
  };
}

async function importPlaylist({ urlOrText, name }) {
  const detected = detectSource(urlOrText);

  if (detected.type === 'ytm') {
    const pl = await ytm.getPlaylist(detected.id);
    if (!pl?.tracks?.length) {
      throw new Error('No tracks found in this YouTube Music playlist (it may be private).');
    }
    return {
      source: 'ytm',
      title: (name || '').trim() || pl.title || 'Imported YouTube Music Playlist',
      description: 'Imported from YouTube Music',
      totalFound: pl.tracks.length,
      tracks: pl.tracks,
    };
  }

  if (detected.type === 'spotify') {
    const res = await fetchSpotifyPlaylist(detected.kind, detected.id);
    if ((name || '').trim()) res.title = name.trim();
    res.tracks = await spotify.enrichTracksWithSpotifyStreams(res.tracks).catch(() => res.tracks);
    return res;
  }

  if (detected.type === 'amazon') {
    const res = await fetchAmazonPlaylist(detected.url);
    if ((name || '').trim()) res.title = name.trim();
    res.tracks = await spotify.enrichTracksWithSpotifyStreams(res.tracks).catch(() => res.tracks);
    return res;
  }

  if (detected.type === 'text') {
    const res = await importFromText(detected.text, (name || '').trim());
    res.tracks = await spotify.enrichTracksWithSpotifyStreams(res.tracks).catch(() => res.tracks);
    return res;
  }

  throw new Error(
    'Unrecognized playlist link. Paste a Spotify, YouTube Music, or Amazon Music playlist link (or a multi-line tracklist).'
  );
}

async function fetchYtmProfilePlaylists(profileUrl) {
  let targetUrl = profileUrl.trim();
  if (!targetUrl.startsWith('http')) targetUrl = `https://${targetUrl}`;
  const u = new URL(targetUrl);
  // music.youtube.com/channel/UC... -> www.youtube.com/channel/UC.../playlists
  const pathParts = u.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  let basePath = '';
  if (pathParts[0] === 'channel' && pathParts[1]) {
    basePath = `/channel/${pathParts[1]}`;
  } else if (pathParts[0]?.startsWith('@')) {
    basePath = `/${pathParts[0]}`;
  } else if ((pathParts[0] === 'c' || pathParts[0] === 'user') && pathParts[1]) {
    basePath = `/${pathParts[0]}/${pathParts[1]}`;
  } else {
    throw new Error('Could not recognize YouTube / YouTube Music profile URL.');
  }

  const res = await fetch(`https://www.youtube.com${basePath}/playlists`, {
    headers: {
      'User-Agent': BROWSER_UA,
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) {
    throw new Error(`YouTube returned HTTP ${res.status} for that profile.`);
  }
  const html = await res.text();
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const profileName = decodeHtmlEntities(ogTitle || pathParts[1] || pathParts[0] || 'Imported Profile');

  const ids = [];
  const seen = new Set();
  for (const m of html.matchAll(/"playlistId":"([A-Za-z0-9_-]{10,})"/g)) {
    const pid = m[1];
    if (!seen.has(pid)) {
      seen.add(pid);
      ids.push(pid);
      if (ids.length >= 6) break;
    }
  }
  if (ids.length === 0) {
    throw new Error('No public playlists found on this YouTube / YouTube Music profile.');
  }

  const playlists = [];
  for (const pid of ids) {
    try {
      const pl = await ytm.getPlaylist(pid);
      if (pl?.tracks?.length > 0) {
        playlists.push({
          title: pl.title || `${profileName} Playlist`,
          description: `Imported from ${profileName}'s profile`,
          tracks: pl.tracks.slice(0, 35),
        });
      }
    } catch {}
  }

  if (playlists.length === 0) {
    throw new Error('Found playlists on this profile, but none had playable public tracks.');
  }
  return { source: 'ytm-profile', profileName, playlists };
}

async function importMusicTaste({ input }) {
  const raw = (input || '').trim();
  if (!raw) throw new Error('Paste a profile link, playlist links, or favorite songs.');

  if (/open\.spotify\.com\/(?:intl-[^/]+\/)?user\//i.test(raw) && !/\/playlist\//i.test(raw)) {
    throw new Error(
      'Spotify keeps user profiles & liked songs private without login. Paste 1 or more of their public Spotify playlist links (one per line) to import their taste!'
    );
  }
  if (/music\.amazon\.[^/]+\/profiles\//i.test(raw) && !/\/playlists\//i.test(raw)) {
    throw new Error(
      'Amazon Music keeps personal profiles private. Paste 1 or more of their public playlist links (one per line) to import their taste!'
    );
  }

  let profileName = 'Imported Taste';
  let source = 'playlists';
  let playlists = [];

  const isSingleYtmProfile =
    !raw.includes('\n') &&
    /(?:youtube\.com|music\.youtube\.com)\/(?:@[^/?#]+|channel\/[^/?#]+|c\/[^/?#]+|user\/[^/?#]+)/i.test(raw) &&
    !/[?&]list=/i.test(raw);

  if (isSingleYtmProfile) {
    const res = await fetchYtmProfilePlaylists(raw);
    profileName = res.profileName;
    source = res.source;
    playlists = res.playlists;
  } else {
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const urlLines = lines.filter((l) => detectSource(l).type !== 'unknown' && detectSource(l).type !== 'text');

    if (urlLines.length > 0) {
      for (const u of urlLines.slice(0, 6)) {
        try {
          const pl = await importPlaylist({ urlOrText: u });
          if (pl?.tracks?.length > 0) {
            playlists.push({
              title: pl.title,
              description: pl.description || 'Imported Music Taste',
              tracks: pl.tracks.slice(0, 40),
            });
          }
        } catch {}
      }
      if (playlists.length === 0) {
        throw new Error('Could not load any public tracks from those playlist links.');
      }
    } else {
      const txt = await importFromText(raw, 'Imported Taste Mix');
      playlists = [{ title: txt.title, description: txt.description, tracks: txt.tracks }];
      source = 'text';
    }
  }

  // Deduplicate tracks and rank most frequent artists
  const seenTracks = new Set();
  const allTracks = [];
  const artistFreq = new Map();

  for (const pl of playlists) {
    for (const t of pl.tracks || []) {
      if (!t?.videoId) continue;
      if (!seenTracks.has(t.videoId)) {
        seenTracks.add(t.videoId);
        allTracks.push(t);
      }
      if (t.artistId && t.artist) {
        const prev = artistFreq.get(t.artistId) || {
          id: t.artistId,
          name: t.artist,
          thumbnail: t.thumbnail || '',
          count: 0,
        };
        prev.count += 1;
        artistFreq.set(t.artistId, prev);
      }
    }
  }

  const enriched = await spotify.enrichTracksWithSpotifyStreams(allTracks.slice(0, 50)).catch(() => allTracks);
  const topArtists = [...artistFreq.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map(({ id, name, thumbnail }) => ({ id, name, thumbnail }));

  return {
    profileName,
    source,
    playlists,
    topTracks: enriched.slice(0, 25),
    topArtists,
    totalTracks: allTracks.length,
  };
}

module.exports = {
  importPlaylist,
  importMusicTaste,
  detectSource,
};
