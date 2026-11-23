import React, { useEffect, useRef } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { usePanMotion } from '../utils/motion';

export default function Visualizer({ height = 56, barCount = 42, className = '' }) {
  const canvasRef = useRef(null);
  const { analyserRef, isPlaying, accentRgb, library } = usePlayer();
  const prefs = library?.preferences || {};
  const panningWaveform = Boolean(prefs.panningWaveform);
  const panFrequency = Number(prefs.panFrequency ?? 0.6);
  const panAmplitude = Number(prefs.panAmplitude ?? 14);
  const panRotation = Boolean(prefs.panRotation);
  const visualizerStyle = prefs.visualizerStyle || 'bars';
  const visualizerColor = prefs.visualizerColor || 'accent';
  const visualizerPeakDelay = Number(prefs.visualizerPeakDelay ?? 1.2);
  const visualizerAggression = Number(prefs.visualizerAggression ?? 1.0);
  const panRef = usePanMotion(panningWaveform, panFrequency, panAmplitude, isPlaying, panRotation, 2.35);

  const liveRef = useRef({
    isPlaying,
    accentRgb,
    panningWaveform,
    panFrequency,
    panAmplitude,
    visualizerStyle,
    visualizerColor,
    visualizerPeakDelay,
    visualizerAggression,
  });
  liveRef.current = {
    isPlaying,
    accentRgb,
    panningWaveform,
    panFrequency,
    panAmplitude,
    visualizerStyle,
    visualizerColor,
    visualizerPeakDelay,
    visualizerAggression,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let phase = 0;
    let panPhase = 0;
    let lastTs = performance.now();
    let width = canvas.clientWidth || 320;
    let curHeight = canvas.clientHeight || height;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let cachedGrad = null;
    let cachedGradKey = '';

    const peaks = new Float32Array(barCount);
    const smoothBars = new Float32Array(barCount);
    const bandFloor = new Float32Array(barCount);
    for (let i = 0; i < barCount; i++) {
      smoothBars[i] = 0;
      peaks[i] = 0;
      bandFloor[i] = 0;
    }
    let bins = null;
    let timeBins = null;
    let avgRms = 0.08;

    const syncSize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth || width;
      curHeight = canvas.clientHeight || height;
      const pw = Math.max(1, Math.round(width * dpr));
      const ph = Math.max(1, Math.round(curHeight * dpr));
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      cachedGrad = null;
    };

    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(canvas);

    const render = (now) => {
      const dt = Math.min(0.05, Math.max(0.0005, (now - lastTs) / 1000));
      lastTs = now;

      const {
        isPlaying: playing,
        accentRgb: rgb,
        panningWaveform: panOn,
        panFrequency: pFreq,
        panAmplitude: pAmp,
        visualizerStyle: styleMode,
        visualizerColor: colorMode,
        visualizerPeakDelay: peakDelay,
        visualizerAggression: aggRaw,
      } = liveRef.current;
      const agg = Math.max(0.4, Math.min(2.8, Number(aggRaw) || 1.0));

      const w = width;
      const h = curHeight;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const analyser = analyserRef.current;
      let hasSignal = false;
      let rms = 0;
      let onset = 0;
      if (analyser && playing) {
        if (!bins || bins.length !== analyser.frequencyBinCount) {
          bins = new Uint8Array(analyser.frequencyBinCount);
        }
        if (!timeBins || timeBins.length !== analyser.fftSize) {
          timeBins = new Uint8Array(analyser.fftSize);
        }
        analyser.getByteFrequencyData(bins);
        analyser.getByteTimeDomainData(timeBins);
        let sumSq = 0;
        for (let k = 0; k < timeBins.length; k++) {
          const v = (timeBins[k] - 128) / 128;
          sumSq += v * v;
        }
        rms = Math.sqrt(sumSq / timeBins.length);
        avgRms += (rms - avgRms) * Math.min(1, dt * 6);
        onset = Math.max(0, rms - avgRms);

        for (let k = 0; k < bins.length; k++) {
          if (bins[k] > 2 || rms > 0.004) {
            hasSignal = true;
            break;
          }
        }
      }

      const gradKey = `${w}:${h}:${rgb}:${colorMode}`;
      if (!cachedGrad || cachedGradKey !== gradKey) {
        if (colorMode === 'spectrum') {
          const g = ctx.createLinearGradient(0, 0, w, 0);
          g.addColorStop(0, 'rgba(52, 211, 153, 0.95)');
          g.addColorStop(0.35, 'rgba(56, 189, 248, 0.95)');
          g.addColorStop(0.7, 'rgba(168, 85, 247, 0.95)');
          g.addColorStop(1, 'rgba(244, 114, 182, 0.95)');
          cachedGrad = g;
        } else if (colorMode === 'white') {
          const g = ctx.createLinearGradient(0, 0, 0, h);
          g.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
          g.addColorStop(1, 'rgba(255, 255, 255, 0.16)');
          cachedGrad = g;
        } else {
          const g = ctx.createLinearGradient(0, 0, 0, h);
          g.addColorStop(0, `rgba(${rgb}, 1)`);
          g.addColorStop(1, `rgba(${rgb}, 0.16)`);
          cachedGrad = g;
        }
        cachedGradKey = gradKey;
      }

      // Fast attack & musical decay so bars match real audio transients and drop during quiet gaps
      const attackFactor = 1 - Math.exp(-dt * (46 + agg * 18));
      const releaseFactor = 1 - Math.exp(-dt * (14 + agg * 6));
      const minBin = 1;
      const maxBin = bins ? Math.min(bins.length - 1, Math.max(32, Math.floor(bins.length * 0.48))) : 48;

      const sampleBin = (i) => {
        const t0 = i / Math.max(1, barCount);
        const t1 = (i + 1) / Math.max(1, barCount);
        const bStart = Math.max(minBin, Math.floor(minBin * Math.pow(maxBin / minBin, t0)));
        const bEnd = Math.min(bins.length - 1, Math.max(bStart, Math.ceil(minBin * Math.pow(maxBin / minBin, t1))));
        let sum = 0;
        let peakBin = 0;
        let cnt = 0;
        for (let b = bStart; b <= bEnd; b++) {
          const val = bins[b] / 255;
          sum += val;
          if (val > peakBin) peakBin = val;
          cnt++;
        }
        const bandVal = cnt > 0 ? sum / cnt * 0.55 + peakBin * 0.45 : 0;

        // Track slow noise floor per band so dynamic changes (vocals, drums, guitar) stand out sharply
        const floorRate = bandVal < bandFloor[i] ? dt * 4.5 : dt * 0.85;
        bandFloor[i] += (bandVal - bandFloor[i]) * Math.min(1, floorRate);
        const dynamicDelta = Math.max(0, bandVal - bandFloor[i] * 0.62);

        // Combine frequency band energy, dynamic contrast, and real-time time-domain waveform/RMS envelope
        const envGate = Math.min(1.25, Math.max(0.08, rms * 3.4 + onset * 5.2));
        let waveSample = 0;
        if (timeBins && timeBins.length > 0) {
          const ti = Math.min(timeBins.length - 1, Math.floor((i / Math.max(1, barCount - 1)) * (timeBins.length - 1)));
          waveSample = Math.abs((timeBins[ti] - 128) / 128);
        }
        return {
          raw: bandVal,
          dynamicDelta,
          envGate,
          waveSample,
        };
      };
      const shapeGain = (val) => {
        if (typeof val === 'object' && val !== null) {
          if (val.raw < 0.02 && rms < 0.005) return 0;
          const shaped = Math.pow(Math.max(0, val.raw), 1.55) * 0.55 + val.dynamicDelta * (1.35 * agg) + val.waveSample * (0.35 * agg);
          return Math.min(1, Math.max(0, shaped * val.envGate * (0.55 + agg * 0.45)));
        }
        return Math.min(1, Math.pow(Math.max(0, val), 1.2) * (0.45 + agg * 0.55));
      };
      const peakDecay = dt / Math.max(0.1, Number(peakDelay) || 1.2);
      const gap = 3;
      const barW = Math.max(2, (w - gap * (barCount - 1)) / barCount);

      if (playing) {
        phase += dt * 3.6;
        panPhase += dt * pFreq * Math.PI * 2;
      }

      const ampNorm = Math.min(1, pAmp / 24);
      const panCenter = panOn ? 0.5 + 0.42 * ampNorm * Math.sin(panPhase) : 0.5;

      ctx.fillStyle = cachedGrad;
      if (styleMode === 'wave') {
        let maxWave = 0;
        for (let i = 0; i < barCount; i++) {
          let target = playing && hasSignal ? shapeGain(sampleBin(i)) : 0;
          if (!playing || !hasSignal) {
            bandFloor[i] *= Math.max(0, 1 - dt * 3);
          }
          if (panOn && target > 0) {
            const dist = Math.abs(i / Math.max(1, barCount - 1) - panCenter);
            const spotlight = Math.max(0.35, 1.28 - dist * (0.9 + ampNorm * 0.6));
            target = Math.min(1, target * spotlight);
          }
          const sf = target > smoothBars[i] ? attackFactor : releaseFactor;
          smoothBars[i] += (target - smoothBars[i]) * sf;
          if (smoothBars[i] < 0.002 && target === 0) smoothBars[i] = 0;
          if (smoothBars[i] > maxWave) maxWave = smoothBars[i];
        }

        if (maxWave > 0.008) {
          const waveVis = Math.min(1, maxWave * 5);
          ctx.save();
          ctx.beginPath();
          for (let i = 0; i < barCount; i++) {
            const x = (i / Math.max(1, barCount - 1)) * w;
            const y = h - Math.max(2, smoothBars[i] * (h - 8)) - 2;
            if (i === 0) ctx.moveTo(x, y);
            else {
              const prevX = ((i - 1) / Math.max(1, barCount - 1)) * w;
              const prevY = h - Math.max(2, smoothBars[i - 1] * (h - 8)) - 2;
              const cx = (prevX + x) / 2;
              ctx.quadraticCurveTo(prevX, prevY, cx, (prevY + y) / 2);
            }
          }
          const lastY = h - Math.max(2, smoothBars[barCount - 1] * (h - 8)) - 2;
          ctx.lineTo(w, lastY);
          ctx.strokeStyle = cachedGrad;
          ctx.lineWidth = 2.5;
          ctx.lineCap = 'round';
          ctx.globalAlpha = 0.95 * waveVis;
          ctx.stroke();

          ctx.lineTo(w, h);
          ctx.lineTo(0, h);
          ctx.closePath();
          ctx.globalAlpha = 0.22 * waveVis;
          ctx.fill();
          ctx.restore();
        }
        ctx.globalAlpha = 1;
        rafId = requestAnimationFrame(render);
        return;
      }

      for (let i = 0; i < barCount; i++) {
        let target = playing && hasSignal ? shapeGain(sampleBin(i)) : 0;
        if (!playing || !hasSignal) {
          bandFloor[i] *= Math.max(0, 1 - dt * 3);
        }

        if (panOn && target > 0) {
          const dist = Math.abs(i / Math.max(1, barCount - 1) - panCenter);
          const spotlight = Math.max(0.35, 1.28 - dist * (0.9 + ampNorm * 0.6));
          target = Math.min(1, target * spotlight);
        }

        const sf = target > smoothBars[i] ? attackFactor : releaseFactor;
        smoothBars[i] += (target - smoothBars[i]) * sf;
        if (smoothBars[i] < 0.002 && target === 0) smoothBars[i] = 0;
        const ratio = smoothBars[i];
        if (ratio > peaks[i]) peaks[i] = ratio;
        else peaks[i] = Math.max(ratio, peaks[i] - peakDecay);
        if (peaks[i] < 0.002 && ratio === 0) peaks[i] = 0;

        if (ratio < 0.008) continue;

        const x = i * (barW + gap);
        const visFade = Math.min(1, ratio * 6);
        ctx.globalAlpha = (0.42 + ratio * 0.58) * visFade;
        ctx.beginPath();

        if (styleMode === 'mirror') {
          const barH = Math.max(2, ratio * (h - 6));
          const y = (h - barH) / 2;
          ctx.roundRect(x, y, barW, barH, Math.min(barW / 2, 4));
          ctx.fill();
        } else if (styleMode === 'minimal') {
          const dotH = Math.max(3, Math.min(barW, 5));
          const y = Math.max(2, h - 4 - ratio * (h - 10) - dotH / 2);
          ctx.roundRect(x, y, barW, dotH, dotH / 2);
          ctx.fill();
        } else {
          const barH = Math.max(2, ratio * (h - 6));
          const y = h - barH;
          ctx.roundRect(x, y, barW, barH, Math.min(barW / 2, 4));
          ctx.fill();
        }
      }

      // Draw luminous peak caps for classic bars only while active
      if (styleMode === 'bars') {
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < barCount; i++) {
          if (peaks[i] < 0.012) continue;
          const x = i * (barW + gap);
          const peakY = Math.max(0, h - Math.max(3, peaks[i] * (h - 6)) - 3);
          ctx.globalAlpha = (0.22 + peaks[i] * 0.45) * Math.min(1, peaks[i] * 5);
          ctx.beginPath();
          ctx.roundRect(x, peakY, barW, 2, 1);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [analyserRef, barCount, height]);

  return (
    <div ref={panRef} className="w-full will-change-transform">
      <canvas ref={canvasRef} style={{ height }} className={`w-full block ${className}`} />
    </div>
  );
}
