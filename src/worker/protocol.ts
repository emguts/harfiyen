import type { DecodeOptions, SpeechLang, Word } from "../engine";
import type { ModelId } from "../models";

export type ProviderChoice = "auto" | "webgpu" | "wasm";

export type ToWorker =
  /** Load the model. `reason`: why the page chose the CPU, shown once ready. */
  | { type: "init"; model: ModelId; provider: ProviderChoice; reason?: string }
  /**
   * `startAt`: seconds into the file to start from (a trimmed range, or continuing a stopped job);
   * `endAt`: where to stop, missing for the file's end. Times stay absolute.
   */
  | { type: "transcribe"; jobId: number; file: File; options: DecodeOptions; startAt?: number; endAt?: number }
  | {
      type: "transcribe-pcm";
      jobId: number;
      pcm: Float32Array;
      sampleRate: number;
      options: DecodeOptions;
      startAt?: number;
      endAt?: number;
    }
  | { type: "cancel"; jobId: number }
  /** Live microphone: audio arrives in chunks until live-stop. */
  | { type: "live-start"; jobId: number; sampleRate: number; options: DecodeOptions }
  | { type: "live-audio"; jobId: number; pcm: Float32Array }
  | { type: "live-stop"; jobId: number }
  /** Punctuate and true-case plain words (one entry per transcript word). */
  | { type: "punctuate"; id: number; words: string[] }
  /** Whisper only: times for known words in parts of a file (a pasted text); `vocals`: in the separated vocals. */
  | { type: "align"; id: number; file: File; lang: SpeechLang; spans: AlignSpan[]; vocals?: boolean };

/** Words said somewhere in start..end (at most 30 s) of a file. */
export interface AlignSpan {
  start: number;
  end: number;
  words: string[];
}

/** `gpu`: WebGPU failed; the page restarts the worker on the CPU. */
export type ErrorCode = "decode-unsupported" | "no-audio" | "model" | "runtime" | "gpu";

export type FromWorker =
  | { type: "download"; loaded: number; total: number; fromCache: boolean }
  | { type: "compiling" }
  | {
      type: "ready";
      provider: "webgpu" | "wasm";
      gpu: string | null;
      fallbackReason: string | null;
    }
  /** The vocal separation model, loaded on the first music-mode job that asks for it. */
  | { type: "vocals-progress"; loaded: number; total: number; fromCache: boolean }
  | { type: "vocals-ready" }
  | { type: "meta"; jobId: number; duration: number }
  | {
      type: "progress";
      jobId: number;
      decoded: number;
      committed: Word[];
      tentative: Word[];
      /** Peak amplitude per PEAK_STEP seconds, appended since the last message. */
      peaks: Float32Array;
      /** Aura bands (low, mid, high interleaved, BAND_RATE per second), appended. */
      bands: Float32Array;
      /** Speech loudness (one log-mel value per band frame), appended; for "Sesle vurgula". */
      loudness: Float32Array;
      speed: number;
    }
  | {
      type: "done";
      jobId: number;
      committed: Word[];
      decoded: number;
      elapsed: number;
      bands: Float32Array;
      loudness: Float32Array;
      timing: { encoder: number; search: number; chunks: number };
    }
  | { type: "cancelled"; jobId: number }
  | { type: "punct-progress"; id: number; phase: "download" | "run"; done: number; total: number }
  | { type: "punctuated"; id: number; words: string[] }
  | { type: "punct-error"; id: number; message: string }
  | { type: "align-progress"; id: number; done: number; total: number }
  /** Per span, a time per word, or null where that span could not be aligned. */
  | { type: "aligned"; id: number; spans: ({ start: number; end: number }[] | null)[] }
  | { type: "align-error"; id: number; message: string }
  | { type: "error"; jobId: number | null; code: ErrorCode; message: string };

export const PEAK_STEP = 0.1;
export { BAND_RATE } from "../render/aura";
