// Ahenk Cep (ozgurguler/ahenk-cep-tr, weights CC BY 4.0): the third dubbing voice, a student of the Ahenk model in
// EMA Lightning's architecture, 8.6M parameters at 48 kHz. A port of the model's web demo
// (github.com/ozguradmin/ahenk-turkish-tts, site/js/engine.js and randn.js, Apache-2.0): trnorm reads the text aloud,
// EMA Lightning's own steps cut it into pieces, and per piece four ONNX graphs give durations, the frame
// conditioning, 16 Euler steps with classifier-free guidance, and audio decoded in windows. The model has eight
// speaking styles, but like the demo this reads in the neutral one only: the others are too weak in the small model.

import type { InferenceSession } from "onnxruntime-web";
import type { Ort } from "../engine/models";
import { alphabet, blocks, chunk, RATE, UNSAFE, words } from "./ema";
import { normalize } from "./trnorm/normalize";

/** ahenk-cep.json, as prepare_models.py copies it to model.json. */
export interface AhenkManifest {
  sample_rate: number;
  hop: number;
  latent_dim: number;
  vocab: string[];
  styles: string[];
  defaults: { steps: number; cfg: number };
  limits: { max_word_frames: number; max_frames: number; window: number; context: number };
}

/**
 * The pieces the model reads, each with the pause after it: site/py/ahenk_front.py, which is trnorm and then EMA
 * Lightning's frontend with its own normalizer switched off.
 */
export function pieces(text: string, speed: number, vocab: Set<string>): [string, number][] {
  const spoken = normalize(text).replace(UNSAFE, " ");
  if (!spoken.trim()) return [];
  return chunk(alphabet(blocks(spoken).join(" "), vocab), speed);
}

// ---------- torch.randn's CPU noise from a seed, so a seed gives the same voice as in PyTorch ----------

class MT19937 {
  private mt = new Uint32Array(624);
  private index = 624;

  constructor(seed: number) {
    this.mt[0] = seed >>> 0;
    for (let j = 1; j < 624; j++) {
      const p = this.mt[j - 1] ^ (this.mt[j - 1] >>> 30);
      this.mt[j] = (Math.imul(1812433253, p) + j) >>> 0;
    }
  }

  private twist() {
    const mt = this.mt;
    for (let i = 0; i < 624; i++) {
      const y = (mt[i] & 0x80000000) | (mt[(i + 1) % 624] & 0x7fffffff);
      let v = mt[(i + 397) % 624] ^ (y >>> 1);
      if (y & 1) v ^= 0x9908b0df;
      mt[i] = v >>> 0;
    }
    this.index = 0;
  }

  next(): number {
    if (this.index >= 624) this.twist();
    let y = this.mt[this.index++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }
}

const f = Math.fround;

/**
 * The first n values (n a multiple of 16) of torch.randn with manual_seed(seed): mt19937 on the seed's low 32 bits,
 * 24-bit uniforms, then ATen's normal_fill, which turns each block of 16 into normals by Box-Muller in float32.
 */
function torchRandn(seed: bigint, n: number): Float32Array {
  const gen = new MT19937(Number(seed & 0xffffffffn));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (gen.next() & 0xffffff) * 5.9604644775390625e-8; // 2 ** -24
  for (let b = 0; b < n; b += 16)
    for (let j = 0; j < 8; j++) {
      const radius = f(Math.sqrt(f(-2 * f(Math.log(f(1 - out[b + j]))))));
      const theta = f(2 * Math.PI * out[b + j + 8]);
      out[b + j] = f(radius * f(Math.cos(theta)));
      out[b + j + 8] = f(radius * f(Math.sin(theta)));
    }
  return out;
}

/** EMA's per-piece seed: (seed * 1_000_003 + i) mod 2**63. */
const pieceSeed = (seed: number, i: number) => (BigInt(seed) * 1000003n + BigInt(i)) % (1n << 63n);

// ---------- engine ----------

/** Round half to even, like torch.round. */
function roundHalfEven(x: number): number {
  const fl = Math.floor(x);
  const d = x - fl;
  if (d !== 0.5) return d > 0.5 ? fl + 1 : fl;
  return fl % 2 === 0 ? fl : fl + 1;
}

/** Engine.plan in float32: durations over speed, frames per word, the word and in-word position of every frame. */
function plan(dur: Float32Array, cw: number[], speed: number, maxWord: number, maxFrames: number) {
  const L = cw.length;
  const s = f(speed);
  const d = new Float32Array(L);
  for (let i = 0; i < L; i++) d[i] = dur[i] / s;
  const nWords = cw[L - 1] + 1;
  const sums = new Float32Array(nWords);
  for (let i = 0; i < L; i++) sums[cw[i]] += d[i];
  const counts = Array.from(sums, (x) => Math.min(maxWord, Math.max(1, roundHalfEven(x))));
  const T = Math.min(
    counts.reduce((a, b) => a + b, 0),
    maxFrames,
  );
  const fw = new BigInt64Array(T);
  const fp = new Float32Array(T);
  for (let w = 0, k = 0; w < nWords && k < T; w++)
    for (let j = 0; j < counts[w] && k < T; j++, k++) {
      fw[k] = BigInt(w);
      fp[k] = j / counts[w];
    }
  return { dur: d, fw, fp, T };
}

export class Ahenk {
  private stoi: Map<string, number>;
  private alpha: Set<string>;

