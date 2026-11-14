import React, { useEffect, useRef } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { getCoverUrl } from '../utils/cover';

export const BACKDROP_PRESETS = [
  {
    id: 'bokeh',
    name: 'Bokeh Flow',
    desc: 'Album glow & floating dots',
    swatch: 'from-emerald-400 via-cyan-500 to-indigo-700',
  },
  {
    id: 'aurora',
    name: 'Aurora Mesh',
    desc: 'Fluid album-tinted orbs',
    swatch: 'from-emerald-400 via-teal-500 to-indigo-600',
  },
  {
    id: 'reactive',
    name: 'Audio Flow',
    desc: 'Beat-reactive light waves',
    swatch: 'from-fuchsia-500 via-violet-500 to-cyan-400',
  },
  {
    id: 'coverflow',
    name: 'Prism Cover',
    desc: 'Living artwork diffusion',
    swatch: 'from-amber-400 via-rose-500 to-purple-600',
  },
  {
    id: 'starfield',
    name: 'Starlight Bokeh',
    desc: 'Drifting ambient particles',
    swatch: 'from-sky-400 via-blue-600 to-indigo-900',
  },
  {
    id: 'vinyl',
    name: 'Vinyl Aura',
    desc: 'Rotating groove rings',
    swatch: 'from-zinc-400 via-emerald-500 to-zinc-900',
  },
  {
    id: 'minimal',
    name: 'Obsidian',
    desc: 'Clean studio darkness',
    swatch: 'from-zinc-700 via-zinc-800 to-black',
  },
];

