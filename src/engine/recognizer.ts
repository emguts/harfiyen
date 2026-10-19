// Streaming recognizer: fbank -> chunked encoder -> transducer search, with
// endpointing to keep hypotheses short on long recordings: at pauses the VAD
// finds, or by sherpa-onnx's rules without one.

import { ENDPOINT_RULES, VAD_ENDPOINT, type ModelConfig } from "./config";
import { OnlineFbank } from "./fbank";
import type { Encoder } from "./models";
import type { Search } from "./search";
import { tokensToWords, type SymbolTable, type Word } from "./tokens";
import type { SileroVad } from "./vad";

/** Silence appended at the end so the last chunk gets decoded (as in the model card). */
const TAIL_PADDING_SEC = 1;
/**
 * Chunks longer than the padding above (the final export's 5.12 s) are
 * decoded only once full: the end is padded up to a chunk boundary plus this
 * margin, which covers the encoder's right context (sedalib's _FinalPass).
 */
const TAIL_MARGIN_SEC = 0.5;
/**
 * The transducer emits a token ~150 ms after it is spoken (measured against
 * known onsets, the same for every decoding method); word times move back by
 * this much.
 */
const EMIT_LAG_SEC = 0.15;

export class Recognizer {
  private fbank: OnlineFbank;
  private feats: Float32Array;
  /** Absolute index of the frame stored at feats[0]. */
  private featStart = 0;
  private featCount = 0;
  /** Absolute feature frame where the next encoder chunk starts. */
  private processed = 0;
  private segmentStart = 0;
  private finished = false;
  /** Samples accepted, padding excluded. */
  private received = 0;
  /** Audio the VAD has not classified yet. */
  private vadPending: Float32Array[] = [];
  /** Milliseconds spent in the encoder and in the search, for diagnostics. */
  readonly timing = { encoder: 0, search: 0, chunks: 0 };
  /** Called with every 80-dim log-mel frame (10 ms), e.g. for visualisation. */
  onFeature: ((f: Float32Array) => void) | null = null;

  // Tokens of the word that may still continue in the next segment.
  private carryTokens: number[] = [];
  private carryFrames: number[] = [];
  private committed: Word[] = [];

  /** vad: shared by the engine's recognizers, reset here. maxSegment: seconds, with the VAD. */
  constructor(
    private cfg: ModelConfig,
    private encoder: Encoder,
    private search: Search,
    private syms: SymbolTable,
    private vad: SileroVad | null = null,
    private maxSegment = 0,
  ) {
    this.fbank = new OnlineFbank(cfg.featureDim);
    this.feats = new Float32Array(cfg.featureDim * 1024);
    vad?.reset();
  }

  /** Seconds of audio covered by decoded chunks so far. */
  get decodedSeconds() {
    return (this.processed * this.cfg.frameShiftMs) / 1000;
  }

  acceptWaveform(samples: Float32Array) {
    this.received += samples.length;
    if (this.vad) this.vadPending.push(samples);
    this.fbank.acceptWaveform(samples);
    this.pullFeatures();
  }

  inputFinished() {
    if (this.finished) return;
    this.finished = true;
    this.fbank.acceptWaveform(new Float32Array(Math.round(this.cfg.sampleRate * this.tailPadding())));
    this.fbank.inputFinished();
    this.pullFeatures();
  }

  isReady() {
    return this.processed + this.cfg.chunkSize < this.featCount;
  }

  /** Decode one encoder chunk. Call while isReady(). */
  async decodeChunk() {
    const { chunkSize, chunkShift, featureDim: F } = this.cfg;
    const from = (this.processed - this.featStart) * F;
    const x = this.feats.slice(from, from + chunkSize * F);
    this.processed += chunkShift;
    const t0 = performance.now();
    const out = await this.encoder.run(x);
    const t1 = performance.now();
    await this.search.decode(out.data, out.frames);
    this.timing.encoder += t1 - t0;
    this.timing.search += performance.now() - t1;
    this.timing.chunks++;
    const end = this.vad ? await this.vadEndpoint() : this.isEndpoint() ? "forced" : null;
    if (end) {
      // At a pause the last word is complete; a forced cut may split it.
      this.commit(this.search.result(), end === "pause");
      this.search.reset();
      this.segmentStart = this.processed;
    }
  }

