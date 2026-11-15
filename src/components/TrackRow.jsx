import React, { useState } from 'react';
import { Play, Pause, Heart, ListPlus, Film, Check, Download, CheckCircle2 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import CoverArt from './CoverArt';
import TrackActionMenu from './TrackActionMenu';
import { formatCount, formatCompactViews } from '../utils/format';

export default function TrackRow({
  track,
  index,
  trackList,
  onOpenArtist,
  onOpenAlbum,
  showArtwork = true,
  compact = false,
  playlistEdit = null,
}) {
  const {
    currentTrack,
    isPlaying,
    isBuffering,
    isTrackLiked,
    library,
    playTrack,
    togglePlay,
    toggleLike,
    playNextInQueue,
    isOnline,
    downloadedIds,
    downloadingIds,
    downloadOfflineTracks,
    deleteOfflineTracks,
  } = usePlayer();

  const isDownloaded = Boolean(track?.videoId && downloadedIds?.has(track.videoId));
  const isDownloading = Boolean(track?.videoId && downloadingIds?.has(track.videoId));
  const unavailableOffline = !isOnline && !isDownloaded;

  const [heartAnimating, setHeartAnimating] = useState(false);
  const [addedToast, setAddedToast] = useState(null);

  const isCurrent = currentTrack?.videoId === track.videoId;
  const isCurrentPlaying = isCurrent && isPlaying;
  const isLiked = isTrackLiked(track);
  const streamCount = library.playCounts?.[track.videoId] || 0;

  const handlePlay = (e) => {
    e?.stopPropagation();
    if (isCurrent) togglePlay();
    else playTrack(track, trackList);
  };

  const handleLike = (e) => {
    e.stopPropagation();
    setHeartAnimating(true);
    setTimeout(() => setHeartAnimating(false), 440);
    toggleLike(track);
  };

  const handleAddedToast = (name) => {
    setAddedToast(name);
    setTimeout(() => setAddedToast(null), 1600);
  };

  return (
    <div
      onDoubleClick={handlePlay}
      onClick={handlePlay}
      className={`group relative flex items-center rounded-xl cursor-pointer transition-all duration-200 ${
        compact ? 'gap-2.5 px-3 py-2' : 'gap-3.5 px-3.5 py-2.5'
      } ${unavailableOffline ? 'opacity-40' : ''} ${
        isCurrent
          ? 'bg-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-white/10'
          : 'hover:bg-white/[0.055]'
      }`}
    >
      {/* Index / Equalizer / Play */}
      <div className={`${compact ? 'w-5' : 'w-7'} flex items-center justify-center shrink-0 text-xs font-mono text-zinc-500`}>
        {isCurrent && isBuffering ? (
          <div className="w-4 h-4 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
        ) : isCurrentPlaying ? (
          <div className="flex items-end gap-[2px] h-3.5 group-hover:hidden">
            <span className="w-[3px] h-full rounded-full bg-emerald-400 eq-bar-1" />
            <span className="w-[3px] h-full rounded-full bg-emerald-400 eq-bar-2" />
            <span className="w-[3px] h-full rounded-full bg-emerald-400 eq-bar-3" />
          </div>
        ) : (
          <span className={`group-hover:hidden ${isCurrent ? 'text-emerald-400 font-semibold' : ''}`}>
            {index != null ? index + 1 : '•'}
          </span>
        )}
        <button
          onClick={handlePlay}
          className="hidden group-hover:flex items-center justify-center text-white hover:scale-110 active:scale-90 transition-transform"
          title={isCurrentPlaying ? 'Pause' : 'Play'}
        >
          {isCurrentPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
        </button>
      </div>

      {/* Artwork */}
      {showArtwork && (
        <div
          className={`relative ${
            compact ? 'w-10 h-10' : 'w-11 h-11'
          } rounded-lg overflow-hidden bg-zinc-800 shrink-0 shadow-md ring-1 ring-white/10`}
        >
          <CoverArt
            item={track}
            className={`w-full h-full object-cover transition duration-300 group-hover:scale-105 ${
              isCurrent ? 'brightness-90' : ''
            }`}
          />
          {track.isVideo && (
            <span className="absolute bottom-0.5 right-0.5 bg-black/80 text-[9px] px-1 py-0.5 rounded text-zinc-200 font-semibold flex items-center gap-0.5">
              <Film size={9} /> MV
            </span>
          )}
        </div>
      )}

      {/* Title & Artist */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <p
            className={`text-sm font-semibold truncate min-w-0 transition-colors ${
              isCurrent ? 'text-emerald-400' : 'text-zinc-100 group-hover:text-white'
            }`}
            title={track.title}
          >
            {track.title}
          </p>
          {track.isVideo && !showArtwork && (
            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-md bg-white/10 text-zinc-300 font-medium">
              Video
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-zinc-400 min-w-0 mt-0.5">
          <span
            onClick={(e) => {
              if (track.artistId && onOpenArtist) {
                e.stopPropagation();
                onOpenArtist(track.artistId);
              }
            }}
            className={`truncate transition-colors ${
              track.artistId && onOpenArtist ? 'hover:text-white hover:underline' : ''
            }`}
          >
            {track.artist || 'Unknown Artist'}
          </span>
          {!compact && track.album && (
            <>
              <span className="text-zinc-600 shrink-0">•</span>
              <span
                onClick={(e) => {
                  if (track.albumId && onOpenAlbum) {
                    e.stopPropagation();
                    onOpenAlbum(track.albumId);
                  }
                }}
                className={`truncate text-zinc-500 transition-colors ${
                  track.albumId && onOpenAlbum ? 'hover:text-zinc-200 hover:underline' : ''
                }`}
              >
                {track.album}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Discovery tag, Spotify stream count / feedback */}
      <div className="hidden sm:flex items-center gap-2 shrink-0 pr-1">
        {addedToast && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 animate-modal-pop">
            <Check size={11} /> {addedToast}
          </span>
        )}
        {track.discoveryTag && (
          <span
            className={`shrink-0 text-[10px] px-1.5 py-[1px] rounded-full font-semibold border ${
              track.discoveryTag === 'Niche'
                ? 'bg-sky-500/10 text-sky-300 border-sky-400/20'
                : 'bg-emerald-500/10 text-emerald-300 border-emerald-400/20'
            }`}
            title={track.discoveryGenre ? `${track.discoveryTag} • ${track.discoveryGenre}` : track.discoveryTag}
          >
            {track.discoveryTag}
          </span>
        )}
        {track.spotifyStreams ? (
          compact ? (
            <span
              className="text-xs font-mono tabular-nums text-zinc-400"
              title={`${Number(track.spotifyStreams).toLocaleString()} Spotify streams`}
            >
              {formatCount(track.spotifyStreams)}
            </span>
          ) : (
            <span
              className="text-xs font-mono tabular-nums text-zinc-400"
              title={`${Number(track.spotifyStreams).toLocaleString()} Spotify streams`}
            >
              <span className="hidden xl:inline">{Number(track.spotifyStreams).toLocaleString()}</span>
              <span className="xl:hidden">{formatCount(track.spotifyStreams)}</span>
            </span>
          )
        ) : track.views ? (
          <span
            className="text-xs font-mono tabular-nums text-zinc-500"
            title={track.views}
          >
            {compact ? formatCompactViews(track.views) : track.views}
          </span>
        ) : null}
        {library.preferences?.showPlayCounts && streamCount > 0 && !compact && (
          <span
            className="hidden lg:inline-block text-[10px] font-mono text-emerald-400/85 px-1.5 py-0.5 rounded-full bg-emerald-400/10"
            title="Your plays in Mynil"
          >
            {streamCount}×
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => {
            if (isDownloading) return;
            if (isDownloaded) deleteOfflineTracks([track.videoId]);
            else downloadOfflineTracks([track]);
          }}
          className={`rounded-lg transition-all duration-150 active:scale-90 flex items-center justify-center ${
            isDownloaded
              ? 'w-7 h-7 text-emerald-400 opacity-100 hover:text-rose-400'
              : isDownloading
              ? 'w-7 h-7 text-emerald-300 opacity-100'
              : 'w-0 h-7 overflow-hidden opacity-0 group-hover:w-7 group-hover:opacity-100 text-zinc-400 hover:text-white hover:bg-white/[0.08]'
          }`}
          title={
            isDownloading
              ? 'Downloading for offline...'
              : isDownloaded
              ? 'Downloaded offline (click to delete)'
              : 'Download for offline playback'
          }
        >
          {isDownloading ? (
            <div className="w-3.5 h-3.5 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
          ) : isDownloaded ? (
            <CheckCircle2 size={compact ? 14 : 15} />
          ) : (
            <Download size={compact ? 14 : 15} />
          )}
        </button>

        <button
          onClick={() => playNextInQueue(track)}
          className="w-0 h-7 overflow-hidden opacity-0 group-hover:w-7 group-hover:opacity-100 rounded-lg text-zinc-400 hover:text-emerald-400 hover:bg-white/[0.08] transition-all duration-150 active:scale-90 flex items-center justify-center"
          title="Play Next"
        >
          <ListPlus size={compact ? 15 : 16} />
        </button>

        <button
          onClick={handleLike}
          className={`rounded-lg transition-all duration-150 active:scale-90 flex items-center justify-center ${
            isLiked
              ? 'w-7 h-7 text-emerald-400 opacity-100'
              : compact
              ? 'w-0 h-7 overflow-hidden opacity-0 group-hover:w-7 group-hover:opacity-100 text-zinc-500 hover:text-white'
              : 'w-7 h-7 text-zinc-500 opacity-0 group-hover:opacity-100 hover:text-white'
          } ${heartAnimating ? 'animate-heart-pop' : ''}`}
          title={isLiked ? 'Remove from Liked Songs' : 'Like Song'}
        >
          <Heart size={compact ? 15 : 16} fill={isLiked ? 'currentColor' : 'none'} />
        </button>

        <TrackActionMenu
          track={track}
          trackList={trackList}
          index={index}
          onOpenArtist={onOpenArtist}
          onOpenAlbum={onOpenAlbum}
          playlistEdit={playlistEdit}
          onAddedToPlaylist={handleAddedToast}
          iconSize={15}
        />

        <span className="w-11 text-right text-xs font-mono tabular-nums text-zinc-500">
          {track.duration || '—'}
        </span>
      </div>
    </div>
  );
}
