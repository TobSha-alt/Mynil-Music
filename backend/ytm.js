const spotify = require('./spotify');

const YTM_BASE = 'https://music.youtube.com/youtubei/v1';

const HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Origin: 'https://music.youtube.com',
  Referer: 'https://music.youtube.com/',
};

const CONTEXT = {
  client: {
    clientName: 'WEB_REMIX',
    clientVersion: '1.20241106.01.00',
    hl: 'en',
    gl: 'US',
  },
};

const SEARCH_PARAMS = {
  songs: 'EgWKAQIIAWoSEAMQBRAEEAkQChAVEBAQDhAR',
  videos: 'EgWKAQIQAWoSEAMQBRAEEAkQChAVEBAQDhAR',
  albums: 'EgWKAQIYAWoSEAMQBRAEEAkQChAVEBAQDhAR',
  artists: 'EgWKAQIgAWoSEAMQBRAEEAkQChAVEBAQDhAR',
  playlists: 'EgeKAQQoAEABahIQAxAFEAQQCRAKEBUQEBAOEBE%3D',
};

async function ytmPost(endpoint, body) {
  const res = await fetch(`${YTM_BASE}/${endpoint}?prettyPrint=false`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ context: CONTEXT, ...body }),
  });
  if (!res.ok) {
    throw new Error(`YTM ${endpoint} HTTP ${res.status}`);
  }
  return res.json();
}

function upscaleThumb(url, size = 544) {
  if (!url) return '';
  if (url.startsWith('//')) url = 'https:' + url;
  // Googleusercontent / yt3 square artwork URLs support =w544-h544-l90-rj
  if (/=(w\d+-h\d+|s\d+)/.test(url)) {
    return url.replace(/=(w\d+-h\d+[^&]*|s\d+[^&]*)/, `=w${size}-h${size}-l90-rj`);
  }
  return url;
}

function pickBestThumb(thumbnails, size = 544) {
  if (!Array.isArray(thumbnails) || thumbnails.length === 0) return '';
  const last = thumbnails[thumbnails.length - 1];
  return upscaleThumb(last?.url || '', size);
}

function textFromRuns(runs) {
  if (!Array.isArray(runs)) return '';
  return runs.map((r) => r.text || '').join('');
}

function parseDurationToSec(str) {
  if (!str || typeof str !== 'string') return 0;
  const parts = str.trim().split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function extractArtistsAndMeta(runs) {
  if (!Array.isArray(runs)) return { artists: [], album: null, duration: '', durationSec: 0, views: '', year: '' };
  const artists = [];
  let album = null;
  let duration = '';
  let views = '';
  let year = '';

  for (const run of runs) {
    const t = (run.text || '').trim();
    if (!t || t === '•' || t === ',' || t === '&') continue;
    const ep = run.navigationEndpoint?.browseEndpoint;
    const pageType = ep?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;

    if (pageType === 'MUSIC_PAGE_TYPE_ARTIST' || (!pageType && ep?.browseId?.startsWith('UC'))) {
      artists.push({ name: t, id: ep.browseId });
    } else if (pageType === 'MUSIC_PAGE_TYPE_ALBUM' || (!pageType && ep?.browseId?.startsWith('MPRE'))) {
      album = { title: t, id: ep.browseId };
    } else if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) {
      duration = t;
    } else if (/^\d{4}$/.test(t)) {
      year = t;
    } else if (/views|plays|monthly/i.test(t)) {
      views = t;
    }
  }

  // Fallback if no linked artist runs were present (e.g. plain text "Artist • 3:20")
  if (artists.length === 0) {
    const joined = textFromRuns(runs);
    const segments = joined.split('•').map((s) => s.trim()).filter(Boolean);
    for (const seg of segments) {
      if (
        !/^(Song|Video|Album|Single|EP|Artist|Playlist|Podcast|Episode)$/i.test(seg) &&
        !/^\d{1,2}:\d{2}(:\d{2})?$/.test(seg) &&
        !/^\d{4}$/.test(seg) &&
        !/views|plays|songs|monthly|subscribers/i.test(seg)
      ) {
        artists.push({ name: seg, id: null });
        break;
      }
    }
  }

  return {
    artists,
    artistText: artists.map((a) => a.name).join(', '),
    album,
    duration,
    durationSec: parseDurationToSec(duration),
    views,
    year,
  };
}

