import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Menu,
  Play,
  ListPlus,
  Plus,
  Heart,
  User,
  Disc3,
  Film,
  Copy,
  Check,
  FolderPlus,
  ArrowUp,
  ArrowDown,
  Trash2,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

export default function TrackActionMenu({
  track,
  trackList,
  index,
  onOpenArtist,
  onOpenAlbum,
  playlistEdit = null,
  onAddedToPlaylist,
  buttonClassName = '',
  iconSize = 15,
  align = 'right',
  buttonTitle = 'Song options',
}) {
  const {
    isTrackLiked,
    library,
    playTrack,
    toggleLike,
    addToQueue,
    playNextInQueue,
    addToPlaylist,
    createPlaylist,
    removeFromPlaylist,
    reorderPlaylistTrack,
    setTheaterOpen,
    showToast,
  } = usePlayer();

  const [open, setOpen] = useState(false);
  const [openUpwards, setOpenUpwards] = useState(false);
  const [creatingPl, setCreatingPl] = useState(false);
  const [newPlName, setNewPlName] = useState('');
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const isLiked = isTrackLiked(track);

  useEffect(() => {
    if (!open) {
      setCreatingPl(false);
      setNewPlName('');
      return;
    }
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useLayoutEffect(() => {
    if (open && wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect();
      setOpenUpwards(window.innerHeight - rect.bottom < 340);
    }
  }, [open]);

  useEffect(() => {
    if (creatingPl) {
      inputRef.current?.focus();
    }
  }, [creatingPl]);

  if (!track?.videoId) return null;

  const handleToggle = (e) => {
    e.stopPropagation();
    setOpen((o) => !o);
  };

  const handleAddToPlaylist = async (pl) => {
    await addToPlaylist(pl.id, track);
    onAddedToPlaylist?.(pl.name);
    setOpen(false);
  };

  const handleCreatePlaylist = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const trimmed = newPlName.trim();
    if (!trimmed) return;
    await createPlaylist({ name: trimmed, initialTracks: [track] });
    onAddedToPlaylist?.(trimmed);
    setOpen(false);
  };

  const handleCopyInfo = () => {
    const label = track.artist ? `${track.title} — ${track.artist}` : track.title;
    navigator.clipboard?.writeText(label).catch(() => {});
    showToast?.('Copied song title & artist');
    setOpen(false);
  };

  return (
    <div
      className="relative"
      ref={wrapRef}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={handleToggle}
        className={
          buttonClassName ||
          `p-1.5 rounded-lg transition-all duration-150 active:scale-90 ${
            open
              ? 'text-white bg-white/15'
              : 'text-zinc-400 hover:text-white hover:bg-white/10'
          }`
        }
        title={buttonTitle}
        aria-label={buttonTitle}
      >
        <Menu size={iconSize} />
      </button>

      {open && (
        <div
          className={`absolute ${
            align === 'left' ? 'left-0' : 'right-0'
          } w-60 rounded-2xl glass-menu p-1.5 z-50 animate-modal-pop ${
            openUpwards ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
        >
          <button
            type="button"
            onClick={() => {
              playTrack(track, trackList);
              setOpen(false);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-white/[0.09] hover:text-white rounded-xl transition"
          >
            <Play size={14} className="text-white" fill="currentColor" /> Play Now
          </button>

          <button
            type="button"
            onClick={() => {
              playNextInQueue(track);
              setOpen(false);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-white/[0.09] hover:text-white rounded-xl transition"
          >
            <ListPlus size={14} className="text-white" /> Play Next
          </button>

          <button
            type="button"
            onClick={() => {
              addToQueue(track);
              setOpen(false);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-white/[0.09] hover:text-white rounded-xl transition"
          >
            <Plus size={14} className="text-zinc-400" /> Add to Queue
          </button>

          <button
            type="button"
            onClick={() => {
              toggleLike(track);
              setOpen(false);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-white/[0.09] hover:text-white rounded-xl transition"
          >
            <Heart
              size={14}
              className={isLiked ? 'text-white' : 'text-zinc-400'}
              fill={isLiked ? 'currentColor' : 'none'}
            />
            {isLiked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
          </button>

          <button
            type="button"
            onClick={() => {
              playTrack({ ...track, isVideo: true }, trackList, { mode: 'video' });
              setTheaterOpen(true);
              setOpen(false);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-white/[0.09] hover:text-white rounded-xl transition"
          >
            <Film size={14} className="text-zinc-400" /> Watch Music Video
          </button>

          {(track.artistId && onOpenArtist) || (track.albumId && onOpenAlbum) ? (
            <>
              <div className="my-1.5 border-t border-white/[0.08]" />
              {track.artistId && onOpenArtist && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenArtist(track.artistId);
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.09] hover:text-white rounded-xl transition"
                >
                  <User size={13} className="text-zinc-400" /> Go to Artist
                </button>
              )}
              {track.albumId && onOpenAlbum && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenAlbum(track.albumId);
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.09] hover:text-white rounded-xl transition"
                >
                  <Disc3 size={13} className="text-zinc-400" /> Go to Album
                </button>
              )}
            </>
          ) : null}

          <button
            type="button"
            onClick={handleCopyInfo}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.09] hover:text-white rounded-xl transition"
          >
            <Copy size={13} className="text-zinc-400" /> Copy Song Info
          </button>

          <div className="my-1.5 border-t border-white/[0.08]" />
          <div className="px-3 py-1 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
              Add to Playlist
            </p>
            <button
              type="button"
              onClick={() => setCreatingPl((v) => !v)}
              className="text-[10px] font-semibold text-white hover:text-white flex items-center gap-1"
            >
              <FolderPlus size={11} /> New
            </button>
          </div>

          {creatingPl && (
            <form onSubmit={handleCreatePlaylist} className="px-2 pb-1.5 flex items-center gap-1.5">
              <input
                ref={inputRef}
                type="text"
                value={newPlName}
                onChange={(e) => setNewPlName(e.target.value)}
                placeholder="Playlist name..."
                className="flex-1 min-w-0 px-2.5 py-1 rounded-lg bg-white/10 border border-white/15 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/30"
              />
              <button
                type="submit"
                className="px-2.5 py-1 rounded-lg bg-white text-black text-[11px] font-bold shrink-0"
              >
                Add
              </button>
            </form>
          )}

          <div className="max-h-36 overflow-y-auto space-y-0.5">
            {library.playlists.length === 0 ? (
              <p className="px-3 py-1.5 text-xs text-zinc-500">No playlists yet</p>
            ) : (
              library.playlists.map((pl) => {
                const exists = pl.tracks.some((t) => t.videoId === track.videoId);
                return (
                  <button
                    key={pl.id}
                    type="button"
                    onClick={() => handleAddToPlaylist(pl)}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.09] hover:text-white rounded-xl transition"
                  >
                    <span className="truncate">{pl.name}</span>
                    {exists && <Check size={12} className="text-white shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          {playlistEdit && (
            <>
              <div className="my-1.5 border-t border-white/[0.08]" />
              {index > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    reorderPlaylistTrack(playlistEdit.playlistId, index, index - 1);
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.09] rounded-xl transition"
                >
                  <ArrowUp size={13} /> Move Up
                </button>
              )}
              {index < playlistEdit.total - 1 && (
                <button
                  type="button"
                  onClick={() => {
                    reorderPlaylistTrack(playlistEdit.playlistId, index, index + 1);
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.09] rounded-xl transition"
                >
                  <ArrowDown size={13} /> Move Down
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  removeFromPlaylist(playlistEdit.playlistId, track.videoId);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/15 rounded-xl transition"
              >
                <Trash2 size={13} /> Remove from Playlist
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
