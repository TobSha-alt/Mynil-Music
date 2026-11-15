const ytm = require('./ytm');

const lyricsCache = new Map();
const MAX_CACHE = 300;
const LRCLIB_HEADERS = {
  'User-Agent': 'Sona/1.0 (https://github.com/sona-player)',
  Accept: 'application/json',
};

const VERSION_TAGS = [
  'live',
  'acoustic',
  'remix',
  'sped up',
  'slowed',
  'nightcore',
  'karaoke',
  'instrumental',
  'cover',
  '8d',
  'concert',
  'session',
  'demo',
  'a cappella',
  'acapella',
];

function cleanTitle(raw = '') {
  return String(raw)
    .replace(
      /\s*[\(\[]\s*(?:official\s*(?:music\s*)?(?:video|audio|lyric\s*video|visualizer)|lyrics?|lyric\s*video|visualizer|audio|hd|4k|uhd|explicit|clean|single\s*version|album\s*version|radio\s*edit|remaster(?:ed)?(?:\s*\d{4})?|\d{4}\s*remaster(?:ed)?|live(?:\s*(?:at|from)[^\)\]]*)?|feat\.?[^\)\]]*|ft\.?[^\)\]]*|with\s+[^\)\]]*|by\s+[^\)\]]+|from\s+[^\)\]]+)\s*[\)\]]/gi,
      ''
    )
    .replace(/\s+(?:feat\.?|ft\.?|with)\s+[^-–—]+$/i, '')
    .replace(
      /\s*[-–—]\s*(?:official\s*(?:music\s*)?(?:video|audio)|lyrics?|remaster(?:ed)?(?:\s*\d{4})?|\d{4}\s*remaster(?:ed)?|radio\s*edit|single\s*version|album\s*version|explicit|clean)$/i,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function stripEditionSuffix(raw = '') {
  return String(raw)
    .replace(/\s*[\(\[]\s*(?:deluxe|expanded|anniversary|taylor'?s\s*version|extended|bonus\s*track)[^\)\]]*[\)\]]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanArtist(raw = '') {
  return String(raw)
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/\s*VEVO$/i, '')
    .split(/\s*(?:,|;|feat\.?|ft\.?|•|\/)\s*/i)[0]
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCompare(str = '') {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeQuery(rawTitle = '', rawArtist = '') {
  const byMatch = String(rawTitle).match(/\(\s*by\s+([^)\]]+)\s*\)/i);
  let title = cleanTitle(rawTitle);
  let artist = cleanArtist(rawArtist);

  // If title is in "Artist - Track Title" format (common in YouTube Music Videos & Home shelves)
  const dashIdx = title.indexOf(' - ');
  if (dashIdx > 1 && dashIdx < title.length - 3) {
    const left = title.slice(0, dashIdx).trim();
    const right = title.slice(dashIdx + 3).trim();
    const leftClean = cleanArtist(left).toLowerCase();
    const aLower = artist.toLowerCase();
    if (!aLower || leftClean.includes(aLower) || aLower.includes(leftClean) || /\b(?:ft\.?|feat\.?)\b/i.test(left)) {
      title = cleanTitle(right);
      if (!artist) artist = cleanArtist(left);
    }
  }

  if (byMatch?.[1] && (!artist || /karaoke|cover|channel|music/i.test(artist))) {
    artist = cleanArtist(byMatch[1]);
  }

  return { title, artist };
}

const JUNK_LINE_RE = /^(resumen|letras|videos|escuchar|otras grabaciones|resultados principales|overview|other recordings|main results|listen|source:|fuente:|lyrics provided by|synced by|subtitles by|traducci[oó]n|letra\s*de\b)/i;
const DECORATIVE_BANNER_RE = /^[☆★✦✧✿◈❖]+\s*.+?\s*[☆★✦✧✿◈❖]+$/;

function hasScrapedUiJunk(text = '') {
  if (!text) return false;
  if (/resultados principales|otras grabaciones|other recordings|main results/i.test(text)) return true;
  const firstLines = text.split(/\r?\n/).slice(0, 12);
  let hits = 0;
  for (const l of firstLines) {
    const clean = l.replace(/\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/g, '').trim();
    if (JUNK_LINE_RE.test(clean)) hits++;
  }
  return hits >= 2;
}

function parseLrc(lrcText = '') {
  if (!lrcText || typeof lrcText !== 'string') return [];
  const rows = [];
  const timeTagRe = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  const wordTagRe = /<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g;
  let offsetSec = 0;

  for (const rawLine of lrcText.split(/\r?\n/)) {
    const offsetMatch = rawLine.match(/^\[\s*offset\s*:\s*([+-]?\d+)\s*\]$/i);
    if (offsetMatch) {
      offsetSec = (parseInt(offsetMatch[1], 10) || 0) / 1000;
      continue;
    }

    const timestamps = [];
    let match;
    timeTagRe.lastIndex = 0;
    while ((match = timeTagRe.exec(rawLine)) !== null) {
      const mins = parseInt(match[1], 10) || 0;
      const secs = parseInt(match[2], 10) || 0;
      const fracRaw = match[3] || '0';
      const frac = parseInt(fracRaw, 10) / Math.pow(10, fracRaw.length);
      timestamps.push(Math.max(0, mins * 60 + secs + frac - offsetSec));
    }
    if (timestamps.length === 0) continue;

    const text = rawLine.replace(timeTagRe, '').replace(wordTagRe, '').replace(/\s+/g, ' ').trim();
    if (text && (JUNK_LINE_RE.test(text) || DECORATIVE_BANNER_RE.test(text))) continue;
    for (const time of timestamps) {
      rows.push({
        time: Math.round(time * 1000) / 1000,
        text,
        isInstrumental: text.length === 0,
      });
    }
  }

  rows.sort((a, b) => a.time - b.time);

  // Deduplicate adjacent instrumental gaps and trim leading & trailing empties
  const cleaned = [];
  for (let i = 0; i < rows.length; i++) {
    const cur = rows[i];
    const prev = cleaned[cleaned.length - 1];
    if (cur.isInstrumental && prev?.isInstrumental) continue;
    cleaned.push(cur);
  }
  while (cleaned.length > 0 && cleaned[0].isInstrumental) {
    cleaned.shift();
  }
  while (cleaned.length > 0 && cleaned[cleaned.length - 1].isInstrumental) {
    cleaned.pop();
  }
  return cleaned;
}

function inspectLrc(lrcText = '') {
  const lines = parseLrc(lrcText);
  let vocalCount = 0;
  let nonZeroMsCount = 0;
  let lastTime = 0;
  for (const l of lines) {
    if (!l.isInstrumental) vocalCount++;
    if (l.time > lastTime) lastTime = l.time;
    if (Math.abs((l.time % 1) - 0) > 0.015) nonZeroMsCount++;
  }
  return {
    vocalCount,
    totalCount: lines.length,
    lastTime,
    hasSubsecondPrecision: vocalCount > 0 && nonZeroMsCount / Math.max(1, lines.length) >= 0.4,
  };
}

function plainToLines(plainText = '') {
  if (!plainText) return [];
  return String(plainText)
    .split(/\r?\n/)
    .map((line) => ({
      time: null,
      text: line.trim(),
      isInstrumental: line.trim().length === 0,
    }));
}

async function fetchJson(url, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: LRCLIB_HEADERS, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function scoreCandidate(item, targetTitle, targetArtist, targetDurationSec) {
  if (!item || (!item.syncedLyrics && !item.plainLyrics)) return -1e9;
  let score = 0;
  if (item.syncedLyrics) score += 220;
  else if (item.plainLyrics) score += 20;

  if (item.instrumental) score -= 150;
  if (hasScrapedUiJunk(item.syncedLyrics || item.plainLyrics || '')) score -= 500;

  const tItemRaw = (item.trackName || '').toLowerCase();
  const tGoalRaw = (targetTitle || '').toLowerCase();
  const tItem = normalizeCompare(cleanTitle(item.trackName || ''));
  const tGoal = normalizeCompare(targetTitle);
  const aItem = normalizeCompare(cleanArtist(item.artistName || ''));
  const aGoal = normalizeCompare(targetArtist);

  if (tItem && tGoal) {
    if (tItem === tGoal) score += 100;
    else if (tItem.includes(tGoal) || tGoal.includes(tItem)) score += 45;
    else score -= 45;
  }

  for (const tag of VERSION_TAGS) {
    const inItem = tItemRaw.includes(tag);
    const inGoal = tGoalRaw.includes(tag);
    if (inItem !== inGoal) {
      score -= 110;
      break;
    }
  }

  if (aGoal) {
    if (aItem === aGoal) score += 85;
    else if (aItem.includes(aGoal) || aGoal.includes(aItem)) score += 45;
    else score -= 50;
  }

  const candDur = Number(item.duration) || 0;
  if (targetDurationSec > 0 && candDur > 0) {
    const diff = Math.abs(candDur - targetDurationSec);
    if (diff === 0) score += 160;
    else if (diff <= 1) score += 135;
    else if (diff <= 2) score += 105;
    else if (diff <= 3) score += 70;
    else if (diff <= 5) score += 35;
    else if (diff <= 8) score += 0;
    else score -= Math.min(180, diff * 6);
  }

  if (item.syncedLyrics) {
    const meta = inspectLrc(item.syncedLyrics);
    if (meta.vocalCount < 4) score -= 100;
    else if (meta.vocalCount >= 12) score += 30;
    if (meta.hasSubsecondPrecision) score += 25;
    if (targetDurationSec > 0 && meta.lastTime > targetDurationSec + 12) {
      score -= 120;
    }
  }

  return score;
}

function mergeCandidates(targetMap, list) {
  if (!list) return;
  const arr = Array.isArray(list) ? list : [list];
  for (const item of arr) {
    if (!item || (!item.syncedLyrics && !item.plainLyrics)) continue;
    const key = item.id || `${item.trackName}|${item.artistName}|${item.duration}`;
    if (!targetMap.has(key)) targetMap.set(key, item);
  }
}

async function fetchFromLrclib({ title, artist, album, duration }) {
  const { title: tClean, artist: aClean } = normalizeQuery(title, artist);
  const dur = Number(duration) > 0 ? Math.round(Number(duration)) : 0;
  if (!tClean) return null;

  const candidateMap = new Map();
  const pickTop = (requireSynced = false) => {
    const items = Array.from(candidateMap.values());
    if (items.length === 0) return null;
    items.sort(
      (a, b) => scoreCandidate(b, tClean, aClean, dur) - scoreCandidate(a, tClean, aClean, dur)
    );
    const bestSynced = items.find((x) => Boolean(x?.syncedLyrics));
    if (bestSynced) return bestSynced;
    if (!requireSynced) return items[0] || null;
    return null;
  };

  // 1. Run exact /api/get + /api/search in parallel so we evaluate ALL duration & quality variants
  if (aClean) {
    const getParams = new URLSearchParams({ track_name: tClean, artist_name: aClean });
    if (album) getParams.set('album_name', album);
    if (dur > 0) getParams.set('duration', String(dur));

    const searchParams = new URLSearchParams({ track_name: tClean, artist_name: aClean });

    const [exactRes, searchList] = await Promise.all([
      fetchJson(`https://lrclib.net/api/get?${getParams.toString()}`),
      fetchJson(`https://lrclib.net/api/search?${searchParams.toString()}`),
    ]);
    mergeCandidates(candidateMap, exactRes);
    mergeCandidates(candidateMap, searchList);

    const best = pickTop(true);
    if (best) {
      const bestScore = scoreCandidate(best, tClean, aClean, dur);
      const bestDiff = dur > 0 && best.duration > 0 ? Math.abs(best.duration - dur) : 0;
      if (bestScore >= 240 && bestDiff <= 2) {
        return best;
      }
    }
  }

  // 2. Fallback queries (broad search + stripped edition tag) if still lacking an exact tight match
  const tBase = stripEditionSuffix(tClean);
  const fallbackFetches = [];
  if (aClean) {
    fallbackFetches.push(
      fetchJson(`https://lrclib.net/api/search?q=${encodeURIComponent(`${tBase} ${aClean}`.trim())}`)
    );
  }
  if (tBase && tBase !== tClean && aClean) {
    const p = new URLSearchParams({ track_name: tBase, artist_name: aClean });
    fallbackFetches.push(fetchJson(`https://lrclib.net/api/search?${p.toString()}`));
  }

  if (fallbackFetches.length > 0) {
    const results = await Promise.all(fallbackFetches);
    for (const r of results) mergeCandidates(candidateMap, r);
    const syncedHit = pickTop(true);
    if (syncedHit) {
      const s = scoreCandidate(syncedHit, tClean, aClean, dur);
      if (s >= 120) return syncedHit;
    }
  }

  // 3. Title-only last resort (handles mismatched uploaders like Topic/Channel/Soundtracks)
  const titleList = await fetchJson(`https://lrclib.net/api/search?q=${encodeURIComponent(tBase || tClean)}`);
  mergeCandidates(candidateMap, titleList);
  return pickTop(false);
}

async function getLyrics({ videoId = '', title = '', artist = '', album = '', duration = 0 } = {}) {
  const durSec = Number(duration) > 0 ? Math.round(Number(duration)) : 0;
  const cacheKey = videoId ? `${videoId}:${durSec}` : `${title}|${artist}|${durSec}`;
  if (cacheKey && lyricsCache.has(cacheKey)) {
    return lyricsCache.get(cacheKey);
  }

  let result = {
    synced: false,
    lines: [],
    lyrics: null,
    source: null,
    matchedDuration: 0,
  };

  const lrcHit = await fetchFromLrclib({ title, artist, album, duration: durSec });
  if (lrcHit?.syncedLyrics) {
    const parsed = parseLrc(lrcHit.syncedLyrics);
    if (parsed.length > 0) {
      result = {
        synced: true,
        lines: parsed,
        lyrics: parsed
          .filter((l) => !l.isInstrumental)
          .map((l) => l.text)
          .join('\n'),
        source: 'Synced via LRCLIB',
        matchedDuration: Number(lrcHit.duration) || 0,
      };
    }
  }

  if (!result.synced && lrcHit?.plainLyrics) {
    result = {
      synced: false,
      lines: plainToLines(lrcHit.plainLyrics),
      lyrics: lrcHit.plainLyrics,
      source: 'Lyrics via LRCLIB',
      matchedDuration: Number(lrcHit.duration) || 0,
    };
  } else if (!result.lyrics && videoId) {
    try {
      const ytmRes = await ytm.getLyrics(videoId);
      if (ytmRes?.lyrics) {
        result = {
          synced: false,
          lines: plainToLines(ytmRes.lyrics),
          lyrics: ytmRes.lyrics,
          source: ytmRes.source || 'YouTube Music',
          matchedDuration: 0,
        };
      }
    } catch {
      // Ignore YTM fallback failure
    }
  }

  if (cacheKey) {
    if (lyricsCache.size >= MAX_CACHE) {
      const oldestKey = lyricsCache.keys().next().value;
      lyricsCache.delete(oldestKey);
    }
    lyricsCache.set(cacheKey, result);
  }

  return result;
}

function clearCache() {
  lyricsCache.clear();
}

module.exports = { getLyrics, parseLrc, clearCache, scoreCandidate };