function isNonMusicContent({ pageType = '', browseId = '', videoType = '', rawSub = '' } = {}) {
  const pt = String(pageType || '').toUpperCase();
  const vt = String(videoType || '').toUpperCase();
  const bid = String(browseId || '');
  const sub = String(rawSub || '').trim();
  if (pt.includes('PODCAST') || pt.includes('NON_MUSIC') || pt.includes('AUDIOBOOK') || pt.includes('EPISODE')) {
    return true;
  }
  if (bid.startsWith('MPSP') || bid.startsWith('MPED')) return true;
  if (vt.includes('PODCAST') || vt.includes('AUDIO_BOOK') || vt.includes('NON_MUSIC')) return true;
  if (/^(Episode|Podcast|Audiobook)\b/i.test(sub)) return true;
  return false;
}

function parseResponsiveItem(renderer, forcedType = null) {
  if (!renderer) return null;
  const flexCols = renderer.flexColumns || [];
  const col0Runs = flexCols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
  const col1Runs = flexCols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
  const extraFlexRuns = flexCols
    .slice(2)
    .flatMap((fc) => fc?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []);
  const fixedColRuns = (renderer.fixedColumns || []).flatMap(
    (fc) => fc?.musicResponsiveListItemFixedColumnRenderer?.text?.runs || []
  );

  const title = textFromRuns(col0Runs).trim();
  if (!title) return null;

  const navEp = renderer.navigationEndpoint || col0Runs[0]?.navigationEndpoint;
  const watchEp =
    renderer.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint
      ?.watchEndpoint ||
    navEp?.watchEndpoint ||
    renderer.playlistItemData;

  const videoId = watchEp?.videoId || renderer.playlistItemData?.videoId || null;
  const browseId = navEp?.browseEndpoint?.browseId || null;
  const pageType =
    navEp?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType || '';

  const allMetaRuns = [...col1Runs, ...extraFlexRuns, ...fixedColRuns];
  const meta = extractArtistsAndMeta(allMetaRuns);
  const rawSub = textFromRuns(col1Runs).trim();
  const thumb = pickBestThumb(renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails, 544);
  const videoType =
    watchEp?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType || '';

  if (isNonMusicContent({ pageType, browseId, videoType, rawSub })) return null;

  let type = forcedType;
  if (!type) {
    if (pageType === 'MUSIC_PAGE_TYPE_ARTIST' || browseId?.startsWith('UC')) type = 'artist';
    else if (pageType === 'MUSIC_PAGE_TYPE_ALBUM' || browseId?.startsWith('MPRE')) type = 'album';
    else if (pageType === 'MUSIC_PAGE_TYPE_PLAYLIST' || browseId?.startsWith('VL')) type = 'playlist';
    else if (videoId) {
      type = videoType === 'MUSIC_VIDEO_TYPE_OMV' || videoType === 'MUSIC_VIDEO_TYPE_UGC' || /^Video\b/i.test(rawSub)
        ? 'video'
        : 'song';
    }
  }

  if (type === 'artist' && browseId) {
    return {
      kind: 'artist',
      id: browseId,
      name: title,
      subtitle: rawSub || 'Artist',
      subscribers: meta.views || rawSub.replace(/^Artist\s*•\s*/i, ''),
      thumbnail: thumb,
    };
  }

  if (type === 'album' && browseId) {
    return {
      kind: 'album',
      id: browseId,
      title,
      artist: meta.artistText || 'Unknown Artist',
      artistId: meta.artists[0]?.id || null,
      year: meta.year,
      subtitle: rawSub,
      thumbnail: thumb,
    };
  }

  if (type === 'playlist' && browseId) {
    return {
      kind: 'playlist',
      id: browseId,
      title,
      author: meta.artistText || rawSub.replace(/^Playlist\s*•\s*/i, ''),
      subtitle: rawSub,
      thumbnail: thumb,
    };
  }

  if (videoId) {
    return {
      kind: type === 'video' ? 'video' : 'song',
      videoId,
      title,
      artist: meta.artistText || rawSub.split('•')[0]?.trim() || 'Unknown Artist',
      artistId: meta.artists[0]?.id || null,
      artists: meta.artists,
      album: meta.album?.title || '',
      albumId: meta.album?.id || null,
      duration: meta.duration,
      durationSec: meta.durationSec,
      views: meta.views,
      thumbnail: thumb,
      isVideo: type === 'video',
    };
  }

  return null;
}

