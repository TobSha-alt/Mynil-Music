const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const ytm = require('./ytm');
const resolver = require('./resolver');
const store = require('./store');
const spotify = require('./spotify');
const lyricsService = require('./lyrics');
const covers = require('./covers');
const recommendations = require('./recommendations');
const sync = require('./sync');
const scanner = require('./scanner');
const offline = require('./offline');
const offsetDetector = require('./offset');
const updater = require('./updater');
const importer = require('./importer');

const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 32 });
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 32 });

const DIST_DIR = path.join(__dirname, '..', 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 2 * 1024 * 1024) {
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function serveLocalFileWithRange(req, res, filePath, contentType) {
  const stat = fs.statSync(filePath);
  const total = stat.size;
  const range = req.headers.range;

  if (range) {
    const m = range.match(/bytes=(\d+)-(\d*)/);
    if (!m) {
      res.writeHead(416, { 'Content-Range': `bytes */${total}` });
      res.end();
      return;
    }
    const start = Number(m[1]);
    const end = m[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
    if (start >= total || start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${total}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': end - start + 1,
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Content-Length': total,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

async function handleStreamProxy(req, res, videoId, mode) {
  // For audio mode, always serve faststart-remuxed local .m4a so macOS AVFoundation/WKWebView
  // reads 100% exact track durations (never 2x DASH SBR duration) and seeks in 0ms.
  if (mode === 'audio') {
    const offlineFile = offline.getOfflineFile(videoId);
    if (offlineFile) {
      return serveLocalFileWithRange(req, res, offlineFile, 'audio/mp4');
    }
    const cachedAudio = resolver.getCachedAudioFile(videoId);
    if (cachedAudio) {
      return serveLocalFileWithRange(req, res, cachedAudio, 'audio/mp4');
    }
    if (process.platform === 'darwin') {
      try {
        const localFile = await resolver.getFastAudioFile(videoId);
        if (localFile && fs.existsSync(localFile)) {
          return serveLocalFileWithRange(req, res, localFile, 'audio/mp4');
        }
      } catch {}
    } else {
      // Stream immediately on Windows/Linux while warming faststart cache in background
      resolver.getFastAudioFile(videoId).catch(() => {});
    }
  }

  if (mode === 'video') {
    const cachedVideo = resolver.getCachedVideoFile(videoId);
    if (cachedVideo) {
      return serveLocalFileWithRange(req, res, cachedVideo, 'video/mp4');
    }
    // Warm faststart MP4 cache in background while streaming immediately
    resolver.getFastVideoFile(videoId).catch(() => {});
  }

  const pipeTarget = async (attempt = 0) => {
    let info;
    try {
      info = await resolver.resolve(videoId, { forceRefresh: attempt > 0 });
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end(err.message || 'Failed to resolve stream');
      }
      return;
    }

    const streamInfo = mode === 'video' ? info.video || info.audio : info.audio || info.video;
    if (!streamInfo || !streamInfo.url) {
      if (!res.headersSent) {
        res.writeHead(404);
        res.end('No playable format found');
      }
      return;
    }

    // For HLS (.m3u8) video streams, redirect directly so WKWebView's native HLS engine
    // handles adaptive 720p/1080p playback with exact 1:1 duration.
    if (mode === 'video' && streamInfo.isHls) {
      res.writeHead(302, {
        Location: streamInfo.url,
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      });
      res.end();
      return;
    }

    const targetUrl = new URL(streamInfo.url);
    const client = targetUrl.protocol === 'https:' ? https : http;
    const agent = targetUrl.protocol === 'https:' ? httpsAgent : httpAgent;

    const upstreamHeaders = {
      ...(streamInfo.httpHeaders || {}),
      'Accept-Encoding': 'identity',
    };
    if (req.headers.range) upstreamHeaders['Range'] = req.headers.range;

    const upstreamReq = client.request(
      targetUrl,
      {
        method: req.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: upstreamHeaders,
        agent,
      },
      (upstreamRes) => {
        if (upstreamRes.statusCode === 403 && attempt === 0) {
          upstreamRes.resume();
          pipeTarget(1);
          return;
        }

        const outHeaders = {
          'Content-Type': upstreamRes.headers['content-type'] || streamInfo.mime || 'audio/mp4',
          'Accept-Ranges': upstreamRes.headers['accept-ranges'] || 'bytes',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        };
        if (upstreamRes.headers['content-length']) {
          outHeaders['Content-Length'] = upstreamRes.headers['content-length'];
        }
        if (upstreamRes.headers['content-range']) {
          outHeaders['Content-Range'] = upstreamRes.headers['content-range'];
        }

        res.writeHead(upstreamRes.statusCode || 200, outHeaders);
        if (req.method === 'HEAD') {
          upstreamRes.resume();
          res.end();
          return;
        }
        upstreamRes.on('error', () => {
          if (!res.writableEnded) res.destroy();
        });
        upstreamRes.pipe(res);
      }
    );

    req.on('close', () => {
      if (!res.writableEnded) {
        try { upstreamReq.destroy(); } catch {}
      }
    });

    upstreamReq.setTimeout(15000, () => {
      try { upstreamReq.destroy(); } catch {}
    });

    upstreamReq.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(502);
        res.end('Upstream error');
      } else {
        res.destroy();
      }
    });

    req.on('close', () => upstreamReq.destroy());
    upstreamReq.end();
  };

  pipeTarget(0);
}

function serveStatic(req, res, pathname) {
  let filePath = path.join(DIST_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html');
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Build not found. Run npm run build.');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

async function handleApi(req, res, urlObj) {
  const { pathname, searchParams } = urlObj;
  try {
    if (pathname === '/api/health') {
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/avatar') {
      const name = searchParams.get('name') || '';
      const fallback = searchParams.get('fallback') || '';
      const resolvedUrl = await spotify.resolveAvatarForArtist(name, fallback);
      if (resolvedUrl) {
        try {
          const imgRes = await fetch(resolvedUrl);
          if (imgRes.ok) {
            const ct = imgRes.headers.get('content-type') || 'image/jpeg';
            const buf = Buffer.from(await imgRes.arrayBuffer());
            res.writeHead(200, {
              'Content-Type': ct,
              'Content-Length': buf.length,
              'Cache-Control': 'public, max-age=86400',
              'Access-Control-Allow-Origin': '*',
            });
            res.end(buf);
            return;
          }
        } catch {}
      }
      // Clean SVG initials avatar fallback so no broken image icon can ever appear
      const initials = (name || '?')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0].toUpperCase())
        .join('') || '?';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#10b981"/><stop offset="100%" stop-color="#3b82f6"/></linearGradient></defs><rect width="400" height="400" fill="#14141f"/><circle cx="200" cy="200" r="200" fill="url(#g)" fill-opacity="0.22"/><text x="200" y="220" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="136" font-weight="800" fill="#ffffff">${initials}</text></svg>`;
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' });
      res.end(svg);
      return;
    }

    if (pathname === '/api/cover') {
      const result = await covers.resolveCover({
        url: searchParams.get('url') || '',
        videoId: searchParams.get('videoId') || '',
        title: searchParams.get('title') || '',
        artist: searchParams.get('artist') || '',
      });
      res.writeHead(200, {
        'Content-Type': result.contentType || 'image/jpeg',
        'Content-Length': result.buffer.length,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(result.buffer);
      return;
    }

    if (pathname === '/api/suggestions') {
      return sendJson(res, 200, await ytm.getSuggestions(searchParams.get('q') || ''));
    }

    if (pathname === '/api/search') {
      const q = searchParams.get('q') || '';
      const filter = searchParams.get('filter') || 'all';
      const result = await ytm.search(q, filter);
      const ids = [];
      if (result.topResult?.videoId) ids.push(result.topResult.videoId);
      for (const t of [...(result.songs || []), ...(result.videos || []), ...(result.items || [])].slice(0, 5)) {
        if (t?.videoId) ids.push(t.videoId);
      }
      if (ids.length) resolver.prewarm(ids);
      return sendJson(res, 200, result);
    }

    if (pathname === '/api/home') {
      const refresh = searchParams.get('refresh') === '1';
      const libState = store.getAll();
      const [result, basedOnShelf] = await Promise.all([
        ytm.getHome(),
        recommendations.getBasedOnLastListened(libState.history, { refresh }).catch(() => null),
      ]);

      const excludeIds = new Set((basedOnShelf?.items || []).map((t) => t.videoId).filter(Boolean));
      const extraShelves = await recommendations
        .getMoreSongsYouMightLike(libState, { excludeIds, refresh })
        .catch(() => []);

      const filteredShelves = (result.shelves || []).filter(
        (s) => !/new albums?\s*(&|and)\s*singles|trending|new music videos?|music videos/i.test(s.title || '')
      );
      const shelves = [
        ...(basedOnShelf && basedOnShelf.items?.length > 0 ? [basedOnShelf] : []),
        ...extraShelves,
        ...filteredShelves,
      ];

      const firstTracks = [];
      for (const s of shelves) {
        for (const item of s.items || []) {
          if (item.videoId) firstTracks.push(item.videoId);
          if (firstTracks.length >= 4) break;
        }
        if (firstTracks.length >= 4) break;
      }
      if (firstTracks.length) resolver.prewarm(firstTracks);
      return sendJson(res, 200, { ...result, shelves });
    }

    if (pathname === '/api/artist') {
      const result = await ytm.getArtist(searchParams.get('id') || '');
      resolver.prewarm((result.topSongs || []).slice(0, 4).map((t) => t.videoId));
      return sendJson(res, 200, result);
    }

    if (pathname === '/api/album') {
      const result = await ytm.getAlbum(searchParams.get('id') || '');
      resolver.prewarm((result.tracks || []).slice(0, 4).map((t) => t.videoId));
      return sendJson(res, 200, result);
    }

    if (pathname === '/api/playlist') {
      const result = await ytm.getPlaylist(searchParams.get('id') || '');
      resolver.prewarm((result.tracks || []).slice(0, 4).map((t) => t.videoId));
      return sendJson(res, 200, result);
    }

    if (pathname === '/api/upnext') {
      const result = await ytm.getUpNext(
        searchParams.get('videoId') || '',
        searchParams.get('playlistId') || null
      );
      resolver.prewarm((result.tracks || []).slice(0, 3).map((t) => t.videoId));
      return sendJson(res, 200, result);
    }

    if (pathname === '/api/lyrics') {
      return sendJson(
        res,
        200,
        await lyricsService.getLyrics({
          videoId: searchParams.get('videoId') || '',
          title: searchParams.get('title') || '',
          artist: searchParams.get('artist') || '',
          album: searchParams.get('album') || '',
          duration: Number(searchParams.get('duration')) || 0,
        })
      );
    }

    if (pathname === '/api/counterpart') {
      const hit = await ytm.findCounterpart(
        searchParams.get('title') || '',
        searchParams.get('artist') || '',
        searchParams.get('mode') || 'video'
      );
      if (hit?.videoId) resolver.prewarm([hit.videoId]);
      return sendJson(res, 200, hit || null);
    }

    if (pathname === '/api/video-offset') {
      const videoId = searchParams.get('videoId') || '';
      const songVideoId = searchParams.get('songVideoId') || '';
      if (!videoId) return sendJson(res, 200, { offsetSec: 0, source: 'none' });
      const result = await offsetDetector.detectVideoIntroOffset({
        videoId,
        songVideoId,
        resolver,
      });
      return sendJson(res, 200, result);
    }

    if (pathname === '/api/prewarm' && req.method === 'POST') {
      const body = await readJsonBody(req);
      resolver.prewarm(body.videoIds || []);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/resolve') {
      return sendJson(res, 200, await resolver.resolve(searchParams.get('videoId') || ''));
    }

    if (pathname === '/api/library' && req.method === 'GET') {
      const lib = store.getAll();
      const missing = [
        ...(lib.likedSongs || []),
        ...(lib.history || []),
        ...(lib.playlists || []).flatMap((p) => p.tracks || []),
      ].filter((t) => t && t.title && !t.spotifyStreams);
      if (missing.length > 0) {
        try {
          const enriched = await Promise.race([
            spotify.enrichTracksWithSpotifyStreams(missing.slice(0, 80)),
            new Promise((resolve) => setTimeout(() => resolve(null), 4000)),
          ]);
          if (Array.isArray(enriched)) {
            const byId = new Map();
            for (const t of enriched) {
              if (t?.videoId && t.spotifyStreams) byId.set(t.videoId, t.spotifyStreams);
            }
            if (byId.size > 0) {
              const apply = (arr) => (arr || []).map((t) => (t?.videoId && !t.spotifyStreams && byId.has(t.videoId) ? { ...t, spotifyStreams: byId.get(t.videoId) } : t));
              lib.likedSongs = apply(lib.likedSongs);
              lib.history = apply(lib.history);
              lib.playlists = (lib.playlists || []).map((p) => ({ ...p, tracks: apply(p.tracks) }));
              store.syncKnownStreamCounts();
              store.save();
            }
          }
          if (missing.length > 80 && !global.__sonaBgEnrichRunning) {
            global.__sonaBgEnrichRunning = true;
            (async () => {
              try {
                for (let i = 80; i < missing.length; i += 80) {
                  const chunk = missing.slice(i, i + 80);
                  const resChunk = await spotify.enrichTracksWithSpotifyStreams(chunk);
                  const byId = new Map();
                  for (const t of resChunk || []) {
                    if (t?.videoId && t.spotifyStreams) byId.set(t.videoId, t.spotifyStreams);
                  }
                  if (byId.size > 0) {
                    const cur = store.getAll();
                    const apply = (arr) => (arr || []).map((t) => (t?.videoId && !t.spotifyStreams && byId.has(t.videoId) ? { ...t, spotifyStreams: byId.get(t.videoId) } : t));
                    cur.likedSongs = apply(cur.likedSongs);
                    cur.history = apply(cur.history);
                    cur.playlists = (cur.playlists || []).map((p) => ({ ...p, tracks: apply(p.tracks) }));
                    store.save();
                  }
                }
              } catch {}
              global.__sonaBgEnrichRunning = false;
            })();
          }
        } catch {}
      }
      return sendJson(res, 200, lib);
    }

    if (pathname === '/api/library/like' && req.method === 'POST') {
      let body = await readJsonBody(req);
      if (body && body.videoId && !body.spotifyStreams) {
        try {
          const [enriched] = await Promise.race([
            spotify.enrichTracksWithSpotifyStreams([body]),
            new Promise((resolve) => setTimeout(() => resolve([body]), 2000)),
          ]);
          if (enriched?.spotifyStreams) body = enriched;
        } catch {}
      }
      return sendJson(res, 200, store.toggleLike(body));
    }

    if (pathname === '/api/library/follow' && req.method === 'POST') {
      const body = await readJsonBody(req);
      return sendJson(res, 200, store.toggleFollowArtist(body));
    }

    if (pathname === '/api/library/album' && req.method === 'POST') {
      const body = await readJsonBody(req);
      return sendJson(res, 200, store.toggleSaveAlbum(body));
    }

    if (pathname === '/api/library/playlist/create' && req.method === 'POST') {
      const body = await readJsonBody(req);
      return sendJson(res, 200, store.createPlaylist(body));
    }

    if (pathname === '/api/library/playlist/import' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const imported = await importer.importPlaylist({
        urlOrText: body.urlOrText || '',
        name: body.name || '',
      });
      const created = store.createPlaylist({
        name: imported.title,
        description: imported.description || '',
        initialTracks: imported.tracks || [],
      });
      return sendJson(res, 200, {
        ok: true,
        source: imported.source,
        importedCount: imported.tracks.length,
        totalFound: imported.totalFound,
        playlist: created.playlist,
        state: created.state,
      });
    }

    if (pathname === '/api/library/taste/import' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const opts = body.options || {};
      const importPlaylistsOpt = opts.importPlaylists !== false;
      const likeSongsOpt = opts.likeSongs !== false;
      const followArtistsOpt = opts.followArtists !== false;
      const tuneRecsOpt = opts.tuneRecommendations !== false;

      const taste = await importer.importMusicTaste({ input: body.input || '' });
      let playlistsCreated = 0;
      let likedAdded = 0;
      let artistsFollowed = 0;
      let historySeeded = 0;

      if (importPlaylistsOpt) {
        for (const pl of taste.playlists) {
          if (pl.tracks?.length > 0) {
            store.createPlaylist({
              name: pl.title,
              description: pl.description || '',
              initialTracks: pl.tracks,
            });
            playlistsCreated++;
          }
        }
      }

      if (likeSongsOpt) {
        const existingLiked = new Set((store.getAll().likedSongs || []).map((t) => t.videoId));
        for (const t of [...taste.topTracks].reverse()) {
          if (t?.videoId && !existingLiked.has(t.videoId)) {
            store.toggleLike(t);
            existingLiked.add(t.videoId);
            likedAdded++;
          }
        }
      }

      if (followArtistsOpt) {
        const existingArtists = new Set((store.getAll().followedArtists || []).map((a) => a.id));
        for (const a of taste.topArtists) {
          if (a?.id && !existingArtists.has(a.id)) {
            store.toggleFollowArtist(a);
            existingArtists.add(a.id);
            artistsFollowed++;
          }
        }
      }

      if (tuneRecsOpt) {
        for (const t of taste.topTracks.slice(0, 15).reverse()) {
          if (t?.videoId) {
            store.recordPlay(t);
            historySeeded++;
          }
        }
      }

      return sendJson(res, 200, {
        ok: true,
        profileName: taste.profileName,
        source: taste.source,
        playlistsCreated,
        likedAdded,
        artistsFollowed,
        historySeeded,
        state: store.getAll(),
      });
    }

    if (pathname === '/api/library/playlist/update' && req.method === 'POST') {
      const body = await readJsonBody(req);
      return sendJson(res, 200, store.updatePlaylist(body.id, body.patch || {}));
    }

    if (pathname === '/api/library/playlist/delete' && req.method === 'POST') {
      const body = await readJsonBody(req);
      return sendJson(res, 200, store.deletePlaylist(body.id));
    }

    if (pathname === '/api/library/playlist/dedupe' && req.method === 'POST') {
      return sendJson(res, 200, store.deleteDuplicatePlaylists());
    }

    if (pathname === '/api/library/playlist/add' && req.method === 'POST') {
      const body = await readJsonBody(req);
      let track = body.track;
      if (track && track.videoId && !track.spotifyStreams) {
        try {
          const [enriched] = await Promise.race([
            spotify.enrichTracksWithSpotifyStreams([track]),
            new Promise((resolve) => setTimeout(() => resolve([track]), 2000)),
          ]);
          if (enriched?.spotifyStreams) track = enriched;
        } catch {}
      }
      return sendJson(res, 200, store.addToPlaylist(body.playlistId, track));
    }

    if (pathname === '/api/library/playlist/remove' && req.method === 'POST') {
      const body = await readJsonBody(req);
      return sendJson(res, 200, store.removeFromPlaylist(body.playlistId, body.videoId));
    }

    if (pathname === '/api/library/playlist/reorder' && req.method === 'POST') {
      const body = await readJsonBody(req);
      return sendJson(res, 200, store.reorderPlaylistTrack(body.playlistId, body.fromIndex, body.toIndex));
    }

    if (pathname === '/api/library/play' && req.method === 'POST') {
      let body = await readJsonBody(req);
      if (body && body.videoId && !body.spotifyStreams) {
        try {
          const [enriched] = await Promise.race([
            spotify.enrichTracksWithSpotifyStreams([body]),
            new Promise((resolve) => setTimeout(() => resolve([body]), 2000)),
          ]);
          if (enriched?.spotifyStreams) body = enriched;
        } catch {}
      }
      return sendJson(res, 200, store.recordPlay(body));
    }

    if (pathname === '/api/library/prefs' && req.method === 'POST') {
      const body = await readJsonBody(req);
      return sendJson(res, 200, store.setPreferences(body));
    }

    if (pathname === '/api/library/history/clear' && req.method === 'POST') {
      return sendJson(res, 200, store.clearHistory());
    }

    if (pathname === '/api/lyrics/cache/clear' && req.method === 'POST') {
      lyricsService.clearCache();
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/account/status' && req.method === 'GET') {
      return sendJson(res, 200, sync.getStatus());
    }

    if (pathname === '/api/account/configure' && req.method === 'POST') {
      const body = await readJsonBody(req);
      return sendJson(res, 200, sync.configure(body));
    }

    if (pathname === '/api/account/signup' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const result = await sync.signUp(body);
      return sendJson(res, 200, { ...result, library: store.getAll() });
    }

    if (pathname === '/api/account/signin' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const status = await sync.signIn(body);
      return sendJson(res, 200, { status, library: store.getAll() });
    }

    if (pathname === '/api/account/signout' && req.method === 'POST') {
      return sendJson(res, 200, sync.signOut());
    }

    if (pathname === '/api/account/sync' && req.method === 'POST') {
      const status = await sync.syncNow();
      return sendJson(res, 200, { status, library: store.getAll() });
    }

    if (pathname === '/api/account/reset-device' && req.method === 'POST') {
      const result = sync.resetDevice({
        onClearExtras: () => {
          offline.clearAll();
          lyricsService.clearCache();
        },
      });
      return sendJson(res, 200, result);
    }

    if (pathname === '/api/account/reset-account' && req.method === 'POST') {
      const result = await sync.resetAccount();
      return sendJson(res, 200, result);
    }

    if (pathname === '/api/offline/status' && req.method === 'GET') {
      return sendJson(res, 200, offline.getStatus());
    }

    if (pathname === '/api/offline/download' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const tracks = Array.isArray(body.tracks) ? body.tracks : body.track ? [body.track] : [];
      const result = await offline.downloadTracks(tracks);
      return sendJson(res, 200, result);
    }

    if (pathname === '/api/offline/delete' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const ids = Array.isArray(body.videoIds) ? body.videoIds : body.videoId ? [body.videoId] : [];
      return sendJson(res, 200, offline.deleteTracks(ids));
    }

    if (pathname === '/api/offline/clear' && req.method === 'POST') {
      return sendJson(res, 200, offline.clearAll());
    }

    if (pathname === '/api/stats/status' && req.method === 'GET') {
      return sendJson(res, 200, scanner.getStatus());
    }

    if (pathname === '/api/stats/scan' && req.method === 'POST') {
      const status = await scanner.runScan();
      return sendJson(res, 200, { status, library: store.getAll() });
    }

    if (pathname === '/api/updater/status' && req.method === 'GET') {
      return sendJson(res, 200, updater.getStatus());
    }

    if (pathname === '/api/updater/check' && req.method === 'POST') {
      return sendJson(res, 200, await updater.checkForUpdates());
    }

    if (pathname === '/api/updater/install' && req.method === 'POST') {
      return sendJson(res, 200, await updater.downloadAndInstall());
    }

    return sendJson(res, 404, { error: 'Unknown endpoint' });
  } catch (err) {
    return sendJson(res, 500, { error: err?.message || 'Internal server error' });
  }
}

store.init();
offline.init();
store.onSave(() => sync.schedulePush());
sync.init();
scanner.init({ onAfterScan: () => sync.schedulePush() });
resolver.start().catch(() => {});
setTimeout(() => updater.checkForUpdates().catch(() => {}), 3500);

const requestedPort = Number(process.env.SONA_PORT || 47921);

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlObj = new URL(req.url, 'http://127.0.0.1');
  const streamMatch = urlObj.pathname.match(/^\/stream\/([a-zA-Z0-9_-]+)$/);
  if (streamMatch) {
    const mode = urlObj.searchParams.get('mode') === 'video' ? 'video' : 'audio';
    return handleStreamProxy(req, res, streamMatch[1], mode);
  }

  if (urlObj.pathname.startsWith('/api/')) {
    return handleApi(req, res, urlObj);
  }

  return serveStatic(req, res, urlObj.pathname);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && requestedPort !== 0) {
    server.listen(0, '127.0.0.1');
  } else {
    console.error(err);
    process.exit(1);
  }
});

server.listen(requestedPort, '127.0.0.1', () => {
  const { port } = server.address();
  console.log(`SONA_READY:${port}`);
});

const shutdown = () => {
  resolver.stop();
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
