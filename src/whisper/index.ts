// Whisper as a SpeechEngine: audio is collected into 30 s windows, each one
// decoded with timestamps (openai-whisper's sequential long-form scheme: a
// cut-off last segment is decoded again at the start of the next window) and
// its words timed from cross-attention. A voice activity detector skips
// silent windows and drops words Whisper invents over silence; a loud window
// it hears no speech in (singing over music, which Silero does not take for
// speech) is decoded anyway, on Whisper's own no-speech check. A window whose
// decoding fell into a loop (music, a chorus, a repeated phrase) keeps what
// came before the loop and is decoded again from there, so nothing after it
// is lost.

import { OnlineFbank } from "../engine/fbank";
import type { SmallProvider } from "../engine";
import type { EncoderProvider, Ort } from "../engine/models";
import type { DecodeOptions, SpeechLang } from "../engine/config";
import type { SpeechEngine, SpeechStream } from "../engine/stream";
import type { Word } from "../engine/tokens";
import { alignWords, FRAME_SEC, tokenFrames } from "./alignment";
import { HOP, LogMel, SAMPLE_RATE, WINDOW_SAMPLES } from "./mel";
import { WhisperModel, type WhisperConfig } from "./model";
import { WhisperTokenizer } from "./tokenizer";
import { SileroVad } from "../engine/vad";

export type { WhisperConfig } from "./model";

export interface WhisperFiles {
  config: WhisperConfig;
  encoder: Uint8Array;
  decoder: Uint8Array;
  vocab: Record<string, number>;
  vad: Uint8Array;
}

/** Thresholds openai-whisper uses to treat a window as silence. */
const NO_SPEECH_PROB = 0.6;
const LOGPROB_FLOOR = -1;
/** A finished stream's leftover shorter than this is not decoded. */
const MIN_TAIL = SAMPLE_RATE / 10;
const SAMPLES_PER_TS = FRAME_SEC * SAMPLE_RATE;
/** Forced text longer than this leaves too little of the decoder's 448 positions. */
const MAX_FORCED_TOKENS = 400;
/**
 * After a loop the window moves at least this far; by the number of windows
 * in a row that looped. A third gives up on the window, as before, so a
 * stretch Whisper cannot get through costs two extra decodes at most.
 */
const LOOP_ADVANCE = [SAMPLE_RATE, 3 * SAMPLE_RATE];
/** A window louder than this (RMS, dBFS) is not silence, whatever the VAD says. */
const LOUD_DB = -40;

/**
 * Lines Whisper is known to invent over music and silence (from subtitle
 * credits in its training data). Where the VAD heard no speech it cannot
 * catch them, so they are taken out by their words. Lowercase, no punctuation.
 */
const STOCK_LINES = [
  "altyazı mk",
  "izlediğiniz için teşekkürler",
  "izlediğiniz için teşekkür ederim",
  "abone olmayı unutmayın",
  "thanks for watching",
  "thank you for watching",
  "subtitles by the amaraorg community",
].map((l) => l.split(" "));

const bare = (text: string) => text.toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}]/gu, "");

/** words without any run that spells one of STOCK_LINES. */
export function dropStockLines(words: Word[]): Word[] {
  const keys = words.map((w) => bare(w.text));
  const drop = new Set<number>();
  for (let i = 0; i < words.length; i++) {
    for (const line of STOCK_LINES) {
      // A line's words may come split or joined ("M.K." can be one word or two).
      let j = i;
      let rest = line.join("");
      while (j < words.length && rest.startsWith(keys[j]) && keys[j]) rest = rest.slice(keys[j++].length);
      if (!rest && j > i) for (let k = i; k < j; k++) drop.add(k);
    }
  }
  return drop.size ? words.filter((_, k) => !drop.has(k)) : words;
}

function rmsDb(x: Float32Array): number {
  let e = 0;
  for (let i = 0; i < x.length; i++) e += x[i] * x[i];
  return 10 * Math.log10(e / Math.max(1, x.length) + 1e-12);
}

export class WhisperEngine implements SpeechEngine {
  private constructor(
    private model: WhisperModel,
    private tok: WhisperTokenizer,
    private vad: SileroVad,
  ) {}

  static async create(
    ort: Ort,
    files: WhisperFiles,
    provider: EncoderProvider,
    small: SmallProvider = "wasm",
  ): Promise<WhisperEngine> {
    // Sequential: onnxruntime-web rejects concurrent initialisation.
    const vad = await SileroVad.create(ort, files.vad, small);
    const model = await WhisperModel.create(ort, files.config, files.encoder, files.decoder, provider);
    return new WhisperEngine(model, new WhisperTokenizer(files.vocab), vad);
  }