function parseTwoRowItem(renderer) {
  if (!renderer) return null;
  const title = textFromRuns(renderer.title?.runs).trim();
  if (!title) return null;

  const subtitleRuns = renderer.subtitle?.runs || [];
  const rawSub = textFromRuns(subtitleRuns).trim();
  const meta = extractArtistsAndMeta(subtitleRuns);
  const thumb = pickBestThumb(renderer.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails, 544);

  const navEp = renderer.navigationEndpoint;
  const browseId = navEp?.browseEndpoint?.browseId || null;
  const pageType =
    navEp?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType || '';
  const watchEp =
    navEp?.watchEndpoint ||
    renderer.thumbnailOverlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
      ?.playNavigationEndpoint?.watchEndpoint;
  const videoId = watchEp?.videoId || null;
  const videoType =
    watchEp?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType || '';

  if (isNonMusicContent({ pageType, browseId, videoType, rawSub })) return null;

  if (pageType === 'MUSIC_PAGE_TYPE_ARTIST' || browseId?.startsWith('UC')) {
    return {
      kind: 'artist',
      id: browseId,
      name: title,
      subtitle: rawSub || 'Artist',
      subscribers: rawSub,
      thumbnail: thumb,
    };
  }

  if (pageType === 'MUSIC_PAGE_TYPE_ALBUM' || browseId?.startsWith('MPRE')) {
    return {
      kind: 'album',
      id: browseId,
      title,
      artist: meta.artistText || rawSub.split('•').pop()?.trim() || 'Album',
      artistId: meta.artists[0]?.id || null,
      year: meta.year,
      subtitle: rawSub,
      thumbnail: thumb,
    };
  }

  if (pageType === 'MUSIC_PAGE_TYPE_PLAYLIST' || browseId?.startsWith('VL') || browseId?.startsWith('RD')) {
    return {
      kind: 'playlist',
      id: browseId,
      title,
      author: meta.artistText || rawSub,
      subtitle: rawSub,
      thumbnail: thumb,
    };
  }

  if (videoId) {
    const videoType =
      watchEp?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType || '';
    const isVideo = videoType === 'MUSIC_VIDEO_TYPE_OMV' || videoType === 'MUSIC_VIDEO_TYPE_UGC';
    return {
      kind: isVideo ? 'video' : 'song',
      videoId,
      title,
      artist: meta.artistText || rawSub.split('•')[0]?.trim() || 'Unknown Artist',
      artistId: meta.artists[0]?.id || null,
      artists: meta.artists,
      album: meta.album?.title || '',
      albumId: meta.album?.id || null,
      duration: meta.duration,
      durationSec: meta.durationSec,
      views: meta.views,
      thumbnail: thumb,
      isVideo,
    };
  }

  return null;
}

async function getSuggestions(input) {
  const q = (input || '').trim();
  if (!q) return { queries: [], items: [] };
  const data = await ytmPost('music/get_search_suggestions', { input: q });
  const contents = data?.contents || [];
  const queries = [];
  const items = [];

  for (const section of contents) {
    const list = section?.searchSuggestionsSectionRenderer?.contents || [];
    for (const entry of list) {
      if (entry.searchSuggestionRenderer) {
        const text = textFromRuns(entry.searchSuggestionRenderer.suggestion?.runs).trim();
        if (text) queries.push(text);
      } else if (entry.musicResponsiveListItemRenderer) {
        const parsed = parseResponsiveItem(entry.musicResponsiveListItemRenderer);
        if (parsed) items.push(parsed);
      }
    }
  }
  return { queries: queries.slice(0, 7), items: items.slice(0, 5) };
}

