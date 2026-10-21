/// <reference lib="webworker" />
// Writes captions into a video.
//
// Video files: mediabunny decodes and re-encodes (WebCodecs, hardware H.264
// or HEVC where available, at the bitrate chosen in the export menu), the compositor (WebGPU, else 2D canvas) draws every frame with its caption,
// and the audio track is copied over untouched. A slice that fills the frame (upright, for Reels, say) is cut
// out while decoding; a picture fitted into the frame is scaled down while decoding and placed by the compositor.
//
// Audio files and recordings: the picture is the audio-reactive aura (the
// same one the player shows), rendered at 1080p30; the audio is re-encoded
// to AAC (or Opus) for the MP4.
//
// With a dub, the sound in either case is the synthetic voice over the file's
// own audio, which is turned down to the chosen level (or out).
//
// With a trim only that part is written, its first moment at 0:00. Captions,
// the aura and the dub are looked up at the file's own time (output time plus
// the trim's start).
//
// The MP4 is written to disk as it is encoded (sink.ts): into the file the
// user picked, or onto the browser's private disk, so hours of video never
// sit in memory.

import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  CanvasSource,
  Conversion,
  getFirstEncodableAudioCodec,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  QUALITY_HIGH,
} from "mediabunny";
import { historyAt, levelsAt, paletteById } from "../render/aura";
import { addUserFont, loadCaptionFont, type UserFont } from "../captions/fonts";
import { CaptionRenderer } from "../captions/renderer";
import type { CaptionSettings } from "../captions/style";
import type { Word } from "../engine";
import { AUDIO_VIDEO, type Encoder, type OutputCodec } from "../lib/videoOutput";
import type { Placement } from "../lib/crop";
import { createCompositor } from "../render/compositor";
import { KineticRenderer } from "../render/kinetic";
import type { LogoLayer } from "../render/logoLayer";
import { DUB_RATE, dubAt, type DubMix } from "../tts/dub";
import { clearRenders, openSink, type Sink } from "./sink";

declare const self: DedicatedWorkerGlobalScope;

export type ToRender =
  | {
      type: "burn";
      jobId: number;
      file: File;
      words: Word[];
      settings: CaptionSettings;
      /** The caption font, when the user added it (the worker has no access to their fonts). */
      userFont: UserFont | null;
      bands: Float32Array;
      /** Speech loudness, for "Sesle vurgula". */
      loudness: Float32Array;
      /** Language of the words; decides how they are uppercased. */
      lang: string;
      dub: DubMix | null;
      /** The user's logo, a copy of the player's (transferred). */
      logo: LogoLayer | null;
      encode: Encode;
      /** The file the user picked to save into; null renders to the private disk (or memory). */
      handle: FileSystemFileHandle | null;
    }
  | { type: "cancel"; jobId: number };

export type FromRender =
  | { type: "progress"; jobId: number; progress: number; fps: number }
  | {
      type: "done";
      jobId: number;
      /** The video to download; null when it was saved into the picked file (`saved`). */
      file: File | null;
      saved: string | null;
      size: number;
      elapsed: number;
    }
  | { type: "cancelled"; jobId: number }
  | { type: "error"; jobId: number; message: string };

/**
 * Video codec, bitrate, encoder and size. No bitrate (the file could not be read
 * beforehand) is mediabunny's high quality; no known encoder lets the browser pick.
 */
export interface Encode {
  codec: OutputCodec;
  bitrate: number | null;
  encoder: Encoder;
  /** Picture size of the output; null keeps the file's own, or the crop's (1080p for auras). */
  size: { width: number; height: number } | null;
  /** Part of the video picture to keep, in displayed pixels; null keeps all of it. Ignored for audio files. */
  crop: { left: number; top: number; width: number; height: number } | null;
  /** The whole picture fitted into a frame of another shape (`size` is the frame); null fills the frame. */
  fit: Placement | null;
  /** The part of the file to write, in seconds; null for all of it. */
  trim: { start: number; end: number } | null;
}

