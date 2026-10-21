// The dubbed voice: one clip of synthetic speech per caption line, each placed at its own start time.

import { BAND_RATE } from "../render/aura";
import { PEAK_STEP } from "../worker/protocol";
import { RATE } from "./ema";

export { RATE as DUB_RATE };

/** The dub as exported: its clips, and how loud the file's own sound stays under it (0 to 1). */
export interface DubMix {
  clips: DubClip[];
  original: number;
}

export interface DubClip {
  /** Index of the line it reads. */
  line: number;
  /** Seconds from the start of the media. */
  start: number;
  /** Mono audio at DUB_RATE. */
  audio: Float32Array;
}

/** The dub from `from` seconds on, `frames` samples long, silence between clips. Clips are sorted by start. */
export function dubSlice(clips: DubClip[], from: number, frames: number): Float32Array {
  const out = new Float32Array(frames);
  const first = Math.round(from * RATE);
  for (const c of clips) {
    const at = Math.round(c.start * RATE) - first;
    if (at >= frames) break;
    if (at + c.audio.length <= 0) continue;
    const src = Math.max(0, -at);
    out.set(c.audio.subarray(src, Math.min(c.audio.length, frames - at)), at + src);
  }
  return out;
}

/** dubSlice at another sample rate (linear interpolation): `frames` samples at `rate` from `from` seconds on. */
export function dubAt(clips: DubClip[], from: number, frames: number, rate: number): Float32Array {
  if (rate === RATE) return dubSlice(clips, from, frames);
  const step = RATE / rate;
  const src = dubSlice(clips, from, Math.ceil(frames * step) + 2);
  const out = new Float32Array(frames);
  for (let k = 0; k < frames; k++) {
    const pos = k * step;
    const i = Math.floor(pos);
    out[k] = src[i] + (src[i + 1] - src[i]) * (pos - i);
  }
  return out;
}

/** The whole dub as a 16-bit WAV, for the player and for download. */
export function dubWav(clips: DubClip[], duration: number): Blob {
  const last = clips.at(-1);
  const end = Math.max(duration, last ? last.start + last.audio.length / RATE : 0);
  const n = Math.ceil(end * RATE);
  const head = new DataView(new ArrayBuffer(44));
  const str = (o: number, s: string) => [...s].forEach((c, i) => head.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  head.setUint32(4, 36 + 2 * n, true);
  str(8, "WAVEfmt ");
  head.setUint32(16, 16, true);
  head.setUint16(20, 1, true);
  head.setUint16(22, 1, true);
  head.setUint32(24, RATE, true);
  head.setUint32(28, RATE * 2, true);
  head.setUint16(32, 2, true);
  head.setUint16(34, 16, true);
  str(36, "data");
  head.setUint32(40, 2 * n, true);
  // A minute at a time, so an hour of dub never needs one big buffer.
  const parts: BlobPart[] = [head];
  const step = 60 * RATE;
  for (let i = 0; i < n; i += step) {
    const f = dubSlice(clips, i / RATE, Math.min(step, n - i));
    const pcm = new Int16Array(f.length);
    for (let j = 0; j < f.length; j++) pcm[j] = Math.round(Math.max(-1, Math.min(1, f[j])) * 32767);
    parts.push(pcm);
  }
  return new Blob(parts, { type: "audio/wav" });
}

/**
 * Waveform peaks, aura band levels (low, mid, high at BAND_RATE) and speech
 * loudness from the dubbed clips, for standalone text-to-speech projects.
 */
export function dubMetrics(clips: DubClip[], duration: number) {
  const last = clips.at(-1);
  const end = Math.max(duration, last ? last.start + last.audio.length / RATE : 0);
  const peakStep = Math.round(PEAK_STEP * RATE);
  const bandStep = Math.round(RATE / BAND_RATE);
  const nPeaks = Math.ceil(end / PEAK_STEP);
  const nBands = Math.ceil(end * BAND_RATE);
  const peaks = new Float32Array(nPeaks);
  const bands = new Float32Array(nBands * 3);
  const loudness = new Float32Array(nBands);
  const a1 = 1 - Math.exp((-2 * Math.PI * 500) / RATE);
  const a2 = 1 - Math.exp((-2 * Math.PI * 2500) / RATE);
  let lp1 = 0;
  let lp2 = 0;
  const level = [0, 0, 0];
  const chunk = 60 * RATE;
  const total = Math.ceil(end * RATE);
  for (let base = 0; base < total; base += chunk) {
    const pcm = dubSlice(clips, base / RATE, Math.min(chunk, total - base));
    for (let i = 0; i < pcm.length; i++) {
      const idx = base + i;
      const pk = Math.floor(idx / peakStep);
      const v = Math.abs(pcm[i]);
      if (pk < nPeaks && v > peaks[pk]) peaks[pk] = v;
    }
    for (let i = 0; i + bandStep <= pcm.length; i += bandStep) {
      const bf = Math.floor((base + i) / bandStep);
      if (bf >= nBands) break;
      let e0 = 0;
      let e1 = 0;
      let e2 = 0;
      for (let j = i; j < i + bandStep; j++) {
        const x = pcm[j];
        lp1 += (x - lp1) * a1;
        lp2 += (x - lp2) * a2;
        const low = lp1;
        const mid = lp2 - lp1;
        const high = x - lp2;
        e0 += low * low;
        e1 += mid * mid;
        e2 += high * high;
      }
      loudness[bf] = Math.log(e1 / bandStep + 1e-10);
      const map = (e: number, boost: number) =>
        Math.min(1, Math.max(0, (10 * Math.log10(e / bandStep + 1e-10) + boost + 60) / 45));
      const raw = [map(e0, 0), map(e1, 4), map(e2, 10)];
      for (let b = 0; b < 3; b++) {
        const k = raw[b] > level[b] ? 0.45 : 0.07;
        level[b] += (raw[b] - level[b]) * k;
        bands[bf * 3 + b] = level[b];
      }
    }
  }
  return { peaks, bands, loudness };
}
