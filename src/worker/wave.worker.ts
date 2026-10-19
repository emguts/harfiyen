/// <reference lib="webworker" />
// The waveform of a file, read as soon as it opens: the timeline shows it
// before anything is transcribed, so the part to use can be picked by eye.
// The same measure as transcription's (the peak of the mono signal per
// PEAK_STEP), so the picture does not change when transcription starts.
// Only the audio is decoded; it reads many times faster than real time.

import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from "mediabunny";
import { PEAK_STEP } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

export type ToWave = { type: "read"; id: number; file: File } | { type: "stop" };

/** `peaks` is everything read so far (zeros past it); `done` once the file has been read to its end. */
export type FromWave = { id: number; peaks: Float32Array; done: boolean } | { id: number; error: true };

/** How often the timeline gets what has been read so far, in milliseconds. */
const POST_EVERY = 250;

let current = 0;

async function read(id: number, file: File) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track || !(await track.canDecode())) throw new Error("no audio");
    const duration = await input.computeDuration();
    const peaks = new Float32Array(Math.ceil(duration / PEAK_STEP) + 1);
    let last = performance.now();
    for await (const sample of new AudioSampleSink(track).samples()) {
      if (id !== current) {
        sample.close();
        return;
      }
      const n = sample.numberOfFrames;
      const rate = sample.sampleRate;
      const channels = sample.numberOfChannels;
      const mono = new Float32Array(n);
      const buf = new Float32Array(n);
      for (let ch = 0; ch < channels; ch++) {
        sample.copyTo(buf, { planeIndex: ch, format: "f32-planar" });
        for (let i = 0; i < n; i++) mono[i] += buf[i] / channels;
      }
      const t0 = sample.timestamp;
      sample.close();
      // One bucket at a time: the frames from here up to the next bucket's start.
      let i = 0;
      while (i < n) {
        const k = Math.max(0, Math.floor((t0 + i / rate) / PEAK_STEP));
        if (k >= peaks.length) break;
        const stop = Math.min(n, Math.ceil(((k + 1) * PEAK_STEP - t0) * rate));
        let pk = peaks[k];
        for (let j = i; j < stop; j++) {
          const v = Math.abs(mono[j]);
          if (v > pk) pk = v;
        }
        peaks[k] = pk;
        i = Math.max(stop, i + 1);
      }
      if (performance.now() - last > POST_EVERY) {
        last = performance.now();
        self.postMessage({ id, peaks: peaks.slice(), done: false } satisfies FromWave);
      }
    }
    if (id === current) self.postMessage({ id, peaks, done: true } satisfies FromWave, [peaks.buffer]);
  } catch {
    // Not readable here (a codec only the browser's media stack plays): transcription draws it instead.
    if (id === current) self.postMessage({ id, error: true } satisfies FromWave);
  } finally {
    input.dispose();
  }
}

self.onmessage = (ev: MessageEvent<ToWave>) => {
  const m = ev.data;
  if (m.type === "stop") {
    current = 0;
    return;
  }
  current = m.id;
  void read(m.id, m.file);
};