async function search(query, filter = 'all') {
  const q = (query || '').trim();
  if (!q) return { topResult: null, songs: [], videos: [], albums: [], artists: [], playlists: [], items: [] };

  const params = SEARCH_PARAMS[filter];
  const data = await ytmPost('search', params ? { query: q, params } : { query: q });

  const sections =
    data?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ||
    [];

  if (filter !== 'all') {
    const forced =
      filter === 'songs'
        ? 'song'
        : filter === 'videos'
        ? 'video'
        : filter === 'albums'
        ? 'album'
        : filter === 'artists'
        ? 'artist'
        : 'playlist';

    const items = [];
    for (const sec of sections) {
      const shelf = sec.musicShelfRenderer;
      if (!shelf) continue;
      for (const c of shelf.contents || []) {
        const parsed = parseResponsiveItem(c.musicResponsiveListItemRenderer, forced);
        if (parsed) items.push(parsed);
      }
    }
    if (filter === 'songs' || filter === 'videos') {
      return { items: await spotify.enrichTracksWithSpotifyStreams(items) };
    }
    if (filter === 'artists') {
      await Promise.all(
        items.slice(0, 12).map(async (a) => {
          const bundle = await spotify.getArtistSpotifyBundle(a.name).catch(() => null);
          if (bundle?.avatarUrl) a.thumbnail = bundle.avatarUrl;
          if (bundle?.monthlyListeners) a.subscribers = bundle.monthlyListeners;
        })
      );
    }
    return { items };
  }

  let topResult = null;
  const songs = [];
  const videos = [];
  const albums = [];
  const artists = [];
  const playlists = [];

  for (const sec of sections) {
    if (sec.itemSectionRenderer) {
      for (const c of sec.itemSectionRenderer.contents || []) {
        const parsed = parseResponsiveItem(c.musicResponsiveListItemRenderer);
        if (!parsed) continue;
        if (parsed.kind === 'song') songs.push(parsed);
        else if (parsed.kind === 'video') videos.push(parsed);
        else if (parsed.kind === 'album') albums.push(parsed);
        else if (parsed.kind === 'artist') artists.push(parsed);
        else if (parsed.kind === 'playlist') playlists.push(parsed);
      }
      continue;
    }

    if (sec.musicCardShelfRenderer) {
      const card = sec.musicCardShelfRenderer;
      const title = textFromRuns(card.title?.runs).trim();
      const subRuns = card.subtitle?.runs || [];
      const rawSub = textFromRuns(subRuns).trim();
      const meta = extractArtistsAndMeta(subRuns);
      const thumb = pickBestThumb(card.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails, 544);
      const navEp = card.title?.runs?.[0]?.navigationEndpoint;
      const watchEp =
        navEp?.watchEndpoint ||
        card.buttons?.[0]?.buttonRenderer?.navigationEndpoint?.watchEndpoint ||
        card.thumbnailOverlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
          ?.playNavigationEndpoint?.watchEndpoint;
      const browseId = navEp?.browseEndpoint?.browseId || null;
      const pageType =
        navEp?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType || '';
      const videoType =
        watchEp?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType || '';

      if (isNonMusicContent({ pageType, browseId, videoType, rawSub })) {
        // Skip podcast/episode/audiobook top results
      } else if (browseId?.startsWith('UC')) {
        topResult = {
          kind: 'artist',
          id: browseId,
          name: title,
          subtitle: rawSub,
          subscribers: meta.views || rawSub.replace(/^Artist\s*•\s*/i, ''),
          thumbnail: thumb,
        };
      } else if (browseId?.startsWith('MPRE')) {
        topResult = {
          kind: 'album',
          id: browseId,
          title,
          artist: meta.artistText || rawSub,
          artistId: meta.artists[0]?.id || null,
          year: meta.year,
          subtitle: rawSub,
          thumbnail: thumb,
        };
      } else if (watchEp?.videoId) {
        topResult = {
          kind: /^Video/i.test(rawSub) ? 'video' : 'song',
          videoId: watchEp.videoId,
          title,
          artist: meta.artistText || rawSub.split('•')[1]?.trim() || 'Artist',
          artistId: meta.artists[0]?.id || null,
          artists: meta.artists,
          album: meta.album?.title || '',
          duration: meta.duration,
          durationSec: meta.durationSec,
          thumbnail: thumb,
          isVideo: /^Video/i.test(rawSub),
        };
      }

      // Card shelf often includes inline quick-picks under card.contents
      for (const c of card.contents || []) {
        const parsed = parseResponsiveItem(c.musicResponsiveListItemRenderer);
        if (parsed?.kind === 'song') songs.push(parsed);
        else if (parsed?.kind === 'video') videos.push(parsed);
        else if (parsed?.kind === 'album') albums.push(parsed);
        else if (parsed?.kind === 'artist') artists.push(parsed);
      }
      continue;
    }

    const shelf = sec.musicShelfRenderer;
    if (!shelf) continue;
    const shelfTitle = textFromRuns(shelf.title?.runs).toLowerCase();
    if (shelfTitle.includes('episode') || shelfTitle.includes('podcast') || shelfTitle.includes('audiobook')) {
      continue;
    }
    const forced =
      shelfTitle.includes('song')
        ? 'song'
        : shelfTitle.includes('video')
        ? 'video'
        : shelfTitle.includes('album')
        ? 'album'
        : shelfTitle.includes('artist')
        ? 'artist'
        : shelfTitle.includes('playlist')
        ? 'playlist'
        : null;

    for (const c of shelf.contents || []) {
      const parsed = parseResponsiveItem(c.musicResponsiveListItemRenderer, forced);
      if (!parsed) continue;
      if (parsed.kind === 'song') songs.push(parsed);
      else if (parsed.kind === 'video') videos.push(parsed);
      else if (parsed.kind === 'album') albums.push(parsed);
      else if (parsed.kind === 'artist') artists.push(parsed);
      else if (parsed.kind === 'playlist') playlists.push(parsed);
    }
  }

  // Enrich topResult, songs, and artists with Spotify monthly listeners, portraits, and stream counts
  const enrichTasks = [];
  if (topResult?.kind === 'artist') {
    enrichTasks.push(
      spotify.getArtistSpotifyBundle(topResult.name).then((b) => {
        if (b?.avatarUrl) topResult.thumbnail = b.avatarUrl;
        if (b?.monthlyListeners) topResult.subscribers = b.monthlyListeners;
      }).catch(() => {})
    );
  } else if (topResult?.videoId) {
    enrichTasks.push(
      spotify.enrichTracksWithSpotifyStreams([topResult]).then(([enriched]) => {
        if (enriched?.spotifyStreams) topResult.spotifyStreams = enriched.spotifyStreams;
      }).catch(() => {})
    );
  }
  if (songs.length > 0) {
    enrichTasks.push(
      spotify.enrichTracksWithSpotifyStreams(songs).then((enriched) => {
        songs.splice(0, songs.length, ...enriched);
      }).catch(() => {})
    );
  }
  if (videos.length > 0) {
    enrichTasks.push(
      spotify.enrichTracksWithSpotifyStreams(videos).then((enriched) => {
        videos.splice(0, videos.length, ...enriched);
      }).catch(() => {})
    );
  }
  if (artists.length > 0) {
    enrichTasks.push(
      Promise.all(
        artists.slice(0, 8).map(async (a) => {
          const b = await spotify.getArtistSpotifyBundle(a.name).catch(() => null);
          if (b?.avatarUrl) a.thumbnail = b.avatarUrl;
          if (b?.monthlyListeners) a.subscribers = b.monthlyListeners;
        })
      )
    );
  }
  await Promise.all(enrichTasks);

  return { topResult, songs, videos, albums, artists, playlists };
}

