// Formatter check against sedalib's Formatter, plus plainWord.
//
//   npx tsx tests/formatter.node.ts [refs.json]
//
// refs.json (default tests/data/formatter-refs.json) comes from
// scripts/make_formatter_refs.py. Token ids and written words must match
// exactly; Harfiyen also ends the transcript with a full stop. plainWord must
// turn every written word back into its input, so that punctuating again sees
// the same text. Exits non-zero on mismatch.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ort from "onnxruntime-node";
import type { Ort } from "../src/engine/models";
import { Formatter, type FormatterConfig } from "../src/punct/formatter";
import { plainWord } from "../src/punct/turkish";
import { WordPieceTokenizer, type WordPieceVocab } from "../src/punct/wordpiece";

const refPath = process.argv[2] ?? join(import.meta.dirname, "data", "formatter-refs.json");
const refs: { words: string[]; ids: number[][]; written: string[] }[] = JSON.parse(readFileSync(refPath, "utf8"));

const dir = join(import.meta.dirname, "..", "public", "models", "seda-formatter");
const vocab: WordPieceVocab = JSON.parse(readFileSync(join(dir, "vocab.json"), "utf8"));
const cfg: FormatterConfig = JSON.parse(readFileSync(join(dir, "model.json"), "utf8"));
const model = new Uint8Array(readFileSync(join(dir, "formatter.int8.onnx")));
const formatter = await Formatter.create(ort as unknown as Ort, model, vocab, cfg, "cpu");
const tok = new WordPieceTokenizer(vocab);

let failed = 0;
function check(ok: boolean, name: string, detail?: () => string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) {
    if (detail) console.log("        " + detail());
    failed++;
  }
}

for (const r of refs) {
  const text = r.words.join(" ");
  const name = text.length > 48 ? text.slice(0, 48) + "…" : text;
  const ids = r.words.map((w) => tok.encodeWord(w));
  check(JSON.stringify(ids) === JSON.stringify(r.ids), `tokens: ${name}`);

  const ours = await formatter.run(r.words);
  const theirs = r.written.slice();
  if (!/[.?!]$/.test(theirs[theirs.length - 1])) theirs[theirs.length - 1] += ".";
  const at = ours.findIndex((w, i) => w !== theirs[i]);
  check(at < 0 && ours.length === theirs.length, `written: ${name}`, () => `word ${at}: ${ours[at]} ≠ ${theirs[at]}`);

  const back = ours.map(plainWord);
  const bad = back.findIndex((w, i) => w !== r.words[i]);
  check(bad < 0, `tekrar uygulama: ${name}`, () => `${ours[bad]} -> ${back[bad]} ≠ ${r.words[bad]}`);
}

// plainWord strips what the formatter and the number step add.
const plain: [string, string][] = [
  ["İstanbul'da,", "istanbulda"],
  ["TBMM'de", "tbmmde"],
  ["Işık.", "ışık"],
  ["misin?", "misin"],
  ["Ahmet’le", "ahmetle"],
  ["1923'te", "1923te"],
  ["e-posta", "e-posta"],
];
for (const [input, expected] of plain) {
  const got = plainWord(input);
  check(got === expected, `plainWord: ${input} -> ${expected}`, () => `got: ${got}`);
}

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
