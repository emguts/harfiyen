// Vocals out of a song, by Kimberley Jensen's Mel-Band RoFormer (MIT weights;
// audiojs/mel-roformer's fp16 ONNX export), so Whisper hears the singer and not
// the band. The graph maps a stereo spectrogram to the vocals' spectrogram; the
// STFT around it is done here, as @audio/neural-separate does it (MIT): Hann
// of 2048, hop 441, centered with reflect padding, unnormalized. Songs are cut
// as Music-Source-Separation-Training's demix() cuts them for this model:
// 8 s segments every 4 s, each fading in and out linearly over a tenth of its
// length (the first not in, the last not out), the sum divided by the weights;
// an input longer than two segments less a step is first reflected out by that
// much on each side.
//
// Streaming: push() takes 44.1 kHz stereo as it is decoded and returns the
// vocals (mono) that no later segment can change, so a long file never sits in
// memory whole and Whisper starts on the first seconds right away.

import type * as OrtWeb from "onnxruntime-web";
import type { EncoderProvider, Ort } from "../engine/models";
import { Fft } from "./fft";

export interface VocalsConfig {
  name: string;
  sampleRate: number;
  nFft: number;
  hop: number;
  /** Samples per segment; frames = segment / hop + 1. */
  segment: number;
  /** Segment start spacing, as a fraction of the segment. */
  step: number;
  /** Crossfade length, as a fraction of the segment. */
  fade: number;
  files: Record<string, number>;
}

const CHANNELS = 2;

/** The loaded graph; each file gets its own VocalSeparator over it. */
export class VocalModel {
  private constructor(
    readonly ort: Ort,
    readonly session: OrtWeb.InferenceSession,
    readonly config: VocalsConfig,
  ) {}

  static async create(ort: Ort, model: Uint8Array, config: VocalsConfig, provider: EncoderProvider) {
    const session = await ort.InferenceSession.create(model, {
      executionProviders: [provider],
      graphOptimizationLevel: "all",
      logSeverityLevel: 3,
    });
    return new VocalModel(ort, session, config);
  }

  separator() {
    return new VocalSeparator(this);
  }
}

export class VocalSeparator {
  private readonly ort: Ort;
  private readonly session: OrtWeb.InferenceSession;
  readonly config: VocalsConfig;
  private readonly fft: Fft;
  private readonly win: Float64Array;
  /** The squared-window envelope of a segment's frames, for the iSTFT. */
  private readonly env: Float64Array;
  private readonly frames: number;
  private readonly bins: number;
  private readonly stepLen: number;
  private readonly fadeLen: number;
  // Scratch, reused for every frame.
  private readonly re: Float64Array;
  private readonly im: Float64Array;

  // Input not yet behind every segment that needs it; buf[c][0] is absolute sample `bufStart`.
  private buf: Float32Array[] = [new Float32Array(0), new Float32Array(0)];
  private bufStart = 0;
  private bufLen = 0;
  // Weighted sums from `accStart` on.
  private acc: Float64Array[] = [new Float64Array(0), new Float64Array(0)];
  private wsum = new Float64Array(0);
  private accStart = 0;
  /** Absolute start of the next segment; everything before it is final. */
  private next = 0;
  private segments = 0;
  // demix()'s reflection at the ends: input held until it is long enough to need it.
  private readonly border: number;
  private pending: Float32Array[] | null = [new Float32Array(0), new Float32Array(0)];
  /** The last border + 1 input samples, for the reflection at the end. */
  private tail: Float32Array[] = [new Float32Array(0), new Float32Array(0)];
  private wide = false;
  /** Input samples taken, and output samples given, unpadded. */
  private taken = 0;
  private given = 0;
  /** Seconds spent in the model and the STFT, for the status line. */
  elapsed = 0;

