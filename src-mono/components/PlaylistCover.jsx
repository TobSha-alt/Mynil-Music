import React from 'react';
import { ListMusic } from 'lucide-react';
import CoverArt from './CoverArt';

function selectCoverTracks(tracks = []) {
  if (!Array.isArray(tracks) || tracks.length === 0) return [];
  const chosen = [];
  const seenThumbs = new Set();

  // Prefer tracks with distinct album covers first
  for (const t of tracks) {
    if (!t) continue;
    const key = t.thumbnail || t.albumId || t.videoId;
    if (key && !seenThumbs.has(key)) {
      seenThumbs.add(key);
      chosen.push(t);
      if (chosen.length === 4) return chosen;
    }
  }

  // If fewer than 4 distinct covers remain (e.g. multiple tracks from same album), fill up to min(4, tracks.length)
  if (chosen.length < Math.min(4, tracks.length)) {
    for (const t of tracks) {
      if (!t || chosen.includes(t)) continue;
      chosen.push(t);
      if (chosen.length === 4) break;
    }
  }

  return chosen;
}

export default function PlaylistCover({ playlist, size = 'md', className = '' }) {
  const tracks = playlist?.tracks || [];
  const covers = selectCoverTracks(tracks);
  const gradient = playlist?.gradient || 'from-zinc-400 via-zinc-400 to-zinc-900';
  const iconSize = size === 'sm' ? 16 : size === 'lg' ? 52 : 34;

  return (
    <div
      className={`overflow-hidden bg-gradient-to-br ${gradient} flex items-center justify-center ${className}`}
    >
      {covers.length >= 4 ? (
        <div className="grid grid-cols-2 grid-rows-2 w-full h-full gap-[1px] bg-black/25">
          {covers.slice(0, 4).map((tr, i) => (
            <CoverArt key={tr.videoId || i} item={tr} className="w-full h-full object-cover" />
          ))}
        </div>
      ) : covers.length === 3 ? (
        <div className="grid grid-cols-2 grid-rows-2 w-full h-full gap-[1px] bg-black/25">
          <CoverArt
            key={covers[0].videoId || 0}
            item={covers[0]}
            className="row-span-2 w-full h-full object-cover"
          />
          <CoverArt key={covers[1].videoId || 1} item={covers[1]} className="w-full h-full object-cover" />
          <CoverArt key={covers[2].videoId || 2} item={covers[2]} className="w-full h-full object-cover" />
        </div>
      ) : covers.length === 2 ? (
        <div className="grid grid-cols-2 w-full h-full gap-[1px] bg-black/25">
          <CoverArt key={covers[0].videoId || 0} item={covers[0]} className="w-full h-full object-cover" />
          <CoverArt key={covers[1].videoId || 1} item={covers[1]} className="w-full h-full object-cover" />
        </div>
      ) : covers.length === 1 ? (
        <CoverArt item={covers[0]} alt={playlist?.name} className="w-full h-full object-cover" />
      ) : (
        <ListMusic size={iconSize} className="text-white/80" />
      )}
    </div>
  );
}
