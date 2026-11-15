import React from 'react';
import { X, Trash2, Sparkles, Mic2, ListMusic, Play, Maximize2 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import Visualizer from './Visualizer';
import CoverArt from './CoverArt';
import PlayingBackdrop from './PlayingBackdrop';
import BackdropMenu from './BackdropMenu';
import SyncedLyrics from './SyncedLyrics';

export default function RightDrawer({ onOpenArtist }) {
  const {
    rightDrawer,
    setRightDrawer,
    setTheaterOpen,
    currentTrack,
    queue,
    queueIndex,
    library,
    updatePref,
    playTrack,
    removeFromQueue,
    clearUpcomingQueue,
    mediaMode,
    switchMediaMode,
  } = usePlayer();

  if (!rightDrawer) return null;

  const upcoming = queue.slice(Math.max(0, queueIndex + 1));
  const backdropMode = library.preferences?.backdrop || 'aurora';

  return (
    <aside className="relative w-80 shrink-0 border-l border-white/[0.06] bg-[#0a0a11]/95 backdrop-blur-2xl saturate-150 flex flex-col overflow-hidden animate-drawer-slide">
      {/* Live Animated Backdrop when Lyrics are showing & a track is loaded */}
      {rightDrawer === 'lyrics' && currentTrack && (
        <PlayingBackdrop mode={backdropMode} compact />
      )}

      {/* Segmented Header */}
      <div className="relative z-20 h-14 px-4 flex items-center justify-between gap-2 border-b border-white/[0.06]">
        <div className="relative grid grid-cols-2 w-40 p-1 rounded-full bg-white/[0.05] border border-white/[0.07]">
          <div
            className={`absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-full bg-white/[0.15] shadow transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              rightDrawer === 'lyrics' ? 'translate-x-full' : 'translate-x-0'
            }`}
          />
          <button
            onClick={() => setRightDrawer('queue')}
            className={`relative z-10 py-1 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
              rightDrawer === 'queue' ? 'text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <ListMusic size={13} /> Queue
          </button>
          <button
            onClick={() => setRightDrawer('lyrics')}
            className={`relative z-10 py-1 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
              rightDrawer === 'lyrics' ? 'text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Mic2 size={13} /> Lyrics
          </button>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {rightDrawer === 'lyrics' && currentTrack && (
            <button
              onClick={() => setTheaterOpen(true)}
              className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.08] transition active:scale-90"
              title="Expand Fullscreen Lyrics"
            >
              <Maximize2 size={15} />
            </button>
          )}
          <button
            onClick={() => setRightDrawer(null)}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.08] transition active:scale-90"
            title="Close Drawer"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Body */}
      {rightDrawer === 'queue' ? (
        <div className="relative z-10 flex-1 overflow-y-auto overscroll-contain p-4 space-y-5">
          {currentTrack && (
            <div className="p-3.5 rounded-2xl bg-white/[0.045] border border-white/[0.08] shadow-inner">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white mb-2.5">
                Now Playing
              </p>
              <div className="flex items-center gap-3">
                <CoverArt
                  item={currentTrack}
                  className="w-12 h-12 object-cover shadow-md ring-1 ring-white/10"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white truncate">{currentTrack.title}</p>
                  <p
                    onClick={() => currentTrack.artistId && onOpenArtist(currentTrack.artistId)}
                    className="text-xs text-zinc-400 truncate hover:text-white hover:underline cursor-pointer"
                  >
                    {currentTrack.artist}
                  </p>
                </div>
              </div>
              {library.preferences.visualizer && (
                <div className="mt-3">
                  <Visualizer height={36} barCount={28} />
                </div>
              )}
            </div>
          )}

          {/* Autoplay Radio Toggle */}
          <div className="flex items-center justify-between px-2 py-2 rounded-xl bg-white/[0.025] border border-white/[0.05]">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-white" />
              <span className="text-xs font-semibold text-zinc-200">Infinite Radio</span>
            </div>
            <button
              onClick={() => updatePref({ autoplay: !library.preferences.autoplay })}
              className={`w-9 h-5 rounded-full transition-colors duration-200 p-0.5 ${
                library.preferences.autoplay ? 'bg-white' : 'bg-white/15'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-black shadow transition-transform duration-200 ${
                  library.preferences.autoplay ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Up Next List */}
          <div>
            <div className="flex items-center justify-between mb-2.5 px-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                Next Up ({upcoming.length})
              </p>
              {upcoming.length > 0 && (
                <button
                  onClick={clearUpcomingQueue}
                  className="text-[11px] font-semibold text-zinc-400 hover:text-white transition"
                >
                  Clear
                </button>
              )}
            </div>
            {upcoming.length === 0 ? (
              <p className="text-xs text-zinc-500 py-8 text-center">
                Queue is empty. Play a song or album to start streaming!
              </p>
            ) : (
              <div className="space-y-1">
                {upcoming.map((t, i) => {
                  const realIdx = queueIndex + 1 + i;
                  return (
                    <div
                      key={`${t.videoId}-${realIdx}`}
                      onClick={() => playTrack(t, queue)}
                      className="group flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/[0.06] cursor-pointer transition-all duration-150"
                    >
                      <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-zinc-800 shrink-0 ring-1 ring-white/10">
                        <CoverArt item={t} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <Play size={13} fill="white" className="text-white" />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-zinc-100 truncate">{t.title}</p>
                        <p className="text-[11px] text-zinc-400 truncate">{t.artist}</p>
                      </div>
                      {t.duration && (
                        <span className="text-[10px] font-mono tabular-nums text-zinc-500 group-hover:hidden shrink-0">
                          {t.duration}
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromQueue(realIdx);
                        }}
                        className="p-1.5 rounded-lg text-zinc-500 hidden group-hover:flex hover:text-zinc-200 hover:bg-white/10 transition shrink-0"
                        title="Remove from queue"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="relative z-10 flex-1 min-h-0 flex flex-col">
          {currentTrack && (
            <div className="relative z-20 px-4 py-3 border-b border-white/[0.06] flex items-center justify-between gap-2 bg-black/25 backdrop-blur-md">
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-white truncate">{currentTrack.title}</h3>
                <p className="text-[11px] text-zinc-400 truncate">{currentTrack.artist}</p>
              </div>
              <div className="shrink-0">
                <BackdropMenu align="right" compact hideStarfield />
              </div>
            </div>
          )}
          <div className="flex-1 min-h-0">
            {mediaMode === 'video' ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center gap-3">
                <Mic2 size={28} className="text-zinc-500" />
                <p className="text-xs font-semibold text-zinc-300">Lyrics are only shown in Song mode</p>
                <p className="text-[11px] text-zinc-500">
                  Switch to Song mode to view synced lyrics for this track.
                </p>
                <button
                  type="button"
                  onClick={() => switchMediaMode('song')}
                  className="mt-1 px-4 py-1.5 rounded-full bg-white text-black text-xs font-bold hover:scale-105 transition"
                >
                  Switch to Song
                </button>
              </div>
            ) : (
              <SyncedLyrics variant="drawer" />
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