// The browser's own choice when the hardware encoder is not there: the processor's.
const acceleration = (encode: Encode) => (encode.encoder === "hardware" ? "prefer-hardware" : "no-preference");

const quality = (encode: Encode) => (encode.bitrate ? new Quality({ bitrate: encode.bitrate }) : QUALITY_HIGH);

const post = (m: FromRender) => self.postMessage(m);

const running = new Map<number, { cancel(): Promise<void> }>();
const sinks = new Map<number, Sink>();
const cancelled = new Set<number>();

/** Closes the output on disk and reports it. */
async function finish(jobId: number, sink: Sink, handle: FileSystemFileHandle | null, started: number) {
  const file = await sink.finish();
  const size = file?.size ?? (await handle!.getFile()).size;
  post({ type: "done", jobId, file, saved: file ? null : handle!.name, size, elapsed: (performance.now() - started) / 1000 });
}

/**
 * The sample with the dub mixed in, on every channel, and the file's own sound turned down to `dub.original`.
 * `t0` is where the output starts in the file: the sample is at output time, the dub at the file's.
 */
function mixDub(sample: AudioSample, dub: DubMix, t0: number): AudioSample {
  const n = sample.numberOfFrames;
  const channels = sample.numberOfChannels;
  const voice = dubAt(dub.clips, sample.timestamp + t0, n, sample.sampleRate);
  const out = new Float32Array(n * channels);
  for (let c = 0; c < channels; c++) {
    const plane = out.subarray(c * n, (c + 1) * n);
    if (dub.original > 0) sample.copyTo(plane, { planeIndex: c, format: "f32-planar" });
    for (let i = 0; i < n; i++) plane[i] = Math.max(-1, Math.min(1, plane[i] * dub.original + voice[i]));
  }
  return new AudioSample({
    data: out,
    format: "f32-planar",
    numberOfChannels: channels,
    sampleRate: sample.sampleRate,
    timestamp: sample.timestamp,
  });
}

async function burn(
  jobId: number,
  file: File,
  words: Word[],
  settings: CaptionSettings,
  bands: Float32Array,
  loudness: Float32Array,
  lang: string,
  dub: DubMix | null,
  logo: LogoLayer | null,
  encode: Encode,
  sink: Sink,
  handle: FileSystemFileHandle | null,
) {
  const started = performance.now();
  // The 2D canvas in a worker only sees fonts registered on the worker.
  await loadCaptionFont(settings.font, self.fonts);
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) return burnAudio(jobId, input, words, settings, bands, loudness, lang, dub, logo, encode, sink, handle, started);
  if (!(await track.canDecode())) throw new Error(`Videonun kodlaması (${track.codec ?? "bilinmiyor"}) bu tarayıcıda çözülemiyor.`);

  // Rotation is baked into the frames (allowRotationMetadata: false below),
  // so the canvas uses the displayed size (or the crop's), or the chosen smaller one
  // (mediabunny rotates, crops and resizes the frames before process). Encoders want even dimensions.
  const { crop, fit } = encode;
  const width = encode.size?.width ?? crop?.width ?? track.displayWidth & ~1;
  const height = encode.size?.height ?? crop?.height ?? track.displayHeight & ~1;
  // A fitted picture is decoded at the size it takes up in the frame.
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const pictureW = fit ? even(fit.dst.w * width) : width;
  const pictureH = fit ? even(fit.dst.h * height) : height;
  const canvas = new OffscreenCanvas(width, height);
  const compositor = await createCompositor(canvas);
  compositor.setPlacement(fit);
  compositor.setLogo(logo);
  const captions = new CaptionRenderer(words, settings, width, height, loudness, lang);

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: sink.fastStart }), target: sink.target });
  // Mono stays mono; anything wider is mixed down to stereo, so the dub is not spread over surround channels.
  const channels = Math.min(2, (await input.getPrimaryAudioTrack())?.numberOfChannels ?? 1);
  let frames = 0;
  // Samples reach process at output time; captions and the dub go by the file's.
  const t0 = encode.trim?.start ?? 0;
  const conversion = await Conversion.init({
    input,
    output,
    tracks: "primary",
    ...(encode.trim && { trim: encode.trim }),
    video: {
      codec: encode.codec,
      bitrate: quality(encode),
      forceTranscode: true,
      allowRotationMetadata: false,
      ...(crop && { crop }),
      hardwareAcceleration: acceleration(encode),
      width: pictureW,
      height: pictureH,
      fit: "fill",
      processedWidth: width,
      processedHeight: height,
      process: (sample) => {
        const frame = sample.toVideoFrame();
        try {
          compositor.render(frame, captions.frame(sample.timestamp + t0));
        } finally {
          frame.close();
        }
        frames++;
        return canvas;
      },
    },
    // The file's audio, resampled to the dub's rate, with the dub mixed in.
    audio: dub
      ? {
          numberOfChannels: channels,
          sampleRate: DUB_RATE,
          forceTranscode: true,
          process: (sample) => mixDub(sample, dub, t0),
        }
      : undefined,
  });
  if (!conversion.isValid) {
    const why = conversion.discardedTracks.map((d) => d.reason).join(", ");
    compositor.destroy();
    throw new Error(`Bu video dönüştürülemiyor (${why}).`);
  }
  conversion.onProgress = (progress) => {
    const sec = (performance.now() - started) / 1000;
    post({ type: "progress", jobId, progress, fps: frames / sec });
  };
  running.set(jobId, conversion);
  if (cancelled.has(jobId)) await conversion.cancel();
  try {
    await conversion.execute();
  } finally {
    running.delete(jobId);
    compositor.destroy();
    input.dispose();
  }
  if (conversion.state === "canceled") {
    await sink.discard();
    post({ type: "cancelled", jobId });
    return;
  }
  await finish(jobId, sink, handle, started);
}