  private tailPadding() {
    const chunk = (this.cfg.chunkShift * this.cfg.frameShiftMs) / 1000;
    if (chunk <= TAIL_PADDING_SEC) return TAIL_PADDING_SEC;
    const sec = this.received / this.cfg.sampleRate;
    return Math.ceil((sec + TAIL_MARGIN_SEC) / chunk) * chunk - sec + TAIL_MARGIN_SEC;
  }

  /** After the last decodeChunk() of a finished stream. */
  flush() {
    this.commit(this.search.result(), true);
    this.search.reset();
  }

  /** Words that are final, returned once. */
  takeCommitted(): Word[] {
    const w = this.committed;
    this.committed = [];
    return w;
  }

  /** Words of the current, still changing segment. */
  tentative(): Word[] {
    const r = this.search.result();
    return this.words([...this.carryTokens, ...r.tokens], [...this.carryFrames, ...r.frames]);
  }

  private words(tokens: number[], frames: number[]): Word[] {
    const sec = (this.cfg.subsampling * this.cfg.frameShiftMs) / 1000;
    return tokensToWords(this.syms, tokens, frames.map((f) => Math.max(0, f * sec - EMIT_LAG_SEC)));
  }

  private commit(r: { tokens: number[]; frames: number[] }, all: boolean) {
    const tokens = [...this.carryTokens, ...r.tokens];
    const frames = [...this.carryFrames, ...r.frames];
    // The segment's last word may continue after the reset (rule 3 cuts at
    // 20 s even mid-word), so hold it back until the next segment starts.
    let cut = tokens.length;
    if (!all) {
      cut = 0;
      for (let i = tokens.length - 1; i >= 0; i--) {
        if (this.syms.get(tokens[i]).startsWith("▁")) {
          cut = i;
          break;
        }
      }
    }
    this.committed.push(...this.words(tokens.slice(0, cut), frames.slice(0, cut)));
    this.carryTokens = tokens.slice(cut);
    this.carryFrames = frames.slice(cut);
  }

  /** Whether the decoded audio ends in a pause after speech, or the segment is too long. */
  private async vadEndpoint(): Promise<"pause" | "forced" | null> {
    const vad = this.vad!;
    // The encoder has read past `processed` (its right context), so the VAD has classified past it too.
    for (const pcm of this.vadPending) await vad.push(pcm);
    this.vadPending = [];
    const shift = this.cfg.frameShiftMs / 1000;
    const start = this.segmentStart * shift;
    const end = this.processed * shift;
    const long = end - start >= this.maxSegment;
    const run = vad.silenceAround(end);
    // The pause began early enough that the word before it has been emitted.
    if (run && end - run.start >= EMIT_LAG_SEC) {
      const spoke = vad.speechSeconds(start, run.start) >= VAD_ENDPOINT.minSpeech;
      if ((spoke && run.end - run.start >= VAD_ENDPOINT.minSilence) || long) return "pause";
    }
    return end - start >= 2 * this.maxSegment ? "forced" : null;
  }

  private isEndpoint(): boolean {
    const shift = this.cfg.frameShiftMs / 1000;
    const utterance = (this.processed - this.segmentStart) * shift;
    const trailing = this.search.numTrailingBlanks() * this.cfg.subsampling * shift;
    return ENDPOINT_RULES.some(
      (r) =>
        (utterance > trailing || !r.mustContainNonSilence) &&
        trailing >= r.minTrailingSilence &&
        utterance >= r.minUtteranceLength,
    );
  }

  private pullFeatures() {
    const F = this.cfg.featureDim;
    this.fbank.compute((f) => {
      this.onFeature?.(f);
      // Drop frames no future chunk will read, then grow if still full.
      let used = this.featCount - this.featStart;
      if ((used + 1) * F > this.feats.length) {
        const drop = this.processed - this.featStart;
        if (drop > 0) {
          this.feats.copyWithin(0, drop * F, used * F);
          this.featStart += drop;
          used -= drop;
        }
        if ((used + 1) * F > this.feats.length) {
          const next = new Float32Array(this.feats.length * 2);
          next.set(this.feats.subarray(0, used * F));
          this.feats = next;
        }
      }
      this.feats.set(f, used * F);
      this.featCount++;
    });
  }
}
