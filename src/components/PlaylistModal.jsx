import React, { useEffect, useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

const GRADIENTS = [
  'from-emerald-500 via-teal-600 to-cyan-900',
  'from-violet-600 via-fuchsia-600 to-indigo-900',
  'from-rose-500 via-pink-600 to-purple-900',
  'from-amber-500 via-orange-600 to-red-900',
  'from-sky-500 via-blue-600 to-indigo-900',
];

export default function PlaylistModal({ open, onClose, onCreated, editing = null }) {
  const { createPlaylist, updatePlaylist, showToast } = usePlayer();
  const [name, setName] = useState(editing?.name || '');
  const [description, setDescription] = useState(editing?.description || '');
  const [gradient, setGradient] = useState(editing?.gradient || GRADIENTS[0]);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name || '');
    setDescription(editing?.description || '');
    setGradient(editing?.gradient || GRADIENTS[0]);
  }, [open, editing]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (editing) {
      await updatePlaylist(editing.id, { name, description, gradient });
      showToast(`Updated "${name.trim()}"`);
      onClose();
    } else {
      const pl = await createPlaylist({ name, description, gradient });
      showToast(`Created playlist "${name.trim()}"`);
      onClose();
      if (pl && onCreated) onCreated(pl.id);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-[#14141f] border border-white/10 shadow-2xl p-6 animate-modal-pop"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-emerald-400" />
            <h2 className="text-lg font-bold text-white">
              {editing ? 'Edit Playlist' : 'Create New Playlist'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Playlist Name</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Midnight Synthwave"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Vibes, mood, or notes..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-400/60 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-2">Cover Theme</label>
            <div className="flex items-center gap-2.5">
              {GRADIENTS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGradient(g)}
                  className={`w-9 h-9 rounded-xl bg-gradient-to-br ${g} transition-all ${
                    gradient === g ? 'ring-2 ring-white scale-110' : 'opacity-60 hover:opacity-100'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-300 hover:bg-white/10 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-400 text-black hover:bg-emerald-300 active:scale-95 transition"
          >
            {editing ? 'Save Changes' : 'Create Playlist'}
          </button>
        </div>
      </form>
    </div>
  );
}
