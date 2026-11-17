import React, { useEffect, useState } from 'react';
import { Play, Shuffle, Bookmark, BookmarkCheck, Disc3, Download, CheckCircle2 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { extractDominantColor } from '../utils/color';
import { getCoverUrl } from '../utils/cover';
import TrackRow from '../components/TrackRow';
import CoverArt from '../components/CoverArt';

export default function AlbumView({ albumId, onOpenArtist, onOpenAlbum }) {
  const {
    playTrack,
    savedAlbumIds,
    toggleSaveAlbum,
    isOnline,
    downloadedIds,
    downloadingIds,
    openDownloadModal,
    deleteOfflineTracks,
  } = usePlayer();
  const [album, setAlbum] = useState(null);
  const [loading, setLoading] = useState(true);
  const [heroRgb, setHeroRgb] = useState('16, 185, 129');

  useEffect(() => {
    if (!albumId) return;
    let cancelled = false;
    setLoading(true);
    window.sona
      .getAlbum(albumId)
      .then((res) => {
        if (!cancelled) {
          setAlbum(res);
          setLoading(false);
          if (res?.thumbnail || res?.title) {
            extractDominantColor(
              getCoverUrl({ thumbnail: res.thumbnail, title: res.title, artist: res.artist })
            ).then(setHeroRgb);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [albumId]);

  if (loading) {
    return (
      <div className="p-8 space-y-6 animate-pulse">
        <div className="flex gap-6 items-end">
          <div className="w-48 h-48 rounded-2xl bg-white/[0.06]" />
          <div className="space-y-3 flex-1">
            <div className="h-4 w-20 rounded bg-white/[0.06]" />
            <div className="h-10 w-64 rounded bg-white/[0.08]" />
          </div>
        </div>
      </div>
    );
  }

  if (!album) return <div className="p-8 text-sm text-zinc-400">Could not load album.</div>;

  const isSaved = savedAlbumIds.has(album.id);
  const totalSec = (album.tracks || []).reduce((acc, t) => acc + (t.durationSec || 0), 0);
  const totalMins = Math.round(totalSec / 60);

  const handlePlay = (shuffle = false) => {
    if (!album.tracks?.length) return;
    const list = [...album.tracks];
    if (shuffle) list.sort(() => Math.random() - 0.5);
    playTrack(list[0], list);
  };

  return (
    <div className="relative min-h-full pb-14 animate-view-enter">
      {/* Dynamic Album Aura */}
      <div
        className="absolute inset-x-0 top-0 h-80 pointer-events-none opacity-45"
        style={{
          background: `linear-gradient(180deg, rgba(${heroRgb}, 0.45) 0%, rgba(7,7,11,0) 100%)`,
        }}
      />

      <div className="relative px-8 pt-8">
        <div className="flex flex-col sm:flex-row sm:items-end gap-6 mb-8">
          <div className="w-48 h-48 overflow-hidden bg-zinc-800 shadow-2xl ring-1 ring-white/15 shrink-0">
            <CoverArt
              src={album.thumbnail}
              title={album.title}
              artist={album.artist}
              loading="eager"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-widest text-zinc-300 mb-1.5">Album</p>
            <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight break-words">
              {album.title}
            </h1>
            <div className="flex items-center flex-wrap gap-2 text-sm text-zinc-300 mt-3">
              <span
                onClick={() => album.artistId && onOpenArtist(album.artistId)}
                className={`font-bold text-white ${
                  album.artistId ? 'hover:underline cursor-pointer' : ''
                }`}
              >
                {album.artist}
              </span>
              {album.year && (
                <>
                  <span className="text-zinc-500">•</span>
                  <span>{album.year}</span>
                </>
              )}
              {album.tracks?.length > 0 && (
                <>
                  <span className="text-zinc-500">•</span>
                  <span className="text-zinc-400">
                    {album.tracks.length} {album.tracks.length === 1 ? 'song' : 'songs'}
                    {totalMins > 0 ? `, ${totalMins} min` : ''}
                  </span>
                </>
              )}
              {album.metaText && (
                <>
                  <span className="text-zinc-500">•</span>
                  <span className="text-zinc-400">{album.metaText}</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-3 mt-5">
              <button
                onClick={() => handlePlay(false)}
                className="px-6 py-2.5 rounded-full bg-emerald-400 text-black text-xs font-bold flex items-center gap-2 btn-glow"
              >
                <Play size={15} fill="currentColor" /> Play Album
              </button>
              <button
                onClick={() => handlePlay(true)}
                className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-2 transition active:scale-95"
              >
                <Shuffle size={14} /> Shuffle
              </button>
              <button
                onClick={() =>
                  toggleSaveAlbum({
                    id: album.id,
                    title: album.title,
                    artist: album.artist,
                    artistId: album.artistId,
                    year: album.year,
                    thumbnail: album.thumbnail,
                  })
                }
                className={`px-4 py-2.5 rounded-full text-xs font-bold border flex items-center gap-1.5 transition active:scale-95 ${
                  isSaved
                    ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                    : 'bg-white/[0.06] border-white/15 text-zinc-200 hover:bg-white/15'
                }`}
              >
                {isSaved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                {isSaved ? 'Saved' : 'Save Album'}
              </button>

              {album.tracks?.length > 0 && (() => {
                const albumTracks = album.tracks.filter((t) => t?.videoId);
                const allDownloaded =
                  albumTracks.length > 0 && albumTracks.every((t) => downloadedIds.has(t.videoId));
                const anyDownloading = albumTracks.some((t) => downloadingIds.has(t.videoId));
                if (!isOnline && !allDownloaded) return null;
                return (
                  <button
                    onClick={() => {
                      if (allDownloaded) {
                        deleteOfflineTracks(albumTracks.map((t) => t.videoId));
                      } else if (isOnline) {
                        openDownloadModal(albumTracks, album?.title || 'Album');
                      }
                    }}
                    disabled={anyDownloading}
                    className={`px-4 py-2.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition ${
                      allDownloaded
                        ? 'bg-emerald-500/15 hover:bg-rose-500/20 text-emerald-300 hover:text-rose-200 border border-emerald-400/25'
                        : 'bg-white/10 hover:bg-white/20 text-white'
                    } ${anyDownloading ? 'opacity-60 cursor-wait' : ''}`}
                    title={allDownloaded ? 'Remove album downloads' : 'Download album for offline playback'}
                  >
                    {anyDownloading ? (
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    ) : allDownloaded ? (
                      <CheckCircle2 size={14} />
                    ) : (
                      <Download size={14} />
                    )}
                    {anyDownloading ? 'Downloading…' : allDownloaded ? 'Downloaded' : 'Download Album'}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Tracklist */}
        <div className="space-y-1">
          {(isOnline ? album.tracks : album.tracks.filter((t) => downloadedIds.has(t.videoId))).map((track, idx) => (
            <TrackRow
              key={`${track.videoId}-${idx}`}
              track={track}
              index={idx}
              trackList={album.tracks}
              onOpenArtist={onOpenArtist}
              onOpenAlbum={onOpenAlbum}
              showArtwork={false}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