async function burnAudio(
  jobId: number,
  input: Input,
  words: Word[],
  settings: CaptionSettings,
  bands: Float32Array,
  loudness: Float32Array,
  lang: string,
  dub: DubMix | null,
  logo: LogoLayer | null,
  encode: Encode,
  sink: Sink,
  handle: FileSystemFileHandle | null,
  started: number,
) {
  const audio = await input.getPrimaryAudioTrack();
  if (!audio) throw new Error("Bu dosyada ses yok.");
  if (!(await audio.canDecode())) throw new Error(`Sesin kodlaması (${audio.codec ?? "bilinmiyor"}) bu tarayıcıda çözülemiyor.`);
  const codec = await getFirstEncodableAudioCodec(["aac", "opus"], {
    numberOfChannels: audio.numberOfChannels,
    sampleRate: audio.sampleRate,
  });
  if (!codec) throw new Error("Bu tarayıcı MP4 için ses kodlayamıyor (AAC veya Opus gerekli).");

  const { width, height } = encode.size ?? AUDIO_VIDEO;
  const { fps } = AUDIO_VIDEO;
  const canvas = new OffscreenCanvas(width, height);
  const compositor = await createCompositor(canvas);
  compositor.setLogo(logo);
  const useKinetic = !!settings.kinetic?.on;
  if (useKinetic && settings.kinetic) await loadCaptionFont(settings.kinetic.font, self.fonts);
  const captions = useKinetic ? null : new CaptionRenderer(words, settings, width, height, loudness, lang);
  const kinetic =
    useKinetic && settings.kinetic
      ? new KineticRenderer(words, settings.kinetic, width, height, loudness, lang)
      : null;
  const palette = paletteById(settings.aura).colors;
  // The part written: t0..t1 of the file, written from 0:00.
  const t0 = encode.trim?.start ?? 0;
  const t1 = Math.min(encode.trim?.end ?? Infinity, await input.computeDuration());
  const duration = Math.max(0, t1 - t0);

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: sink.fastStart }), target: sink.target });
  const video = new CanvasSource(canvas, {
    codec: encode.codec,
    bitrate: quality(encode),
    keyFrameInterval: 2,
    hardwareAcceleration: acceleration(encode),
  });
  const sound = new AudioSampleSource({ codec, bitrate: QUALITY_HIGH });
  output.addVideoTrack(video, { frameRate: fps });
  output.addAudioTrack(sound);
  let stop = false;
  running.set(jobId, {
    cancel: async () => {
      stop = true;
    },
  });

  let frame = 0;
  const totalFrames = Math.ceil(duration * fps);
  const renderUntil = async (t: number) => {
    for (; frame < totalFrames && frame / fps < t && !stop; frame++) {
      const time = frame / fps;
      const at = time + t0;
      const levels = levelsAt(bands, at);
      compositor.render(
        {
          kind: "aura",
          time: at,
          levels,
          palette,
          style: settings.auraStyle ?? "aura",
          history: settings.auraStyle === "spektrum" ? historyAt((s) => levelsAt(bands, s), at) : undefined,
        },
        kinetic ? kinetic.frame(at, levels) : (captions?.frame(at) ?? null),
      );
      await video.add(time, 1 / fps);
    }
    const sec = (performance.now() - started) / 1000;
    post({ type: "progress", jobId, progress: Math.min(1, frame / totalFrames), fps: frame / sec });
  };

  try {
    await output.start();
    // Interleave: draw the frames up to the end of each audio sample.
    const trimmed = !!encode.trim;
    for await (const sample of new AudioSampleSink(audio).samples(trimmed ? t0 : undefined, trimmed ? t1 : undefined)) {
      // Cut to the trim at the sample: the first may begin before it, the last end after it.
      const n = sample.numberOfFrames;
      const a = Math.max(0, Math.min(n, Math.round((t0 - sample.timestamp) * sample.sampleRate)));
      const b = Math.max(a, Math.min(n, Math.round((t1 - sample.timestamp) * sample.sampleRate)));
      if (stop || a >= b) {
        sample.close();
        if (stop) break;
        continue;
      }
      const part = a > 0 || b < n ? sample.trim(a, b) : sample;
      part.setTimestamp(Math.max(0, sample.timestamp + a / sample.sampleRate - t0));
      const mixed = dub ? mixDub(part, dub, t0) : part;
      const end = mixed.timestamp + mixed.duration;
      await sound.add(mixed);
      if (mixed !== part) mixed.close();
      if (part !== sample) part.close();
      sample.close();
      await renderUntil(end);
    }
    if (!stop) await renderUntil(Infinity);
    if (stop) {
      await output.cancel();
      await sink.discard();
      post({ type: "cancelled", jobId });
      return;
    }
    await output.finalize();
  } finally {
    running.delete(jobId);
    compositor.destroy();
    input.dispose();
  }
  await finish(jobId, sink, handle, started);
}

