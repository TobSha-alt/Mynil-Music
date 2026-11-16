import React, { useEffect, useState } from 'react';
import {
  Settings,
  Sliders,
  Mic2,
  Activity,
  Disc3,
  Move,
  Palette,
  RotateCcw,
  Minus,
  Plus,
  Check,
  Volume2,
  Sparkles,
  Keyboard,
  Trash2,
  User,
  RefreshCw,
  LogOut,
  Download,
  Upload,
  Trophy,
  HardDrive,
  AlertTriangle,
} from 'lucide-react';
import { usePlayer, EQ_PRESETS } from '../context/PlayerContext';
import { BACKDROP_PRESETS } from '../components/PlayingBackdrop';
import { usePanMotion } from '../utils/motion';
import { getTrackIdentityKey } from '../utils/trackIdentity';
import CoverArt from '../components/CoverArt';

function ToggleRow({ title, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 px-4 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] transition">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">{title}</p>
        {description && <p className="text-xs text-zinc-400 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full shrink-0 transition-colors duration-200 ${
          checked ? 'bg-emerald-400' : 'bg-white/15'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2];

const VISUALIZER_STYLES = [
  { id: 'bars', label: 'Classic Bars' },
  { id: 'mirror', label: 'Mirrored Wave' },
  { id: 'minimal', label: 'Minimal Peaks' },
];

const LYRIC_SIZES = [
  { id: 'compact', label: 'Compact' },
  { id: 'normal', label: 'Balanced' },
  { id: 'large', label: 'Large' },
];

const LYRIC_ALIGNS = [
  { id: 'left', label: 'Left Aligned' },
  { id: 'center', label: 'Centered' },
];

const IS_MAC = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent || '');

const SHORTCUTS = [
  { key: 'Space', label: 'Play / Pause' },
  { key: '← / →', label: 'Seek ±5s' },
  { key: 'Shift + ← / →', label: 'Prev / Next' },
  { key: 'M', label: 'Mute' },
  { key: 'L', label: 'Lyrics Drawer' },
  { key: 'Q', label: 'Queue Drawer' },
  { key: 'F', label: 'Fullscreen Mode' },
  { key: IS_MAC ? '⌘ K' : 'Ctrl + K', label: 'Quick Search' },
];

