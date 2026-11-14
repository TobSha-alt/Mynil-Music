import React, { useEffect, useState } from 'react';
import { Play, Shuffle, UserPlus, UserCheck, BadgeCheck } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import TrackRow from '../components/TrackRow';
import ArtistAvatar from '../components/ArtistAvatar';
import { AlbumCard, ArtistCard, VideoCard } from '../components/MediaCards';

export default function ArtistView({ artistId, onOpenArtist, onOpenAlbum }) {
  const { playTrack, followedArtistIds, toggleFollowArtist } = usePlayer();
  const [artist, setArtist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAllPopular, setShowAllPopular] = useState(false);

  useEffect(() => {
    if (!artistId) return;
    let cancelled = false;
    setLoading(true);
    setShowAllPopular(false);
    window.sona
      .getArtist(artistId)
      .then((res) => {
        if (!cancelled) {
          setArtist(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [artistId]);

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <div className="h-64 rounded-3xl skeleton-shimmer" />
        <div className="space-y-2.5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 rounded-xl skeleton-shimmer" />
          ))}
        </div>
      </div>
    );
  }

  if (!artist) {
    return <div className="p-8 text-sm text-zinc-400">Could not load artist.</div>;
  }

  const isFollowed = followedArtistIds.has(artist.id);

  const handlePlayAll = (shuffle = false) => {
    if (!artist.topSongs?.length) return;
    const list = [...artist.topSongs];
    if (shuffle) list.sort(() => Math.random() - 0.5);
    playTrack(list[0], list);
  };

  return (
    <div className="pb-14 animate-view-enter">
      {/* Immersive Hero */}
      <div className="relative h-80 overflow-hidden flex items-end px-8 pb-7">
        <ArtistAvatar
          name={artist.name}
          src={artist.banner || artist.thumbnail}
          className="absolute inset-0 w-full h-full object-cover object-center scale-105 brightness-50 blur-sm"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#07070b] via-[#07070b]/55 to-transparent" />

        <div className="relative z-10 flex items-end gap-6 w-full">
          <ArtistAvatar
            name={artist.name}
            src={artist.thumbnail}
            className="w-36 h-36 rounded-full object-cover shadow-2xl ring-4 ring-white/15 shrink-0 bg-zinc-900"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-sky-400 mb-1">
              <BadgeCheck size={15} /> Verified Artist
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight truncate">
              {artist.name}
            </h1>
            {artist.subscribers && (
              <p className="text-sm text-zinc-300 mt-1.5">{artist.subscribers}</p>
            )}

            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={() => handlePlayAll(false)}
                disabled={!artist.topSongs?.length}
                className="px-6 py-2.5 rounded-full bg-emerald-400 text-black text-xs font-bold flex items-center gap-2 btn-glow disabled:opacity-40"
              >
                <Play size={15} fill="currentColor" /> Play
              </button>
              <button
                onClick={() => handlePlayAll(true)}
                disabled={!artist.topSongs?.length}
                className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-2 transition active:scale-95 disabled:opacity-40"
              >
                <Shuffle size={14} /> Shuffle
              </button>
              <button
                onClick={() =>
                  toggleFollowArtist({
                    id: artist.id,
                    name: artist.name,
                    thumbnail: artist.thumbnail,
                    subscribers: artist.subscribers,
                  })
                }
                className={`px-5 py-2.5 rounded-full text-xs font-bold flex items-center gap-2 border transition active:scale-95 ${
                  isFollowed
                    ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                    : 'bg-black/40 border-white/25 text-white hover:bg-white/15'
                }`}
              >
                {isFollowed ? <UserCheck size={14} /> : <UserPlus size={14} />}
                {isFollowed ? 'Following' : 'Follow'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-8 pt-6 space-y-10">
        {/* Popular Songs */}
        {artist.topSongs?.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-white">Popular</h2>
              {artist.topSongs.length > 5 && (
                <button
                  onClick={() => setShowAllPopular((v) => !v)}
                  className="text-xs font-bold text-zinc-400 hover:text-white transition"
                >
                  {showAllPopular ? 'Show less' : 'See more'}
                </button>
              )}
            </div>
            <div className="space-y-1">
              {(showAllPopular ? artist.topSongs : artist.topSongs.slice(0, 5)).map((t, idx) => (
                <TrackRow
                  key={`${t.videoId}-${idx}`}
                  track={t}
                  index={idx}
                  trackList={artist.topSongs}
                  onOpenArtist={onOpenArtist}
                  onOpenAlbum={onOpenAlbum}
                />
              ))}
            </div>
          </section>
        )}

        {/* Albums */}
        {artist.albums?.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-white mb-3.5">Albums</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {artist.albums.map((alb) => (
                <AlbumCard key={alb.id} album={alb} onOpenAlbum={onOpenAlbum} />
              ))}
            </div>
          </section>
        )}

        {/* Singles & EPs */}
        {artist.singles?.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-white mb-3.5">Singles & EPs</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {artist.singles.map((s) => (
                <AlbumCard key={s.id} album={s} onOpenAlbum={onOpenAlbum} />
              ))}
            </div>
          </section>
        )}

        {/* Music Videos */}
        {artist.videos?.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-white mb-3.5">Music Videos</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {artist.videos.slice(0, 8).map((v) => (
                <VideoCard key={v.videoId} video={v} trackList={artist.videos} onOpenArtist={onOpenArtist} />
              ))}
            </div>
          </section>
        )}

        {/* Fans Also Like */}
        {artist.relatedArtists?.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-white mb-3.5">Fans Also Like</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {artist.relatedArtists.slice(0, 6).map((ra) => (
                <ArtistCard key={ra.id} artist={ra} onOpenArtist={onOpenArtist} />
              ))}
            </div>
          </section>
        )}

        {/* About */}
        {artist.description && (
          <section className="max-w-3xl p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <h2 className="text-sm font-bold text-white mb-2">About {artist.name}</h2>
            <p className="text-xs leading-6 text-zinc-400">{artist.description}</p>
          </section>
        )}
      </div>
    </div>
  );
}