self.onmessage = (ev: MessageEvent<ToRender>) => {
  const m = ev.data;
  if (m.type === "cancel") {
    cancelled.add(m.jobId);
    // Before the encoder stops, so the half-written file is thrown away rather than saved.
    sinks.get(m.jobId)?.cancel();
    void running.get(m.jobId)?.cancel();
    return;
  }
  const run = async () => {
    // The previous render's download link is gone once a new one starts.
    await clearRenders();
    const sink = await openSink(m.handle);
    sinks.set(m.jobId, sink);
    if (cancelled.has(m.jobId)) sink.cancel();
    if (m.userFont) addUserFont(m.userFont);
    try {
      await burn(m.jobId, m.file, m.words, m.settings, m.bands, m.loudness, m.lang, m.dub, m.logo, m.encode, sink, m.handle);
    } finally {
      m.logo?.image.close();
    }
  };
  run()
    .catch(async (e) => {
      await sinks.get(m.jobId)?.discard();
      if (cancelled.has(m.jobId)) post({ type: "cancelled", jobId: m.jobId });
      else post({ type: "error", jobId: m.jobId, message: e instanceof Error ? e.message : String(e) });
    })
    .finally(() => {
      cancelled.delete(m.jobId);
      sinks.delete(m.jobId);
    });
};
