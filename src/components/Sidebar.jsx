import React from 'react';
import { Home, Search, Library, Heart, Plus, PanelLeftClose, PanelLeftOpen, Settings } from 'lucide-react';
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

  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'library', label: 'Your Library', icon: Library },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside
      className={`flex flex-col shrink-0 bg-[#0a0a10]/95 border-r border-white/[0.06] transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        collapsed ? 'w-[78px]' : 'w-[252px]'
      }`}
    >
      {/* Top macOS traffic-light spacer + brand */}
      <div className="h-14 pt-2 px-3.5 flex items-center justify-between drag-region">
        {!collapsed && (
          <div
            className={`flex items-center gap-2.5 no-drag ${
              typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)
                ? 'pl-[72px]'
                : 'pl-1'
            }`}
          >
            <div className="w-7 h-7 rounded-[9px] bg-gradient-to-b from-[#171b28] to-[#0a0c13] flex items-center justify-center shadow-lg shadow-emerald-500/15 ring-1 ring-white/15">
              <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" aria-hidden="true">
                <defs>
                  <linearGradient id="sonaLogoGrad" x1="10" y1="3" x2="10" y2="17" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#6ee7b7" />
                    <stop offset="55%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#0d9488" />
                  </linearGradient>
                </defs>
                <rect x="3" y="8" width="2" height="4" rx="1" fill="url(#sonaLogoGrad)" />
                <rect x="6" y="5.5" width="2" height="9" rx="1" fill="url(#sonaLogoGrad)" />
                <rect x="9" y="3" width="2" height="14" rx="1" fill="url(#sonaLogoGrad)">
                  {isPlaying && (
                    <animate attributeName="height" values="14;10;14" dur="0.9s" repeatCount="indefinite" />
                  )}
                  {isPlaying && (
                    <animate attributeName="y" values="3;5;3" dur="0.9s" repeatCount="indefinite" />
                  )}
                </rect>
                <rect x="12" y="5.5" width="2" height="9" rx="1" fill="url(#sonaLogoGrad)" />
                <rect x="15" y="8" width="2" height="4" rx="1" fill="url(#sonaLogoGrad)" />
              </svg>
            </div>
            <span className="font-extrabold text-[15px] tracking-tight text-white">Mynil</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400/80">Music</span>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className={`no-drag p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-all duration-150 active:scale-90 ${
            collapsed ? 'mx-auto mt-4' : ''
          }`}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {/* Primary Nav */}
      <nav className="px-3 py-2 space-y-1">
        {navItems.map(({ id, label, icon: Icon }) => {
          const active = activeRoute.name === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate({ name: id })}
              className={`group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200 active:scale-[0.98] ${
                active
                  ? 'bg-white/[0.1] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05]'
              } ${collapsed ? 'justify-center px-0' : ''}`}
              title={collapsed ? label : undefined}
            >
              {active && !collapsed && (
                <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.75)]" />
              )}
              <Icon
                size={18}
                className={`transition-transform duration-200 group-hover:scale-110 ${
                  active ? 'text-emerald-400' : ''
                }`}
              />
              {!collapsed && <span>{label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="mx-4 my-2.5 border-t border-white/[0.06]" />

      {/* Liked Songs shortcut */}
      <div className="px-3">
        <button
          onClick={() => onNavigate({ name: 'liked' })}
          className={`group relative w-full flex items-center gap-3 p-2 rounded-xl transition-all duration-200 active:scale-[0.98] ${
            activeRoute.name === 'liked'
              ? 'bg-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
              : 'hover:bg-white/[0.05]'
          } ${collapsed ? 'justify-center' : ''}`}
          title={collapsed ? 'Liked Songs' : undefined}
        >
          <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 via-purple-500 to-emerald-400 flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform duration-200">
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
                          hasCurrentTrack ? 'text-emerald-400' : 'text-zinc-100'
                        }`}
                      >
                        {pl.name}
                      </p>
                      <p className="text-[11px] text-zinc-500 truncate">
                        {pl.tracks.length} {pl.tracks.length === 1 ? 'track' : 'tracks'}
                      </p>
                    </div>
                    {hasCurrentTrack && isPlaying && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.9)] shrink-0" />
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
                  className="w-8 h-8 rounded-full object-cover ring-1 ring-white/15 group-hover:ring-2 group-hover:ring-emerald-400 group-hover:-translate-y-0.5 group-hover:scale-110 transition-all duration-200"
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
            className="w-9 h-9 object-cover ring-1 ring-emerald-400/50 shadow-lg"
          />
        </div>
      )}
    </aside>
  );
}
