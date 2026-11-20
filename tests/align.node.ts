// A pasted text timed from a transcription (src/lib/align.ts), without a model.
// Adapted from emguts/harfiyen.
//
//   npx tsx tests/align.node.ts
//
// Exits non-zero on failure.

import type { Word } from "../src/engine";
import { buildCues } from "../src/lib/cues";
import {
  alignText,
  applySpans,
  existingCues,
  looksLined,
  matchWords,
  placeByLines,
  planSpans,
  tapAlign,
  textLines,
  textUnits,
} from "../src/lib/align";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `\n        ${detail}`}`);
  if (!ok) failed++;
}

/** Words one after another, `step` seconds each, from `at`. */
const heard = (text: string, at = 0, step = 0.5): Word[] =>
  text.split(" ").map((t, i) => ({ text: t, start: at + i * step, end: at + (i + 1) * step - 0.05 }));
const lined = (h: Word[], text: string) => alignText(h, text, { lines: true }).words;

check(
  "satırlar",
  JSON.stringify(textLines("[Nakarat]\nbir iki üç\n\n(x2)\n♪ dört beş\r\n")) ===
    JSON.stringify([["bir", "iki", "üç"], ["dört", "beş"]]),
);
check("kısa satırlar satır sayılır", looksLined("bir iki üç\ndört beş altı\nyedi sekiz"));
check(
  "paragraf satır sayılmaz",
  !looksLined(
    "Bugün size uzun bir konuşma yapacağım ve bu konuşmada birçok konuya değineceğim, hepsini tek tek anlatacağım.\nİkinci paragraf da en az bunun kadar uzun olacak, çünkü anlatacak çok şey var ve vaktimiz de yeterli.",
  ),
);

// Misheard words still match by spelling; extra words Whisper repeats are skipped.
{
  const m = matchWords(["deniz", "kenarında", "bir", "ev"], ["denis", "kenarinda", "bir", "ev", "ev", "ev"]);
  check("yanlış duyulan kelime eşleşir", JSON.stringify(m) === "[0,1,2,3]", JSON.stringify(m));
}
{
  const m = matchWords(["gel", "gel"], ["şey", "gel", "gel", "bitti"]);
  check("baştaki ve sondaki fazlalık atlanır", JSON.stringify(m) === "[1,2]", JSON.stringify(m));
}

// Lines become caption lines; matched words keep their times.
{
  const h = heard("yollar uzun gece sessiz sabah uzak", 10);
  const out = lined(h, "Yollar uzun, gece sessiz\nSabah uzak");
  check("kelime sayısı", out.length === 6);
  check("satır başları", out.map((w) => !!w.cue).join() === "true,false,false,false,true,false");
  check("noktalama ve büyük harf metinden", out[1].text === "uzun," && out[4].text === "Sabah");
  check("eşleşen zaman korunur", out[3].start === h[3].start && out[5].end === h[5].end);
}

// Without lines, no caption lines are forced.
{
  const h = heard("yollar uzun gece sessiz sabah uzak", 10);
  const out = alignText(h, "Yollar uzun, gece sessiz\nSabah uzak", { lines: false }).words;
  check("satırsız: satır başı yok", out.every((w) => !w.cue));
}

// A word Whisper missed is placed between its neighbours, in order.
{
  const h = heard("rüzgar eser durmadan", 0, 1);
  const out = lined(h, "rüzgar hep eser durmadan");
  const ok = out[1].start >= out[0].end && out[1].end <= out[2].start + 1e-9;
  check("kaçırılan kelime araya yerleşir", ok, JSON.stringify(out));
}

// A line Whisper did not hear at all goes between its neighbours.
{
  const h = [...heard("ilk satır burada", 0), ...heard("son satır şurada", 30)];
  const out = lined(h, "ilk satır burada\nduyulmayan bir satır\nson satır şurada");
  const mid = out.slice(3, 6);
  const ok = mid[0].start >= out[2].end && mid[2].end < out[6].start;
  check("duyulmayan satır araya yerleşir", ok, JSON.stringify(mid));
}

// Times never go back.
{
  const h = heard("a b c d e f g h", 0, 0.3);
  const out = lined(h, "x a y b z\nc q r d\ne f g h s t");
  const ok = out.every((w, i) => w.end >= w.start && (i === 0 || w.start >= out[i - 1].start));
  check("zamanlar ileri gider", ok);
}

// A repeated intro line Whisper barely heard: the few short words it did hear
// must not pull every repeat into the first second.
{
  const intro = Array.from({ length: 8 }, () => "biz bu yolu hep birlikte yürüdük").join("\n");
  const h = [
    ...heard("biz bu", 0, 0.4),
    ...heard("kalbimiz hafif şimdi", 30, 0.6),
    ...heard("gece boyunca dans", 40, 0.6),
  ];
  const out = lined(h, `${intro}\nkalbimiz hafif şimdi\ngece boyunca dans`);
  const lastIntro = out[8 * 6 - 1];
  const verse = out[8 * 6];
  const lineStarts = out.filter((w) => w.cue).slice(0, 8).map((w) => w.start);
  const paced = lineStarts.every((t, n) => n === 0 || t - lineStarts[n - 1] > 2);
  check("tekrarlanan giriş sıkışmaz", paced && lastIntro.end <= verse.start, JSON.stringify(lineStarts));
  check("sonraki dize zamanını korur", verse.start === 30);
}

// A part not in the text (another language) sits between two lines: the
// unheard line follows the previous one at speaking pace, not spread over it.
{
  const h = [...heard("ilk satır burada", 0), ...heard("lorem ipsum dolor sit amet", 10), ...heard("son satır şurada", 30)];
  const out = lined(h, "ilk satır burada\nduyulmayan bir satır\nson satır şurada");
  check("başka dildeki kısmın üstüne yayılmaz", out[5].end < 10, JSON.stringify(out.slice(3, 6)));
}

// A long talk: matched block by block, every word in order, misheard words still placed.
{
  const vocab = ["deniz", "kenarında", "güneş", "batarken", "yürüdük", "konuştuk", "sustuk", "güldük", "baktık", "düşündük"];
  const said = Array.from({ length: 3000 }, (_, i) => `${vocab[i % vocab.length]}${Math.floor(i / vocab.length)}`);
  // Whisper misheard every seventh word and dropped every thirteenth.
  const h: Word[] = [];
  said.forEach((w, i) => {
    if (i % 13 === 5) return;
    h.push({ text: i % 7 === 3 ? w.replace("e", "a") : w, start: i * 0.4, end: i * 0.4 + 0.35 });
  });
  const t0 = performance.now();
  const t = alignText(h, said.join(" "), { lines: false });
  const ms = performance.now() - t0;
  const anchored = t.anchored.filter(Boolean).length;
  check("uzun metin: kelimelerin çoğu eşleşir", anchored > said.length * 0.9, `${anchored}/${said.length}`);
  check("uzun metin: zaman doğru", t.words[2000].start === 800, String(t.words[2000].start));
  check("uzun metin: hızlı", ms < 5000, `${Math.round(ms)} ms`);
}

// Caption styles break at aligned lines.
{
  const words: Word[] = [
    { text: "bir", start: 0, end: 0.3, cue: true },
    { text: "iki", start: 0.3, end: 0.6 },
    { text: "üç", start: 0.6, end: 0.9, cue: true },
    { text: "dört", start: 0.9, end: 1.2 },
  ];
  const cues = buildCues(words);
  check("altyazı satırda kırılır", cues.length === 2 && cues[1].words[0].text === "üç");
}

// Taps: each line starts where it was tapped; heard words inside it keep their times.
{
  const h = heard("mavi deniz uzakta", 12, 0.5);
  const t = tapAlign(h, "bir zamanlar burada\nmavi deniz uzakta\nson söz", [2, 12, 20], { lines: true });
  const w = t.words;
  check("dokunuş satır başı olur", w[0].start === 2 && w[3].start === 12 && w[6].start === 20);
  check("satır içi duyulan zamanı alır", w[4].start === h[1].start && t.anchored[4]);
  check("dokunulmayan kelime sıradaki satırı geçmez", w[2].end <= 12, JSON.stringify(w.slice(0, 3)));
  check("dokunuşta satır başı işaretli", w[0].cue === true && w[3].cue === true);
}
{
  const t = tapAlign([], "ilk satır\nikinci satır\nüçüncü satır", [1, 5], { lines: true });
  check("dokunulmayan satır sonrakine dizilir", t.words[4].start >= t.words[3].end && t.words[4].start < 9);
}
// Without lines, sentences are tapped.
{
  const units = textUnits("Bir iki üç. Dört beş!\nAltı yedi", false);
  check("satırsız: birimler cümleler", JSON.stringify(units) === JSON.stringify([["Bir", "iki", "üç."], ["Dört", "beş!"], ["Altı", "yedi"]]), JSON.stringify(units));
  const t = tapAlign([], "Bir iki üç. Dört beş!", [3, 8], { lines: false });
  check("satırsız: cümle dokunuşta başlar", t.words[0].start === 3 && t.words[3].start === 8 && t.words.every((w) => !w.cue));
}

// Audio spans: a few lines each, at most 30 s; an unmatched line looks between its neighbours.
{
  const words: Word[] = [
    { text: "a", start: 1, end: 1.5, cue: true },
    { text: "b", start: 1.5, end: 2 },
    { text: "c", start: 3, end: 3.5, cue: true },
    { text: "d", start: 50, end: 50.5, cue: true },
  ];
  const timing = { words, anchored: [true, true, false, true] };
  const spans = planSpans(timing, 60);
  const plan = spans.map((x) => [x.start, x.end, x.first, x.last].join(" ")).join(" | ");
  check("ses aralıkları", plan === "0 3 0 1 | 2 31 2 2 | 49 51.5 3 3", plan);
  check("aralık 30 saniyeyi geçmez", spans.every((x) => x.end - x.start <= 30));

  const ok = applySpans(timing, spans, [
    [
      { start: 1.1, end: 1.4 },
      { start: 1.6, end: 1.9 },
    ],
    [{ start: 8, end: 8.5 }],
    null,
  ]);
  check("sesten gelen zaman uygulanır", ok[0].start === 1.1 && ok[2].start === 8 && ok[3].start === 50);
  const far = applySpans(timing, spans, [
    [
      { start: 20, end: 20.4 },
      { start: 21, end: 21.4 },
    ],
    null,
    null,
  ]);
  check("kanıttan sapan aralık reddedilir", far[0].start === 1 && far[1].start === 1.5);
}

// Without caption lines, sentences stand in for lines.
{
  const words: Word[] = [
    { text: "Bir", start: 1, end: 1.5 },
    { text: "iki.", start: 1.5, end: 2 },
    { text: "Üç", start: 50, end: 50.5 },
    { text: "dört.", start: 50.5, end: 51 },
  ];
  const spans = planSpans({ words, anchored: [true, true, true, true] }, 60);
  check("satırsız: cümleler ayrı aralık", spans.length === 2 && spans[1].first === 2, JSON.stringify(spans));
}

let threw = false;
try {
  lined(heard("bir iki"), "\n\n");
} catch {
  threw = true;
}
check("boş metin hata verir", threw);

// placeByLines / existingCues tests
{
  // 1. Respects explicit `cue: true` boundaries and proportional word weights
  const explicit: Word[] = [
    { text: "One", start: 1, end: 2, cue: true },
    { text: "two", start: 2, end: 4 },
    { text: "Three", start: 5, end: 6, cue: true },
    { text: "four", start: 6, end: 7 },
  ];
  check("existingCues explicit sınırları korur", existingCues(explicit).length === 2);
  const placed = placeByLines(explicit, "Biri iki\nÜçüncüsü");
  check(
    "placeByLines kelime zamanlarını orantılı dağıtır ve cue ekler",
    placed.length === 3 &&
      placed[0].text === "Biri" &&
      placed[0].cue === true &&
      Math.abs(placed[0].start - 1) < 1e-9 &&
      Math.abs(placed[0].end - 2.6666666667) < 1e-6 &&
      placed[1].text === "iki" &&
      !placed[1].cue &&
      Math.abs(placed[1].start - placed[0].end) < 1e-9 &&
      Math.abs(placed[1].end - 4) < 1e-9 &&
      placed[2].text === "Üçüncüsü" &&
      placed[2].cue === true &&
      placed[2].start === 5 &&
      placed[2].end === 7,
    JSON.stringify(placed),
  );
}

{
  // 2. Uses READING_RULES cues when no explicit `cue: true` exists, and skips blanks/headers/notes
  const autoWords: Word[] = [
    { text: "Hello", start: 0, end: 0.4 },
    { text: "world", start: 0.4, end: 1.0 },
    { text: "How", start: 3.0, end: 3.4 },
    { text: "now", start: 3.4, end: 4.0 },
  ];
  const cues = existingCues(autoWords);
  check("existingCues duraklamadan satırları bulur", cues.length === 2, `len=${cues.length}`);
  const placed = placeByLines(autoWords, "[Nakarat]\n\nMerhaba dünya\n(x2)\n♪ Şimdi nasıl\n");
  check(
    "placeByLines başlıkları ve boş satırları atlar",
    placed.length === 4 &&
      placed[0].start === 0 &&
      placed[1].end === 1.0 &&
      placed[2].cue === true &&
      placed[2].start === 3.0 &&
      placed[3].end === 4.0,
    JSON.stringify(placed),
  );

  // 3. lines: false omits `cue: true`
  const unlined = placeByLines(autoWords, "Merhaba dünya\nŞimdi nasıl", { lines: false });
  check(
    "placeByLines lines:false cue işareti eklemez",
    unlined.every((w) => !w.cue) && unlined[0].start === 0 && unlined[3].end === 4.0,
  );

  // 4. Mismatched line count throws
  let mismatchThrew = false;
  try {
    placeByLines(autoWords, "Tek satır");
  } catch {
    mismatchThrew = true;
  }
  check("placeByLines satır sayısı uyuşmazsa hata verir", mismatchThrew);

  // 5. Header-only / blank text throws
  let emptyThrew = false;
  try {
    placeByLines(autoWords, "[Nakarat]\n\n(x2)\n");
  } catch {
    emptyThrew = true;
  }
  check("placeByLines boş/yalnızca başlıklı metinde hata verir", emptyThrew);
}

{
  // 6. Zero-duration cue stays monotonic
  const zeroCue: Word[] = [{ text: "Hi", start: 2, end: 2, cue: true }];
  const placed = placeByLines(zeroCue, "Selam sana");
  check(
    "placeByLines sıfır süreli satırda geçerli zaman üretir",
    placed.length === 2 &&
      placed.every((w) => w.start === 2 && w.end === 2 && Number.isFinite(w.start)),
    JSON.stringify(placed),
  );
}

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
