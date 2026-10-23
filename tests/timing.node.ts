// Hand-edited word times (src/lib/timing.ts), without a model. Adapted from emguts/harfiyen.
//
//   npx tsx tests/timing.node.ts
//
// Exits non-zero on failure.

import type { Word } from "../src/engine";
import { formatTime, parseTime, retime, shiftAll, shiftSpan } from "../src/lib/timing";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `\n        ${detail}`}`);
  if (!ok) failed++;
}

// Three lines of two words: 0-1, 2-3, 5-6 seconds.
const words: Word[] = [
  { text: "bir", start: 0, end: 0.5, cue: true },
  { text: "iki", start: 0.5, end: 1 },
  { text: "üç", start: 2, end: 2.5, cue: true },
  { text: "dört", start: 2.5, end: 3 },
  { text: "beş", start: 5, end: 5.5, cue: true },
  { text: "altı", start: 5.5, end: 6 },
];
const times = (ws: Word[]) => ws.map((w) => `${w.start}-${w.end}`).join(" ");

{
  const out = retime(words, 2, 2, 2.2, 4.2);
  check("satır yeni aralığa yerleşir", times(out.slice(2, 4)) === "2.2-3.2 3.2-4.2", times(out));
  check("diğer satırlar değişmez", out[0] === words[0] && out[4] === words[4]);
  check("metin ve satır başı korunur", out[2].text === "üç" && out[2].cue === true);
}
{
  const out = retime(words, 2, 2, 0.2, 7);
  check("komşuları geçmez", out[2].start === 1 && out[3].end === 5, times(out));
}
{
  const out = retime(words, 3, 1, 2.8, 3.5);
  check("tek kelime", out[3].start === 2.8 && out[3].end === 3.5, times(out));
  check("bitişik önceki kelime sınırı izler", out[2].start === 2 && out[2].end === 2.8, times(out));
}
{
  // Most transcribed words touch: a start must still move earlier, taking the boundary along.
  const out = retime(words, 3, 1, 2.3, 3);
  check("bitişik kelimede başlangıç geri alınır", out[3].start === 2.3 && out[2].end === 2.3, times(out));
  const tight = retime(words, 3, 1, 1, 3);
  check("önceki kelime en kısa süresinde durur", tight[2].start === 2 && tight[2].end === 2.05 && tight[3].start === 2.05, times(tight));
  const later = retime(words, 2, 1, 2, 2.7);
  check("bitişik sonraki kelime sınırı izler", later[2].end === 2.7 && later[3].start === 2.7 && later[3].end === 3, times(later));
  const gap = retime(words, 2, 1, 1.5, 2.5);
  check("aradaki boşluk korunur, önceki satır değişmez", gap[2].start === 1.5 && gap[1] === words[1], times(gap));
}
{
  const out = shiftSpan(words, 2, 2, 0.4);
  check("satır kayar, uzunluk aynı", times(out.slice(2, 4)) === "2.4-2.9 2.9-3.4", times(out));
  const far = shiftSpan(words, 2, 2, 10);
  check("kaydırma sonraki satırda durur", far[3].end === 5 && far[2].start === 4, times(far));
  const back = shiftSpan(words, 0, 2, -3);
  check("kaydırma sıfırın gerisine gitmez", back[0].start === 0);
}
{
  const out = shiftAll(words, 0.25);
  check("hepsi kayar", out[0].start === 0.25 && out[5].end === 6.25);
  const back = shiftAll(words, -1);
  check("toplu kaydırma sıfırda durur", back[0].start === 0 && back[5].end === 6);
}
check("zaman yazımı", formatTime(62.354) === "1:02.35" && formatTime(2.35) === "2.35", formatTime(62.354));
check(
  "zaman okuma",
  parseTime("1:02.35") === 62.35 && parseTime("62,5") === 62.5 && parseTime("1:02") === 62 && isNaN(parseTime("abc")),
);

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
