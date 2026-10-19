// Punctuation quality on correctly written Turkish text.
//
//   npx tsx tests/punct-eval.node.ts [data.json] [--all]
//
// The text (tests/data/punct-eval.tr.json, from scripts/make_punct_eval.py)
// is stripped to what speech recognition gives (plainWord), punctuated again
// with the formatter, and compared word by word. Prints scores, not
// pass/fail: run it before and after a change. --all lists every mistake
// instead of the first few of each kind.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ort from "onnxruntime-node";
import type { Ort } from "../src/engine/models";
import { Formatter, type FormatterConfig } from "../src/punct/formatter";
import { plainWord } from "../src/punct/turkish";
import type { WordPieceVocab } from "../src/punct/wordpiece";

const args = process.argv.slice(2);
const showAll = args.includes("--all");
const dataPath = args.find((a) => !a.startsWith("--")) ?? join(import.meta.dirname, "data", "punct-eval.tr.json");
const data: { articles: { title: string; text: string }[] } = JSON.parse(readFileSync(dataPath, "utf8"));

const dir = join(import.meta.dirname, "..", "public", "models", "seda-formatter");
const vocab: WordPieceVocab = JSON.parse(readFileSync(join(dir, "vocab.json"), "utf8"));
const cfg: FormatterConfig = JSON.parse(readFileSync(join(dir, "model.json"), "utf8"));
const model = new Uint8Array(readFileSync(join(dir, "formatter.int8.onnx")));
const formatter = await Formatter.create(ort as unknown as Ort, model, vocab, cfg, "cpu");

/** Precision / recall counter for one yes-no property of a word. */
class Score {
  tp = 0;
  fp = 0;
  fn = 0;
  examples: { fp: string[]; fn: string[] } = { fp: [], fn: [] };
  add(ref: boolean, ours: boolean, context: () => string) {
    if (ref && ours) this.tp++;
    else if (ours) this.examples.fp.push(context()), this.fp++;
    else if (ref) this.examples.fn.push(context()), this.fn++;
  }
  line(name: string) {
    const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1).padStart(5) + "%" : "    -");
    const p = pct(this.tp, this.tp + this.fp);
    const r = pct(this.tp, this.tp + this.fn);
    return `${name.padEnd(22)} kesinlik ${p}  bulma ${r}   (doğru ${this.tp}, fazla ${this.fp}, eksik ${this.fn})`;
  }
}

const lower = (s: string) => s.toLocaleLowerCase("tr-TR");
const core = (w: string) => w.replace(/[.,?!]+$/, "");
const endsSentence = (w: string) => /[.?!]$/.test(w);
const isUpper = (w: string) => !!w && w[0] !== lower(w[0]);

let words = 0;
let exact = 0;
const apostrophe = new Score(); // a word written with an apostrophe
const apostropheWrong: string[] = []; // both have one, at a different place
const capital = new Score(); // a capital letter inside a sentence (proper nouns)
const sentence = new Score(); // a sentence ends after the word
const comma = new Score();
const question = new Score();

for (const article of data.articles) {
  const ref = article.text.split(/\s+/).filter((w) => plainWord(w));
  const input = ref.map(plainWord);
  const ours = await formatter.run(input);

  ref.forEach((r, i) => {
    const o = ours[i];
    const at = () => `${ref.slice(Math.max(0, i - 2), i).join(" ")} [${o} ≠ ${r}] ${ref.slice(i + 1, i + 3).join(" ")}  · ${article.title}`;
    words++;
    if (o === r) exact++;

    const refApos = core(r).includes("'");
    const ourApos = core(o).includes("'");
    apostrophe.add(refApos, ourApos, at);
    if (refApos && ourApos && lower(core(r)) !== lower(core(o))) apostropheWrong.push(at());

    // Inside a sentence by the reference; the first word is capitalised anyway.
    if (i > 0 && !endsSentence(ref[i - 1])) capital.add(isUpper(r), isUpper(o), at);

    sentence.add(endsSentence(r), endsSentence(o), at);
    comma.add(r.endsWith(","), o.endsWith(","), at);
    question.add(r.endsWith("?"), o.endsWith("?"), at);
  });
}

console.log(`${data.articles.length} makale, ${words} kelime; birebir aynı: ${((100 * exact) / words).toFixed(1)}%\n`);
console.log(apostrophe.line("kesme işareti"));
console.log(`${"".padEnd(22)} ${apostropheWrong.length} kelimede ikisinde de var ama yeri ya da kökü farklı`);
console.log(capital.line("cümle içi büyük harf"));
console.log(sentence.line("cümle sonu"));
console.log(comma.line("virgül"));
console.log(question.line("soru işareti"));

const show = (title: string, list: string[]) => {
  if (!list.length) return;
  const n = showAll ? list.length : 12;
  console.log(`\n${title} (${list.length}${list.length > n ? `, ilk ${n}` : ""}):`);
  for (const line of list.slice(0, n)) console.log("  " + line);
};
show("Fazladan kesme işareti", apostrophe.examples.fp);
show("Eksik kesme işareti", apostrophe.examples.fn);
show("Kesme işareti yanlış yerde", apostropheWrong);
show("Fazladan büyük harf", capital.examples.fp);
show("Eksik büyük harf", capital.examples.fn);
