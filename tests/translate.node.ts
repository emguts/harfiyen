// Translation check against scripts/make_mt_refs.py.
//
//   npx tsx tests/translate.node.ts <ref.json>
//
// Token ids must match MarianTokenizer, and the greedy output the same int8 model decoded in Python.
// References: python scripts/make_mt_refs.py OUT.json (after `python scripts/prepare_models.py --mt-only`).
// Sentence splitting and timing are checked on a small made-up transcript.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ort from "onnxruntime-node";
import type { Ort } from "../src/engine/models";
import { placeTranslation, splitSentences } from "../src/lib/translation";
import { Translator, type MtConfig, type MtVocab } from "../src/mt/translator";

const refPath = process.argv[2];
if (!refPath) throw new Error("usage: tsx tests/translate.node.ts <ref.json>");
const dir = join(import.meta.dirname, "..", "public", "models", "opus-mt-tc-big-tr-en");
const vocab: MtVocab = JSON.parse(readFileSync(join(dir, "spm.json"), "utf8"));
const cfg: MtConfig = JSON.parse(readFileSync(join(dir, "model.json"), "utf8"));
const refs: { text: string; ids: number[]; translation: string; fp32: string }[] = JSON.parse(
  readFileSync(refPath, "utf8"),
);

let failed = false;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
  if (!ok) failed = true;
};

const mt = await Translator.create(
  ort as unknown as Ort,
  new Uint8Array(readFileSync(join(dir, "encoder.int8.onnx"))),
  new Uint8Array(readFileSync(join(dir, "decoder.int8.onnx"))),
  vocab,
  cfg,
  "cpu",
);

for (const r of refs) {
  const ids = mt.encode(r.text);
  check(JSON.stringify(ids) === JSON.stringify(r.ids), `tokens (${ids.length}) ${r.text.slice(0, 40)}`);
}
const started = performance.now();
for (const r of refs) {
  const out = await mt.translate(r.text);
  // MarianTokenizer leaves a double space where an <unk> was dropped; we do not.
  const want = r.translation.replace(/\s+/g, " ").trim();
  check(out === want, `${r.text.slice(0, 40)} -> ${out}`);
  if (out !== want) console.log(`      expected ${want}`);
}
console.log(`${((performance.now() - started) / refs.length).toFixed(0)} ms a sentence`);

const w = (text: string, start: number, end: number) => ({ text, start, end });
const words = [
  w("Merhaba", 0, 0.5),
  w("arkadaşlar.", 0.5, 1),
  w("Bugün", 1.2, 1.5),
  w("tarif", 1.5, 2),
  w("yapacağız", 2, 2.6),
  // a pause with no punctuation ends a sentence too
  w("hadi", 4.5, 4.8),
  w("başlayalım", 4.8, 5.4),
];
const sentences = splitSentences(words);
check(
  JSON.stringify(sentences.map((s) => [s.first, s.count])) === "[[0,2],[2,3],[5,2]]",
  `sentences ${JSON.stringify(sentences.map((s) => s.text))}`,
);
const placed = placeTranslation(words, sentences, ["Hello friends.", "Today we'll cook.", "Let's go"]);
check(placed.length === 7, `${placed.length} translated words`);
check(placed[0].start === 0 && Math.abs(placed[1].end - 1) < 1e-9, "first sentence spans 0-1 s");
check(placed[2].start === 1.2 && Math.abs(placed[4].end - 2.6) < 1e-9, "second sentence spans 1.2-2.6 s");
check(placed.every((p, i) => i === 0 || p.start >= placed[i - 1].end - 1e-9), "words in order, no overlap");

if (failed) process.exit(1);
