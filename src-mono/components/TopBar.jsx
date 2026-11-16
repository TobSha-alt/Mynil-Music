import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Search, X, Sparkles, Play, ArrowUpRight, User, Home, Library, Settings, Maximize2, Minimize2, BarChart3, PictureInPicture2 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import ArtistAvatar from './ArtistAvatar';
import CoverArt from './CoverArt';

const IS_MAC = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent || '');

export default function TopBar({
  activeRoute,
  onNavigate,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onSearchSubmit,
  onOpenArtist,
  onOpenAlbum,
  searchInputRef,
  sidebarCollapsed,
  accountStatus,
  onOpenAccount,
}) {
  const { library, playTrack, updatePref } = usePlayer();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState({ queries: [], items: [] });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const boxRef = useRef(null);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const totalStreams = Object.values(library.playCounts || {}).reduce((a, b) => a + b, 0);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSuggestions({ queries: [], items: [] });
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await window.sona.suggestions(q);
        setSuggestions(res || { queries: [], items: [] });
      } catch {
        setSuggestions({ queries: [], items: [] });
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const triggerSearch = (text) => {
    const finalQ = (text ?? query).trim();
    if (!finalQ) return;
    setQuery(finalQ);
    setDropdownOpen(false);
    setHighlightIdx(-1);
    onSearchSubmit(finalQ);
  };

  const handleKeyDown = (e) => {
    const list = suggestions.queries || [];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(list.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(-1, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIdx >= 0 && list[highlightIdx]) {
        triggerSearch(list[highlightIdx]);
      } else {
        triggerSearch(query);
      }
    } else if (e.key === 'Escape') {
      setDropdownOpen(false);
      searchInputRef?.current?.blur();
    }
  };

  return (
    <header
      className={`h-14 px-5 flex items-center justify-between gap-4 border-b border-white/[0.06] bg-[#060608]/85 backdrop-blur-2xl drag-region z-30 ${
        IS_MAC ? 'pl-24' : ''
      }`}
    >
      {/* Left: Brand + History Arrows + Primary Editorial Nav */}
      <div className="flex items-center gap-3 no-drag shrink-0">
        <div className="flex items-center gap-2 pr-2 border-r border-white/[0.08]">
          <span className="font-extrabold text-[14px] tracking-tight text-white">MYNIL</span>
          <span className="px-1.5 py-0.5 rounded bg-white/[0.07] border border-white/[0.1] text-[9px] font-mono uppercase tracking-[0.18em] text-zinc-300">
            MONO
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onBack}
            disabled={!canGoBack}
            className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] disabled:opacity-25 disabled:pointer-events-none flex items-center justify-center text-zinc-200 transition-all duration-150 active:scale-90"
            title="Back"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            onClick={onForward}
            disabled={!canGoForward}
            className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] disabled:opacity-25 disabled:pointer-events-none flex items-center justify-center text-zinc-200 transition-all duration-150 active:scale-90"
            title="Forward"
          >
            <ChevronRight size={15} />
          </button>
        </div>

        {onNavigate && (
          <nav className="hidden md:flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            {[
              { id: 'home', label: 'Home', icon: Home },
              { id: 'search', label: 'Search', icon: Search },
              { id: 'library', label: 'Library', icon: Library },
              { id: 'stats', label: 'Stats', icon: BarChart3 },
              { id: 'settings', label: 'Settings', icon: Settings },
            ].map(({ id, label, icon: Icon }) => {
              const active = activeRoute?.name === id;
              return (
                <button
                  key={id}
                  onClick={() => onNavigate({ name: id })}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all duration-150 active:scale-95 ${
                    active
                      ? 'bg-white text-black shadow-sm'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
                  }`}
                >
                  <Icon size={12} />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
        )}
      </div>

      {/* Instant Search Bar */}
      <div ref={boxRef} className="relative flex-1 max-w-md no-drag">
        <div
          className={`relative flex items-center rounded-lg transition-all duration-200 ${
            focused
              ? 'bg-[#111114] ring-1 ring-white/40 border border-white/40 shadow-[0_8px_30px_rgba(0,0,0,0.55)]'
              : 'bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08]'
          }`}
        >
          <Search
            size={15}
            className={`ml-3.5 shrink-0 transition-colors ${focused ? 'text-white' : 'text-zinc-400'}`}
          />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onFocus={() => {
              setFocused(true);
              setDropdownOpen(true);
            }}
            onBlur={() => setFocused(false)}
            onChange={(e) => {
              setQuery(e.target.value);
              setDropdownOpen(true);
              setHighlightIdx(-1);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search songs, music videos, albums, artists..."
            className="w-full h-9 px-3 bg-transparent text-[13px] text-white placeholder-zinc-400 focus:outline-none"
          />
          {query ? (
            <button
              onClick={() => {
                setQuery('');
                setSuggestions({ queries: [], items: [] });
                searchInputRef?.current?.focus();
              }}
              className="mr-3 p-1 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition"
            >
              <X size={13} />
            </button>
          ) : (
            <kbd className="mr-3 px-1.5 py-0.5 rounded-md bg-white/[0.07] border border-white/10 text-[10px] font-mono text-zinc-400 shrink-0">
              {IS_MAC ? '⌘K' : 'Ctrl+K'}
            </kbd>
          )}
        </div>

        {/* Live Suggestions Dropdown */}
        {dropdownOpen &&
          query.trim() &&
          (suggestions.queries.length > 0 || suggestions.items.length > 0) && (
            <div className="absolute left-0 right-0 top-11 rounded-2xl glass-menu p-2 z-50 animate-modal-pop">
              {suggestions.queries.length > 0 && (
                <div className="space-y-0.5">
                  <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                    Suggestions
                  </p>
                  {suggestions.queries.map((q, idx) => (
                    <button
                      key={q}
                      onClick={() => triggerSearch(q)}
                      className={`group w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-left text-[13px] transition-all duration-150 ${
                        highlightIdx === idx
                          ? 'bg-zinc-200/20 text-white'
                          : 'text-zinc-200 hover:bg-white/[0.07]'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Search size={13} className="text-zinc-400 shrink-0" />
                        <span className="truncate">{q}</span>
                      </span>
                      <ArrowUpRight
                        size={13}
                        className="text-zinc-500 opacity-0 group-hover:opacity-100 transition shrink-0"
                      />
                    </button>
                  ))}
                </div>
              )}

              {suggestions.items.length > 0 && (
                <>
                  <div className="my-2 border-t border-white/[0.08]" />
                  <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                    Jump To
                  </p>
                  <div className="space-y-0.5">
                    {suggestions.items.map((item, i) => (
                      <button
                        key={`${item.id || item.videoId}-${i}`}
                        onClick={() => {
                          setDropdownOpen(false);
                          if (item.kind === 'artist') onOpenArtist(item.id);
                          else if (item.kind === 'album') onOpenAlbum(item.id);
                          else if (item.videoId) playTrack(item);
                        }}
                        className="group w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/[0.08] transition-all duration-150 text-left"
                      >
                        {item.kind === 'artist' ? (
                          <ArtistAvatar
                            name={item.name}
                            src={item.thumbnail}
                            className="w-9 h-9 object-cover shrink-0 rounded-full ring-1 ring-white/10"
                          />
                        ) : (
                          <CoverArt
                            item={item}
                            className={`w-9 h-9 object-cover shrink-0 ring-1 ring-white/10 ${
                              item.kind === 'album' || item.kind === 'playlist' ? '' : 'rounded-lg'
                            }`}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-white truncate">
                            {item.title || item.name}
                          </p>
                          <p className="text-[11px] text-zinc-400 truncate capitalize">
                            {item.kind} {item.artist ? `• ${item.artist}` : ''}
                          </p>
                        </div>
                        {item.videoId && (
                          <div className="w-7 h-7 rounded-full bg-white/15 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                            <Play size={12} fill="currentColor" className="ml-0.5" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
      </div>

      {/* Right Controls: Streams Pill + Account Button */}
      <div className="flex items-center gap-2 no-drag shrink-0">
        {library.preferences?.showPlayCounts && (
          <div className="hidden lg:flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.07] flex items-center gap-2 text-xs text-zinc-300 shadow-inner">
              <Sparkles size={13} className="text-white" />
              <span className="font-mono font-semibold text-white tabular-nums">{totalStreams}</span>
              <span className="text-zinc-400">streams</span>
            </div>
          </div>
        )}

        <button
          onClick={onOpenAccount}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition active:scale-95 ${
            accountStatus?.mode === 'account'
              ? 'bg-zinc-200/15 hover:bg-zinc-200/25 border-white/30 text-white'
              : 'bg-white/[0.06] hover:bg-white/[0.13] border-white/[0.08] text-zinc-200'
          }`}
          title={
            accountStatus?.mode === 'account'
              ? `Signed in as @${accountStatus.user?.username} (Synced)`
              : 'Guest Mode — Click to Sign In or Create Account'
          }
        >
          <span
            className={`w-2 h-2 rounded-full ${
              accountStatus?.mode === 'account' ? 'bg-white' : 'bg-zinc-500'
            }`}
          />
          <User size={13} />
          <span className="hidden sm:inline">
            {accountStatus?.mode === 'account' ? `@${accountStatus.user?.username}` : 'Guest'}
          </span>
        </button>

        <button
          onClick={() => updatePref({ miniPlayerEnabled: !library.preferences?.miniPlayerEnabled })}
          className={`w-8 h-8 rounded-full border flex items-center justify-center transition active:scale-90 ${
            library.preferences?.miniPlayerEnabled
              ? 'bg-white text-black border-white'
              : 'bg-white/[0.06] hover:bg-white/[0.13] border-white/[0.08] text-zinc-200'
          }`}
          title={library.preferences?.miniPlayerEnabled ? 'Close Mini-Player' : 'Open Mini-Player'}
        >
          <PictureInPicture2 size={14} />
        </button>

        <button
          onClick={toggleFullscreen}
          className={`w-8 h-8 rounded-full border flex items-center justify-center transition active:scale-90 ${
            isFullscreen
              ? 'bg-white text-black border-white'
              : 'bg-white/[0.06] hover:bg-white/[0.13] border-white/[0.08] text-zinc-200'
          }`}
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
        >
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>
    </header>
  );
}
