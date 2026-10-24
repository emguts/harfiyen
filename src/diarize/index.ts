// Who speaks when: a voice print (speaker embedding) for every short window
// of speech, the prints grouped into speakers, and each word given the
// speaker its windows sound like most. The words' own times say where the
// speech is, so no voice activity model is needed.
//
// The voice prints come from 3D-Speaker's CAM++ (Apache-2.0), exported to
// ONNX by sherpa-onnx; it reads the same 80-dim fbank as Seda.

import type * as OrtWeb from "onnxruntime-web";
import type { Word } from "../engine";
import { OnlineFbank } from "../engine/fbank";
import type { Ort } from "../engine/models";

/** Fbank frames per second. */
const FPS = 100;
/** A window's length and step, seconds. */
const WINDOW = 1.5;
const HOP = 0.5;
/** A window is never shorter than this, seconds: a lone short word borrows the audio around it. */
const MIN_WINDOW = 1;
/** Words closer than this are one stretch of speech, seconds. */
const JOIN = 0.3;

export interface Turn {
  start: number;
  end: number;
  speaker: number;
}

export interface DiarizeOptions {
  /** How many people speak; missing to guess. */
  speakers?: number;
  /** Called with the share of windows done, 0..1. */
  onProgress?: (done: number) => void;
  isCancelled?: () => boolean;
}

/** The voice print model. */
export class SpeakerEmbedder {
  private constructor(
    private ort: Ort,
    private session: OrtWeb.InferenceSession,
  ) {}

  static async create(ort: Ort, bytes: Uint8Array, provider: "wasm" | "cpu" = "wasm"): Promise<SpeakerEmbedder> {
    const session = await ort.InferenceSession.create(bytes, {
      executionProviders: [provider],
      graphOptimizationLevel: "all",
      logSeverityLevel: 3,
    });
    return new SpeakerEmbedder(ort, session);
  }

  /** A unit-length print of `frames` fbank frames (frames x 80), mean-normalised here. */
  async embed(feats: Float32Array, frames: number): Promise<Float32Array> {
    const x = new Float32Array(feats);
    const mean = new Float32Array(80);
    for (let t = 0; t < frames; t++) for (let d = 0; d < 80; d++) mean[d] += x[t * 80 + d];
    for (let d = 0; d < 80; d++) mean[d] /= frames;
    for (let t = 0; t < frames; t++) for (let d = 0; d < 80; d++) x[t * 80 + d] -= mean[d];
    const name = this.session.inputNames[0];
    const out = await this.session.run({ [name]: new this.ort.Tensor("float32", x, [1, frames, 80]) });
    return unit(out[this.session.outputNames[0]].data as Float32Array);
  }
}

