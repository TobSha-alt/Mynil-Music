import React, { useEffect, useState } from 'react';
import { X, HardDriveDownload, Laptop, Music2, Video, Loader2 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

const FORMATS = [
  { id: 'mp3', label: 'MP3 Audio', ext: '.mp3', hint: 'Universal audio', icon: Music2 },
  { id: 'm4a', label: 'M4A Audio', ext: '.m4a', hint: 'High quality AAC', icon: Music2 },
  { id: 'mp4', label: 'MP4 Video', ext: '.mp4', hint: 'Video + audio', icon: Video },
];

export default function DownloadModal() {
  const { downloadPrompt, closeDownloadModal, downloadOfflineTracks, showToast } = usePlayer();
  const [format, setFormat] = useState('mp3');
  const [busy, setBusy] = useState(false);

  const tracks = downloadPrompt?.tracks || [];
  const label = downloadPrompt?.label || (tracks.length === 1 ? tracks[0]?.title : 'Selection') || 'Download';
  const isSingle = tracks.length === 1;
  const isVideoTrack = isSingle && Boolean(tracks[0]?.isVideo);

  useEffect(() => {
    if (!downloadPrompt) return;
    setBusy(false);
    setFormat(tracks.length === 1 && tracks[0]?.isVideo ? 'mp4' : 'mp3');
  }, [downloadPrompt]);

  if (!downloadPrompt || tracks.length === 0) return null;

  const handleOffline = () => {
    closeDownloadModal();
    downloadOfflineTracks(tracks);
  };

  const handleDeviceDownload = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (isSingle) {
        const url = window.sona.getDownloadFileUrl(tracks[0], format);
        const a = document.createElement('a');
        a.href = url;
        a.download = '';
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast(`Downloading ${format.toUpperCase()} to device...`);
        closeDownloadModal();
      } else {
        showToast(`Preparing ${tracks.length} tracks as .zip...`);
        const blob = await window.sona.downloadZip(label, tracks, format);
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl;
        const safeName = String(label || 'mynil-download').replace(/[<>:"/\\|?*]+/g, '_').trim() || 'mynil-download';
        a.download = `${safeName}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
        showToast(`Downloaded ${safeName}.zip`);
        closeDownloadModal();
      }
    } catch (err) {
      showToast(err?.message || 'Device download failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={() => !busy && closeDownloadModal()}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/15 bg-zinc-950/95 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
          <div className="min-w-0 pr-3">
            <h3 className="text-base font-bold text-white truncate">Download "{label}"</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              {isSingle
                ? `${tracks[0]?.artist || 'Unknown Artist'}${isVideoTrack ? ' • Music Video' : ''}`
                : `${tracks.length} tracks`}
            </p>
          </div>
          <button
            onClick={() => !busy && closeDownloadModal()}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {/* Option 1: In-app offline */}
          <button
            onClick={handleOffline}
            disabled={busy}
            className="w-full text-left p-4 rounded-xl border border-white/25 bg-white/[0.08] hover:bg-white/[0.13] transition flex items-start gap-3.5 group"
          >
            <div className="w-10 h-10 rounded-xl bg-white/15 text-white flex items-center justify-center shrink-0">
              <HardDriveDownload className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-white">
                Download for Offline Playback
              </div>
              <div className="text-xs text-zinc-400 mt-0.5">
                Saves audio and synced .lrc lyrics inside Mynil for zero-internet playback.
              </div>
            </div>
          </button>

          {/* Option 2: Device download */}
          <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03] space-y-3">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-white/10 text-white flex items-center justify-center shrink-0">
                <Laptop className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-white">Download to Device</div>
                <div className="text-xs text-zinc-400 mt-0.5">
                  {isSingle
                    ? 'Save directly to your Downloads folder.'
                    : `Bundle all ${tracks.length} tracks into a .zip archive.`}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {FORMATS.map((f) => {
                const Icon = f.icon;
                const active = format === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    disabled={busy}
                    onClick={() => setFormat(f.id)}
                    className={`p-2.5 rounded-xl border text-left transition ${
                      active
                        ? 'border-white bg-white text-black'
                        : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold">{f.ext.toUpperCase()}</span>
                      <Icon className="w-3.5 h-3.5 opacity-80" />
                    </div>
                    <div className={`text-[10px] mt-1 ${active ? 'text-black/70' : 'text-zinc-500'}`}>
                      {f.hint}
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleDeviceDownload}
              disabled={busy}
              className="w-full py-2.5 px-4 rounded-xl bg-white text-black font-bold text-xs hover:bg-zinc-200 transition flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{isSingle ? 'Preparing file...' : 'Packaging ZIP...'}</span>
                </>
              ) : (
                <span>
                  {isSingle
                    ? `Download ${format.toUpperCase()} File`
                    : `Download .ZIP (${tracks.length} × ${format.toUpperCase()})`}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