  constructor(model: VocalModel) {
    this.ort = model.ort;
    this.session = model.session;
    const config = (this.config = model.config);
    const { nFft, hop, segment } = config;
    this.fft = new Fft(nFft);
    this.win = new Float64Array(nFft);
    for (let i = 0; i < nFft; i++) this.win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / nFft);
    this.frames = Math.floor(segment / hop) + 1;
    this.bins = nFft / 2 + 1;
    this.stepLen = Math.floor(segment * config.step);
    this.fadeLen = Math.floor(segment * config.fade);
    this.border = segment - this.stepLen;
    this.re = new Float64Array(nFft);
    this.im = new Float64Array(nFft);
    this.env = new Float64Array((this.frames - 1) * hop + nFft);
    for (let t = 0; t < this.frames; t++) for (let i = 0; i < nFft; i++) this.env[t * hop + i] += this.win[i] ** 2;
  }

  /** Mono or stereo at config.sampleRate; returns the vocals that are final now. */
  async push(channels: Float32Array[]): Promise<Float32Array> {
    const stereo = [0, 1].map((c) => channels[Math.min(c, channels.length - 1)]);
    this.taken += stereo[0].length;
    this.keepTail(stereo);
    if (this.pending) {
      this.pending = this.pending.map((p, c) => concat(p, stereo[c]));
      if (this.pending[0].length <= 2 * this.border) return new Float32Array(0);
      // Long enough: reflect the start out and go.
      const head = this.pending.map((x) => Float32Array.from({ length: this.border }, (_, i) => x[this.border - i]));
      this.append(head);
      this.append(this.pending);
      this.pending = null;
      this.wide = true;
    } else this.append(stereo);
    const L = this.config.segment;
    while (this.bufStart + this.bufLen >= this.next + L) {
      await this.runSegment(this.next, L, false);
      this.next += this.stepLen;
    }
    return this.emit(this.next);
  }

  /** The rest, once the input has ended. */
  async finish(): Promise<Float32Array> {
    if (this.pending) {
      this.append(this.pending);
      this.pending = null;
    } else if (this.wide) {
      const t = this.tail;
      const k = t[0].length - 1;
      this.append(t.map((x) => Float32Array.from({ length: this.border }, (_, i) => x[k - 1 - i])));
    }
    const L = this.config.segment;
    const end = this.bufStart + this.bufLen;
    while (this.next < end) {
      const last = this.next + L >= end;
      await this.runSegment(this.next, Math.min(L, end - this.next), last);
      if (last) break;
      this.next += this.stepLen;
    }
    return this.emit(end);
  }

  private append(channels: Float32Array[]) {
    const n = channels[0].length;
    if (!n) return;
    if (this.bufLen + n > this.buf[0].length) {
      const size = Math.max(this.bufLen + n, this.buf[0].length * 2, this.config.segment * 2);
      this.buf = this.buf.map((b) => {
        const grown = new Float32Array(size);
        grown.set(b.subarray(0, this.bufLen));
        return grown;
      });
    }
    for (let c = 0; c < CHANNELS; c++) this.buf[c].set(channels[c], this.bufLen);
    this.bufLen += n;
  }

  private keepTail(stereo: Float32Array[]) {
    const keep = this.border + 1;
    this.tail = this.tail.map((t, c) => {
      const all = concat(t, stereo[c]);
      return all.length > keep ? all.slice(all.length - keep) : all;
    });
  }

  /** Separate [start, start + len) and add it, weighted, to the sums. */
  private async runSegment(start: number, len: number, last: boolean) {
    const t0 = performance.now();
    const { segment: L, hop, nFft } = this.config;
    const { frames: T, bins: F } = this;
    const from = start - this.bufStart;
    // A short last segment is reflected out to full length when it is mostly input, padded with zeros when not.
    const reflect = len > L / 2;
    const spec = new Float32Array(2 * CHANNELS * F * T);
    const seg = new Float64Array(L);
    for (let c = 0; c < CHANNELS; c++) {
      const src = this.buf[c];
      for (let i = 0; i < L; i++) seg[i] = i < len ? src[from + i] : reflect ? src[from + reflectIndex(i, len)] : 0;
      this.stft(seg, spec.subarray(2 * c * F * T, (2 * c + 1) * F * T), spec.subarray((2 * c + 1) * F * T, (2 * c + 2) * F * T));
    }
    const name = this.session.inputNames[0];
    const out = await this.session.run({ [name]: new this.ort.Tensor("float32", spec, [1, 2 * CHANNELS, F, T]) });
    const z = out[this.session.outputNames[0]];
    const vocals = (await z.getData()) as Float32Array;
    z.dispose();

    this.reserve(start + len);
    const first = this.segments === 0;
    const fade = this.fadeLen;
    const at = start - this.accStart;
    const w = new Float64Array(len);
    for (let i = 0; i < len; i++) {
      let v = 1;
      if (!first && i < fade) v = i / (fade - 1);
      if (!last && i >= L - fade) v = Math.min(v, (L - 1 - i) / (fade - 1));
      w[i] = v;
      this.wsum[at + i] += v;
    }
    const wave = new Float64Array((T - 1) * hop + nFft);
    for (let c = 0; c < CHANNELS; c++) {
      this.istft(
        vocals.subarray(2 * c * F * T, (2 * c + 1) * F * T),
        vocals.subarray((2 * c + 1) * F * T, (2 * c + 2) * F * T),
        wave,
      );
      const acc = this.acc[c];
      const pad = nFft >> 1;
      for (let i = 0; i < len; i++) {
        const e = this.env[pad + i];
        if (e > 1e-8) acc[at + i] += (wave[pad + i] / e) * w[i];
      }
    }
    this.segments++;
    this.elapsed += (performance.now() - t0) / 1000;
  }

  /** Centered, reflect-padded STFT of one segment, as [F][T] planes. */
  private stft(x: Float64Array, outRe: Float32Array, outIm: Float32Array) {
    const { nFft: n, hop } = this.config;
    const { frames: T, bins: F, re, im, win } = this;
    const N = x.length;
    const pad = n >> 1;
    for (let t = 0; t < T; t++) {
      const pos = t * hop - pad;
      if (pos < 0 || pos + n > N) for (let i = 0; i < n; i++) re[i] = x[reflectIndex(pos + i, N)] * win[i];
      else for (let i = 0; i < n; i++) re[i] = x[pos + i] * win[i];
      im.fill(0);
      this.fft.transform(re, im);
      for (let f = 0; f < F; f++) {
        outRe[f * T + t] = re[f];
        outIm[f * T + t] = im[f];
      }
    }
  }

  /** Windowed overlap-add of the frames into `out` (not yet divided by the envelope). */
  private istft(specRe: Float32Array, specIm: Float32Array, out: Float64Array) {
    const { nFft: n, hop } = this.config;
    const { frames: T, bins: F, re, im, win } = this;
    out.fill(0);
    for (let t = 0; t < T; t++) {
      for (let f = 0; f < F; f++) {
        re[f] = specRe[f * T + t];
        im[f] = specIm[f * T + t];
      }
      // A real signal's spectrum: the upper half mirrors the lower, conjugated.
      im[0] = 0;
      im[F - 1] = 0;
      for (let f = F; f < n; f++) {
        re[f] = re[n - f];
        im[f] = -im[n - f];
      }
      this.fft.transform(re, im, true);
      for (let i = 0, p = t * hop; i < n; i++, p++) out[p] += (re[i] / n) * win[i];
    }
  }

  /** Room in the sums up to absolute sample `end`. */
  private reserve(end: number) {
    const need = end - this.accStart;
    if (need <= this.wsum.length) return;
    const size = Math.max(need, this.wsum.length * 2);
    const grow = (a: Float64Array) => {
      const b = new Float64Array(size);
      b.set(a);
      return b;
    };
    this.acc = this.acc.map(grow);
    this.wsum = grow(this.wsum);
  }

  /** Mono vocals from accStart to `upTo`, then drop what no segment needs any more. */
  private emit(upTo: number): Float32Array {
    const n = Math.max(0, upTo - this.accStart);
    const out = new Float32Array(n);
    const [l, r] = this.acc;
    for (let i = 0; i < n; i++) {
      const s = this.wsum[i];
      out[i] = s > 0 ? (l[i] + r[i]) / (2 * s) : 0;
    }
    // Shift the sums and the input down to what is still open.
    const keep = this.wsum.length - n;
    this.acc = this.acc.map((a) => a.copyWithin(0, n).fill(0, keep));
    this.wsum.copyWithin(0, n).fill(0, keep);
    this.accStart += n;
    // Drop the reflected lead-in and anything past the input's end.
    const lead = this.wide ? Math.max(0, this.border - (this.accStart - n)) : 0;
    const keepOut = out.subarray(Math.min(n, lead), Math.min(n, lead + this.taken - this.given));
    this.given += keepOut.length;
    const drop = Math.min(this.bufLen, Math.max(0, this.next - this.bufStart));
    if (drop) {
      for (const b of this.buf) b.copyWithin(0, drop, this.bufLen);
      this.bufLen -= drop;
      this.bufStart += drop;
    }
    return keepOut;
  }
}

function concat(a: Float32Array, b: Float32Array) {
  if (!a.length) return b;
  const out = new Float32Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

/** numpy's 'reflect' padding: mirrors without repeating the edge sample. */
function reflectIndex(i: number, n: number) {
  if (n === 1) return 0;
  const period = 2 * (n - 1);
  i = ((i % period) + period) % period;
  return i < n ? i : period - i;
}