  get provider() {
    return this.model.provider;
  }

  /**
   * Times for known text in up to 30 s of 16 kHz audio starting `offset`
   * seconds into the file: the alignment heads' attention over the forced
   * text, as for transcribed words. One time per word, or null when the
   * words could not be told apart (too many tokens, lone punctuation).
   * From emguts/harfiyen.
   */
  async alignText(
    pcm: Float32Array,
    offset: number,
    words: string[],
    lang: SpeechLang,
  ): Promise<{ start: number; end: number }[] | null> {
    const text = words.flatMap((w) => this.tok.encodeWord(w));
    if (!text.length || text.length > MAX_FORCED_TOKENS) return null;
    this.model.setLanguage(lang);
    const n = Math.min(pcm.length, WINDOW_SAMPLES);
    const enc = await this.model.encode(new LogMel(this.model.config.numMel).compute(pcm.subarray(0, n)));
    try {
      const att = await this.model.attention(enc, text);
      const frames = tokenFrames(att.heads, att.rows, Math.floor(n / (HOP * 2)), att.promptLen, this.model.config.medianFilterWidth);
      const timed = alignWords(this.tok, text, frames, offset);
      if (timed.length !== words.length) return null;
      return timed.map((w) => ({ start: w.start, end: w.end }));
    } finally {
      this.model.release(enc);
    }
  }

  createRecognizer(opts?: DecodeOptions): SpeechStream {
    this.model.setLanguage(opts?.lang ?? "tr");
    this.vad.reset();
    return new WhisperRecognizer(this.model, this.tok, this.vad, !!opts?.music);
  }
}

/**
 * After a loop (the repeats already cut off): the complete segments before
 * it and the window's move to their end, or null when no segment closed.
 */
export function beforeLoop(tokens: number[], tsBegin: number, windowSamples: number) {
  let end = 0;
  for (let i = 1; i < tokens.length; i++) if (tokens[i - 1] >= tsBegin && tokens[i] >= tsBegin) end = i;
  const advance = end ? (tokens[end - 1] - tsBegin) * SAMPLES_PER_TS : 0;
  if (advance <= 0) return null;
  return { text: tokens.slice(0, end).filter((t) => t < tsBegin), advance: Math.min(advance, windowSamples) };
}

/**
 * Which generated text is final, and how far the window moves on. A window
 * that ends mid-segment moves only to the last complete one.
 */
export function splitSegments(tokens: number[], tsBegin: number, windowSamples: number, takeAll: boolean) {
  const isTs = tokens.map((t) => t >= tsBegin);
  const n = tokens.length;
  const singleEnding = n >= 2 && !isTs[n - 2] && isTs[n - 1];
  const cuts: number[] = [];
  for (let i = 1; i < n; i++) if (isTs[i - 1] && isTs[i]) cuts.push(i);
  if (!cuts.length || singleEnding || takeAll) {
    return { text: tokens.filter((t) => t < tsBegin), advance: windowSamples };
  }
  const end = cuts[cuts.length - 1];
  const advance = (tokens[end - 1] - tsBegin) * SAMPLES_PER_TS;
  return {
    text: tokens.slice(0, end).filter((t) => t < tsBegin),
    advance: advance > 0 ? Math.min(advance, windowSamples) : windowSamples,
  };
}

class WhisperRecognizer implements SpeechStream {
  onFeature: ((f: Float32Array) => void) | null = null;
  readonly timing = { encoder: 0, search: 0, chunks: 0 };
  /** Only for onFeature (the aura); Whisper has its own features. */
  private fbank = new OnlineFbank(80);
  private mel: LogMel;
  /** Audio from the current window start on. */
  private audio = new Float32Array(WINDOW_SAMPLES * 2);
  private length = 0;
  private windowStart = 0;
  private finished = false;
  /** Samples given to the VAD so far. */
  private vadSamples = 0;
  private lastEnd = 0;
  private committed: Word[] = [];
  /** Windows in a row whose decoding looped. */
  private loops = 0;

  constructor(
    private model: WhisperModel,
    private tok: WhisperTokenizer,
    private vad: SileroVad,
    private music = false,
  ) {
    this.mel = new LogMel(model.config.numMel);
  }

  get decodedSeconds() {
    return this.windowStart / SAMPLE_RATE;
  }