function parseShelfList(sections) {
  const shelves = [];
  for (const sec of sections || []) {
    const carousel = sec.musicCarouselShelfRenderer;
    const shelf = sec.musicShelfRenderer;
    if (carousel) {
      const title =
        textFromRuns(carousel.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs).trim() || 'Featured';
      const items = [];
      for (const c of carousel.contents || []) {
        const item = c.musicTwoRowItemRenderer
          ? parseTwoRowItem(c.musicTwoRowItemRenderer)
          : c.musicResponsiveListItemRenderer
          ? parseResponsiveItem(c.musicResponsiveListItemRenderer)
          : null;
        if (item) items.push(item);
      }
      if (items.length > 0) shelves.push({ title, items });
    } else if (shelf) {
      const title = textFromRuns(shelf.title?.runs).trim() || 'Tracks';
      const items = [];
      for (const c of shelf.contents || []) {
        const item = c.musicResponsiveListItemRenderer
          ? parseResponsiveItem(c.musicResponsiveListItemRenderer)
          : null;
        if (item) items.push(item);
      }
      if (items.length > 0) shelves.push({ title, items });
    }
  }
  return shelves;
}

async function getHome() {
  const [homeData, exploreData] = await Promise.all([
    ytmPost('browse', { browseId: 'FEmusic_home' }).catch(() => null),
    ytmPost('browse', { browseId: 'FEmusic_explore' }).catch(() => null),
  ]);

  const homeSections =
    homeData?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer
      ?.contents || [];
  const exploreSections =
    exploreData?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer
      ?.contents || [];

  const shelves = [...parseShelfList(exploreSections), ...parseShelfList(homeSections)];
  const artistCards = [];
  const trackItems = [];
  for (const s of shelves) {
    for (const item of s.items) {
      if (item.kind === 'artist') artistCards.push(item);
      else if (item.kind === 'song' || item.kind === 'video') trackItems.push(item);
    }
  }
  await Promise.all([
    Promise.all(
      artistCards.slice(0, 12).map(async (a) => {
        const b = await spotify.getArtistSpotifyBundle(a.name).catch(() => null);
        if (b?.avatarUrl) a.thumbnail = b.avatarUrl;
        if (b?.monthlyListeners) a.subscribers = b.monthlyListeners;
      })
    ),
    spotify.enrichTracksWithSpotifyStreams(trackItems).then((enriched) => {
      for (let i = 0; i < trackItems.length; i++) {
        if (enriched[i]?.spotifyStreams) {
          trackItems[i].spotifyStreams = enriched[i].spotifyStreams;
        }
      }
    }).catch(() => {}),
  ]);
  return { shelves };
}