  constructor(
    private ort: Ort,
    private m: AhenkManifest,
    private sessions: { text: InferenceSession; cond: InferenceSession; step: InferenceSession; decoder: InferenceSession },
  ) {
    this.stoi = new Map(m.vocab.map((ch, i) => [ch, i]));
    this.alpha = new Set(m.vocab.filter((v) => v.length === 1));
  }

  /** All of the text as one buffer of 48 kHz audio. `speed` above 1 speaks faster. */
  async speak(text: string, speed = 1, seed = 0): Promise<Float32Array> {
    const { ort, m } = this;
    const { text: textGraph, cond: condGraph, step: stepGraph, decoder } = this.sessions;
    const i64 = (arr: ArrayLike<number>) => BigInt64Array.from(arr as number[], (x) => BigInt(x));
    const f32 = (arr: Float32Array, dims: number[]) => new ort.Tensor("float32", arr, dims);
    const scalar = (x: number) => f32(Float32Array.of(x), [1]);
    const D = m.latent_dim;
    const { steps, cfg } = m.defaults;
    const { window, context, max_word_frames, max_frames } = m.limits;
    const style = Math.max(0, m.styles.indexOf("neutral"));
    const out: Float32Array[] = [];
    const parts = pieces(text, speed, this.alpha);
    for (let k = 0; k < parts.length; k++) {
      const [piece, pause] = parts[k];
      const ids = [...piece].map((ch) => this.stoi.get(ch) ?? 1);
      const { cw, wstart } = words(piece);
      const L = ids.length;
      const cwT = new ort.Tensor("int64", i64(cw), [1, L]);
      const t1 = await textGraph.run({
        ids: new ort.Tensor("int64", i64(ids), [1, L]),
        style: new ort.Tensor("int64", BigInt64Array.of(BigInt(style)), [1]),
      });
      const p = plan((await t1.dur.getData()) as Float32Array, cw, speed, max_word_frames, max_frames);
      const { cond } = await condGraph.run({
        h: t1.h,
        dur: f32(p.dur, [1, L]),
        cw: cwT,
        wstart: new ort.Tensor("int64", i64(wstart), [1, L]),
        fw: new ort.Tensor("int64", p.fw, [1, p.T]),
        fp: f32(p.fp, [1, p.T]),
      });
      t1.h.dispose();
      t1.dur.dispose();
      let x = f32(torchRandn(pieceSeed(seed, k), p.T * D), [1, p.T, D]);
      const dt = scalar(1 / steps);
      const g = scalar(cfg);
      for (let s = 0; s < steps; s++) {
        const { x_next } = await stepGraph.run({ x, cond, t: scalar(s / steps), dt, cfg: g });
        x.dispose();
        x = x_next as typeof x;
      }
      cond.dispose();
      const lat = (await x.getData()) as Float32Array; // [T, D]
      x.dispose();
      const T = p.T;
      for (let s = 0; s < T; s += window) {
        const e = Math.min(T, s + window);
        const a = Math.max(0, s - context);
        const b = Math.min(T, e + context);
        const n = b - a;
        const z = new Float32Array(D * n); // [1, D, n]
        for (let fr = 0; fr < n; fr++) for (let d = 0; d < D; d++) z[d * n + fr] = lat[(a + fr) * D + d];
        const { audio } = await decoder.run({ z: f32(z, [1, D, n]) });
        out.push(((await audio.getData()) as Float32Array).slice((s - a) * m.hop, (e - a) * m.hop));
        audio.dispose();
      }
      if (pause) out.push(new Float32Array(Math.round(pause * RATE)));
    }
    const all = new Float32Array(out.reduce((n, c) => n + c.length, 0));
    let o = 0;
    for (const c of out) {
      all.set(c, o);
      o += c.length;
    }
    return all;
  }
}
