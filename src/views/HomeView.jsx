import React, { useEffect, useState } from 'react';
import { Play, Sparkles, TrendingUp, Flame, Heart, Disc3, RefreshCw } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { getGreeting } from '../utils/format';
import { AlbumCard, ArtistCard, PlaylistCard, VideoCard } from '../components/MediaCards';
import TrackRow from '../components/TrackRow';
import CoverArt from '../components/CoverArt';

const MOOD_CHIPS = [
  { label: '90s & Classic Rock', query: 'classic rock hits' },
  { label: 'Late Night R&B', query: 'late night R&B' },
  { label: 'Deep Focus', query: 'ambient chill electronic' },
  { label: 'Indie Anthems', query: 'indie rock favorites' },
  { label: 'Hip-Hop Essentials', query: 'hip hop hits' },
  { label: 'Workout Energy', query: 'high energy workout hits' },
];

export default function HomeView({ onOpenArtist, onOpenAlbum, onOpenPlaylist, onNavigate }) {
  const { library, playTrack, createPlaylist, currentTrack, isPlaying, accentRgb, showToast } = usePlayer();
  const [shelves, setShelves] = useState([]);
  const [sessionMixes, setSessionMixes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshingMix, setRefreshingMix] = useState(false);
  const [mixFilter, setMixFilter] = useState('all'); // 'all' | 'Popular' | 'Niche'

  const loadHome = (refresh = false) => {
    if (refresh) setRefreshingMix(true);
    return Promise.all([
      window.sona.getHome(refresh).then((res) => setShelves(res?.shelves || [])),
      window.sona.getSessionMixes?.(refresh).then((res) => setSessionMixes(res?.mixes || [])),
    ])
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        setRefreshingMix(false);
      });
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      window.sona.getHome(false).then((res) => {
        if (!cancelled) {
          setShelves(res?.shelves || []);
          setLoading(false);
        }
      }),
      window.sona.getSessionMixes?.(false).then((res) => {
        if (!cancelled) setSessionMixes(res?.mixes || []);
      }),
    ]).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRefreshMix = async () => {
    if (refreshingMix) return;
    await loadHome(true);
    showToast?.('Refreshed your genre mix');
  };

  const quickHistory = library.history.slice(0, 6);

  return (
    <div className="relative min-h-full pb-12 animate-view-enter">
      {/* Ambient top gradient */}
      <div
        className="absolute inset-x-0 top-0 h-80 pointer-events-none opacity-35 transition-all duration-700"
        style={{
          background: `radial-gradient(ellipse at 20% 0%, rgba(${accentRgb}, 0.55), transparent 65%)`,
        }}
      />

      <div className="relative px-8 pt-6 space-y-10">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-1.5 mb-1">
                <Sparkles size={12} /> Instant Stream
              </p>
              <h1 className="text-3xl font-extrabold tracking-tight text-white">{getGreeting()}</h1>
            </div>

            {library.likedSongs.length > 0 && (
              <button
                onClick={() => onNavigate({ name: 'liked' })}
                className="px-4 py-2 rounded-full bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 text-xs font-semibold text-white flex items-center gap-2 transition active:scale-95"
              >
                <Heart size={13} className="text-emerald-400" fill="currentColor" />
                {library.likedSongs.length} Liked Songs
              </button>
            )}
          </div>

          {/* Quick Vibe Chips */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {MOOD_CHIPS.map((m) => (
              <button
                key={m.label}
                onClick={() => onNavigate({ name: 'search', query: m.query })}
                className="shrink-0 px-3.5 py-1.5 rounded-full bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.07] hover:border-white/[0.16] text-xs font-semibold text-zinc-300 hover:text-white transition-all duration-150 active:scale-95"
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Jump Back In Grid */}
        {quickHistory.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-white mb-3.5">Jump Back In</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {quickHistory.map((track) => {
                const active = currentTrack?.videoId === track.videoId;
                return (
                  <div
                    key={track.videoId}
                    onClick={() => playTrack(track, quickHistory)}
                    className={`group flex items-center gap-3.5 pr-3 rounded-xl overflow-hidden cursor-pointer border transition-all duration-200 ${
                      active
                        ? 'bg-white/[0.12] border-emerald-400/40 shadow-lg'
                        : 'bg-white/[0.05] hover:bg-white/[0.1] border-white/[0.06]'
                    }`}
                  >
                    <CoverArt
                      item={track}
                      className="w-14 h-14 object-cover shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-bold truncate ${active ? 'text-emerald-400' : 'text-white'}`}>
                        {track.title}
                      </p>
                      <p className="text-xs text-zinc-400 truncate">{track.artist}</p>
                    </div>
                    {active && isPlaying ? (
                      <div className="flex items-end gap-[2px] h-3.5 mr-1 shrink-0">
                        <span className="w-[3px] h-full rounded-full bg-emerald-400 eq-bar-1" />
                        <span className="w-[3px] h-full rounded-full bg-emerald-400 eq-bar-2" />
                        <span className="w-[3px] h-full rounded-full bg-emerald-400 eq-bar-3" />
                      </div>
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-emerald-400 text-black flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all shrink-0">
                        <Play size={16} fill="currentColor" className="ml-0.5" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Followed Artists */}
        {library.followedArtists.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3.5">
              <h2 className="text-lg font-bold text-white">Artists You Follow</h2>
              <button
                onClick={() => onNavigate({ name: 'library', tab: 'artists' })}
                className="text-xs font-semibold text-zinc-400 hover:text-white transition"
              >
                See all
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {library.followedArtists.slice(0, 6).map((artist) => (
                <ArtistCard key={artist.id} artist={artist} onOpenArtist={onOpenArtist} />
              ))}
            </div>
          </section>
        )}

        {/* Dynamic Session Playlists */}
        {sessionMixes.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles size={17} className="text-emerald-400" />
                <h2 className="text-lg font-bold text-white">Made For You This Session</h2>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {sessionMixes.map((mix) => (
                <div
                  key={mix.id}
                  onClick={() => mix.tracks?.[0] && playTrack(mix.tracks[0], mix.tracks)}
                  className="p-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] cursor-pointer transition group flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <CoverArt item={mix.tracks?.[0]} className="w-11 h-11 rounded-lg object-cover shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">{mix.name}</p>
                        <p className="text-[11px] text-zinc-400">{mix.tracks?.length || 0} tracks</p>
                      </div>
                    </div>
                    <p className="text-xs text-zinc-400 line-clamp-2 mt-1">{mix.subtitle}</p>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => mix.tracks?.[0] && playTrack(mix.tracks[0], mix.tracks)}
                      className="px-3 py-1.5 rounded-full bg-emerald-400 text-black text-xs font-bold flex items-center gap-1"
                    >
                      <Play size={11} fill="currentColor" /> Play
                    </button>
                    <button
                      onClick={async () => {
                        const created = await createPlaylist({
                          name: mix.name,
                          description: mix.subtitle,
                          initialTracks: mix.tracks,
                        });
                        showToast?.(`Saved "${mix.name}" to My Playlists`);
                        if (created?.id) onNavigate({ name: 'custom-playlist', id: created.id });
                      }}
                      className="px-3 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.15] text-white text-xs font-semibold"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Live YouTube Music Shelves */}
        {loading ? (
          <div className="space-y-8">
            {[0, 1].map((s) => (
              <div key={s}>
                <div className="h-5 w-48 rounded-full skeleton-shimmer mb-4" />
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
                      <div className="aspect-square rounded-xl skeleton-shimmer mb-3" />
                      <div className="h-3.5 w-3/4 rounded-full skeleton-shimmer mb-2" />
                      <div className="h-3 w-1/2 rounded-full skeleton-shimmer" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          shelves.map((shelf, sIdx) => {
            if (shelf.kind === 'basedOnHistory') {
              const allSongs = shelf.items || [];
              const songs =
                mixFilter === 'all'
                  ? allSongs
                  : allSongs.filter((t) => t.discoveryTag === mixFilter);
              return (
                <section key={`based-on-history-${sIdx}`}>
                  <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Disc3 size={18} className="text-emerald-400" />
                        <h2 className="text-lg font-bold text-white">{shelf.title}</h2>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap mt-1.5">
                        <span className="text-xs text-zinc-400">
                          {shelf.seedCount > 0
                            ? `Popular hits & niche cuts from your last ${shelf.seedCount} ${
                                shelf.seedCount === 1 ? 'song' : 'songs'
                              }:`
                            : 'Starter popular & niche mix — play songs to tailor:'}
                        </span>
                        {(shelf.genres || []).map((g) => (
                          <button
                            key={g}
                            onClick={() => onNavigate({ name: 'search', query: g })}
                            className="px-2.5 py-0.5 rounded-full bg-emerald-400/10 hover:bg-emerald-400/20 border border-emerald-400/20 text-[11px] font-semibold text-emerald-300 transition active:scale-95"
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                      <div className="flex items-center p-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] font-semibold">
                        {[
                          { id: 'all', label: 'All' },
                          { id: 'Popular', label: 'Popular' },
                          { id: 'Niche', label: 'Niche' },
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            onClick={() => setMixFilter(tab.id)}
                            className={`px-2.5 py-1 rounded-full transition ${
                              mixFilter === tab.id
                                ? 'bg-white text-black shadow-sm'
                                : 'text-zinc-400 hover:text-white'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={handleRefreshMix}
                        disabled={refreshingMix}
                        className="px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-zinc-200 flex items-center gap-1.5 transition active:scale-95 disabled:opacity-60"
                        title="Shuffle a fresh set of popular & niche tracks"
                      >
                        <RefreshCw size={12} className={refreshingMix ? 'animate-spin' : ''} />
                        Refresh
                      </button>
                      {songs.length > 0 && (
                        <button
                          onClick={() => playTrack(songs[0], songs)}
                          className="px-3.5 py-1.5 rounded-full bg-emerald-400 hover:bg-emerald-300 text-black text-xs font-bold flex items-center gap-1.5 shadow-lg transition active:scale-95"
                        >
                          <Play size={12} fill="currentColor" />
                          Play Mix
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5 bg-white/[0.02] border border-white/[0.05] rounded-2xl p-2">
                    {songs.slice(0, 12).map((t, i) => (
                      <TrackRow
                        key={t.videoId}
                        track={t}
                        index={i}
                        trackList={songs}
                        onOpenArtist={onOpenArtist}
                        onOpenAlbum={onOpenAlbum}
                        compact
                      />
                    ))}
                  </div>
                </section>
              );
            }

            const songs = shelf.items.filter((i) => i.kind === 'song');
            const videos = shelf.items.filter((i) => i.kind === 'video');
            const cards = shelf.items.filter((i) => i.kind === 'album' || i.kind === 'playlist' || i.kind === 'artist');

            return (
              <section key={`${shelf.title}-${sIdx}`}>
                <div className="flex items-center gap-2 mb-4">
                  {shelf.title.toLowerCase().includes('trending') ? (
                    <Flame size={18} className="text-emerald-400" />
                  ) : (
                    <TrendingUp size={18} className="text-emerald-400" />
                  )}
                  <h2 className="text-lg font-bold text-white">{shelf.title}</h2>
                </div>

                {videos.length > cards.length && videos.length >= songs.length ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {videos.slice(0, 8).map((v) => (
                      <VideoCard key={v.videoId} video={v} trackList={videos} onOpenArtist={onOpenArtist} />
                    ))}
                  </div>
                ) : songs.length > cards.length ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5 bg-white/[0.02] border border-white/[0.05] rounded-2xl p-2">
                    {songs.slice(0, 10).map((t, i) => (
                      <TrackRow
                        key={t.videoId}
                        track={t}
                        index={i}
                        trackList={songs}
                        onOpenArtist={onOpenArtist}
                        onOpenAlbum={onOpenAlbum}
                        compact
                      />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {shelf.items.slice(0, 12).map((item, idx) => {
                      if (item.kind === 'album') {
                        return <AlbumCard key={`${item.id}-${idx}`} album={item} onOpenAlbum={onOpenAlbum} />;
                      }
                      if (item.kind === 'artist') {
                        return <ArtistCard key={`${item.id}-${idx}`} artist={item} onOpenArtist={onOpenArtist} />;
                      }
                      if (item.kind === 'playlist') {
                        return <PlaylistCard key={`${item.id}-${idx}`} playlist={item} onOpenPlaylist={onOpenPlaylist} />;
                      }
                      if (item.kind === 'video') {
                        return <VideoCard key={`${item.videoId}-${idx}`} video={item} trackList={shelf.items} onOpenArtist={onOpenArtist} />;
                      }
                      return null;
                    })}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
