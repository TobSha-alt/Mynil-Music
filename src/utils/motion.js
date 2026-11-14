import { useCallback, useEffect, useRef, useState } from 'react';

export function usePanMotion(enabled, frequency = 0.6, amplitude = 14, isPlaying = true, rotate = false) {
  const [el, setEl] = useState(null);
  const phaseRef = useRef(0);
  const stateRef = useRef({ enabled, frequency, amplitude, isPlaying, rotate });
  stateRef.current = { enabled, frequency, amplitude, isPlaying, rotate };

  const attachRef = useCallback((node) => {
    setEl(node);
  }, []);

  useEffect(() => {
    if (!el) return;
    if (!enabled) {
      el.style.transform = '';
      return;
    }

    let rafId = 0;
    let lastTs = performance.now();

    const applyTransform = () => {
      const { amplitude: a, rotate: rot } = stateRef.current;
      const amp = Math.max(0, Math.min(48, Number(a) || 14));
      const p = phaseRef.current;
      const x = Math.sin(p) * amp;
      const y = Math.cos(p * 0.72) * (amp * 0.52);
      const deg = rot ? Math.sin(p * 0.85) * Math.min(18, amp * 0.45) : 0;
      el.style.transform = rot
        ? `translate3d(${x.toFixed(3)}px, ${y.toFixed(3)}px, 0) rotate(${deg.toFixed(3)}deg)`
        : `translate3d(${x.toFixed(3)}px, ${y.toFixed(3)}px, 0)`;
    };

    // Position immediately at the current stored phase (preserving frozen pause spot)
    applyTransform();

    const tick = (now) => {
      const dt = Math.min(0.05, Math.max(0.0005, (now - lastTs) / 1000));
      lastTs = now;

      const { frequency: f, isPlaying: playing } = stateRef.current;
      if (playing) {
        const freq = Math.max(0.15, Math.min(3, Number(f) || 0.6));
        phaseRef.current += dt * freq * Math.PI * 2;
        applyTransform();
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      if (!stateRef.current.enabled) {
        el.style.transform = '';
      }
    };
  }, [el, enabled]);

  return attachRef;
}
