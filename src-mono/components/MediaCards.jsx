import React from 'react';
import { Play, Pause, UserPlus, UserCheck, Disc3, Film, ListMusic } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import ArtistAvatar from './ArtistAvatar';
import CoverArt from './CoverArt';

export function ArtistCard({ artist, onOpenArtist }) {
  const { followedArtistIds, toggleFollowArtist } = usePlayer();
  const isFollowed = followedArtistIds.has(artist.id);

  return (
    <div
      onClick={() => onOpenArtist(artist.id)}
      className="group relative p-4 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.05] hover:border-white/[0.12] hover:-translate-y-1 hover:shadow-2xl transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer flex flex-col items-center text-center"
    >
      <div className="relative w-32 h-32 rounded-full overflow-hidden bg-zinc-800 shadow-xl mb-3.5 ring-2 ring-white/5 group-hover:ring-white/20 transition-all duration-300">
        <ArtistAvatar
          name={artist.name}
          src={artist.thumbnail}
          className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
        />
      </div>
      <h3 className="text-sm font-bold text-white truncate w-full">{artist.name}</h3>
      <p className="text-xs text-zinc-400 truncate w-full mt-0.5">
        {artist.subscribers || 'Artist'}
      </p>
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleFollowArtist(artist);
        }}
        className={`mt-3 px-3.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all duration-200 active:scale-90 ${
          isFollowed
            ? 'bg-zinc-200/20 text-white border border-white/40'
            : 'bg-white/10 text-zinc-200 hover:bg-white/20 border border-white/10'
        }`}
      >
        {isFollowed ? <UserCheck size={12} /> : <UserPlus size={12} />}
        {isFollowed ? 'Following' : 'Follow'}
      </button>
    </div>
  );
}

export function AlbumCard({ album, onOpenAlbum }) {
  const { playTrack } = usePlayer();

  const handleQuickPlay = async (e) => {
    e.stopPropagation();
    const res = await window.sona.getAlbum(album.id);
    if (res?.tracks?.length) {
      playTrack(res.tracks[0], res.tracks);
    }
  };

  return (
    <div
      onClick={() => onOpenAlbum(album.id)}
      className="group relative p-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.05] hover:border-white/[0.12] hover:-translate-y-1 hover:shadow-2xl transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer"
    >
      <div className="relative aspect-square overflow-hidden bg-zinc-800 shadow-lg mb-3 ring-1 ring-white/5">
        <CoverArt
          src={album.thumbnail}
          title={album.title}
          artist={album.artist}
          className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
        />
        <button
          onClick={handleQuickPlay}
          className="absolute bottom-2.5 right-2.5 w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-xl opacity-0 translate-y-3 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-110 active:scale-90"
          title="Play Album"
        >
          <Play size={18} fill="currentColor" className="ml-0.5" />
        </button>
      </div>
      <h3 className="text-sm font-bold text-white truncate">{album.title}</h3>
      <p className="text-xs text-zinc-400 truncate mt-0.5">
        {album.year ? `${album.year} • ` : ''}
        {album.artist || album.subtitle || 'Album'}
      </p>
    </div>
  );
}

export function PlaylistCard({ playlist, onOpenPlaylist }) {
  const { playTrack } = usePlayer();

  const handleQuickPlay = async (e) => {
    e.stopPropagation();
    const res = await window.sona.getPlaylist(playlist.id);
    if (res?.tracks?.length) {
      playTrack(res.tracks[0], res.tracks);
    }
  };

  return (
    <div
      onClick={() => onOpenPlaylist(playlist.id)}
      className="group relative p-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.05] hover:border-white/[0.12] hover:-translate-y-1 hover:shadow-2xl transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer"
    >
      <div className="relative aspect-square overflow-hidden bg-zinc-800 shadow-lg mb-3 ring-1 ring-white/5">
        <CoverArt
          src={playlist.thumbnail}
          title={playlist.title}
          artist={playlist.author || playlist.subtitle}
          className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
        />
        <button
          onClick={handleQuickPlay}
          className="absolute bottom-2.5 right-2.5 w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-xl opacity-0 translate-y-3 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-110 active:scale-90"
          title="Play Playlist"
        >
          <Play size={18} fill="currentColor" className="ml-0.5" />
        </button>
      </div>
      <h3 className="text-sm font-bold text-white truncate">{playlist.title}</h3>
      <p className="text-xs text-zinc-400 truncate mt-0.5">
        {playlist.author || playlist.subtitle || 'Playlist'}
      </p>
    </div>
  );
}

export function VideoCard({ video, trackList, onOpenArtist }) {
  const { currentTrack, isPlaying, playTrack, togglePlay, setTheaterOpen } = usePlayer();
  const isCurrent = currentTrack?.videoId === video.videoId;
  const isCurrentPlaying = isCurrent && isPlaying;

  const handlePlay = () => {
    if (isCurrent) {
      togglePlay();
    } else {
      playTrack({ ...video, isVideo: true }, trackList, { mode: 'video' });
      setTheaterOpen(true);
    }
  };

  return (
    <div
      onClick={handlePlay}
      className="group relative p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.05] hover:border-white/[0.12] hover:-translate-y-1 hover:shadow-2xl transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer"
    >
      <div className="relative aspect-video rounded-xl overflow-hidden bg-zinc-900 shadow-lg mb-3 ring-1 ring-white/5">
        <CoverArt
          item={video}
          className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition" />
        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[10px] font-semibold text-zinc-200 flex items-center gap-1">
          <Film size={10} className="text-white" /> Music Video
        </span>
        {video.duration && (
          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono tabular-nums text-zinc-200">
            {video.duration}
          </span>
        )}
        <div
          className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ${
            isCurrent ? 'opacity-100 scale-100' : 'opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100'
          }`}
        >
          <div className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
            {isCurrentPlaying ? (
              <Pause size={18} fill="currentColor" />
            ) : (
              <Play size={18} fill="currentColor" className="ml-0.5" />
            )}
          </div>
        </div>
      </div>
      <h3 className={`text-sm font-bold truncate ${isCurrent ? 'text-white' : 'text-white'}`}>
        {video.title}
      </h3>
      <p
        onClick={(e) => {
          if (video.artistId && onOpenArtist) {
            e.stopPropagation();
            onOpenArtist(video.artistId);
          }
        }}
        className={`text-xs text-zinc-400 truncate mt-0.5 ${
          video.artistId && onOpenArtist ? 'hover:text-white hover:underline' : ''
        }`}
      >
        {video.artist}
      </p>
    </div>
  );
}