async function getArtist(browseId) {
  const data = await ytmPost('browse', { browseId });
  const header = data?.header?.musicImmersiveHeaderRenderer || data?.header?.musicVisualHeaderRenderer || {};
  const name = textFromRuns(header.title?.runs) || 'Artist';
  const description = textFromRuns(header.description?.runs) || '';
  const ytmThumb = pickBestThumb(
    header.foregroundThumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
      header.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails,
    800
  );
  const ytmMonthly = textFromRuns(header.monthlyListenerCount?.runs) || '';

  const sections =
    data?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer
      ?.contents || [];

  const topSongs = [];
  let topSongsBrowseId = null;
  const albums = [];
  const singles = [];
  const videos = [];
  const relatedArtists = [];
  const playlists = [];

  let albumsMore = null;
  let singlesMore = null;

  for (const sec of sections) {
    if (sec.musicShelfRenderer) {
      const shelf = sec.musicShelfRenderer;
      const title = textFromRuns(shelf.title?.runs).toLowerCase();
      if (title.includes('song')) {
        topSongsBrowseId = shelf.bottomEndpoint?.browseEndpoint?.browseId || null;
        for (const c of shelf.contents || []) {
          const item = parseResponsiveItem(c.musicResponsiveListItemRenderer, 'song');
          if (item) topSongs.push(item);
        }
      }
    } else if (sec.musicCarouselShelfRenderer) {
      const carousel = sec.musicCarouselShelfRenderer;
      const headerRenderer = carousel.header?.musicCarouselShelfBasicHeaderRenderer;
      const title = textFromRuns(headerRenderer?.title?.runs).toLowerCase();
      const moreEp = headerRenderer?.moreContentButton?.buttonRenderer?.navigationEndpoint?.browseEndpoint || null;
      if (title.includes('album') && !title.includes('single') && moreEp?.browseId) albumsMore = moreEp;
      else if (title.includes('single') && moreEp?.browseId) singlesMore = moreEp;

      for (const c of carousel.contents || []) {
        const item = c.musicTwoRowItemRenderer
          ? parseTwoRowItem(c.musicTwoRowItemRenderer)
          : parseResponsiveItem(c.musicResponsiveListItemRenderer);
        if (!item) continue;
        if (title.includes('album') && !title.includes('single')) albums.push(item);
        else if (title.includes('single')) singles.push(item);
        else if (title.includes('video') || title.includes('live')) videos.push(item);
        else if (title.includes('fans might also like') || item.kind === 'artist') relatedArtists.push(item);
        else if (title.includes('playlist')) playlists.push(item);
      }
    }
  }

  const fetchDiscographyGrid = async (ep) => {
    if (!ep?.browseId) return [];
    try {
      const d = await ytmPost('browse', { browseId: ep.browseId, ...(ep.params ? { params: ep.params } : {}) });
      const secs =
        d?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer
          ?.contents || [];
      const out = [];
      for (const s of secs) {
        const gridItems = s.gridRenderer?.items || s.musicGridRenderer?.items || [];
        for (const gi of gridItems) {
          const parsed = gi.musicTwoRowItemRenderer ? parseTwoRowItem(gi.musicTwoRowItemRenderer) : null;
          if (parsed) out.push(parsed);
        }
      }
      return out;
    } catch {
      return [];
    }
  };

  // Fetch Spotify artist bundle + full Top Songs + full Albums/Singles discographies in parallel
  const [spBundle, topPlaylist, fullAlbums, fullSingles] = await Promise.all([
    spotify.getArtistSpotifyBundle(name).catch(() => null),
    topSongsBrowseId ? getPlaylist(topSongsBrowseId, { skipSpotifyEnrich: true }).catch(() => null) : Promise.resolve(null),
    fetchDiscographyGrid(albumsMore),
    fetchDiscographyGrid(singlesMore),
  ]);

  if (fullAlbums.length > albums.length) {
    const seen = new Set(albums.map((a) => a.id));
    for (const a of fullAlbums) {
      if (a?.id && !seen.has(a.id)) {
        seen.add(a.id);
        albums.push(a);
      }
    }
  }
  if (fullSingles.length > singles.length) {
    const seen = new Set(singles.map((s) => s.id));
    for (const s of fullSingles) {
      if (s?.id && !seen.has(s.id)) {
        seen.add(s.id);
        singles.push(s);
      }
    }
  }

  // Merge exact durations from topPlaylist into topSongs (and expand to top 10!)
  const durationByVid = new Map();
  const durationByTitle = new Map();
  if (topPlaylist?.tracks?.length) {
    for (const pt of topPlaylist.tracks) {
      if (pt.videoId && pt.duration) durationByVid.set(pt.videoId, { duration: pt.duration, durationSec: pt.durationSec });
      if (pt.title && pt.duration) durationByTitle.set(pt.title.toLowerCase(), { duration: pt.duration, durationSec: pt.durationSec });
    }
    // Expand topSongs up to 10 using playlist tracks if YTM only showed 5
    for (const pt of topPlaylist.tracks) {
      if (topSongs.length >= 10) break;
      if (!topSongs.some((s) => s.videoId === pt.videoId || s.title.toLowerCase() === pt.title.toLowerCase())) {
        topSongs.push(pt);
      }
    }
  }

  const mappedTopSongs = topSongs.map((t) => {
    const durMatch = durationByVid.get(t.videoId) || durationByTitle.get((t.title || '').toLowerCase());
    const streams = spBundle?.songsEntry ? spotify.matchStreamCount(t.title, spBundle.songsEntry) : null;
    return {
      ...t,
      duration: t.duration || durMatch?.duration || '',
      durationSec: t.durationSec || durMatch?.durationSec || 0,
      ...(streams ? { spotifyStreams: streams } : {}),
    };
  });
  const enrichedTopSongs = await spotify.enrichTracksWithSpotifyStreams(mappedTopSongs, name).catch(() => mappedTopSongs);

  // Ensure ALL related artists have crisp working portraits + Spotify monthly listeners
  await Promise.all(
    relatedArtists.slice(0, 10).map(async (ra) => {
      const b = await spotify.getArtistSpotifyBundle(ra.name).catch(() => null);
      if (b?.avatarUrl) ra.thumbnail = b.avatarUrl;
      if (b?.monthlyListeners) ra.subscribers = b.monthlyListeners;
    })
  );

  return {
    id: browseId,
    name,
    description,
    thumbnail: spBundle?.avatarUrl || ytmThumb,
    banner: ytmThumb || spBundle?.avatarUrl || '',
    subscribers: spBundle?.monthlyListeners || ytmMonthly || '',
    topSongs: enrichedTopSongs,
    topSongsBrowseId,
    albums,
    singles,
    videos,
    playlists,
    relatedArtists,
  };
}

