import type { AudioSampleSink } from "mediabunny";
import { downmix, Resampler } from "../engine/resampler";
import type { VocalSeparator } from "../separate/vocals";

/** Mono 16 kHz audio of from..to seconds of a track, a piece at a time. */
export async function* pcmChunks(sink: AudioSampleSink, rate: number, from: number, to: number): AsyncGenerator<Float32Array> {
  const resampler = new Resampler(rate, 16000);
  for await (const sample of sink.samples(from, to)) {
    const frames = sample.numberOfFrames;
    const skip = Math.max(0, Math.min(frames, Math.round((from - sample.timestamp) * sample.sampleRate)));
    const stop = Math.max(skip, Math.min(frames, Math.round((to - sample.timestamp) * sample.sampleRate)));
    const channels: Float32Array[] = [];
    for (let ch = 0; ch < sample.numberOfChannels; ch++) {
      const buf = new Float32Array(frames);
      sample.copyTo(buf, { planeIndex: ch, format: "f32-planar" });
      channels.push(buf.subarray(skip, stop));
    }
    sample.close();
    if (skip < stop) yield resampler.process(downmix(channels));
  }
  yield resampler.process(new Float32Array(0), true);
}

/** Mono 16 kHz audio of from..to seconds of a track. */
export async function readPcm(sink: AudioSampleSink, rate: number, from: number, to: number): Promise<Float32Array> {
  const parts: Float32Array[] = [];
  for await (const p of pcmChunks(sink, rate, from, to)) parts.push(p);
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Mono 16 kHz vocals of from..to seconds of a track: the band taken out by `sep`, a fresh separator. */
export async function readVocals(
  sink: AudioSampleSink,
  rate: number,
  from: number,
  to: number,
  sep: VocalSeparator,
): Promise<Float32Array> {
  const sepRate = sep.config.sampleRate;
  const toSep = rate !== sepRate ? [new Resampler(rate, sepRate), new Resampler(rate, sepRate)] : null;
  const resampler = new Resampler(sepRate, 16000);
  const parts: Float32Array[] = [];
  const add = async (channels: Float32Array[], last = false) => {
    const stereo = channels.length > 1 ? channels.slice(0, 2) : [channels[0], channels[0]];
    let out = await sep.push(toSep ? stereo.map((c, i) => toSep[i].process(c, last)) : stereo);
    if (last) out = concat([out, await sep.finish()]);
    parts.push(resampler.process(out, last));
  };
  for await (const sample of sink.samples(from, to)) {
    const frames = sample.numberOfFrames;
    const skip = Math.max(0, Math.min(frames, Math.round((from - sample.timestamp) * sample.sampleRate)));
    const stop = Math.max(skip, Math.min(frames, Math.round((to - sample.timestamp) * sample.sampleRate)));
    const channels: Float32Array[] = [];
    for (let ch = 0; ch < sample.numberOfChannels; ch++) {
      const buf = new Float32Array(frames);
      sample.copyTo(buf, { planeIndex: ch, format: "f32-planar" });
      channels.push(buf.subarray(skip, stop));
    }
    sample.close();
    if (skip < stop) await add(channels);
  }
  await add([new Float32Array(0)], true);
  return concat(parts);
}

function concat(parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
