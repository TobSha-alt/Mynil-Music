import React from 'react';
import { Heart, Plus, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import ArtistAvatar from './ArtistAvatar';
import CoverArt from './CoverArt';
import PlaylistCover from './PlaylistCover';

export default function Sidebar({
  activeRoute,
  onNavigate,
  onOpenNewPlaylist,
  collapsed,
  onToggleCollapse,
}) {
  const { library, currentTrack, isPlaying } = usePlayer();

  return (
    <aside
      className={`flex flex-col shrink-0 bg-[#060608]/95 border-l border-white/[0.06] transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        collapsed ? 'w-[74px]' : 'w-[248px]'
      }`}
    >
      {/* Top Collection Header */}
      <div className="h-14 px-3.5 flex items-center justify-between border-b border-white/[0.05] drag-region">
        <button
          onClick={onToggleCollapse}
          className={`no-drag p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] text-zinc-300 hover:text-white transition-all duration-150 active:scale-90 ${
            collapsed ? 'mx-auto' : ''
          }`}
          title={collapsed ? 'Expand collection rail' : 'Collapse collection rail'}
        >
          {collapsed ? <PanelRightOpen size={15} /> : <PanelRightClose size={15} />}
        </button>
        {!collapsed && (
          <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-zinc-500">
            Collection
          </span>
        )}
      </div>

      {/* Liked Songs shortcut */}
      <div className="px-3 pt-3">
        <button
          onClick={() => onNavigate({ name: 'liked' })}
          className={`group relative w-full flex items-center gap-3 p-2 rounded-xl transition-all duration-200 active:scale-[0.98] ${
            activeRoute.name === 'liked'
              ? 'bg-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
              : 'hover:bg-white/[0.05]'
          } ${collapsed ? 'justify-center' : ''}`}
          title={collapsed ? 'Liked Songs' : undefined}
        >
          <div className="w-9 h-9 bg-gradient-to-br from-zinc-400 via-zinc-400 to-zinc-300 flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform duration-200">
            <Heart size={15} fill="white" className="text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0 text-left flex-1">
              <p className="text-[13px] font-bold text-white truncate">Liked Songs</p>
              <p className="text-[11px] text-zinc-400 truncate">
                {library.likedSongs.length} {library.likedSongs.length === 1 ? 'song' : 'songs'}
              </p>
            </div>
          )}
        </button>
      </div>

      {/* Playlists Header */}
      <div className="px-4 pt-5 pb-2 flex items-center justify-between">
        {!collapsed && (
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
            Playlists
          </span>
        )}
        <button
          onClick={onOpenNewPlaylist}
          className={`p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.09] transition-all duration-150 active:scale-90 ${
            collapsed ? 'mx-auto' : ''
          }`}
          title="Create New Playlist"
        >
          <Plus size={15} />
        </button>
      </div>

      {/* Playlists List */}
      <div className="flex-1 overflow-y-auto px-3 space-y-1 pb-2">
        {library.playlists.length === 0 && !collapsed ? (
          <button
            onClick={onOpenNewPlaylist}
            className="w-full py-3 px-3 rounded-xl border border-dashed border-white/[0.1] hover:border-white/25 hover:bg-white/[0.04] text-left transition group"
          >
            <p className="text-xs font-semibold text-zinc-300 group-hover:text-white">No playlists yet</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">Click to create one</p>
          </button>
        ) : (
          library.playlists.map((pl) => {
            const active = activeRoute.name === 'custom-playlist' && activeRoute.id === pl.id;
            const hasCurrentTrack = currentTrack && pl.tracks.some((t) => t.videoId === currentTrack.videoId);

            return (
              <button
                key={pl.id}
                onClick={() => onNavigate({ name: 'custom-playlist', id: pl.id })}
                className={`group relative w-full flex items-center gap-3 p-2 rounded-xl transition-all duration-200 active:scale-[0.98] ${
                  active
                    ? 'bg-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                    : 'hover:bg-white/[0.05]'
                } ${collapsed ? 'justify-center' : ''}`}
                title={collapsed ? pl.name : undefined}
              >
                <PlaylistCover
                  playlist={pl}
                  size="sm"
                  className="w-9 h-9 shrink-0 shadow group-hover:scale-105 transition-transform duration-200"
                />
                {!collapsed && (
                  <>
                    <div className="min-w-0 text-left flex-1">
                      <p
                        className={`text-[13px] font-semibold truncate ${
                          hasCurrentTrack ? 'text-white' : 'text-zinc-100'
                        }`}
                      >
                        {pl.name}
                      </p>
                      <p className="text-[11px] text-zinc-500 truncate">
                        {pl.tracks.length} {pl.tracks.length === 1 ? 'track' : 'tracks'}
                      </p>
                    </div>
                    {hasCurrentTrack && isPlaying && (
                      <span className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_rgba(16,185,129,0.9)] shrink-0" />
                    )}
                  </>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Followed Artists quick strip */}
      {!collapsed && library.followedArtists.length > 0 && (
        <div className="p-3.5 border-t border-white/[0.06] bg-white/[0.015]">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
              Following
            </p>
            <span className="text-[10px] font-mono text-zinc-500">{library.followedArtists.length}</span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
            {library.followedArtists.slice(0, 10).map((artist) => (
              <button
                key={artist.id}
                onClick={() => onNavigate({ name: 'artist', id: artist.id })}
                className="shrink-0 group relative"
                title={artist.name}
              >
                <ArtistAvatar
                  name={artist.name}
                  src={artist.thumbnail}
                  className="w-8 h-8 rounded-full object-cover ring-1 ring-white/15 group-hover:ring-2 group-hover:ring-white/30 group-hover:-translate-y-0.5 group-hover:scale-110 transition-all duration-200"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Subtle playing indicator if collapsed */}
      {collapsed && currentTrack && (
        <div className="p-3 flex justify-center border-t border-white/[0.06]">
          <CoverArt
            item={currentTrack}
            className="w-9 h-9 object-cover ring-1 ring-white/50 shadow-lg"
          />
        </div>
      )}
    </aside>
  );
}