async function getAlbum(browseId) {
  const data = await ytmPost('browse', { browseId });
  const twoCol = data?.contents?.twoColumnBrowseResultsRenderer;
  const headerRenderer =
    twoCol?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.musicResponsiveHeaderRenderer ||
    data?.header?.musicDetailHeaderRenderer ||
    {};

  const title = textFromRuns(headerRenderer.title?.runs) || 'Album';
  const subtitleRuns = headerRenderer.subtitle?.runs || [];
  const secondSubtitle = textFromRuns(headerRenderer.secondSubtitle?.runs);
  const straplineRuns = headerRenderer.straplineTextOne?.runs || [];
  const meta = extractArtistsAndMeta([...straplineRuns, ...subtitleRuns]);

  const thumbnail = pickBestThumb(
    (
      headerRenderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
      headerRenderer.thumbnail?.croppedSquareThumbnailRenderer?.thumbnail?.thumbnails
    ),
    640
  );

  const trackContents =
    twoCol?.secondaryContents?.sectionListRenderer?.contents?.[0]?.musicShelfRenderer?.contents ||
    data?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer
      ?.contents?.[0]?.musicShelfRenderer?.contents ||
    [];

  const tracks = [];
  for (const c of trackContents) {
    const item = parseResponsiveItem(c.musicResponsiveListItemRenderer, 'song');
    if (item) {
      if (!item.thumbnail) item.thumbnail = thumbnail;
      if (!item.album) item.album = title;
      if (!item.albumId) item.albumId = browseId;
      if (!item.artist || item.artist === 'Unknown Artist') item.artist = meta.artistText || 'Artist';
      if (!item.artistId) item.artistId = meta.artists[0]?.id || null;
      tracks.push(item);
    }
  }

  const enrichedTracks = await spotify.enrichTracksWithSpotifyStreams(tracks, meta.artistText || '');

  return {
    id: browseId,
    title,
    artist: meta.artistText || 'Artist',
    artistId: meta.artists[0]?.id || null,
    year: meta.year,
    subtitle: textFromRuns(subtitleRuns),
    metaText: secondSubtitle,
    thumbnail,
    tracks: enrichedTracks,
  };
}

