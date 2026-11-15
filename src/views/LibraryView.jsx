import React, { useState, useEffect } from 'react';
import { Heart, Plus, ListMusic, Users, Disc3, Play, Download, X, Loader2 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { ArtistCard, AlbumCard } from '../components/MediaCards';
import TrackRow from '../components/TrackRow';
import CoverArt from '../components/CoverArt';
import PlaylistCover from '../components/PlaylistCover';

export default function LibraryView({
  initialTab = 'playlists',
  onNavigate,
  onOpenArtist,
  onOpenAlbum,
  onOpenNewPlaylist,
}) {
  const { library, playTrack, importPlaylist, showToast } = usePlayer();
  const [tab, setTab] = useState(initialTab);
  const [importOpen, setImportOpen] = useState(false);
  const [importInput, setImportInput] = useState('');
  const [importName, setImportName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!importInput.trim()) return;
    setImporting(true);
    setImportError('');
    try {
      const res = await importPlaylist({ urlOrText: importInput.trim(), name: importName.trim() });
      showToast?.(`Imported "${res?.playlist?.name || 'Playlist'}" (${res?.importedCount || 0} tracks)`);
      setImportOpen(false);
      setImportInput('');
      setImportName('');
      if (res?.playlist?.id) {
        onNavigate({ name: 'custom-playlist', id: res.playlist.id });
      }
    } catch (err) {
      setImportError(err?.message || 'Failed to import playlist');
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  const tabs = [
    { id: 'playlists', label: 'Playlists', count: library.playlists.length + 1 },
    { id: 'liked', label: 'Liked Songs', count: library.likedSongs.length },
    { id: 'artists', label: 'Followed Artists', count: library.followedArtists.length },
    { id: 'albums', label: 'Saved Albums', count: library.savedAlbums.length },
  ];

  return (
    <div className="px-8 py-6 pb-14 space-y-6 animate-view-enter">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Your Library</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setImportError('');
              setImportOpen(true);
            }}
            className="px-4 py-2 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 text-white text-xs font-bold flex items-center gap-1.5 transition"
          >
            <Download size={14} /> Import Playlist
          </button>
          <button
            onClick={onOpenNewPlaylist}
            className="px-4 py-2 rounded-full bg-emerald-400 text-black text-xs font-bold flex items-center gap-1.5 btn-glow"
          >
            <Plus size={15} /> New Playlist
          </button>
        </div>
      </div>

      {importOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleImportSubmit}
            className="w-full max-w-lg rounded-2xl bg-zinc-900 border border-white/15 p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-white">Import Playlist</h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Paste a Spotify, YouTube Music, or Amazon Music playlist link (or a tracklist).
                </p>
              </div>
              <button
                type="button"
                onClick={() => !importing && setImportOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                Spotify
              </span>
              <span className="px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/25">
                YouTube Music
              </span>
              <span className="px-2.5 py-1 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/25">
                Amazon Music
              </span>
              <span className="px-2.5 py-1 rounded-full bg-white/[0.06] text-zinc-300 border border-white/10">
                Tracklist Text
              </span>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-zinc-300">Playlist Link or Tracklist</label>
              <textarea
                rows={4}
                value={importInput}
                onChange={(e) => setImportInput(e.target.value)}
                placeholder={'https://open.spotify.com/playlist/...\nhttps://music.youtube.com/playlist?list=...\nhttps://music.amazon.com/user-playlists/...\n\nOr paste one "Song - Artist" per line'}
                required
                className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-zinc-500 outline-none focus:border-emerald-400/60 resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-300">Playlist Name (optional)</label>
              <input
                type="text"
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                placeholder="Leave blank to use original playlist title"
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-zinc-500 outline-none focus:border-emerald-400/60"
              />
            </div>

            {importError && (
              <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-xl px-3 py-2">
                {importError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={importing}
                onClick={() => setImportOpen(false)}
                className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-zinc-200 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={importing || !importInput.trim()}
                className="px-4 py-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-black text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
              >
                {importing ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Importing…
                  </>
                ) : (
                  <>
                    <Download size={14} /> Import Playlist
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="inline-flex items-center gap-1 p-1 rounded-full bg-white/[0.04] border border-white/[0.07] flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-200 active:scale-95 ${
              tab === t.id
                ? 'bg-white text-black shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            {t.label} <span className="opacity-65 ml-1">{t.count}</span>
          </button>
        ))}
      </div>

      {tab === 'playlists' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {/* Liked Songs Hero Tile */}
          <div
            onClick={() => onNavigate({ name: 'liked' })}
            className="col-span-2 p-5 rounded-2xl bg-gradient-to-br from-indigo-600 via-purple-600 to-emerald-500 cursor-pointer group flex flex-col justify-between min-h-[190px] shadow-xl hover:scale-[1.01] transition"
          >
            <div className="text-xs font-medium text-white/85 line-clamp-3">
              {library.likedSongs.slice(0, 4).map((t) => `${t.title} • ${t.artist}`).join('   ') ||
                'Heart any song to build your collection'}
            </div>
            <div className="flex items-end justify-between mt-4">
              <div>
                <h3 className="text-xl font-extrabold text-white flex items-center gap-2">
                  <Heart size={18} fill="white" /> Liked Songs
                </h3>
                <p className="text-xs text-white/80 mt-0.5">{library.likedSongs.length} songs</p>
              </div>
              {library.likedSongs.length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    playTrack(library.likedSongs[0], library.likedSongs);
                  }}
                  className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition"
                >
                  <Play size={17} fill="currentColor" className="ml-0.5" />
                </button>
              )}
            </div>
          </div>

          {library.playlists.map((pl) => {
            return (
              <div
                key={pl.id}
                onClick={() => onNavigate({ name: 'custom-playlist', id: pl.id })}
                className="group p-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.05] cursor-pointer transition"
              >
                <div className="relative aspect-square overflow-hidden mb-3">
                  <PlaylistCover playlist={pl} size="md" className="w-full h-full" />
                  {pl.tracks.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        playTrack(pl.tracks[0], pl.tracks);
                      }}
                      className="absolute bottom-2.5 right-2.5 w-10 h-10 rounded-full bg-emerald-400 text-black flex items-center justify-center shadow-xl opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition"
                    >
                      <Play size={16} fill="currentColor" className="ml-0.5" />
                    </button>
                  )}
                </div>
                <h3 className="text-sm font-bold text-white truncate">{pl.name}</h3>
                <p className="text-xs text-zinc-400 truncate mt-0.5">{pl.tracks.length} tracks</p>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'liked' && (
        <div className="space-y-1">
          {library.likedSongs.length === 0 ? (
            <p className="text-sm text-zinc-500 py-10 text-center">No liked songs yet.</p>
          ) : (
            library.likedSongs.map((t, idx) => (
              <TrackRow
                key={t.videoId}
                track={t}
                index={idx}
                trackList={library.likedSongs}
                onOpenArtist={onOpenArtist}
                onOpenAlbum={onOpenAlbum}
              />
            ))
          )}
        </div>
      )}

      {tab === 'artists' && (
        library.followedArtists.length === 0 ? (
          <div className="py-14 text-center text-zinc-500">
            <Users size={30} className="mx-auto mb-2 opacity-60" />
            <p className="text-sm">Follow artists from Search or Artist pages to see them here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {library.followedArtists.map((a) => (
              <ArtistCard key={a.id} artist={a} onOpenArtist={onOpenArtist} />
            ))}
          </div>
        )
      )}

      {tab === 'albums' && (
        library.savedAlbums.length === 0 ? (
          <div className="py-14 text-center text-zinc-500">
            <Disc3 size={30} className="mx-auto mb-2 opacity-60" />
            <p className="text-sm">Save albums to build your collection.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {library.savedAlbums.map((alb) => (
              <AlbumCard key={alb.id} album={alb} onOpenAlbum={onOpenAlbum} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