function ReactiveCanvas({ accentRgb, isPlaying, analyserRef, compact = false }) {
  const canvasRef = useRef(null);
  const liveRef = useRef({ accentRgb, isPlaying });
  liveRef.current = { accentRgb, isPlaying };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let rafId = 0;
    let t = 0;
    let smoothEnergy = 0.25;
    let lastTs = performance.now();
    let w = canvas.clientWidth || 400;
    let h = canvas.clientHeight || 400;
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let bins = null;

    const syncSize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = canvas.clientWidth || w;
      h = canvas.clientHeight || h;
      const pw = Math.max(1, Math.round(w * dpr));
      const ph = Math.max(1, Math.round(h * dpr));
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
    };
    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(canvas);

    const render = (now) => {
      rafId = requestAnimationFrame(render);
      if (document.hidden) {
        lastTs = now;
        return;
      }
      const dt = Math.min(0.05, Math.max(0.0005, (now - lastTs) / 1000));
      lastTs = now;
      const { accentRgb: rgb, isPlaying: playing } = liveRef.current;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      let bass = 0.15;
      let mid = 0.15;
      const analyser = analyserRef?.current;
      if (analyser && playing) {
        if (!bins || bins.length !== analyser.frequencyBinCount) {
          bins = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(bins);
        const lowCount = Math.max(1, Math.floor(bins.length * 0.18));
        let lowSum = 0;
        let midSum = 0;
        for (let i = 0; i < lowCount; i++) lowSum += bins[i];
        for (let i = lowCount; i < Math.floor(bins.length * 0.6); i++) midSum += bins[i];
        bass = lowSum / (lowCount * 255);
        mid = midSum / (Math.max(1, Math.floor(bins.length * 0.42)) * 255);
      }

      const targetEnergy = playing ? 0.28 + bass * 0.85 : 0.14;
      smoothEnergy += (targetEnergy - smoothEnergy) * (1 - Math.exp(-dt * 5.2));
      t += dt * (playing ? 1.1 + bass * 2.1 : 0.36);

      // Flowing audio-reactive nebula blobs
      const blobs = [
        {
          x: w * (0.3 + 0.18 * Math.sin(t * 0.9)),
          y: h * (0.35 + 0.16 * Math.cos(t * 0.7)),
          r: Math.max(w, h) * (compact ? 0.68 : 0.56) * (1 + smoothEnergy * 0.26),
          alpha: 0.34 + smoothEnergy * 0.22,
          color: rgb,
        },
        {
          x: w * (0.72 + 0.16 * Math.cos(t * 0.8)),
          y: h * (0.65 + 0.18 * Math.sin(t * 1.1)),
          r: Math.max(w, h) * (compact ? 0.62 : 0.52) * (1 + mid * 0.25),
          alpha: 0.24 + mid * 0.22,
          color: '139, 92, 246',
        },
        {
          x: w * (0.5 + 0.2 * Math.sin(t * 0.5 + 1.7)),
          y: h * (0.5 + 0.15 * Math.cos(t * 0.6 + 0.8)),
          r: Math.max(w, h) * 0.45 * (1 + bass * 0.3),
          alpha: 0.18 + bass * 0.18,
          color: '56, 189, 248',
        },
      ];

      for (const b of blobs) {
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        g.addColorStop(0, `rgba(${b.color}, ${Math.min(0.65, b.alpha)})`);
        g.addColorStop(0.55, `rgba(${b.color}, ${Math.min(0.25, b.alpha * 0.35)})`);
        g.addColorStop(1, `rgba(${b.color}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
    };

    rafId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [analyserRef, compact]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

function StarfieldCanvas({ accentRgb, isPlaying }) {
  const canvasRef = useRef(null);
  const liveRef = useRef({ accentRgb, isPlaying });
  liveRef.current = { accentRgb, isPlaying };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let rafId = 0;
    let lastTs = performance.now();
    let w = canvas.clientWidth || 400;
    let h = canvas.clientHeight || 400;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const syncSize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth || w;
      h = canvas.clientHeight || h;
      const pw = Math.max(1, Math.round(w * dpr));
      const ph = Math.max(1, Math.round(h * dpr));
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
    };
    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(canvas);

    const particles = Array.from({ length: 42 }, (_, i) => ({
      x: Math.random(),
      y: Math.random(),
      r: 1.4 + (i % 5) * 1.15,
      vx: (Math.random() - 0.5) * 0.027,
      vy: -0.015 - Math.random() * 0.033,
      phase: Math.random() * Math.PI * 2,
      tinted: i % 3 === 0,
    }));

    const SPRITE_SIZE = 64;
    const makeBokehSprite = (rgbStr) => {
      const off = document.createElement('canvas');
      off.width = SPRITE_SIZE;
      off.height = SPRITE_SIZE;
      const octx = off.getContext('2d');
      const half = SPRITE_SIZE / 2;
      const g = octx.createRadialGradient(half, half, 0, half, half, half);
      g.addColorStop(0, `rgba(${rgbStr}, 1)`);
      g.addColorStop(1, `rgba(${rgbStr}, 0)`);
      octx.fillStyle = g;
      octx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
      return off;
    };

    const whiteSprite = makeBokehSprite('255, 255, 255');
    let cachedTintedRgb = '';
    let tintedSprite = null;

    const render = (now) => {
      rafId = requestAnimationFrame(render);
      if (document.hidden) {
        lastTs = now;
        return;
      }
      const dt = Math.min(0.05, Math.max(0.0005, (now - lastTs) / 1000));
      lastTs = now;
      const { accentRgb: rgb, isPlaying: playing } = liveRef.current;

      if (!tintedSprite || cachedTintedRgb !== rgb) {
        tintedSprite = makeBokehSprite(rgb);
        cachedTintedRgb = rgb;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const speed = playing ? 1.45 : 0.45;
      for (const p of particles) {
        p.x = (p.x + p.vx * speed * dt + 1) % 1;
        p.y = (p.y + p.vy * speed * dt + 1) % 1;
        p.phase += dt * (playing ? 1.9 : 0.85);

        const alpha = 0.16 + 0.28 * (0.5 + 0.5 * Math.sin(p.phase));
        const px = p.x * w;
        const py = p.y * h;
        const radius = p.r * 3.2;

        ctx.globalAlpha = alpha;
        ctx.drawImage(p.tinted ? tintedSprite : whiteSprite, px - radius, py - radius, radius * 2, radius * 2);
      }
      ctx.globalAlpha = 1;
    };

    rafId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

export default function PlayingBackdrop({ mode = 'aurora', compact = false }) {
  const { currentTrack, accentRgb, isPlaying, analyserRef } = usePlayer();
  const coverSrc = currentTrack ? getCoverUrl(currentTrack) : '';

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      {/* Subtle GPU-cached cover blur for rich depth in all modes except obsidian */}
      {coverSrc && mode !== 'minimal' && (
        <img
          src={coverSrc}
          alt=""
          className={`absolute inset-0 w-full h-full object-cover blur-2xl gpu-blur-layer transition-opacity duration-700 ${
            mode === 'coverflow' ? 'opacity-45 brightness-90' : 'opacity-18 brightness-75'
          }`}
        />
      )}

      {(mode === 'aurora' || mode === 'bokeh') && (
        <>
          <div
            className="animate-aurora-1 absolute -top-1/4 -left-1/4 w-[85%] h-[85%] will-change-transform transition-colors duration-1000"
            style={{
              background: `radial-gradient(closest-side, rgba(${accentRgb}, ${isPlaying ? 0.46 : 0.26}) 0%, rgba(${accentRgb}, ${isPlaying ? 0.18 : 0.08}) 48%, transparent 100%)`,
            }}
          />
          <div
            className="animate-aurora-2 absolute -bottom-1/4 -right-1/4 w-[80%] h-[80%] will-change-transform"
            style={{
              background: `radial-gradient(closest-side, rgba(139, 92, 246, ${isPlaying ? 0.34 : 0.18}) 0%, rgba(139, 92, 246, ${isPlaying ? 0.12 : 0.06}) 48%, transparent 100%)`,
            }}
          />
          <div
            className="animate-aurora-3 absolute top-1/4 left-1/4 w-[65%] h-[65%] will-change-transform"
            style={{
              background: `radial-gradient(closest-side, rgba(${accentRgb}, 0.22) 0%, rgba(${accentRgb}, 0.07) 50%, transparent 100%)`,
            }}
          />
          {mode === 'bokeh' && <StarfieldCanvas accentRgb={accentRgb} isPlaying={isPlaying} />}
        </>
      )}

      {mode === 'reactive' && (
        <ReactiveCanvas accentRgb={accentRgb} isPlaying={isPlaying} analyserRef={analyserRef} compact={compact} />
      )}

      {mode === 'coverflow' && (
        <>
          <div
            className="animate-aurora-1 absolute inset-0 opacity-65"
            style={{
              background: `radial-gradient(circle at 25% 25%, rgba(${accentRgb}, 0.42), transparent 58%), radial-gradient(circle at 80% 75%, rgba(255, 255, 255, 0.08), transparent 50%)`,
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-black/60" />
        </>
      )}

      {mode === 'starfield' && (
        <>
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(circle at 50% 25%, rgba(${accentRgb}, 0.26), transparent 62%)`,
            }}
          />
          <StarfieldCanvas accentRgb={accentRgb} isPlaying={isPlaying} />
        </>
      )}

      {mode === 'vinyl' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className={`relative w-[135%] aspect-square rounded-full flex items-center justify-center ${
              isPlaying ? 'animate-spin-slow' : ''
            }`}
            style={{
              background: `radial-gradient(closest-side, rgba(${accentRgb}, 0.26) 0%, rgba(${accentRgb}, 0.06) 52%, transparent 100%)`,
            }}
          >
            <div className="w-[78%] h-[78%] rounded-full border border-white/[0.06]" />
            <div className="absolute w-[56%] h-[56%] rounded-full border border-white/[0.08]" />
            <div className="absolute w-[34%] h-[34%] rounded-full border border-white/[0.1]" />
            <div
              className="absolute inset-0 rounded-full opacity-35"
              style={{
                background: `conic-gradient(from 0deg, transparent 0deg, rgba(${accentRgb}, 0.28) 55deg, transparent 140deg, rgba(255,255,255,0.08) 230deg, transparent 360deg)`,
              }}
            />
          </div>
        </div>
      )}

      {mode === 'minimal' && (
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle at 50% 0%, rgba(${accentRgb}, 0.14), transparent 60%)`,
          }}
        />
      )}

      {/* Subtle contrast scrim for crisp lyric legibility */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/20 to-black/55" />
    </div>
  );
}
