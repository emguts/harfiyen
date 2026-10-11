// Whisper engine check with onnxruntime-node on the CPU.
//
//   npx tsx tests/whisper.node.ts <wav>... [--encoder path/to/encoder.onnx] [--decoder path/to/decoder.onnx]
//
// Prints each transcript with word timestamps and checks that the words are
// in order and inside the audio. Uses the browser's encoder_model_fp16.onnx
// with the q4f16 decoder unless --encoder / --decoder name other exports
// with the same interface (e.g. encoder_model_q4f16.onnx, the light option).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ort from "onnxruntime-node";
import { Resampler, downmix } from "../src/engine";
import type { Ort } from "../src/engine/models";
import { WhisperEngine, type WhisperConfig } from "../src/whisper";

const args = process.argv.slice(2);
const encIdx = args.indexOf("--encoder");
const encoderFile = encIdx >= 0 ? args.splice(encIdx, 2)[1] : "encoder_model_fp16.onnx";
const decIdx = args.indexOf("--decoder");
const decoderFile = decIdx >= 0 ? args.splice(decIdx, 2)[1] : null;
if (!args.length) throw new Error("usage: tsx tests/whisper.node.ts <wav>... [--encoder file]");
const dir = join(import.meta.dirname, "..", "public", "models", "whisper-large-v3-turbo");

function readWav(path: string): { sampleRate: number; samples: Float32Array } {
  const b = readFileSync(path);
  let p = 12;
  let sampleRate = 0;
  let channels = 1;
  while (p < b.length) {
    const id = b.toString("ascii", p, p + 4);
    const size = b.readUInt32LE(p + 4);
    if (id === "fmt ") {
      channels = b.readUInt16LE(p + 10);
      sampleRate = b.readUInt32LE(p + 12);
      if (b.readUInt16LE(p + 22) !== 16) throw new Error("only 16-bit wav");
    } else if (id === "data") {
      const n = size / 2 / channels;
      const chans = Array.from({ length: channels }, () => new Float32Array(n));
      for (let i = 0; i < n; i++) for (let c = 0; c < channels; c++) chans[c][i] = b.readInt16LE(p + 8 + (i * channels + c) * 2) / 32768;
      return { sampleRate, samples: downmix(chans) };
    }
    p += 8 + size + (size & 1);
  }
  throw new Error("no data chunk");
}

let failed = false;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
  if (!ok) failed = true;
};

const config: WhisperConfig = JSON.parse(readFileSync(join(dir, "model.json"), "utf8"));
const t0 = performance.now();
const engine = await WhisperEngine.create(
  ort as unknown as Ort,
  {
    config,
    encoder: new Uint8Array(readFileSync(encIdx >= 0 ? encoderFile : join(dir, encoderFile))),
    decoder: new Uint8Array(readFileSync(decoderFile ?? join(dir, "decoder_model_merged_q4f16.onnx"))),
    vocab: JSON.parse(readFileSync(join(dir, "vocab.json"), "utf8")),
    vad: new Uint8Array(readFileSync(join(dir, "silero_vad.onnx"))),
  },
  "cpu",
  "cpu",
);
console.log(`loaded ${encoderFile} in ${((performance.now() - t0) / 1000).toFixed(1)} s`);

for (const path of args) {
  const { samples, sampleRate } = readWav(path);
  const seconds = samples.length / sampleRate;
  const rec = engine.createRecognizer();
  const rs = new Resampler(sampleRate, 16000);
  const words = [];
  const start = performance.now();
  // Feed in uneven pieces, as the worker does.
  const step = Math.round(sampleRate * 2.3);
  for (let i = 0; i < samples.length; i += step) {
    const last = i + step >= samples.length;
    rec.acceptWaveform(rs.process(samples.subarray(i, i + step), last));
    if (last) rec.inputFinished();
    while (rec.isReady()) await rec.decodeChunk();
    words.push(...rec.takeCommitted());
  }
  rec.flush();
  words.push(...rec.takeCommitted());
  const sec = (performance.now() - start) / 1000;
  console.log(`\n${path} (${seconds.toFixed(1)} s, ${sec.toFixed(1)} s, ${rec.timing.chunks} windows)`);
  console.log("  " + words.map((w) => w.text).join(" "));
  console.log("  " + words.map((w) => `${w.text}[${w.start.toFixed(2)}-${w.end.toFixed(2)}]`).join(" "));
  const ordered = words.every((w, i) => w.start <= w.end && (i === 0 || words[i - 1].start <= w.start));
  check(words.length > 0 && ordered, "words present and in order");
  check(words.every((w) => w.start >= 0 && w.end <= seconds + 0.5), "words inside the audio");
}

process.exit(failed ? 1 : 0);
