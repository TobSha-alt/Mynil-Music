import React, { useEffect, useState } from 'react';
import { Play, Film, Disc3, Users, ListMusic, ListPlus, Music, Sparkles, Search as SearchIcon } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import TrackRow from '../components/TrackRow';
import TrackActionMenu from '../components/TrackActionMenu';
import ArtistAvatar from '../components/ArtistAvatar';
import CoverArt from '../components/CoverArt';
import { AlbumCard, ArtistCard, PlaylistCard, VideoCard } from '../components/MediaCards';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'songs', label: 'Songs' },
  { id: 'videos', label: 'Music Videos' },
  { id: 'albums', label: 'Albums' },
  { id: 'artists', label: 'Artists' },
  { id: 'playlists', label: 'Playlists' },
];

const QUICK_PROMPTS = [
  'The Weeknd',
  'Kendrick Lamar',
  'Daft Punk',
  'Tame Impala',
  'Billie Eilish',
  'Frank Ocean',
  'Fred again..',
  'SZA',
];

export default function SearchView({ query, onSearch, onOpenArtist, onOpenAlbum, onOpenPlaylist }) {
  const { playTrack, playNextInQueue, followedArtistIds, toggleFollowArtist } = usePlayer();
  const [filter, setFilter] = useState('all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = (query || '').trim();
    if (!q) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    window.sona
      .search(q, filter)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, filter]);

  if (!query?.trim()) {
    return (
      <div className="px-8 py-10 animate-view-enter">
        <div className="max-w-2xl">
          <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/30 flex items-center justify-center text-white mb-4">
            <SearchIcon size={22} />
          </div>
          <h1 className="text-2xl font-extrabold text-white mb-2">Instant YouTube Music Search</h1>
          <p className="text-sm text-zinc-400 mb-6">
            Search any song, music video, album, artist, or playlist. Results stream instantly.
          </p>
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3">Try Searching</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => onSearch(p)}
                className="px-4 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.14] border border-white/10 text-xs font-semibold text-zinc-200 hover:text-white transition active:scale-95"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const top = data?.topResult;

  return (
    <div className="px-8 py-6 pb-12 space-y-7 animate-view-enter">
      {/* Filter Chips */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="inline-flex items-center gap-1 p-1 rounded-full bg-white/[0.04] border border-white/[0.07] flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-200 active:scale-95 ${
                filter === f.id
                  ? 'bg-white text-black shadow-md'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-500">
          Results for <span className="text-zinc-200 font-semibold">“{query}”</span>
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-14 rounded-xl skeleton-shimmer" />
          ))}
        </div>
      ) : filter === 'all' && data ? (
        <div className="space-y-9">
          {/* Top Result + Songs */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {top && (
              <div className="lg:col-span-5">
                <h2 className="text-base font-bold text-white mb-3 flex items-center gap-1.5">
                  <Sparkles size={15} className="text-white" /> Top Result
                </h2>
                <div
                  onClick={() => {
                    if (top.kind === 'artist') onOpenArtist(top.id);
                    else if (top.kind === 'album') onOpenAlbum(top.id);
                    else if (top.videoId) playTrack(top, data.songs);
                  }}
                  className="group relative p-6 rounded-3xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] hover:from-white/[0.13] border border-white/10 cursor-pointer transition-all duration-200"
                >
                  {top.kind === 'artist' ? (
                    <ArtistAvatar
                      name={top.name}
                      src={top.thumbnail}
                      className="w-28 h-28 object-cover shadow-2xl mb-4 rounded-full bg-zinc-900"
                    />
                  ) : (
                    <CoverArt
                      item={top}
                      className="w-28 h-28 object-cover shadow-2xl mb-4"
                    />
                  )}
                  <h3 className="text-2xl font-extrabold text-white truncate">
                    {top.title || top.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-[11px] font-bold uppercase tracking-wider text-zinc-200">
                      {top.kind}
                    </span>
                    <span className="text-xs text-zinc-400 truncate">
                      {top.artist || top.subscribers || top.subtitle}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center gap-2.5 flex-wrap">
                    {top.videoId && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            playTrack(top, data.songs);
                          }}
                          className="px-5 py-2.5 rounded-full bg-white text-black text-xs font-bold flex items-center gap-1.5 btn-glow"
                        >
                          <Play size={14} fill="currentColor" /> Play Now
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            playNextInQueue(top);
                          }}
                          className="px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold text-white flex items-center gap-1.5 transition active:scale-95"
                          title="Play Next"
                        >
                          <ListPlus size={14} className="text-white" /> Play Next
                        </button>
                        <TrackActionMenu
                          track={top}
                          trackList={data.songs}
                          onOpenArtist={onOpenArtist}
                          onOpenAlbum={onOpenAlbum}
                          align="left"
                          iconSize={15}
                          buttonClassName="p-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-zinc-200 hover:text-white flex items-center justify-center transition active:scale-95"
                          buttonTitle="More song options"
                        />
                      </>
                    )}
                    {top.kind === 'artist' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFollowArtist(top);
                        }}
                        className={`px-4 py-2 rounded-full text-xs font-bold border transition ${
                          followedArtistIds.has(top.id)
                            ? 'bg-zinc-200/20 border-white/50 text-white'
                            : 'bg-white/10 border-white/15 text-white hover:bg-white/20'
                        }`}
                      >
                        {followedArtistIds.has(top.id) ? 'Following' : 'Follow'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {data.songs?.length > 0 && (
              <div className={top ? 'lg:col-span-7' : 'lg:col-span-12'}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold text-white flex items-center gap-1.5">
                    <Music size={15} className="text-white" /> Songs
                  </h2>
                  <button
                    onClick={() => setFilter('songs')}
                    className="text-xs font-semibold text-zinc-400 hover:text-white"
                  >
                    See all
                  </button>
                </div>
                <div className="space-y-1">
                  {data.songs.slice(0, 6).map((song, idx) => (
                    <TrackRow
                      key={`${song.videoId}-${idx}`}
                      track={song}
                      index={idx}
                      trackList={data.songs}
                      onOpenArtist={onOpenArtist}
                      onOpenAlbum={onOpenAlbum}
                      compact
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Music Videos */}
          {data.videos?.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3.5">
                <h2 className="text-base font-bold text-white flex items-center gap-1.5">
                  <Film size={16} className="text-white" /> Music Videos
                </h2>
                <button
                  onClick={() => setFilter('videos')}
                  className="text-xs font-semibold text-zinc-400 hover:text-white"
                >
                  See all
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {data.videos.slice(0, 4).map((v) => (
                  <VideoCard key={v.videoId} video={v} trackList={data.videos} onOpenArtist={onOpenArtist} />
                ))}
              </div>
            </section>
          )}

          {/* Artists */}
          {data.artists?.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3.5">
                <h2 className="text-base font-bold text-white flex items-center gap-1.5">
                  <Users size={16} className="text-white" /> Artists
                </h2>
                <button
                  onClick={() => setFilter('artists')}
                  className="text-xs font-semibold text-zinc-400 hover:text-white"
                >
                  See all
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {data.artists.slice(0, 6).map((a) => (
                  <ArtistCard key={a.id} artist={a} onOpenArtist={onOpenArtist} />
                ))}
              </div>
            </section>
          )}

          {/* Albums */}
          {data.albums?.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3.5">
                <h2 className="text-base font-bold text-white flex items-center gap-1.5">
                  <Disc3 size={16} className="text-white" /> Albums
                </h2>
                <button
                  onClick={() => setFilter('albums')}
                  className="text-xs font-semibold text-zinc-400 hover:text-white"
                >
                  See all
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {data.albums.slice(0, 6).map((alb) => (
                  <AlbumCard key={alb.id} album={alb} onOpenAlbum={onOpenAlbum} />
                ))}
              </div>
            </section>
          )}

          {/* Playlists */}
          {data.playlists?.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3.5">
                <h2 className="text-base font-bold text-white flex items-center gap-1.5">
                  <ListMusic size={16} className="text-white" /> Playlists
                </h2>
                <button
                  onClick={() => setFilter('playlists')}
                  className="text-xs font-semibold text-zinc-400 hover:text-white"
                >
                  See all
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {data.playlists.slice(0, 6).map((pl) => (
                  <PlaylistCard key={pl.id} playlist={pl} onOpenPlaylist={onOpenPlaylist} />
                ))}
              </div>
            </section>
          )}
        </div>
      ) : data?.items ? (
        <div>
          {filter === 'songs' && (
            <div className="space-y-1">
              {data.items.map((item, idx) => (
                <TrackRow
                  key={`${item.videoId}-${idx}`}
                  track={item}
                  index={idx}
                  trackList={data.items}
                  onOpenArtist={onOpenArtist}
                  onOpenAlbum={onOpenAlbum}
                />
              ))}
            </div>
          )}

          {filter === 'videos' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {data.items.map((v, idx) => (
                <VideoCard key={`${v.videoId}-${idx}`} video={v} trackList={data.items} onOpenArtist={onOpenArtist} />
              ))}
            </div>
          )}

          {filter === 'albums' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {data.items.map((alb, idx) => (
                <AlbumCard key={`${alb.id}-${idx}`} album={alb} onOpenAlbum={onOpenAlbum} />
              ))}
            </div>
          )}

          {filter === 'artists' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {data.items.map((a, idx) => (
                <ArtistCard key={`${a.id}-${idx}`} artist={a} onOpenArtist={onOpenArtist} />
              ))}
            </div>
          )}

          {filter === 'playlists' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {data.items.map((pl, idx) => (
                <PlaylistCard key={`${pl.id}-${idx}`} playlist={pl} onOpenPlaylist={onOpenPlaylist} />
              ))}
            </div>
          )}

          {data.items.length === 0 && (
            <p className="text-sm text-zinc-500 py-10 text-center">No results found.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
