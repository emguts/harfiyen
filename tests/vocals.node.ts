// Vocal separation check with onnxruntime-node.
//
//   npx tsx tests/vocals.node.ts <song.wav> [out.wav] [--ref ref.wav] [--ep cpu|dml]
//
// Runs src/separate/vocals.ts over a 44.1 kHz WAV (float or 16 bit) in 1 s
// pushes, as the worker feeds it, and writes the mono vocals. With --ref, the
// output is compared with another separation of the same file (e.g. one by
// @audio/neural-separate) and the difference printed in dB SNR.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as ort from "onnxruntime-node";
import type { EncoderProvider, Ort } from "../src/engine/models";
import { VocalModel, type VocalsConfig } from "../src/separate/vocals";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const refPath = opt("--ref");
const ep = opt("--ep") ?? "cpu";
const [input, output = "vocals.wav"] = args;
if (!input) throw new Error("usage: tsx tests/vocals.node.ts <song.wav> [out.wav] [--ref ref.wav] [--ep cpu|dml]");
const dir = join(import.meta.dirname, "..", "public", "models", "mel-roformer");

/** Channels of a PCM or float WAV. */
function readWav(path: string): { sampleRate: number; channels: Float32Array[] } {
  const b = readFileSync(path);
  let p = 12;
  let sampleRate = 0;
  let count = 1;
  let format = 1;
  let bits = 16;
  while (p < b.length) {
    const id = b.toString("ascii", p, p + 4);
    const size = b.readUInt32LE(p + 4);
    if (id === "fmt ") {
      format = b.readUInt16LE(p + 8);
      count = b.readUInt16LE(p + 10);
      sampleRate = b.readUInt32LE(p + 12);
      bits = b.readUInt16LE(p + 22);
    } else if (id === "data") {
      const frames = size / (bits / 8) / count;
      const channels = Array.from({ length: count }, () => new Float32Array(frames));
      for (let i = 0; i < frames; i++) {
        for (let c = 0; c < count; c++) {
          const at = p + 8 + (i * count + c) * (bits / 8);
          channels[c][i] = format === 3 || bits === 32 ? b.readFloatLE(at) : b.readInt16LE(at) / 32768;
        }
      }
      return { sampleRate, channels };
    }
    p += 8 + size + (size & 1);
  }
  throw new Error("no data chunk");
}

function writeWav(path: string, x: Float32Array, rate: number) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + x.length * 2, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), 44 + i * 2);
  writeFileSync(path, b);
}

const config: VocalsConfig = JSON.parse(readFileSync(join(dir, "model.json"), "utf8"));
const song = readWav(input);
if (song.sampleRate !== config.sampleRate) throw new Error(`need ${config.sampleRate} Hz, got ${song.sampleRate}`);
const model = await VocalModel.create(
  ort as unknown as Ort,
  readFileSync(join(dir, Object.keys(config.files)[0])),
  config,
  ep as EncoderProvider,
);
const sep = model.separator();
const t0 = performance.now();
const parts: Float32Array[] = [];
const N = song.channels[0].length;
for (let i = 0; i < N; i += config.sampleRate) {
  parts.push(await sep.push(song.channels.map((c) => c.subarray(i, Math.min(N, i + config.sampleRate)))));
}
parts.push(await sep.finish());
const vocals = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
parts.reduce((at, p) => (vocals.set(p, at), at + p.length), 0);
const secs = (performance.now() - t0) / 1000;
console.log(`${(N / config.sampleRate).toFixed(1)} s of audio in ${secs.toFixed(1)} s (${ep}), ${vocals.length === N ? "length ok" : `LENGTH ${vocals.length} != ${N}`}`);
writeWav(output, vocals, config.sampleRate);

if (refPath) {
  const ref = readWav(refPath).channels;
  const mono = ref.length > 1 ? ref[0].map((v, i) => (v + ref[1][i]) / 2) : ref[0];
  let sig = 0;
  let err = 0;
  for (let i = 0; i < Math.min(mono.length, vocals.length); i++) {
    sig += mono[i] ** 2;
    err += (mono[i] - vocals[i]) ** 2;
  }
  console.log(`against ${refPath}: ${(10 * Math.log10(sig / err)).toFixed(1)} dB SNR`);
}
