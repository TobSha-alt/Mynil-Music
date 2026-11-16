const jsonGet = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const jsonPost = async (url, body) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `HTTP ${res.status}`);
  }
  return res.json();
};

if (!window.sona) {
  window.sona = {
    getProxyBase: async () => window.location.origin,

    suggestions: (q) => jsonGet(`/api/suggestions?q=${encodeURIComponent(q || '')}`),
    search: (q, filter = 'all') =>
      jsonGet(`/api/search?q=${encodeURIComponent(q || '')}&filter=${encodeURIComponent(filter)}`),
    getHome: (refresh = false) => jsonGet(refresh ? '/api/home?refresh=1' : '/api/home'),
    getArtist: (id) => jsonGet(`/api/artist?id=${encodeURIComponent(id || '')}`),
    getAlbum: (id) => jsonGet(`/api/album?id=${encodeURIComponent(id || '')}`),
    getPlaylist: (id) => jsonGet(`/api/playlist?id=${encodeURIComponent(id || '')}`),
    getUpNext: (videoId, playlistId = null) =>
      jsonGet(
        `/api/upnext?videoId=${encodeURIComponent(videoId || '')}${
          playlistId ? `&playlistId=${encodeURIComponent(playlistId)}` : ''
        }`
      ),
    getLyrics: (track) => {
      const payload = typeof track === 'string' ? { videoId: track } : track || {};
      const params = new URLSearchParams();
      if (payload.videoId) params.set('videoId', payload.videoId);
      if (payload.title) params.set('title', payload.title);
      if (payload.artist) params.set('artist', payload.artist);
      if (payload.album) params.set('album', payload.album);
      if (payload.duration) params.set('duration', String(payload.duration));
      return jsonGet(`/api/lyrics?${params.toString()}`);
    },
    findCounterpart: (title, artist, mode = 'video') =>
      jsonGet(
        `/api/counterpart?title=${encodeURIComponent(title || '')}&artist=${encodeURIComponent(
          artist || ''
        )}&mode=${encodeURIComponent(mode)}`
      ),
    getVideoOffset: (videoId, songVideoId = '') =>
      jsonGet(
        `/api/video-offset?videoId=${encodeURIComponent(videoId || '')}&songVideoId=${encodeURIComponent(
          songVideoId || ''
        )}`
      ),

    prewarm: (videoIds) => jsonPost('/api/prewarm', { videoIds }),
    resolveStream: (videoId) => jsonGet(`/api/resolve?videoId=${encodeURIComponent(videoId || '')}`),

    getLibrary: () => jsonGet('/api/library'),
    toggleLike: (track) => jsonPost('/api/library/like', track),
    toggleFollowArtist: (artist) => jsonPost('/api/library/follow', artist),
    toggleSaveAlbum: (album) => jsonPost('/api/library/album', album),
    createPlaylist: (payload) => jsonPost('/api/library/playlist/create', payload),
    importPlaylist: (payload) => jsonPost('/api/library/playlist/import', payload),
    importMusicTaste: (payload) => jsonPost('/api/library/taste/import', payload),
    dedupePlaylists: () => jsonPost('/api/library/playlist/dedupe', {}),
    dedupePlaylistTracks: (playlistId) => jsonPost('/api/library/playlist/dedupe-tracks', { playlistId }),
    getStats: (range = 'month') => jsonGet(`/api/stats?range=${encodeURIComponent(range)}`),
    getSessionMixes: (refresh = false) => jsonGet(`/api/mixes${refresh ? '?refresh=1' : ''}`),
    updateDiscordPresence: (payload) => jsonPost('/api/discord/presence', payload),
    updatePlaylist: (id, patch) => jsonPost('/api/library/playlist/update', { id, patch }),
    deletePlaylist: (id) => jsonPost('/api/library/playlist/delete', { id }),
    addToPlaylist: (playlistId, track) => jsonPost('/api/library/playlist/add', { playlistId, track }),
    removeFromPlaylist: (playlistId, videoId) =>
      jsonPost('/api/library/playlist/remove', { playlistId, videoId }),
    reorderPlaylistTrack: (playlistId, fromIndex, toIndex) =>
      jsonPost('/api/library/playlist/reorder', { playlistId, fromIndex, toIndex }),
    recordPlay: (track) => jsonPost('/api/library/play', track),
    setPreferences: (patch) => jsonPost('/api/library/prefs', patch),
    clearHistory: () => jsonPost('/api/library/history/clear', {}),
    clearLyricsCache: () => jsonPost('/api/lyrics/cache/clear', {}),

    getAccountStatus: () => jsonGet('/api/account/status'),
    configureAccount: (payload) => jsonPost('/api/account/configure', payload),
    signUp: (payload) => jsonPost('/api/account/signup', payload),
    signIn: (payload) => jsonPost('/api/account/signin', payload),
    signOut: () => jsonPost('/api/account/signout', {}),
    syncAccount: () => jsonPost('/api/account/sync', {}),
    resetDevice: () => jsonPost('/api/account/reset-device', {}),
    resetAccount: () => jsonPost('/api/account/reset-account', {}),
    getOfflineStatus: () => jsonGet('/api/offline/status'),
    downloadOffline: (tracks) => jsonPost('/api/offline/download', { tracks }),
    deleteOffline: (videoIds) => jsonPost('/api/offline/delete', { videoIds }),
    clearOffline: () => jsonPost('/api/offline/clear', {}),
    getStatsStatus: () => jsonGet('/api/stats/status'),
    scanStats: () => jsonPost('/api/stats/scan', {}),
    getUpdaterStatus: () => jsonGet('/api/updater/status'),
    checkUpdates: () => jsonPost('/api/updater/check', {}),
    installUpdate: () => jsonPost('/api/updater/install', {}),
  };
}