export default function SettingsView() {
  const {
    library,
    updatePref,
    refreshLibrary,
    offlineStatus,
    clearOfflineDownloads,
    showToast,
    currentTrack,
    accentRgb,
    playbackRate,
    setPlaybackRate,
    clearHistory,
    clearLyricsCache,
  } = usePlayer();

  const [accountStatus, setAccountStatus] = useState(null);
  const [statsStatus, setStatsStatus] = useState(null);
  const [authTab, setAuthTab] = useState('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    window.sona
      ?.getAccountStatus?.()
      .then((st) => setAccountStatus(st))
      .catch(() => {});
    window.sona
      ?.getStatsStatus?.()
      .then((st) => setStatsStatus(st))
      .catch(() => {});
  }, []);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthBusy(true);
    try {
      if (authTab === 'signup') {
        const res = await window.sona.signUp({ username, password });
        setAccountStatus(res.status);
        if (res.library) await refreshLibrary(res.library);
        showToast?.('Account created & synced!');
      } else {
        const res = await window.sona.signIn({ username, password });
        setAccountStatus(res.status);
        if (res.library) await refreshLibrary(res.library);
        showToast?.('Signed in & library synced!');
      }
      setPassword('');
    } catch (err) {
      showToast?.(err.message || 'Authentication failed');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    const st = await window.sona.signOut();
    setAccountStatus(st);
    showToast?.('Switched to Guest Mode');
  };

  const handleSyncNow = async () => {
    setSyncBusy(true);
    try {
      const res = await window.sona.syncAccount();
      setAccountStatus(res.status);
      if (res.library) await refreshLibrary(res.library);
      showToast?.(res.status?.lastError ? res.status.lastError : 'Library synced across devices');
    } catch (err) {
      showToast?.(err.message || 'Sync failed');
    } finally {
      setSyncBusy(false);
    }
  };

  const handleScanNow = async () => {
    setScanBusy(true);
    try {
      const res = await window.sona.scanStats();
      setStatsStatus(res.status);
      if (res.library) await refreshLibrary(res.library);
      const sum = res.status?.lastSummary;
      showToast?.(
        sum
          ? `Stats updated: ${sum.artistsUpdated} artists, ${sum.tracksUpdated} tracks`
          : 'Monthly stats scan complete'
      );
    } catch (err) {
      showToast?.(err.message || 'Stats scan failed');
    } finally {
      setScanBusy(false);
    }
  };

  const handleResetAccount = async () => {
    if (!window.confirm('Full Reset Account? This will erase all liked songs, playlists, albums, listens, and preferences on your synced account.')) {
      return;
    }
    setResetBusy(true);
    try {
      const res = await window.sona.resetAccount();
      setAccountStatus(res.status);
      if (res.library) await refreshLibrary(res.library);
      showToast?.('Account data has been completely reset');
    } catch (err) {
      showToast?.(err.message || 'Account reset failed');
    } finally {
      setResetBusy(false);
    }
  };

  const handleResetDevice = async () => {
    if (!window.confirm('Full Reset Device? This will sign you out and wipe all local data, history, and offline downloads as if you never opened Sona. (Your cloud account stays safe.)')) {
      return;
    }
    setResetBusy(true);
    try {
      await window.sona.resetDevice();
      window.location.reload();
    } catch (err) {
      showToast?.(err.message || 'Device reset failed');
      setResetBusy(false);
    }
  };

  const handleExportBackup = () => {
    const blob = new Blob([JSON.stringify(library, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mynil-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast?.('Library backup downloaded');
  };

  const handleImportBackup = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        if (parsed.preferences) await updatePref(parsed.preferences);
        showToast?.('Backup preferences imported');
      } catch {
        showToast?.('Invalid backup file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const totalPlays = Object.values(library.playCounts || {}).reduce((s, n) => s + Number(n || 0), 0);
  const topPlayedTracks = [...(library.history || []), ...(library.likedSongs || [])]
    .filter((t, idx, arr) => t?.videoId && arr.findIndex((x) => x.videoId === t.videoId) === idx)
    .map((t) => ({ ...t, count: Number(library.playCounts?.[t.videoId] || 0) }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  const prefs = library.preferences || {};

  const showLyricTimings = Boolean(prefs.showLyricTimings);
  const showLyricProgress = Boolean(prefs.showLyricProgress);
  const blurInactiveLyrics = Boolean(prefs.blurInactiveLyrics);
  const lyricFontSize = prefs.lyricFontSize || 'normal';
  const lyricAlign = prefs.lyricAlign || 'left';
  const lyricTransitionMs = Number(prefs.lyricTransitionMs ?? 550);
  const panningAlbum = Boolean(prefs.panningAlbum);
  const panningWaveform = Boolean(prefs.panningWaveform);
  const panFrequency = Number(prefs.panFrequency ?? 0.6);
  const panAmplitude = Number(prefs.panAmplitude ?? 14);
  const panRotation = Boolean(prefs.panRotation);
  const visualizer = prefs.visualizer !== false;
  const visualizerStyle = prefs.visualizerStyle || 'bars';
  const autoplay = prefs.autoplay !== false;
  const showPlayCounts = Boolean(prefs.showPlayCounts);
  const restoreLastTrack = prefs.restoreLastTrack !== false;
  const autoTheaterOnPlay = Boolean(prefs.autoTheaterOnPlay);
  const keyboardShortcuts = prefs.keyboardShortcuts !== false;
  const eqPreset = prefs.eqPreset || 'flat';
  const syncOffset = Number(prefs.lyricSyncOffset || 0);
  const activeBackdrop = prefs.backdrop || 'aurora';

  const trackKey = currentTrack ? getTrackIdentityKey(currentTrack) || currentTrack.videoId || '' : '';
  const trackSyncOffset = trackKey ? Number(prefs.trackSyncOffsets?.[trackKey] || 0) : 0;

  const previewAlbumRef = usePanMotion(
    panningAlbum,
    panFrequency,
    Math.min(20, panAmplitude * 0.7),
    true,
    panRotation
  );
  const previewWaveRef = usePanMotion(
    panningWaveform,
    panFrequency,
    Math.min(20, panAmplitude * 0.7),
    true,
    panRotation
  );

  const adjustOffset = (delta) => {
    const next = Math.max(-5, Math.min(5, Math.round((syncOffset + delta) * 100) / 100));
    updatePref({ lyricSyncOffset: next });
  };

  const adjustTrackOffset = (delta) => {
    if (!trackKey) return;
    const next = Math.max(-5, Math.min(5, Math.round((trackSyncOffset + delta) * 100) / 100));
    updatePref({ trackSyncOffsets: { [trackKey]: next } });
  };

  const resetDefaults = () => {
    setPlaybackRate(1);
    updatePref({
      visualizer: true,
      visualizerStyle: 'bars',
      autoplay: true,
      backdrop: 'aurora',
      eqPreset: 'flat',
      lyricSyncOffset: 0,
      lyricTransitionMs: 550,
      showLyricTimings: false,
      showLyricProgress: false,
      blurInactiveLyrics: false,
      lyricFontSize: 'normal',
      lyricAlign: 'left',
      panningAlbum: false,
      panningWaveform: false,
      panFrequency: 0.6,
      panAmplitude: 14,
      panRotation: false,
      showPlayCounts: false,
      playbackRate: 1,
      restoreLastTrack: true,
      autoTheaterOnPlay: false,
      keyboardShortcuts: true,
    });
    showToast?.('Settings reset to defaults');
  };

  const [updaterStatus, setUpdaterStatus] = useState(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);

  useEffect(() => {
    window.sona?.getUpdaterStatus?.().then((st) => st && setUpdaterStatus(st)).catch(() => {});
  }, []);

  const handleCheckUpdates = async () => {
    setCheckingUpdates(true);
    try {
      const st = await window.sona.checkUpdates();
      setUpdaterStatus(st);
      if (st?.updateAvailable) {
        showToast(`Update v${st.latestVersion} is available!`);
      } else if (st?.error) {
        showToast(st.error);
      } else {
        showToast('Mynil Music is up to date');
      }
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleInstallUpdate = async () => {
    setInstallingUpdate(true);
    try {
      const res = await window.sona.installUpdate();
      if (res?.status) setUpdaterStatus(res.status);
      if (res?.ok) {
        showToast('Installer downloaded and launched');
      } else if (res?.fallbackUrl) {
        window.open(res.fallbackUrl, '_blank');
      }
    } finally {
      setInstallingUpdate(false);
    }
  };

  return (
    <div className="relative min-h-full pb-16 animate-view-enter">
      <div
        className="absolute inset-x-0 top-0 h-64 pointer-events-none opacity-30 transition-all duration-700"
        style={{
          background: `radial-gradient(ellipse at 20% 0%, rgba(${accentRgb}, 0.5), transparent 65%)`,
        }}
      />

      <div className="relative max-w-4xl mx-auto px-8 pt-6 space-y-8">
        {/* Header */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-1.5 mb-1">
              <Settings size={12} /> Preferences
            </p>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">Settings</h1>
          </div>

          <button
            onClick={resetDefaults}
            className="px-4 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-zinc-200 flex items-center gap-1.5 transition active:scale-95"
          >
            <RotateCcw size={13} /> Reset Defaults
          </button>
        </div>

        {/* Account & Cross-Device Sync */}
        <section className="rounded-2xl bg-white/[0.025] border border-white/[0.07] p-5 space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <User size={17} className="text-emerald-400" />
              <h2 className="text-base font-bold text-white">Account &amp; Cross-Device Sync</h2>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                  accountStatus?.mode === 'account'
                    ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
                    : 'bg-white/[0.06] border-white/10 text-zinc-300'
                }`}
              >
                {accountStatus?.mode === 'account'
                  ? `Signed in: @${accountStatus.user?.username}`
                  : 'Guest Mode (Local Only)'}
              </span>
            </div>
          </div>

          {accountStatus?.mode === 'account' ? (
            <div className="flex items-center justify-between gap-4 flex-wrap p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div>
                <p className="text-sm font-semibold text-white">@{accountStatus.user?.username}</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {accountStatus.lastSyncAt
                    ? `Last synced: ${new Date(accountStatus.lastSyncAt).toLocaleString()}`
                    : 'Ready to sync across your Mac & Windows PC'}
                </p>
                {accountStatus.lastError && (
                  <p className="text-xs text-rose-400 mt-1">{accountStatus.lastError}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSyncNow}
                  disabled={syncBusy}
                  className="px-3.5 py-2 rounded-xl bg-emerald-400/15 hover:bg-emerald-400/25 border border-emerald-400/30 text-xs font-semibold text-emerald-300 flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  <RefreshCw size={13} className={syncBusy ? 'animate-spin' : ''} />
                  {syncBusy ? 'Syncing...' : 'Sync Now'}
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-zinc-200 flex items-center gap-1.5 transition"
                >
                  <LogOut size={13} /> Sign Out (Guest)
                </button>
                <button
                  type="button"
                  onClick={handleResetAccount}
                  disabled={resetBusy}
                  className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-xs font-semibold text-rose-300 flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  <AlertTriangle size={13} /> Full Reset Account
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs text-zinc-400">
                  Use Mynil Music as a <strong>Guest</strong> or sign in with a <strong>Username &amp; Password</strong>{' '}
                  (no email required) to sync playlists, likes, albums &amp; history across devices.
                </p>
                <div className="flex items-center gap-1 p-1 rounded-lg bg-white/[0.05]">
                  <button
                    type="button"
                    onClick={() => setAuthTab('signin')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                      authTab === 'signin' ? 'bg-white text-black' : 'text-zinc-300 hover:text-white'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthTab('signup')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                      authTab === 'signup' ? 'bg-white text-black' : 'text-zinc-300 hover:text-white'
                    }`}
                  >
                    Create Account
                  </button>
                </div>
              </div>

              <form onSubmit={handleAuthSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username (e.g. toby)"
                  required
                  minLength={3}
                  className="px-3 py-2 rounded-lg bg-white/[0.05] border border-white/10 text-xs text-white placeholder-zinc-500 outline-none focus:border-emerald-400/60"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                  minLength={4}
                  className="px-3 py-2 rounded-lg bg-white/[0.05] border border-white/10 text-xs text-white placeholder-zinc-500 outline-none focus:border-emerald-400/60"
                />
                <button
                  type="submit"
                  disabled={authBusy}
                  className="px-4 py-2 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-black text-xs font-bold transition disabled:opacity-50"
                >
                  {authBusy
                    ? 'Please wait...'
                    : authTab === 'signup'
                    ? 'Create Account & Sync'
                    : 'Sign In & Sync'}
                </button>
              </form>
            </div>
          )}
        </section>

        {/* Offline Downloads */}
        <section className="rounded-2xl bg-white/[0.025] border border-white/[0.07] p-5 space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <HardDrive size={17} className="text-emerald-400" />
              <div>
                <h2 className="text-base font-bold text-white">Offline Downloads</h2>
                <p className="text-xs text-zinc-400">
                  Cached in Mynil&apos;s encrypted offline store (no MP3/MP4 files). Only downloaded songs play when offline.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={clearOfflineDownloads}
              disabled={(offlineStatus?.tracks?.length || 0) === 0}
              className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-xs font-semibold text-rose-300 flex items-center gap-1.5 transition disabled:opacity-40"
            >
              <Trash2 size={12} /> Clear All Downloads
            </button>
          </div>
          <div className="flex items-center gap-6 text-xs text-zinc-400 px-1">
            <span>
              Downloaded songs:{' '}
              <strong className="text-white">{offlineStatus?.tracks?.length || 0}</strong>
            </span>
            <span>
              Storage used:{' '}
              <strong className="text-white">
                {((offlineStatus?.totalBytes || 0) / (1024 * 1024)).toFixed(1)} MB
              </strong>
            </span>
          </div>
        </section>

        {/* Monthly Stats Scanner */}
        <section className="rounded-2xl bg-white/[0.025] border border-white/[0.07] p-5 space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <RefreshCw size={17} className="text-emerald-400" />
              <h2 className="text-base font-bold text-white">Monthly Stats Refresh</h2>
            </div>
            <button
              type="button"
              onClick={handleScanNow}
              disabled={scanBusy || statsStatus?.scanning}
              className="px-3.5 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-xs font-semibold text-white flex items-center gap-1.5 transition disabled:opacity-50"
            >
              <RefreshCw size={12} className={scanBusy || statsStatus?.scanning ? 'animate-spin' : ''} />
              {scanBusy || statsStatus?.scanning ? 'Scanning...' : 'Scan Now'}
            </button>
          </div>

          <ToggleRow
            title="Auto-Scan Every Month (30 Days)"
            description="Automatically refresh followers, monthly listeners, and stream counts across your library"
            checked={prefs.autoMonthlyScan !== false}
            onChange={(v) => updatePref({ autoMonthlyScan: v })}
          />

          <div className="flex items-center justify-between gap-4 flex-wrap px-1 text-xs text-zinc-400">
            <span>
              Last scan:{' '}
              <strong className="text-zinc-200">
                {statsStatus?.lastScanAt ? new Date(statsStatus.lastScanAt).toLocaleDateString() : 'Never'}
              </strong>
              {statsStatus?.lastSummary &&
                ` (${statsStatus.lastSummary.artistsUpdated} artists, ${statsStatus.lastSummary.tracksUpdated} tracks updated)`}
            </span>
            <span>
              Next scheduled:{' '}
              <strong className="text-zinc-200">
                {statsStatus?.nextScanAt ? new Date(statsStatus.nextScanAt).toLocaleDateString() : 'On next launch'}
              </strong>
            </span>
          </div>
        </section>

        {/* Audio & Equalizer Section */}
        <section className="rounded-2xl bg-white/[0.025] border border-white/[0.07] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Volume2 size={17} className="text-emerald-400" />
            <h2 className="text-base font-bold text-white">Audio & Equalizer</h2>
          </div>

          <div>
            <p className="text-xs font-semibold text-zinc-300 mb-2">Sound Profile (Live 3-Band EQ)</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(EQ_PRESETS).map(([id, preset]) => {
                const selected = eqPreset === id;
                return (
                  <button
                    key={id}
                    onClick={() => updatePref({ eqPreset: id })}
                    className={`text-left p-3 rounded-xl border transition-all ${
                      selected
                        ? 'bg-emerald-400/12 border-emerald-400/50 shadow-md'
                        : 'bg-white/[0.03] hover:bg-white/[0.07] border-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-white">{preset.label}</p>
                      {selected && <Check size={12} className="text-emerald-400 shrink-0" />}
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-0.5 truncate">{preset.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 py-3 px-4 rounded-xl bg-white/[0.03] border border-white/[0.06] flex-wrap">
            <div>
              <p className="text-sm font-semibold text-white">Playback Speed</p>
              <p className="text-xs text-zinc-400 mt-0.5">Adjust tempo cleanly across songs and videos</p>
            </div>
            <div className="flex items-center gap-1.5">
              {SPEED_OPTIONS.map((rate) => (
                <button
                  key={rate}
                  onClick={() => setPlaybackRate(rate)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition ${
                    playbackRate === rate
                      ? 'bg-emerald-400 text-black shadow'
                      : 'bg-white/[0.07] text-zinc-300 hover:bg-white/[0.14]'
                  }`}
                >
                  {rate}×
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Panning Album & Waveform Section */}
        <section className="rounded-2xl bg-white/[0.025] border border-white/[0.07] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Move size={17} className="text-emerald-400" />
            <h2 className="text-base font-bold text-white">Panning Album & Waveform</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <ToggleRow
              title="Panning Album"
              description="Smoothly drift the playing album artwork in fullscreen lyrics"
              checked={panningAlbum}
              onChange={(v) => updatePref({ panningAlbum: v })}
            />
            <ToggleRow
              title="Panning Waveform"
              description="Smoothly drift the playing audio waveform"
              checked={panningWaveform}
              onChange={(v) => updatePref({ panningWaveform: v })}
            />
            <ToggleRow
              title="Rotational Panning"
              description="Add a gentle rotational tilt to panning motion"
              checked={panRotation}
              onChange={(v) => updatePref({ panRotation: v })}
            />
          </div>

          {/* Frequency & Amplitude Sliders + Live Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-1">
            <div className="lg:col-span-7 space-y-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                    <Sliders size={13} className="text-emerald-400" />
                    Panning Frequency
                  </span>
                  <span className="text-xs font-mono tabular-nums text-emerald-300 bg-emerald-400/10 px-2 py-0.5 rounded-md">
                    {panFrequency.toFixed(2)} Hz
                  </span>
                </div>
                <input
                  type="range"
                  min={0.15}
                  max={2.5}
                  step={0.05}
                  value={panFrequency}
                  onChange={(e) => updatePref({ panFrequency: Number(e.target.value) })}
                  className="w-full accent-emerald-400 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-zinc-500 mt-0.5">
                  <span>Slow drift (0.15 Hz)</span>
                  <span>Fast sway (2.50 Hz)</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                    <Activity size={13} className="text-emerald-400" />
                    Panning Amplitude
                  </span>
                  <span className="text-xs font-mono tabular-nums text-emerald-300 bg-emerald-400/10 px-2 py-0.5 rounded-md">
                    {Math.round(panAmplitude)} px
                  </span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={36}
                  step={1}
                  value={panAmplitude}
                  onChange={(e) => updatePref({ panAmplitude: Number(e.target.value) })}
                  className="w-full accent-emerald-400 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-zinc-500 mt-0.5">
                  <span>Subtle (2 px)</span>
                  <span>Wide float (36 px)</span>
                </div>
              </div>
            </div>

            {/* Live Motion Preview */}
            <div className="lg:col-span-5 rounded-xl bg-black/40 border border-white/[0.07] p-4 flex flex-col items-center justify-center gap-3 min-h-[148px] overflow-hidden">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                Live Motion Preview
              </p>
              <div ref={previewAlbumRef} className="will-change-transform">
                {currentTrack ? (
                  <CoverArt
                    item={currentTrack}
                    className="w-14 h-14 object-cover shadow-lg ring-1 ring-white/15"
                  />
                ) : (
                  <div className="w-14 h-14 bg-gradient-to-br from-emerald-400 via-teal-500 to-indigo-600 flex items-center justify-center shadow-lg ring-1 ring-white/20">
                    <Disc3 size={22} className="text-black" />
                  </div>
                )}
              </div>
              <div ref={previewWaveRef} className="flex items-center gap-1 will-change-transform">
                {[0.35, 0.7, 1, 0.55, 0.85, 0.45, 0.9, 0.6, 0.4].map((v, i) => (
                  <span
                    key={i}
                    className="w-1 rounded-full transition-all"
                    style={{
                      height: `${Math.round(v * 18 + 4)}px`,
                      backgroundColor: `rgb(${accentRgb})`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Lyrics Settings Section */}
        <section className="rounded-2xl bg-white/[0.025] border border-white/[0.07] p-5 space-y-3">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2">
              <Mic2 size={17} className="text-emerald-400" />
              <h2 className="text-base font-bold text-white">Lyrics</h2>
            </div>
            <button
              onClick={clearLyricsCache}
              className="px-3 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.08] text-[11px] font-semibold text-zinc-300 flex items-center gap-1.5 transition"
            >
              <RotateCcw size={11} /> Re-sync / Refresh Lyrics
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ToggleRow
              title="Show Lyric Timestamps"
              description="Display the timestamp beside each synced lyric line"
              checked={showLyricTimings}
              onChange={(v) => updatePref({ showLyricTimings: v })}
            />
            <ToggleRow
              title="Show Lyric Line Progress Bar"
              description="Display the progress sweep bar under the active lyric line"
              checked={showLyricProgress}
              onChange={(v) => updatePref({ showLyricProgress: v })}
            />
          </div>

          <ToggleRow
            title="Blur Distant Inactive Lyrics"
            description="Apply a soft depth blur to far-away lyrics so the sung line stands out"
            checked={blurInactiveLyrics}
            onChange={(v) => updatePref({ blurInactiveLyrics: v })}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center justify-between gap-3 py-3 px-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <p className="text-sm font-semibold text-white">Text Size</p>
              <div className="flex items-center gap-1">
                {LYRIC_SIZES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => updatePref({ lyricFontSize: s.id })}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                      lyricFontSize === s.id
                        ? 'bg-emerald-400 text-black'
                        : 'bg-white/[0.07] text-zinc-300 hover:bg-white/[0.14]'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 py-3 px-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <p className="text-sm font-semibold text-white">Alignment</p>
              <div className="flex items-center gap-1">
                {LYRIC_ALIGNS.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => updatePref({ lyricAlign: a.id })}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                      lyricAlign === a.id
                        ? 'bg-emerald-400 text-black'
                        : 'bg-white/[0.07] text-zinc-300 hover:bg-white/[0.14]'
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="py-3.5 px-4 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-white">Lyric Transition Smoothness</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Controls how smoothly scroll and active-line highlights glide between lyrics
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {[
                  { label: 'Snappy', ms: 250 },
                  { label: 'Smooth', ms: 550 },
                  { label: 'Flowing', ms: 850 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => updatePref({ lyricTransitionMs: preset.ms })}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                      Math.abs(lyricTransitionMs - preset.ms) <= 40
                        ? 'bg-emerald-400 text-black'
                        : 'bg-white/[0.07] text-zinc-300 hover:bg-white/[0.14]'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
                <span className="ml-1 text-xs font-mono tabular-nums text-emerald-300 bg-emerald-400/10 px-2 py-0.5 rounded-md">
                  {Math.round(lyricTransitionMs)} ms
                </span>
              </div>
            </div>
            <input
              type="range"
              min={150}
              max={1000}
              step={50}
              value={lyricTransitionMs}
              onChange={(e) => updatePref({ lyricTransitionMs: Number(e.target.value) })}
              className="w-full accent-emerald-400 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-zinc-500">
              <span>Crisp (150 ms)</span>
              <span>Balanced (550 ms)</span>
              <span>Dreamy glide (1000 ms)</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 py-3 px-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <div>
              <p className="text-sm font-semibold text-white">Global Lyrics Sync Offset</p>
              <p className="text-xs text-zinc-400 mt-0.5">Shift synced lyrics earlier or later across all songs</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => adjustOffset(-0.25)}
                className="w-8 h-8 rounded-lg bg-white/[0.07] hover:bg-white/[0.15] text-zinc-200 flex items-center justify-center transition active:scale-90"
                title="Delay lyrics 0.25s"
              >
                <Minus size={14} />
              </button>
              <span className="w-16 text-center text-xs font-mono tabular-nums text-zinc-200">
                {syncOffset > 0 ? `+${syncOffset.toFixed(2)}s` : `${syncOffset.toFixed(2)}s`}
              </span>
              <button
                onClick={() => adjustOffset(0.25)}
                className="w-8 h-8 rounded-lg bg-white/[0.07] hover:bg-white/[0.15] text-zinc-200 flex items-center justify-center transition active:scale-90"
                title="Advance lyrics 0.25s"
              >
                <Plus size={14} />
              </button>
              {syncOffset !== 0 && (
                <button
                  onClick={() => updatePref({ lyricSyncOffset: 0 })}
                  className="px-2.5 h-8 rounded-lg bg-white/[0.05] hover:bg-white/[0.14] text-xs font-medium text-zinc-300 transition"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {currentTrack && (
            <div className="flex items-center justify-between gap-4 py-3 px-4 rounded-xl bg-emerald-500/[0.04] border border-emerald-400/20">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  Sync Offset for “{currentTrack.title}”
                </p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Fine-tune timing just for this song without affecting other tracks
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => adjustTrackOffset(-0.25)}
                  className="w-8 h-8 rounded-lg bg-white/[0.07] hover:bg-white/[0.15] text-zinc-200 flex items-center justify-center transition active:scale-90"
                >
                  <Minus size={14} />
                </button>
                <span className="w-16 text-center text-xs font-mono tabular-nums text-emerald-300">
                  {trackSyncOffset > 0 ? `+${trackSyncOffset.toFixed(2)}s` : `${trackSyncOffset.toFixed(2)}s`}
                </span>
                <button
                  onClick={() => adjustTrackOffset(0.25)}
                  className="w-8 h-8 rounded-lg bg-white/[0.07] hover:bg-white/[0.15] text-zinc-200 flex items-center justify-center transition active:scale-90"
                >
                  <Plus size={14} />
                </button>
                {trackSyncOffset !== 0 && (
                  <button
                    onClick={() => updatePref({ trackSyncOffsets: { [trackKey]: 0 } })}
                    className="px-2.5 h-8 rounded-lg bg-white/[0.05] hover:bg-white/[0.14] text-xs font-medium text-zinc-300 transition"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Playback & Background Section */}
        <section className="rounded-2xl bg-white/[0.025] border border-white/[0.07] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Palette size={17} className="text-emerald-400" />
            <h2 className="text-base font-bold text-white">Playback & Background</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ToggleRow
              title="Live Spectrum Visualizer"
              description="Show real-time audio bars in Theater Mode"
              checked={visualizer}
              onChange={(v) => updatePref({ visualizer: v })}
            />
            <ToggleRow
              title="Autoplay Radio"
              description="Keep playing similar tracks when your queue ends"
              checked={autoplay}
              onChange={(v) => updatePref({ autoplay: v })}
            />
            <ToggleRow
              title="Personal Play Counts"
              description="Show total streams in the top bar and 1×, 2× badges on tracks"
              checked={showPlayCounts}
              onChange={(v) => updatePref({ showPlayCounts: v })}
            />
            <ToggleRow
              title="Resume Last Track on Launch"
              description="Load your last played song paused in the bar when Mynil opens"
              checked={restoreLastTrack}
              onChange={(v) => updatePref({ restoreLastTrack: v })}
            />
          </div>

          <ToggleRow
            title="Auto-Open Fullscreen Lyrics on Play"
            description="Jump straight into Theater Mode when starting a new song"
            checked={autoTheaterOnPlay}
            onChange={(v) => updatePref({ autoTheaterOnPlay: v })}
          />

          {visualizer && (
            <div className="flex items-center justify-between gap-4 py-3 px-4 rounded-xl bg-white/[0.03] border border-white/[0.06] flex-wrap">
              <div>
                <p className="text-sm font-semibold text-white">Visualizer Style</p>
                <p className="text-xs text-zinc-400 mt-0.5">Choose how the live audio spectrum renders</p>
              </div>
              <div className="flex items-center gap-1.5">
                {VISUALIZER_STYLES.map((st) => (
                  <button
                    key={st.id}
                    onClick={() => updatePref({ visualizerStyle: st.id })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      visualizerStyle === st.id
                        ? 'bg-emerald-400 text-black shadow'
                        : 'bg-white/[0.07] text-zinc-300 hover:bg-white/[0.14]'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-zinc-300 mb-2">Default Playing Background</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {BACKDROP_PRESETS.map((preset) => {
                const selected = activeBackdrop === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => updatePref({ backdrop: preset.id })}
                    className={`text-left p-2.5 rounded-xl border transition-all ${
                      selected
                        ? 'bg-white/[0.1] border-emerald-400/50 shadow-md'
                        : 'bg-white/[0.03] hover:bg-white/[0.07] border-white/[0.06]'
                    }`}
                  >
                    <div
                      className={`h-9 rounded-lg mb-2 bg-gradient-to-br ${preset.swatch} relative overflow-hidden ring-1 ring-white/15`}
                    >
                      {selected && (
                        <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-black/70 text-emerald-400 flex items-center justify-center">
                          <Check size={10} strokeWidth={3} />
                        </div>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-white truncate">{preset.name}</p>
                    <p className="text-[11px] text-zinc-400 truncate">{preset.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Controls & Shortcuts */}
        <section className="rounded-2xl bg-white/[0.025] border border-white/[0.07] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Keyboard size={17} className="text-emerald-400" />
            <h2 className="text-base font-bold text-white">Keyboard Shortcuts & Library Data</h2>
          </div>

          <ToggleRow
            title="Enable Playback Keyboard Shortcuts"
            description="Control playback, volume, lyrics, and fullscreen view directly from your keyboard"
            checked={keyboardShortcuts}
            onChange={(v) => updatePref({ keyboardShortcuts: v })}
          />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SHORTCUTS.map((sc) => (
              <div
                key={sc.key}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white/[0.025] border border-white/[0.05]"
              >
                <span className="text-[11px] text-zinc-400 truncate">{sc.label}</span>
                <kbd className="px-1.5 py-0.5 rounded bg-white/[0.08] border border-white/10 text-[10px] font-mono text-zinc-200 shrink-0">
                  {sc.key}
                </kbd>
              </div>
            ))}
          </div>

          {topPlayedTracks.length > 0 && (
            <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Trophy size={13} className="text-amber-400" /> Top Played Tracks
                </span>
                <span className="text-zinc-400 font-mono">{totalPlays} total plays</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {topPlayedTracks.map((t, i) => (
                  <div
                    key={t.videoId}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-black/25 border border-white/[0.05]"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">
                        #{i + 1} {t.title}
                      </p>
                      <p className="text-[10px] text-zinc-400 truncate">{t.artist}</p>
                    </div>
                    <span className="text-[11px] font-mono text-emerald-400 shrink-0">{t.count}x</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-4 pt-2 border-t border-white/[0.06] flex-wrap">
            <div className="flex items-center gap-4 text-xs text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Sparkles size={12} className="text-emerald-400" />
                <strong className="text-white">{library.likedSongs.length}</strong> Liked Songs
              </span>
              <span>
                <strong className="text-white">{library.playlists.length}</strong> Playlists
              </span>
              <span>
                <strong className="text-white">{library.history.length}</strong> Recent History
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleExportBackup}
                className="px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-zinc-200 flex items-center gap-1.5 transition"
              >
                <Download size={12} /> Export Backup
              </button>
              <label className="px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-zinc-200 flex items-center gap-1.5 transition cursor-pointer">
                <Upload size={12} /> Import Prefs
                <input type="file" accept=".json,application/json" onChange={handleImportBackup} className="hidden" />
              </label>
              <button
                onClick={clearHistory}
                disabled={library.history.length === 0}
                className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-xs font-semibold text-rose-300 flex items-center gap-1.5 transition disabled:opacity-40"
              >
                <Trash2 size={12} /> Clear Listening History
              </button>
              <button
                type="button"
                onClick={handleResetDevice}
                disabled={resetBusy}
                className="px-3.5 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-xs font-bold text-rose-200 flex items-center gap-1.5 transition disabled:opacity-50"
              >
                <AlertTriangle size={12} /> Full Reset Device
              </button>
            </div>
          </div>
        </section>

        {/* Theme & Custom Accent Color */}
        <section className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-6 space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Palette size={16} className="text-emerald-400" />
            Theme & Accent Color
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { id: 'adaptive', label: 'Adaptive (Album Art)' },
              { id: 'custom', label: 'Custom Accent' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => updatePref({ accentMode: m.id })}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition ${
                  (prefs.accentMode || 'adaptive') === m.id
                    ? 'bg-emerald-400 text-black'
                    : 'bg-white/[0.07] text-zinc-300 hover:bg-white/[0.14]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          {(prefs.accentMode || 'adaptive') === 'custom' && (
            <div className="flex items-center gap-2.5 flex-wrap pt-1">
              {[
                { name: 'Emerald', rgb: '16, 185, 129', hex: '#10b981' },
                { name: 'Cyan', rgb: '56, 189, 248', hex: '#38bdf8' },
                { name: 'Violet', rgb: '168, 85, 247', hex: '#a855f7' },
                { name: 'Rose', rgb: '244, 63, 94', hex: '#f43f5e' },
                { name: 'Amber', rgb: '245, 158, 11', hex: '#f59e0b' },
                { name: 'Crimson', rgb: '239, 68, 68', hex: '#ef4444' },
                { name: 'Pure White', rgb: '255, 255, 255', hex: '#ffffff' },
              ].map((sw) => (
                <button
                  key={sw.name}
                  type="button"
                  onClick={() => updatePref({ accentMode: 'custom', customAccent: sw.rgb })}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition ${
                    prefs.customAccent === sw.rgb
                      ? 'border-white bg-white/15 text-white'
                      : 'border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]'
                  }`}
                >
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: sw.hex }} />
                  {sw.name}
                </button>
              ))}
              <label className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.04] text-xs text-zinc-300 cursor-pointer">
                Pick:
                <input
                  type="color"
                  onChange={(e) => {
                    const hex = e.target.value.replace('#', '');
                    const r = parseInt(hex.slice(0, 2), 16) || 16;
                    const g = parseInt(hex.slice(2, 4), 16) || 185;
                    const b = parseInt(hex.slice(4, 6), 16) || 129;
                    updatePref({ accentMode: 'custom', customAccent: `${r}, ${g}, ${b}` });
                  }}
                  className="w-5 h-5 bg-transparent border-0 cursor-pointer"
                />
              </label>
            </div>
          )}
        </section>

        {/* Crossfade & Gapless Playback */}
        <section className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-6 space-y-3">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Sliders size={16} className="text-emerald-400" />
            Playback Transitions
          </h2>
          <ToggleRow
            title="Crossfade Between Tracks"
            description="Smoothly fade out the current song into the next track"
            checked={Boolean(prefs.crossfadeEnabled)}
            onChange={(v) => updatePref({ crossfadeEnabled: v })}
          />
          {prefs.crossfadeEnabled && (
            <div className="px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300 font-semibold">Crossfade Duration</span>
                <span className="font-mono text-emerald-300 font-bold">{prefs.crossfadeSec ?? 5}s</span>
              </div>
              <input
                type="range"
                min={1}
                max={12}
                step={1}
                value={prefs.crossfadeSec ?? 5}
                onChange={(e) => updatePref({ crossfadeSec: Number(e.target.value) })}
                className="w-full accent-emerald-400 cursor-pointer"
              />
            </div>
          )}
          <ToggleRow
            title="Gapless Playback"
            description="Pre-buffer upcoming album tracks for zero-gap transitions"
            checked={prefs.gaplessEnabled !== false}
            onChange={(v) => updatePref({ gaplessEnabled: v })}
          />
        </section>

        {/* Desktop & Integrations */}
        <section className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-6 space-y-3">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Sparkles size={16} className="text-emerald-400" />
            Desktop & Integrations
          </h2>
          <ToggleRow
            title="Floating Mini-Player"
            description="Show a compact floating player with live waveform"
            checked={Boolean(prefs.miniPlayerEnabled)}
            onChange={(v) => updatePref({ miniPlayerEnabled: v })}
          />
          <ToggleRow
            title="Discord Rich Presence"
            description="Display your currently playing song and progress on Discord"
            checked={prefs.discordRpcEnabled !== false}
            onChange={(v) => updatePref({ discordRpcEnabled: v })}
          />
          <ToggleRow
            title="Minimize to System Tray"
            description="Keep playback running in the tray when closing or minimizing on Windows"
            checked={Boolean(prefs.minimizeToTray)}
            onChange={(v) => updatePref({ minimizeToTray: v })}
          />
        </section>

        {/* App Updates (GitHub Releases) */}
        <section className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-6 space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <RefreshCw size={16} className="text-emerald-400" />
                App Updates
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Current version: <strong className="text-white">v{updaterStatus?.currentVersion || '1.0.0'}</strong>
                {updaterStatus?.repo && !updaterStatus.repo.startsWith('OWNER/') && (
                  <span> · GitHub: <code className="text-zinc-300">{updaterStatus.repo}</code></span>
                )}
              </p>
              {updaterStatus?.updateAvailable && (
                <p className="text-xs text-emerald-300 font-semibold mt-1">
                  New version available: v{updaterStatus.latestVersion}
                </p>
              )}
              {updaterStatus?.error && (
                <p className="text-xs text-amber-300 mt-1">{updaterStatus.error}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCheckUpdates}
                disabled={checkingUpdates}
                className="px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-zinc-200 flex items-center gap-1.5 transition disabled:opacity-50"
              >
                <RefreshCw size={12} className={checkingUpdates ? 'animate-spin' : ''} />
                {checkingUpdates ? 'Checking…' : 'Check for Updates'}
              </button>
              {updaterStatus?.updateAvailable && (
                <button
                  type="button"
                  onClick={handleInstallUpdate}
                  disabled={installingUpdate}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  <Download size={12} />
                  {installingUpdate ? 'Downloading…' : `Install v${updaterStatus.latestVersion}`}
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
