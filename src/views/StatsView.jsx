import React, { useState, useEffect } from 'react';
import { BarChart3, Clock, Flame, Music2, Users, Disc3, Play, Sparkles, CopyPlus } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import CoverArt from '../components/CoverArt';
import TrackRow from '../components/TrackRow';

function formatDurationHuman(totalSec) {
  const mins = Math.round((Number(totalSec) || 0) / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

export default function StatsView({ onOpenArtist, onOpenAlbum, onNavigate }) {
  const { playTrack, createPlaylist, showToast } = usePlayer();
  const [range, setRange] = useState('month'); // 'week' | 'month' | 'year' | 'all'
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    window.sona
      .getStats(range)
      .then((res) => {
        if (!cancelled) {
          setStats(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const ranges = [
    { id: 'week', label: 'Weekly' },
    { id: 'month', label: 'Monthly' },
    { id: 'year', label: 'Yearly' },
    { id: 'all', label: 'All Time' },
  ];

  const maxBucket = Math.max(1, ...(stats?.timeline || []).map((b) => b.plays));

  return (
    <div className="px-8 py-6 pb-16 space-y-8 animate-view-enter">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-400">Listening Stats</p>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Your Listening Insights</h1>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-full bg-white/[0.05] border border-white/[0.08]">
          {ranges.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${
                range === r.id ? 'bg-emerald-400 text-black shadow' : 'text-zinc-300 hover:text-white'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !stats ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-white/[0.04]" />
          ))}
        </div>
      ) : (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
              <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
                <BarChart3 size={14} className="text-emerald-400" /> Total Streams
              </div>
              <p className="text-3xl font-extrabold text-white tabular-nums">{stats?.totalPlays || 0}</p>
            </div>
            <div className="p-5 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
              <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
                <Clock size={14} className="text-sky-400" /> Listening Time
              </div>
              <p className="text-3xl font-extrabold text-white tabular-nums">
                {formatDurationHuman(stats?.totalDurationSec)}
              </p>
            </div>
            <div className="p-5 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
              <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
                <Users size={14} className="text-purple-400" /> Unique Artists
              </div>
              <p className="text-3xl font-extrabold text-white tabular-nums">{stats?.uniqueArtists || 0}</p>
            </div>
            <div className="p-5 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
              <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
                <Flame size={14} className="text-amber-400" /> Active Streak
              </div>
              <p className="text-3xl font-extrabold text-white tabular-nums">
                {stats?.streakDays || 0} {stats?.streakDays === 1 ? 'day' : 'days'}
              </p>
            </div>
          </div>

          {/* Activity Chart */}
          {stats?.timeline?.length > 0 && (
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.07]">
              <h2 className="text-sm font-bold text-white mb-4">Activity Over Time</h2>
              <div className="flex items-end gap-1.5 h-28">
                {stats.timeline.slice(-30).map((b) => (
                  <div key={b.label} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <div
                      className="w-full rounded-t-md bg-emerald-400/80 hover:bg-emerald-300 transition-all"
                      style={{ height: `${Math.max(6, Math.round((b.plays / maxBucket) * 88))}px` }}
                      title={`${b.label}: ${b.plays} plays`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Smart Playlists */}
          {stats?.smartPlaylists?.some((sp) => sp.tracks?.length > 0) && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-emerald-400" />
                <h2 className="text-lg font-extrabold text-white">Smart Playlists</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {stats.smartPlaylists
                  .filter((sp) => sp.tracks?.length > 0)
                  .map((sp) => (
                    <div
                      key={sp.id}
                      className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex flex-col justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-bold text-white">{sp.name}</p>
                        <p className="text-xs text-zinc-400 mt-0.5">{sp.subtitle}</p>
                        <p className="text-[11px] text-zinc-500 mt-1">{sp.tracks.length} tracks</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => playTrack(sp.tracks[0], sp.tracks)}
                          className="px-3.5 py-1.5 rounded-full bg-emerald-400 text-black text-xs font-bold flex items-center gap-1.5"
                        >
                          <Play size={12} fill="currentColor" /> Play
                        </button>
                        <button
                          onClick={async () => {
                            const created = await createPlaylist({
                              name: sp.name,
                              description: sp.subtitle,
                              initialTracks: sp.tracks,
                            });
                            showToast?.(`Saved "${sp.name}" to your playlists`);
                            if (created?.id && onNavigate) onNavigate({ name: 'custom-playlist', id: created.id });
                          }}
                          className="px-3 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.15] text-white text-xs font-semibold flex items-center gap-1.5"
                        >
                          <CopyPlus size={12} /> Save
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          )}

          {/* Top Artists & Top Albums */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-emerald-400" />
                <h2 className="text-lg font-extrabold text-white">Top Artists</h2>
              </div>
              <div className="space-y-2">
                {(stats?.topArtists || []).map((a, idx) => (
                  <div
                    key={`${a.name}-${idx}`}
                    onClick={() => a.id && onOpenArtist?.(a.id)}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] cursor-pointer transition"
                  >
                    <span className="w-6 text-center text-xs font-mono text-zinc-500">{idx + 1}</span>
                    <CoverArt src={a.thumbnail} title={a.name} className="w-10 h-10 rounded-full object-cover shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate">{a.name}</p>
                      <p className="text-xs text-zinc-400">{formatDurationHuman(a.totalSec)}</p>
                    </div>
                    <span className="text-xs font-mono text-emerald-400 font-bold">{a.plays} plays</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Disc3 size={16} className="text-emerald-400" />
                <h2 className="text-lg font-extrabold text-white">Top Albums</h2>
              </div>
              <div className="space-y-2">
                {(stats?.topAlbums || []).map((al, idx) => (
                  <div
                    key={`${al.title}-${idx}`}
                    onClick={() => al.id && onOpenAlbum?.(al.id)}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] cursor-pointer transition"
                  >
                    <span className="w-6 text-center text-xs font-mono text-zinc-500">{idx + 1}</span>
                    <CoverArt src={al.thumbnail} title={al.title} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate">{al.title}</p>
                      <p className="text-xs text-zinc-400 truncate">{al.artist}</p>
                    </div>
                    <span className="text-xs font-mono text-emerald-400 font-bold">{al.plays} plays</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Top Songs */}
          {stats?.topSongs?.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Music2 size={16} className="text-emerald-400" />
                <h2 className="text-lg font-extrabold text-white">Most Listened Songs</h2>
              </div>
              <div className="space-y-1">
                {stats.topSongs.map((t, idx) => (
                  <TrackRow
                    key={`${t.videoId}-${idx}`}
                    track={t}
                    index={idx}
                    trackList={stats.topSongs}
                    onOpenArtist={onOpenArtist}
                    onOpenAlbum={onOpenAlbum}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