function unit(v: Float32Array): Float32Array {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

const dot = (a: Float32Array, b: Float32Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

/** 80-dim log-mel frames of audio pushed in pieces, frame i at i / FPS seconds. */
export class Features {
  private fb = new OnlineFbank(80);
  private feats = new Float32Array(FPS * 60 * 80);
  frames = 0;

  push(pcm: Float32Array) {
    this.fb.acceptWaveform(pcm);
    this.take();
  }

  finish(): this {
    this.fb.inputFinished();
    this.take();
    return this;
  }

  /** Frames a..b, frames x 80. */
  slice(a: number, b: number): Float32Array {
    return this.feats.subarray(a * 80, b * 80);
  }

  private take() {
    this.fb.compute((f) => {
      if ((this.frames + 1) * 80 > this.feats.length) {
        const next = new Float32Array(this.feats.length * 2);
        next.set(this.feats);
        this.feats = next;
      }
      this.feats.set(f, this.frames * 80);
      this.frames++;
    });
  }
}

/** Features of 16 kHz mono audio held whole. */
export const featuresOf = (pcm: Float32Array) => {
  const f = new Features();
  f.push(pcm);
  return f.finish();
};

interface Window {
  start: number;
  end: number;
  /** Where its speech is, without the audio a short window borrows around it. */
  speechStart: number;
  speechEnd: number;
}

/** Stretches of speech from the words, cut into overlapping windows. */
export function windowsOf(words: Word[], length: number): Window[] {
  const spans: { start: number; end: number }[] = [];
  for (const w of words) {
    const last = spans.at(-1);
    if (last && w.start - last.end < JOIN) last.end = Math.max(last.end, w.end);
    else spans.push({ start: w.start, end: w.end });
  }
  const out: Window[] = [];
  for (const s of spans) {
    const d = s.end - s.start;
    if (d <= WINDOW) {
      const pad = Math.max(0, (MIN_WINDOW - d) / 2);
      const start = Math.max(0, s.start - pad);
      out.push({ start, end: Math.min(length, Math.max(s.end + pad, start + MIN_WINDOW)), speechStart: s.start, speechEnd: s.end });
      continue;
    }
    // Evenly spread, the last one ending at the stretch's end.
    const n = Math.ceil((d - WINDOW) / HOP) + 1;
    const step = (d - WINDOW) / (n - 1);
    for (let i = 0; i < n; i++) {
      const start = s.start + i * step;
      out.push({ start, end: start + WINDOW, speechStart: start, speechEnd: start + WINDOW });
    }
  }
  return out;
}

/**
 * Average-linkage clustering on cosine similarity: the two closest groups
 * join until `count` are left, or, without a count, until the closest two
 * are less alike than `threshold`.
 */
export function cluster(prints: Float32Array[], count: number | undefined, threshold: number): number[] {
  const n = prints.length;
  const members = prints.map((_, i) => [i]);
  // sim[i * n + j]: mean similarity between groups i and j; updated on each join.
  const sim = new Float32Array(n * n);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) sim[i * n + j] = sim[j * n + i] = dot(prints[i], prints[j]);
  const alive = Array.from({ length: n }, (_, i) => i);
  const want = Math.max(1, Math.min(count ?? 1, n));
  while (alive.length > want) {
    let best = -Infinity;
    let bi = -1;
    let bj = -1;
    for (let x = 0; x < alive.length; x++)
      for (let y = x + 1; y < alive.length; y++) {
        const s = sim[alive[x] * n + alive[y]];
        if (s > best) {
          best = s;
          bi = x;
          bj = y;
        }
      }
    if (count === undefined && best < threshold) break;
    const gi = alive[bi];
    const gj = alive[bj];
    const ni = members[gi].length;
    const nj = members[gj].length;
    for (const g of alive) {
      if (g === gi || g === gj) continue;
      sim[gi * n + g] = sim[g * n + gi] = (sim[gi * n + g] * ni + sim[gj * n + g] * nj) / (ni + nj);
    }
    members[gi].push(...members[gj]);
    alive.splice(bj, 1);
  }
  const labels = new Array<number>(n).fill(0);
  alive.forEach((g, k) => {
    for (const m of members[g]) labels[m] = k;
  });
  return labels;
}

function nearest(cs: Float32Array[], p: Float32Array): number {
  let best = 0;
  for (let j = 1; j < cs.length; j++) if (dot(cs[j], p) > dot(cs[best], p)) best = j;
  return best;
}

function centroids(prints: Float32Array[], labels: number[], k: number): Float32Array[] {
  const out = Array.from({ length: k }, () => new Float32Array(prints[0].length));
  prints.forEach((p, i) => {
    const c = out[labels[i]];
    for (let d = 0; d < p.length; d++) c[d] += p[d];
  });
  return out.map(unit);
}

/** Similarity under which two windows are taken for different people, without a given count. */
const THRESHOLD = 0.4;
/** At most this many windows are clustered; the rest only refine the result. */
const MAX_CLUSTER = 600;
/** A guessed speaker with less of the speech than this joins the closest other one. */
const MIN_SHARE = 0.03;
/** What changing speaker between two words costs, in similarity, between words that run on... */
const SWITCH = 0.25;
/** ...and after a pause this long or a sentence end, nearly nothing. */
const PAUSE = 0.5;

/**
 * Each word's speaker, by index into `words`: 0, 1, ... in the order they
 * first speak; null when cancelled. `audio` starts at `offset` seconds of
 * the file; word times are the file's.
 */
export async function diarize(
  embedder: SpeakerEmbedder,
  audio: Features,
  offset: number,
  words: Word[],
  o: DiarizeOptions = {},
): Promise<number[] | null> {
  if (!words.length) return [];
  const local = words.map((w) => ({ ...w, start: w.start - offset, end: w.end - offset }));
  const { frames } = audio;
  const windows = windowsOf(local, frames / FPS);
  const prints: Float32Array[] = [];
  for (const [i, w] of windows.entries()) {
    if (o.isCancelled?.()) return null;
    const a = Math.max(0, Math.floor(w.start * FPS));
    const b = Math.min(frames, Math.max(a + 10, Math.round(w.end * FPS)));
    prints.push(await embedder.embed(audio.slice(a, b), b - a));
    if (i % 8 === 0) o.onProgress?.(i / windows.length);
  }
  o.onProgress?.(1);

  // Clustering is quadratic: a long file clusters an even sample of its windows.
  const step = Math.max(1, prints.length / MAX_CLUSTER);
  const sample = Array.from({ length: Math.min(prints.length, MAX_CLUSTER) }, (_, i) => prints[Math.floor(i * step)]);
  let labels = cluster(sample, o.speakers, THRESHOLD);
  let k = Math.max(...labels) + 1;
  // Too small a guessed group is usually one voice that sounded off (a laugh, a cough).
  if (o.speakers === undefined) {
    for (;;) {
      const sizes = new Array<number>(k).fill(0);
      for (const l of labels) sizes[l]++;
      const small = sizes.findIndex((s) => s < Math.max(2, MIN_SHARE * labels.length));
      if (small < 0 || k === 1) break;
      const cs = centroids(sample, labels, k);
      let to = -1;
      for (let j = 0; j < k; j++) if (j !== small && (to < 0 || dot(cs[small], cs[j]) > dot(cs[small], cs[to]))) to = j;
      labels = labels.map((l) => (l === small ? to : l)).map((l) => (l > small ? l - 1 : l));
      k--;
    }
  }
  // A few rounds of k-means over every window settle each speaker's print.
  let cs = centroids(sample, labels, k);
  for (let r = 0; r < 3; r++) {
    const all = prints.map((p) => nearest(cs, p));
    cs = centroids(prints, all, k).map((c, j) => (c.some((x) => x) ? c : cs[j]));
  }

  // Each word: how much it sounds like each speaker, over the windows it lies in.
  const score = local.map((w) => {
    const s = new Float32Array(k);
    let weight = 0;
    windows.forEach((win, i) => {
      const lap = Math.min(w.end, win.speechEnd) - Math.max(w.start, win.speechStart);
      if (lap <= 0) return;
      weight += lap;
      for (let j = 0; j < k; j++) s[j] += lap * dot(prints[i], cs[j]);
    });
    if (!weight) {
      // Not in any window's speech (shouldn't happen): the nearest window decides.
      const mid = (w.start + w.end) / 2;
      let near = 0;
      windows.forEach((win, i) => {
        const d = Math.abs((win.start + win.end) / 2 - mid);
        if (d < Math.abs((windows[near].start + windows[near].end) / 2 - mid)) near = i;
      });
      for (let j = 0; j < k; j++) s[j] = dot(prints[near], cs[j]);
      return s;
    }
    return s.map((x) => x / weight);
  });

  // The likeliest speaker sequence: changing speaker costs SWITCH, little at a pause.
  const n = local.length;
  const back = Array.from({ length: n }, () => new Int32Array(k));
  let cost = Array.from(score[0], (x) => -x);
  for (let i = 1; i < n; i++) {
    const pause = local[i].start - local[i - 1].end >= PAUSE || /[.?!…]$/.test(local[i - 1].text);
    const sw = pause ? SWITCH * 0.1 : SWITCH;
    const next = new Array<number>(k);
    for (let j = 0; j < k; j++) {
      let best = Infinity;
      for (let p = 0; p < k; p++) {
        const c = cost[p] + (p === j ? 0 : sw);
        if (c < best) {
          best = c;
          back[i][j] = p;
        }
      }
      next[j] = best - score[i][j];
    }
    cost = next;
  }
  const out = new Array<number>(n);
  out[n - 1] = cost.indexOf(Math.min(...cost));
  for (let i = n - 1; i > 0; i--) out[i - 1] = back[i][out[i]];
  return byFirstSpeech(out);
}

/** Speaker numbers in the order they first speak. */
function byFirstSpeech(labels: number[]): number[] {
  const order = new Map<number, number>();
  for (const l of labels) if (!order.has(l)) order.set(l, order.size);
  return labels.map((l) => order.get(l)!);
}

/** Runs of words by one speaker, as time ranges. */
export function turnsOf(words: Word[], labels: number[]): Turn[] {
  const out: Turn[] = [];
  words.forEach((w, i) => {
    const last = out.at(-1);
    if (last && last.speaker === labels[i]) last.end = w.end;
    else out.push({ start: w.start, end: w.end, speaker: labels[i] });
  });
  return out;
}
