const ytm = require('./ytm');

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
    const pl = await ytm.getPlaylist(detected.id, { skipSpotifyEnrich: true });
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
    return res;
  }

  if (detected.type === 'amazon') {
    const res = await fetchAmazonPlaylist(detected.url);
    if ((name || '').trim()) res.title = name.trim();
    return res;
  }

  if (detected.type === 'text') {
    return importFromText(detected.text, (name || '').trim());
  }

  throw new Error(
    'Unrecognized playlist link. Paste a Spotify, YouTube Music, or Amazon Music playlist link (or a multi-line tracklist).'
  );
}

module.exports = {
  importPlaylist,
  detectSource,
};
