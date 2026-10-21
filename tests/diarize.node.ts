// Speaker diarization (src/diarize) on a recording whose speakers are known.
//
//   npx tsx tests/diarize.node.ts <audio.wav> <truth.txt> [speakers]
//
// After `python scripts/prepare_models.py --speakers-only`.
// audio.wav: 16 kHz mono 16-bit. truth.txt: one line per turn, "start duration speaker | text";
// the text's words share the turn's time evenly. Prints the share of words given the right
// speaker (under the best matching of numbers to names), with the count given and guessed.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ort from "onnxruntime-node";
import type { Word } from "../src/engine";
import type { Ort } from "../src/engine/models";
import { diarize, featuresOf, SpeakerEmbedder } from "../src/diarize";

const [wavPath, truthPath, given] = process.argv.slice(2);
if (!truthPath) throw new Error("usage: tsx tests/diarize.node.ts <audio.wav> <truth.txt> [speakers]");
const modelPath = join(import.meta.dirname, "..", "public", "models", "3dspeaker-campplus", "campplus.onnx");

function readWav(path: string): Float32Array {
  const b = readFileSync(path);
  let at = 12;
  while (at < b.length) {
    const id = b.toString("ascii", at, at + 4);
    const size = b.readUInt32LE(at + 4);
    if (id === "data") {
      const n = Math.min(size, b.length - at - 8) / 2;
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = b.readInt16LE(at + 8 + i * 2) / 32768;
      return out;
    }
    at += 8 + size + (size & 1);
  }
  throw new Error("no data chunk");
}

const words: Word[] = [];
const truth: string[] = [];
for (const line of readFileSync(truthPath, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const [head, text] = line.split("|");
  const [start, dur, ...name] = head.trim().split(/\s+/);
  const tokens = text.trim().split(/\s+/);
  tokens.forEach((t, i) => {
    words.push({ text: t, start: +start + (+dur * i) / tokens.length, end: +start + (+dur * (i + 1)) / tokens.length });
    truth.push(name.join(" "));
  });
}
const names = [...new Set(truth)];

function accuracy(labels: number[]): number {
  // Greedy matching of guessed numbers to names, by how many words they share.
  const counts = new Map<string, number>();
  labels.forEach((l, i) => counts.set(`${l}|${truth[i]}`, (counts.get(`${l}|${truth[i]}`) ?? 0) + 1));
  const pairs = [...counts].sort((a, b) => b[1] - a[1]);
  const usedL = new Set<string>();
  const usedN = new Set<string>();
  let right = 0;
  for (const [key, c] of pairs) {
    const [l, n] = key.split("|");
    if (usedL.has(l) || usedN.has(n)) continue;
    usedL.add(l);
    usedN.add(n);
    right += c;
  }
  return right / labels.length;
}

const pcm = readWav(wavPath);
const audio = featuresOf(pcm);
const embedder = await SpeakerEmbedder.create(ort as unknown as Ort, new Uint8Array(readFileSync(modelPath)), "cpu");
for (const speakers of [given ? +given : names.length, undefined]) {
  const started = performance.now();
  const labels = (await diarize(embedder, audio, 0, words, { speakers }))!;
  const ms = performance.now() - started;
  const found = Math.max(...labels) + 1;
  console.log(
    `${speakers ? `${speakers} given` : "guessed"}: ${found} speakers, ${(accuracy(labels) * 100).toFixed(1)}% of words right` +
      `, ${((ms / 1000 / (pcm.length / 16000)) * 60).toFixed(1)} s a minute of audio`,
  );
}
