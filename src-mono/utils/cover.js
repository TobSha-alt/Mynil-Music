export function getCoverUrl(input, extra = {}) {
  const obj = typeof input === 'string' ? { thumbnail: input, ...extra } : { ...(input || {}), ...extra };
  const rawUrl = obj.thumbnail || obj.url || obj.src || '';
  if (rawUrl && (rawUrl.startsWith('/api/') || rawUrl.startsWith('data:'))) {
    return rawUrl;
  }

  const params = new URLSearchParams();
  if (rawUrl) params.set('url', rawUrl);
  if (obj.videoId) params.set('videoId', obj.videoId);
  if (obj.title) params.set('title', obj.title);
  if (obj.artist) params.set('artist', obj.artist);
  return `/api/cover?${params.toString()}`;
}
