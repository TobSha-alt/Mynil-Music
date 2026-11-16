import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PlayerProvider, usePlayer } from './context/PlayerContext';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import PlayerBar from './components/PlayerBar';
import RightDrawer from './components/RightDrawer';
import TheaterModal from './components/TheaterModal';
import PlaylistModal from './components/PlaylistModal';
import AccountModal from './components/AccountModal';
import ToastBanner from './components/ToastBanner';
import HomeView from './views/HomeView';
import SearchView from './views/SearchView';
import ArtistView from './views/ArtistView';
import AlbumView from './views/AlbumView';
import PlaylistView from './views/PlaylistView';
import LibraryView from './views/LibraryView';
import SettingsView from './views/SettingsView';
import StatsView from './views/StatsView';
import MiniPlayer from './components/MiniPlayer';

function AppShell() {
  const {
    audioRef,
    library,
    updatePref,
    togglePlay,
    seek,
    next,
    prev,
    toggleMute,
    theaterOpen,
    setTheaterOpen,
    setRightDrawer,
    isOnline,
  } = usePlayer();
  const [history, setHistory] = useState([{ name: 'home' }]);
  const [histIdx, setHistIdx] = useState(0);
  const sidebarCollapsed = Boolean(library.preferences?.sidebarCollapsed);
  const [newPlaylistOpen, setNewPlaylistOpen] = useState(false);
  const [accountStatus, setAccountStatus] = useState(null);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);

  useEffect(() => {
    window.sona
      ?.getAccountStatus?.()
      .then((st) => {
        setAccountStatus(st);
        if (st?.mode === 'guest') {
          setAccountModalOpen(true);
        }
      })
      .catch(() => {});

    const t = setTimeout(() => {
      window.sona
        ?.checkUpdates?.()
        .then((u) => {
          if (u?.updateAvailable) setUpdateInfo(u);
        })
        .catch(() => {});
    }, 4500);
    return () => clearTimeout(t);
  }, []);

  const searchInputRef = useRef(null);
  const mainScrollRef = useRef(null);

  const activeRoute = history[histIdx] || { name: 'home' };

  const navigate = useCallback(
    (route) => {
      setHistory((prev) => {
        const sliced = prev.slice(0, histIdx + 1);
        return [...sliced, route];
      });
      setHistIdx((i) => i + 1);
      if (mainScrollRef.current) mainScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [histIdx]
  );

  const goBack = useCallback(() => {
    if (histIdx > 0) setHistIdx((i) => i - 1);
  }, [histIdx]);

  const goForward = useCallback(() => {
    if (histIdx < history.length - 1) setHistIdx((i) => i + 1);
  }, [histIdx, history.length]);

  const handleSearchSubmit = useCallback(
    (q) => {
      navigate({ name: 'search', query: q });
    },
    [navigate]
  );

  const openArtist = useCallback((id) => navigate({ name: 'artist', id }), [navigate]);
  const openAlbum = useCallback((id) => navigate({ name: 'album', id }), [navigate]);
  const openPlaylist = useCallback((id) => navigate({ name: 'ytm-playlist', id }), [navigate]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (e.key === 'Escape' && theaterOpen) {
        setTheaterOpen(false);
        return;
      }

      if (typing || library.preferences?.keyboardShortcuts === false) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) next();
        else seek((audioRef.current?.currentTime || 0) + 5);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) prev();
        else seek((audioRef.current?.currentTime || 0) - 5);
      } else if (!e.metaKey && !e.ctrlKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        toggleMute();
      } else if (!e.metaKey && !e.ctrlKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setRightDrawer((d) => (d === 'lyrics' ? null : 'lyrics'));
      } else if (!e.metaKey && !e.ctrlKey && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        setRightDrawer((d) => (d === 'queue' ? null : 'queue'));
      } else if (!e.metaKey && !e.ctrlKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setTheaterOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    audioRef,
    togglePlay,
    seek,
    next,
    prev,
    toggleMute,
    theaterOpen,
    setTheaterOpen,
    setRightDrawer,
    library.preferences?.keyboardShortcuts,
  ]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#07070b] text-zinc-100 overflow-hidden">
      <div className="flex-1 min-h-0 flex">
        <Sidebar
          activeRoute={activeRoute}
          onNavigate={navigate}
          onOpenNewPlaylist={() => setNewPlaylistOpen(true)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => updatePref({ sidebarCollapsed: !sidebarCollapsed })}
        />

        <div className="flex-1 min-w-0 flex flex-col bg-gradient-to-b from-[#0e0e16] to-[#07070b]">
          <TopBar
            canGoBack={histIdx > 0}
            canGoForward={histIdx < history.length - 1}
            onBack={goBack}
            onForward={goForward}
            onSearchSubmit={handleSearchSubmit}
            onOpenArtist={openArtist}
            onOpenAlbum={openAlbum}
            searchInputRef={searchInputRef}
            sidebarCollapsed={sidebarCollapsed}
            accountStatus={accountStatus}
            onOpenAccount={() => setAccountModalOpen(true)}
          />

          <div className="flex-1 min-h-0 flex flex-col">
            {!isOnline && (
              <div className="px-6 py-2 bg-amber-500/15 border-b border-amber-400/25 text-amber-200 text-xs font-semibold flex items-center justify-between shrink-0">
                <span>Offline Mode — Showing and playing downloaded songs only</span>
              </div>
            )}
            {updateInfo?.updateAvailable && !updateDismissed && (
              <div className="px-6 py-2 bg-emerald-500/15 border-b border-emerald-400/25 text-emerald-100 text-xs font-semibold flex items-center justify-between gap-3 shrink-0">
                <span>
                  Update available: <strong>v{updateInfo.latestVersion}</strong> (you have v{updateInfo.currentVersion})
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={installingUpdate}
                    onClick={async () => {
                      setInstallingUpdate(true);
                      try {
                        const res = await window.sona.installUpdate();
                        if (!res?.ok && res?.fallbackUrl) {
                          window.open(res.fallbackUrl, '_blank');
                        }
                      } finally {
                        setInstallingUpdate(false);
                      }
                    }}
                    className="px-3 py-1 rounded-full bg-emerald-400 text-black font-bold hover:bg-emerald-300 transition disabled:opacity-60"
                  >
                    {installingUpdate ? 'Downloading…' : 'Download & Install'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setUpdateDismissed(true)}
                    className="px-2 py-1 rounded-full text-emerald-200/80 hover:text-white transition"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
            <div className="flex-1 min-h-0 flex">
            <main ref={mainScrollRef} className="flex-1 min-w-0 overflow-y-auto overscroll-contain">
              {activeRoute.name === 'home' && (
                <HomeView
                  onOpenArtist={openArtist}
                  onOpenAlbum={openAlbum}
                  onOpenPlaylist={openPlaylist}
                  onNavigate={navigate}
                />
              )}

              {activeRoute.name === 'search' && (
                <SearchView
                  query={activeRoute.query || ''}
                  onSearch={handleSearchSubmit}
                  onOpenArtist={openArtist}
                  onOpenAlbum={openAlbum}
                  onOpenPlaylist={openPlaylist}
                />
              )}

              {activeRoute.name === 'artist' && (
                <ArtistView
                  artistId={activeRoute.id}
                  onOpenArtist={openArtist}
                  onOpenAlbum={openAlbum}
                />
              )}

              {activeRoute.name === 'album' && (
                <AlbumView
                  albumId={activeRoute.id}
                  onOpenArtist={openArtist}
                  onOpenAlbum={openAlbum}
                />
              )}

              {activeRoute.name === 'liked' && (
                <PlaylistView
                  mode="liked"
                  onOpenArtist={openArtist}
                  onOpenAlbum={openAlbum}
                  onNavigate={navigate}
                />
              )}

              {activeRoute.name === 'custom-playlist' && (
                <PlaylistView
                  mode="custom"
                  playlistId={activeRoute.id}
                  onOpenArtist={openArtist}
                  onOpenAlbum={openAlbum}
                  onDeleted={() => navigate({ name: 'library' })}
                  onNavigate={navigate}
                />
              )}

              {activeRoute.name === 'ytm-playlist' && (
                <PlaylistView
                  mode="ytm"
                  playlistId={activeRoute.id}
                  onOpenArtist={openArtist}
                  onOpenAlbum={openAlbum}
                  onNavigate={navigate}
                />
              )}

              {activeRoute.name === 'library' && (
                <LibraryView
                  initialTab={activeRoute.tab}
                  onNavigate={navigate}
                  onOpenArtist={openArtist}
                  onOpenAlbum={openAlbum}
                  onOpenNewPlaylist={() => setNewPlaylistOpen(true)}
                />
              )}

              {activeRoute.name === 'stats' && (
                <StatsView
                  onOpenArtist={openArtist}
                  onOpenAlbum={openAlbum}
                  onNavigate={navigate}
                />
              )}

              {activeRoute.name === 'settings' && <SettingsView />}
            </main>

            <RightDrawer onOpenArtist={openArtist} />
            </div>
          </div>
        </div>
      </div>

      <PlayerBar onOpenArtist={openArtist} />

      <TheaterModal onOpenArtist={openArtist} />

      <PlaylistModal
        open={newPlaylistOpen}
        onClose={() => setNewPlaylistOpen(false)}
        onCreated={(id) => navigate({ name: 'custom-playlist', id })}
      />

      <AccountModal
        open={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
        accountStatus={accountStatus}
        onStatusChange={setAccountStatus}
        onOpenSettings={() => navigate({ name: 'settings' })}
      />

      <MiniPlayer />

      <ToastBanner />
    </div>
  );
}

export default function App() {
  return (
    <PlayerProvider>
      <AppShell />
    </PlayerProvider>
  );
}
