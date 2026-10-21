// Jump cut (src/lib/cuts.ts): finding the quiet, and file ↔ output times, without a model.
//
//   npx tsx tests/cuts.node.ts
//
// Exits non-zero on failure.

import type { Word } from "../src/engine";
import { BAND_RATE } from "../src/render/aura";
import {
  DEFAULT_JUMP_CUT,
  findCuts,
  isFiller,
  keptLength,
  keptParts,
  toFile,
  toOutput,
  wordsThrough,
} from "../src/lib/cuts";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `\n        ${detail}`}`);
  if (!ok) failed++;
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const show = (rs: { start: number; end: number }[]) => rs.map((r) => `${r.start.toFixed(2)}-${r.end.toFixed(2)}`).join(" ");

// Speech 1-2, 2.3-3 (a short pause), 5-6, and "ııı" at 6.2-6.6; the file is 8 s.
const words: Word[] = [
  { text: "bir", start: 1, end: 2 },
  { text: "iki", start: 2.3, end: 3 },
  { text: "üç", start: 5, end: 6 },
  { text: "ııı", start: 6.2, end: 6.6 },
];
const span = { start: 0, end: 8 };
const jc = { ...DEFAULT_JUMP_CUT, on: true, gap: 0.6, pad: 0.15 };

check("dolgu sesleri", isFiller("Iıı,") && isFiller("eee") && isFiller("hmm") && !isFiller("e") && !isFiller("bir"));

{
  const cuts = findCuts(words, span, jc, new Float32Array(0));
  check(
    "ses düzeyi olmadan: baş, uzun ara, dolgu ve son kesilir, kısa ara kalır",
    show(cuts) === "0.00-0.85 3.15-4.85 6.15-8.00",
    show(cuts),
  );
}
{
  const cuts = findCuts(words, span, { ...jc, fillers: false }, new Float32Array(0));
  check("dolgu kapalı: ııı konuşma sayılır", show(cuts) === "0.00-0.85 3.15-4.85 6.75-8.00", show(cuts));
}
{
  // Loud where the three words are, and a cough at 4.0-4.3 the transcript does not have.
  const loud = new Float32Array(8 * BAND_RATE).fill(-14);
  const sound = (a: number, b: number) => loud.fill(-3, Math.floor(a * BAND_RATE), Math.ceil(b * BAND_RATE));
  for (const w of words.slice(0, 3)) sound(w.start, w.end);
  sound(4, 4.3);
  // The last word trails off past its end.
  sound(6, 6.4);
  const cuts = findCuts(words.slice(0, 3), span, jc, loud);
  check("yazıda olmayan ses kalır, uzayan son kelime kırpılmaz", show(cuts) === "0.00-0.85 3.15-3.85 4.45-4.85 6.55-8.00", show(cuts));
}
check("kelime yoksa kesim yok", findCuts([], span, jc, new Float32Array(0)).length === 0);
{
  const dub = [{ start: 3.2, end: 4.6 }];
  const cuts = findCuts(words, span, jc, new Float32Array(0), dub);
  check("seslendirme cümlesi kesilmez", !cuts.some((c) => c.end > 3.2 && c.start < 4.6), show(cuts));
}

{
  const cuts = [
    { start: 0, end: 1 },
    { start: 3, end: 5 },
  ];
  const parts = keptParts(span, cuts);
  check("kalan parçalar", show(parts) === "1.00-3.00 5.00-8.00" && parts[1].at === 2, show(parts));
  check("çıktı süresi", keptLength(parts) === 5);
  check("dosya → çıktı", near(toOutput(2, parts), 1) && near(toOutput(5.5, parts), 2.5) && near(toOutput(0.5, parts), 0));
  check("kesimin içi kesimin yeri", near(toOutput(4, parts), 2));
  check("çıktı → dosya", near(toFile(1, parts), 2) && near(toFile(2.5, parts), 5.5) && near(toFile(0, parts), 1));
  const out = wordsThrough(
    [
      { text: "a", start: 1.5, end: 2.5 },
      { text: "b", start: 3.5, end: 4.5 },
      { text: "c", start: 2.8, end: 5.4 },
    ],
    span,
    cuts,
  );
  check("kelimeler çıktı zamanında, kesimdekiler düşer", show(out) === "0.50-1.50 1.80-2.40", show(out));
}
{
  const parts = keptParts({ start: 2, end: 6 }, []);
  check("kesimsiz: bölümün tamamı", show(parts) === "2.00-6.00" && near(toOutput(3, parts), 1));
}

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