  acceptWaveform(samples: Float32Array) {
    if (this.length + samples.length > this.audio.length) {
      const next = new Float32Array(Math.max(this.audio.length * 2, this.length + samples.length));
      next.set(this.audio.subarray(0, this.length));
      this.audio = next;
    }
    this.audio.set(samples, this.length);
    this.length += samples.length;
    this.fbank.acceptWaveform(samples);
    this.pullFeatures();
  }

  inputFinished() {
    if (this.finished) return;
    this.finished = true;
    this.fbank.inputFinished();
    this.pullFeatures();
  }

  isReady() {
    return this.length >= WINDOW_SAMPLES || (this.finished && this.length >= MIN_TAIL);
  }

  async decodeChunk() {
    const n = Math.min(this.length, WINDOW_SAMPLES);
    const last = this.finished && this.length <= WINDOW_SAMPLES;
    const t0 = performance.now();
    await this.vad.push(this.audio.subarray(this.vadSamples - this.windowStart, n), last);
    this.vadSamples = this.windowStart + n;
    const from = this.decodedSeconds;
    // No speech to the VAD: silence is skipped; a loud window may be singing
    // over music, so Whisper decides, and its words are not held to the VAD.
    // In music mode the VAD is not asked: sung vocals are not speech to it.
    const vadSpeech = !this.music && this.vad.hasSpeech(from, from + n / SAMPLE_RATE, 0);
    if (!vadSpeech && rmsDb(this.audio.subarray(0, n)) < LOUD_DB) {
      this.consume(n);
      return;
    }
    const enc = await this.model.encode(this.mel.compute(this.audio.subarray(0, n)));
    const t1 = performance.now();
    let advance = n;
    try {
      const gen = await this.model.generate(enc);
      const silent = !this.music && gen.noSpeechProb > NO_SPEECH_PROB && gen.avgLogprob < LOGPROB_FLOOR;
      if (!silent && gen.tokens.length) {
        const tsBegin = this.model.config.tokens.timestampBegin;
        let seg = splitSegments(gen.tokens, tsBegin, n, last);
        // No closed segment before the loop: keep the text up to its last whole
        // word (the cut may split a word, even a letter's bytes) and move on to
        // where those words end, known once they are timed below.
        let toWordsEnd = false;
        if (gen.looped) {
          const kept = beforeLoop(gen.tokens, tsBegin, n);
          if (kept) seg = kept;
          else {
            const text = gen.tokens.filter((t) => t < tsBegin);
            let cut = 0;
            for (let i = text.length - 1; i > 0 && !cut; i--) if (this.tok.startsWord(text[i])) cut = i;
            seg = { text: text.slice(0, cut), advance: 0 };
            toWordsEnd = true;
          }
        }
        advance = seg.advance;
        if (seg.text.length) {
          const att = await this.model.attention(enc, seg.text);
          const frames = tokenFrames(
            att.heads,
            att.rows,
            Math.floor(n / (HOP * 2)),
            att.promptLen,
            this.model.config.medianFilterWidth,
          );
          const aligned = alignWords(this.tok, seg.text, frames, from);
          for (const w of vadSpeech ? aligned : dropStockLines(aligned)) {
            if (toWordsEnd) advance = Math.max(advance, Math.round((w.end - from) * SAMPLE_RATE));
            if (!this.music) {
              if (vadSpeech && !this.vad.hasSpeech(w.start, w.end)) continue;
              // Words at a pause soak up the silence next to them (half a
              // second at sentence starts); keep them to the speech.
              Object.assign(w, this.vad.speechSpan(w.start, w.end));
            }
            // Windows overlap a little where a segment was decoded again.
            w.start = Math.max(w.start, this.lastEnd);
            w.end = Math.max(w.end, w.start);
            this.lastEnd = w.end;
            this.committed.push(w);
          }
        }
        // Always move on after a loop, and further when they keep coming.
        this.loops = gen.looped ? this.loops + 1 : 0;
        if (gen.looped) advance = Math.min(n, Math.max(advance, LOOP_ADVANCE[this.loops - 1] ?? n));
      }
    } finally {
      this.model.release(enc);
    }
    this.timing.encoder += t1 - t0;
    this.timing.search += performance.now() - t1;
    this.timing.chunks++;
    this.consume(advance);
  }

  flush() {
    this.consume(this.length);
  }

  takeCommitted(): Word[] {
    const w = this.committed;
    this.committed = [];
    return w;
  }

  tentative(): Word[] {
    return [];
  }

  private consume(samples: number) {
    const k = Math.min(samples, this.length);
    this.audio.copyWithin(0, k, this.length);
    this.length -= k;
    this.windowStart += k;
  }

  private pullFeatures() {
    this.fbank.compute((f) => this.onFeature?.(f));
  }
}
