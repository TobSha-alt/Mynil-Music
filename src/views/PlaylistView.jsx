import React, { useEffect, useState } from 'react';
import { Play, Shuffle, Heart, Pencil, Trash2, CopyPlus, Search, ListMusic, Download, CheckCircle2 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import TrackRow from '../components/TrackRow';
import PlaylistModal from '../components/PlaylistModal';
import CoverArt from '../components/CoverArt';
import PlaylistCover from '../components/PlaylistCover';

export default function PlaylistView({
  mode, // 'liked' | 'custom' | 'ytm'
  playlistId,
  onOpenArtist,
  onOpenAlbum,
  onDeleted,
  onNavigate,
}) {
  const {
    library,
    playTrack,
    createPlaylist,
    deletePlaylist,
    isOnline,
    downloadedIds,
    downloadingIds,
    downloadOfflineTracks,
    deleteOfflineTracks,
  } = usePlayer();
  const [ytmData, setYtmData] = useState(null);
  const [loading, setLoading] = useState(mode === 'ytm');
  const [filterText, setFilterText] = useState('');
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    if (mode !== 'ytm' || !playlistId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    window.sona
      .getPlaylist(playlistId)
      .then((res) => {
        if (!cancelled) {
          setYtmData(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, playlistId]);

  const customPl = mode === 'custom' ? library.playlists.find((p) => p.id === playlistId) : null;

  if (loading) {
    return (
      <div className="p-8 space-y-4 animate-pulse">
        <div className="h-44 rounded-3xl bg-white/[0.04]" />
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-white/[0.04]" />
        ))}
      </div>
    );
  }

  if (mode === 'custom' && !customPl) {
    return <div className="p-8 text-sm text-zinc-400">Playlist not found.</div>;
  }

  if (mode === 'ytm' && !ytmData) {
    return <div className="p-8 text-sm text-zinc-400">Could not load playlist.</div>;
  }

  const title =
    mode === 'liked' ? 'Liked Songs' : mode === 'custom' ? customPl.name : ytmData.title;
  const subtitle =
    mode === 'liked'
      ? 'Every song & music video you hearted'
      : mode === 'custom'
      ? customPl.description || 'Custom Playlist'
      : ytmData.author || ytmData.subtitle || 'YouTube Music Playlist';

  const tracks =
    mode === 'liked'
      ? library.likedSongs
      : mode === 'custom'
      ? customPl.tracks
      : ytmData.tracks || [];

  const baseTracks = filterText.trim()
    ? tracks.filter(
        (t) =>
          t.title?.toLowerCase().includes(filterText.toLowerCase()) ||
          t.artist?.toLowerCase().includes(filterText.toLowerCase())
      )
    : tracks;

  const filteredTracks = isOnline
    ? baseTracks
    : baseTracks.filter((t) => downloadedIds.has(t.videoId));

  const downloadableTracks = tracks.filter((t) => t?.videoId);
  const allDownloaded =
    downloadableTracks.length > 0 && downloadableTracks.every((t) => downloadedIds.has(t.videoId));
  const anyDownloading = downloadableTracks.some((t) => downloadingIds.has(t.videoId));

  const handleToggleOfflineAll = () => {
    if (!downloadableTracks.length) return;
    if (allDownloaded) {
      deleteOfflineTracks(downloadableTracks.map((t) => t.videoId));
    } else if (isOnline) {
      downloadOfflineTracks(downloadableTracks);
    }
  };

  const handlePlay = (shuffle = false) => {
    if (!filteredTracks.length) return;
    const list = [...filteredTracks];
    if (shuffle) list.sort(() => Math.random() - 0.5);
    playTrack(list[0], list);
  };

  const handleCloneYtm = async () => {
    if (!ytmData) return;
    const created = await createPlaylist({
      name: ytmData.title,
      description: ytmData.subtitle || '',
      initialTracks: ytmData.tracks || [],
    });
    if (created && onNavigate) {
      onNavigate({ name: 'custom-playlist', id: created.id });
    }
  };

  const handleDelete = async () => {
    if (!customPl) return;
    await deletePlaylist(customPl.id);
    if (onDeleted) onDeleted();
  };

  const coverTracks = tracks.slice(0, 4);

  return (
    <div className="relative min-h-full pb-14 animate-view-enter">
      {/* Header Gradient */}
      <div
        className={`relative px-8 pt-8 pb-8 bg-gradient-to-b ${
          mode === 'liked'
            ? 'from-indigo-600/35 via-purple-900/15 to-transparent'
            : mode === 'custom'
            ? `${customPl.gradient} bg-opacity-20`
            : 'from-emerald-600/25 via-zinc-900/20 to-transparent'
        }`}
        style={
          mode === 'custom'
            ? { backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(7,7,11,0))' }
            : undefined
        }
      >
        <div className="flex flex-col sm:flex-row sm:items-end gap-6">
          {/* Cover */}
          {mode === 'liked' ? (
            <div className="w-44 h-44 bg-gradient-to-br from-indigo-500 via-purple-500 to-emerald-400 flex items-center justify-center shadow-2xl shrink-0">
              <Heart size={64} fill="white" className="text-white drop-shadow-lg" />
            </div>
          ) : mode === 'custom' ? (
            <PlaylistCover
              playlist={customPl}
              size="lg"
              className="w-44 h-44 shadow-2xl shrink-0 ring-1 ring-white/15"
            />
          ) : (
            <CoverArt
              src={ytmData.thumbnail}
              title={title}
              className="w-44 h-44 object-cover shadow-2xl ring-1 ring-white/15 shrink-0"
            />
          )}

          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-widest text-zinc-300 mb-1.5">
              {mode === 'liked' ? 'Collection' : 'Playlist'}
            </p>
            <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight break-words">
              {title}
            </h1>
            <p className="text-sm text-zinc-300 mt-2">{subtitle}</p>
            <p className="text-xs text-zinc-400 mt-1">
              {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
            </p>

            <div className="flex items-center flex-wrap gap-3 mt-5">
              <button
                onClick={() => handlePlay(false)}
                disabled={filteredTracks.length === 0}
                className="px-6 py-2.5 rounded-full bg-emerald-400 text-black text-xs font-bold flex items-center gap-2 btn-glow disabled:opacity-40"
              >
                <Play size={15} fill="currentColor" /> Play All
              </button>
              <button
                onClick={() => handlePlay(true)}
                disabled={filteredTracks.length === 0}
                className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-2 transition active:scale-95 disabled:opacity-40"
              >
                <Shuffle size={14} /> Shuffle
              </button>

              {mode === 'custom' && (
                <>
                  <button
                    onClick={() => setEditOpen(true)}
                    className="px-4 py-2.5 rounded-full bg-white/[0.07] hover:bg-white/[0.15] text-zinc-200 text-xs font-bold flex items-center gap-1.5 transition"
                  >
                    <Pencil size={13} /> Edit
                  </button>
                  <button
                    onClick={handleDelete}
                    className="px-4 py-2.5 rounded-full bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-xs font-bold flex items-center gap-1.5 transition"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </>
              )}

              {mode === 'ytm' && (
                <button
                  onClick={handleCloneYtm}
                  className="px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 transition"
                >
                  <CopyPlus size={14} /> Save to My Playlists
                </button>
              )}

              {downloadableTracks.length > 0 && (isOnline || allDownloaded) && (
                <button
                  onClick={handleToggleOfflineAll}
                  disabled={anyDownloading}
                  className={`px-4 py-2.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition ${
                    allDownloaded
                      ? 'bg-emerald-500/15 hover:bg-rose-500/20 text-emerald-300 hover:text-rose-200 border border-emerald-400/25'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  } ${anyDownloading ? 'opacity-60 cursor-wait' : ''}`}
                  title={allDownloaded ? 'Remove offline downloads' : 'Download all songs for offline playback'}
                >
                  {anyDownloading ? (
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  ) : allDownloaded ? (
                    <CheckCircle2 size={14} />
                  ) : (
                    <Download size={14} />
                  )}
                  {anyDownloading ? 'Downloading…' : allDownloaded ? 'Downloaded' : 'Download'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Tracks */}
      <div className="px-8">
        {tracks.length > 0 && (
          <div className="relative max-w-xs mb-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter in playlist..."
              className="w-full h-9 pl-9 pr-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-400/50"
            />
          </div>
        )}

        {filteredTracks.length === 0 ? (
          <div className="py-16 text-center rounded-2xl border border-dashed border-white/10">
            <p className="text-sm font-semibold text-zinc-300">
              {tracks.length === 0 ? 'No songs here yet' : 'No matching tracks'}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              {mode === 'liked'
                ? 'Click the heart icon on any song or music video to save it here.'
                : 'Use the ⋯ menu on any song to add it to this playlist.'}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredTracks.map((track, idx) => (
              <TrackRow
                key={`${track.videoId}-${idx}`}
                track={track}
                index={idx}
                trackList={filteredTracks}
                onOpenArtist={onOpenArtist}
                onOpenAlbum={onOpenAlbum}
                playlistEdit={
                  mode === 'custom' && !filterText.trim()
                    ? { playlistId: customPl.id, total: filteredTracks.length }
                    : null
                }
              />
            ))}
          </div>
        )}
      </div>

      {mode === 'custom' && (
        <PlaylistModal open={editOpen} onClose={() => setEditOpen(false)} editing={customPl} />
      )}
    </div>
  );
}
