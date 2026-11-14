import React, { useState, useEffect } from 'react';
import { X, User, RefreshCw, LogOut, Sparkles, Check } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

export default function AccountModal({
  open,
  onClose,
  accountStatus,
  onStatusChange,
  onOpenSettings,
}) {
  const { refreshLibrary, showToast } = usePlayer();
  const [tab, setTab] = useState('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
  }, [open]);

  if (!open) return null;

  const isSignedIn = accountStatus?.mode === 'account';

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (tab === 'signup') {
        const res = await window.sona.signUp({ username, password });
        onStatusChange?.(res.status);
        if (res.library) await refreshLibrary(res.library);
        showToast?.(`Signed in as @${res.status?.user?.username}`);
      } else {
        const res = await window.sona.signIn({ username, password });
        onStatusChange?.(res.status);
        if (res.library) await refreshLibrary(res.library);
        showToast?.(`Welcome back, @${res.status?.user?.username}`);
      }
      setPassword('');
      onClose();
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncBusy(true);
    setError('');
    try {
      const res = await window.sona.syncAccount();
      onStatusChange?.(res.status);
      if (res.library) await refreshLibrary(res.library);
      showToast?.(res.status?.lastError ? res.status.lastError : 'Library synced');
    } catch (err) {
      setError(err.message || 'Sync failed');
    } finally {
      setSyncBusy(false);
    }
  };

  const handleSignOut = async () => {
    const st = await window.sona.signOut();
    onStatusChange?.(st);
    showToast?.('Switched to Guest Mode');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="w-full max-w-md rounded-3xl bg-[#101019] border border-white/10 shadow-2xl overflow-hidden animate-modal-pop">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-400/15 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
              <User size={20} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white">
                {isSignedIn ? `@${accountStatus.user?.username}` : 'Welcome to Sona'}
              </h2>
              <p className="text-xs text-zinc-400">
                {isSignedIn
                  ? 'Account Sync is active across devices'
                  : 'Sign in to sync across Mac & Windows, or continue as Guest'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="px-3.5 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300">
              {error}
            </div>
          )}

          {isSignedIn ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400 flex items-center gap-1.5">
                    <Sparkles size={13} className="text-emerald-400" /> Auto-Sync
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-semibold flex items-center gap-1">
                    <Check size={11} /> Enabled
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Last synced</span>
                  <span className="text-zinc-200 font-medium">
                    {accountStatus.lastSyncAt
                      ? new Date(accountStatus.lastSyncAt).toLocaleString()
                      : 'Just now'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleSyncNow}
                  disabled={syncBusy}
                  className="py-2.5 px-4 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-black text-xs font-bold flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                >
                  <RefreshCw size={14} className={syncBusy ? 'animate-spin' : ''} />
                  {syncBusy ? 'Syncing...' : 'Sync Now'}
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="py-2.5 px-4 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition"
                >
                  <LogOut size={14} /> Sign Out
                </button>
              </div>

              {onOpenSettings && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSettings();
                  }}
                  className="w-full py-2 text-xs text-zinc-400 hover:text-white transition"
                >
                  Open Full Account Settings
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Sign In / Create Account Tabs */}
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/[0.05] border border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setTab('signin')}
                  className={`py-2 rounded-lg text-xs font-bold transition ${
                    tab === 'signin' ? 'bg-white text-black shadow' : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setTab('signup')}
                  className={`py-2 rounded-lg text-xs font-bold transition ${
                    tab === 'signup' ? 'bg-white text-black shadow' : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  Create Account
                </button>
              </div>

              <form onSubmit={handleAuth} className="space-y-3">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username"
                  required
                  minLength={3}
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 text-sm text-white placeholder-zinc-500 outline-none focus:border-emerald-400/60"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                  minLength={4}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 text-sm text-white placeholder-zinc-500 outline-none focus:border-emerald-400/60"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-black text-sm font-extrabold transition disabled:opacity-50"
                >
                  {busy
                    ? 'Please wait...'
                    : tab === 'signup'
                    ? 'Create Account & Sync'
                    : 'Sign In & Sync'}
                </button>
              </form>

              <div className="pt-2 border-t border-white/[0.07]">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-zinc-200 transition"
                >
                  Continue as Guest
                </button>
              </div>
              <p className="text-[11px] text-center text-zinc-500">
                Guest mode saves locally on this device and prompts to sign in on launch.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
