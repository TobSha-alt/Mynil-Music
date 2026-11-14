import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

export default function ToastBanner() {
  const { toast } = usePlayer();
  if (!toast) return null;

  return (
    <div
      key={toast.id}
      className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[60] pointer-events-none animate-modal-pop"
    >
      <div className="glass-menu px-4 py-2 rounded-full flex items-center gap-2 text-xs font-semibold text-white shadow-2xl">
        <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
        <span className="truncate max-w-xs">{toast.message}</span>
      </div>
    </div>
  );
}