async function getPlaylist(browseId, { skipSpotifyEnrich = false } = {}) {
  const normalizedId = browseId.startsWith('VL') || browseId.startsWith('OLAK') ? browseId : `VL${browseId}`;
  const data = await ytmPost('browse', { browseId: normalizedId });
  const twoCol = data?.contents?.twoColumnBrowseResultsRenderer;
  const headerRenderer =
    twoCol?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.musicResponsiveHeaderRenderer ||
    twoCol?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]
      ?.musicEditablePlaylistDetailHeaderRenderer?.header?.musicResponsiveHeaderRenderer ||
    data?.header?.musicDetailHeaderRenderer ||
    {};

  const title = textFromRuns(headerRenderer.title?.runs) || 'Playlist';
  const subtitle = textFromRuns(headerRenderer.subtitle?.runs);
  const secondSubtitle = textFromRuns(headerRenderer.secondSubtitle?.runs);
  const strapline = textFromRuns(headerRenderer.straplineTextOne?.runs);
  const thumbnail = pickBestThumb(
    (
      headerRenderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
      headerRenderer.thumbnail?.croppedSquareThumbnailRenderer?.thumbnail?.thumbnails
    ),
    640
  );

  const trackContents =
    twoCol?.secondaryContents?.sectionListRenderer?.contents?.[0]?.musicPlaylistShelfRenderer?.contents ||
    twoCol?.secondaryContents?.sectionListRenderer?.contents?.[0]?.musicShelfRenderer?.contents ||
    data?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer
      ?.contents?.[0]?.musicPlaylistShelfRenderer?.contents ||
    [];

  const tracks = [];
  for (const c of trackContents) {
    const item = parseResponsiveItem(c.musicResponsiveListItemRenderer);
    if (item && item.videoId) tracks.push(item);
  }

  const finalTracks = skipSpotifyEnrich ? tracks : await spotify.enrichTracksWithSpotifyStreams(tracks);

  return {
    id: normalizedId,
    title,
    author: strapline || subtitle,
    subtitle,
    metaText: secondSubtitle,
    thumbnail: thumbnail || finalTracks[0]?.thumbnail || '',
    tracks: finalTracks,
  };
}

async function getUpNext(videoId, playlistId = null, { skipSpotifyEnrich = false } = {}) {
  const body = { videoId, playlistId: playlistId || `RDAMVM${videoId}`, isAudioOnly: true };
  const data = await ytmPost('next', body);

  const tabs =
    data?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs ||
    [];

  const upNextTab = tabs[0]?.tabRenderer?.content?.musicQueueRenderer;
  const queueContents = upNextTab?.content?.playlistPanelRenderer?.contents || [];

  const tracks = [];
  for (const entry of queueContents) {
    const item = entry.playlistPanelVideoRenderer;
    if (!item || !item.videoId) continue;
    const videoType =
      item.navigationEndpoint?.watchEndpoint?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig
        ?.musicVideoType || '';
    const rawSub = textFromRuns(item.longBylineText?.runs || item.shortBylineText?.runs || []);
    if (isNonMusicContent({ videoType, rawSub })) continue;
    const title = textFromRuns(item.title?.runs);
    const meta = extractArtistsAndMeta(item.longBylineText?.runs || item.shortBylineText?.runs || []);
    const dur = textFromRuns(item.lengthText?.runs);
    const thumb = pickBestThumb(item.thumbnail?.thumbnails, 544);
    tracks.push({
      kind: 'song',
      videoId: item.videoId,
      title,
      artist: meta.artistText || textFromRuns(item.shortBylineText?.runs).split('•')[0]?.trim() || 'Artist',
      artistId: meta.artists[0]?.id || null,
      artists: meta.artists,
      album: meta.album?.title || '',
      albumId: meta.album?.id || null,
      duration: dur,
      durationSec: parseDurationToSec(dur),
      thumbnail: thumb,
      isVideo: false,
    });
  }

  const lyricsBrowseId = tabs.find((t) => t.tabRenderer?.title === 'Lyrics')?.tabRenderer?.endpoint?.browseEndpoint
    ?.browseId;

  const finalTracks = skipSpotifyEnrich
    ? tracks
    : await spotify.enrichTracksWithSpotifyStreams(tracks).catch(() => tracks);
  return { tracks: finalTracks, lyricsBrowseId: lyricsBrowseId || null };
}

async function getLyrics(videoId) {
  const { lyricsBrowseId } = await getUpNext(videoId, null, { skipSpotifyEnrich: true });
  if (!lyricsBrowseId) return { lyrics: null, source: null };
  const data = await ytmPost('browse', { browseId: lyricsBrowseId });
  const shelf = data?.contents?.sectionListRenderer?.contents?.[0]?.musicDescriptionShelfRenderer;
  const lyrics = textFromRuns(shelf?.description?.runs) || null;
  const source = textFromRuns(shelf?.footer?.runs) || null;
  return { lyrics, source };
}

async function findCounterpart(title, artist, targetMode = 'video') {
  const q = `${title || ''} ${artist || ''}`.trim();
  if (!q) return null;
  const filter = targetMode === 'video' ? 'videos' : 'songs';
  const res = await search(q, filter);
  return res.items?.[0] || null;
}

module.exports = {
  getSuggestions,
  search,
  getHome,
  getArtist,
  getAlbum,
  getPlaylist,
  getUpNext,
  getLyrics,
  findCounterpart,
};
