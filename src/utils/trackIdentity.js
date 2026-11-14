const GENERIC_ARTISTS = new Set(['', 'artist', 'unknown artist', 'various artists']);

/**
 * Normalizes a song title by stripping release/metadata tags (e.g. feat., Explicit, Remaster)
 * while preserving distinct versions like Live, Acoustic, or Remix.
 */
export function normalizeTrackTitle(rawTitle) {
  if (!rawTitle || typeof rawTitle !== 'string') return '';
  return rawTitle
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019']/g, '')
    .replace(
      /\((?:feat\.?|ft\.?|with|from|official|audio|video|music video|lyrics?|lyric video|visualizer|explicit|clean|album version|single version|remaster(?:ed)?(?:\s*\d{4})?|\d{4}\s*remaster(?:ed)?)[^)]*\)/gi,
      ''
    )
    .replace(
      /\[(?:feat\.?|ft\.?|with|from|official|audio|video|music video|lyrics?|lyric video|visualizer|explicit|clean|album version|single version|remaster(?:ed)?(?:\s*\d{4})?|\d{4}\s*remaster(?:ed)?)[^\]]*\]/gi,
      ''
    )
    .replace(
      /\s*-\s*(?:\d{4}\s*)?(?:remaster(?:ed)?(?:\s*\d{4})?|single version|album version|explicit|clean|official (?:audio|video))\s*$/i,
      ''
    )
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts and normalizes the primary artist name so featured credits in different
 * formats across artist shelves and album tracks still correlate reliably.
 */
export function normalizePrimaryArtist(track) {
  const raw =
    (Array.isArray(track?.artists) && track.artists[0]?.name) ||
    track?.artist ||
    '';
  if (!raw || typeof raw !== 'string') return '';
  const first = raw.split(/\s*(?:,|;|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b)\s*/i)[0] || raw;
  const norm = first
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return GENERIC_ARTISTS.has(norm) ? '' : norm;
}

/**
 * Returns a canonical `<normalizedTitle>::<normalizedPrimaryArtist>` key when both
 * song title and artist are present, or an empty string if either is missing/generic.
 */
export function getTrackIdentityKey(track) {
  if (!track) return '';
  const title = normalizeTrackTitle(track.title);
  const artist = normalizePrimaryArtist(track);
  if (!title || !artist) return '';
  return `${title}::${artist}`;
}

export function tracksMatch(a, b) {
  if (!a || !b) return false;
  if (a.videoId && b.videoId && a.videoId === b.videoId) return true;
  const keyA = getTrackIdentityKey(a);
  const keyB = getTrackIdentityKey(b);
  return Boolean(keyA && keyB && keyA === keyB);
}
