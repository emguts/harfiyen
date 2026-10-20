// Lyrics timed from a transcription (src/lib/lyrics.ts), without a model.
//
//   npx tsx tests/lyrics.node.ts
//
// Exits non-zero on failure.

import type { Word } from "../src/engine";
import { buildCues } from "../src/lib/cues";
import { alignLyrics, applySpans, lyricLines, matchWords, planSpans, tapAlign } from "../src/lib/lyrics";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `\n        ${detail}`}`);
  if (!ok) failed++;
}

/** Words one after another, `step` seconds each, from `at`. */
const heard = (text: string, at = 0, step = 0.5): Word[] =>
  text.split(" ").map((t, i) => ({ text: t, start: at + i * step, end: at + (i + 1) * step - 0.05 }));

check(
  "satırlar",
  JSON.stringify(lyricLines("[Nakarat]\nbir iki üç\n\n(x2)\n♪ dört beş\r\n")) ===
    JSON.stringify([["bir", "iki", "üç"], ["dört", "beş"]]),
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
  const out = alignLyrics(h, "Yollar uzun, gece sessiz\nSabah uzak");
  check("kelime sayısı", out.length === 6);
  check("satır başları", out.map((w) => !!w.cue).join() === "true,false,false,false,true,false");
  check("noktalama ve büyük harf sözlerden", out[1].text === "uzun," && out[4].text === "Sabah");
  check("eşleşen zaman korunur", out[3].start === h[3].start && out[5].end === h[5].end);
}

// A word Whisper missed is placed between its neighbours, in order.
{
  const h = heard("rüzgar eser durmadan", 0, 1);
  const out = alignLyrics(h, "rüzgar hep eser durmadan");
  const ok = out[1].start >= out[0].end && out[1].end <= out[2].start + 1e-9;
  check("kaçırılan kelime araya yerleşir", ok, JSON.stringify(out));
}

// A line Whisper did not hear at all goes between its neighbours.
{
  const h = [...heard("ilk satır burada", 0), ...heard("son satır şurada", 30)];
  const out = alignLyrics(h, "ilk satır burada\nduyulmayan bir satır\nson satır şurada");
  const mid = out.slice(3, 6);
  const ok = mid[0].start >= out[2].end && mid[2].end < out[6].start;
  check("duyulmayan satır araya yerleşir", ok, JSON.stringify(mid));
}

// Times never go back.
{
  const h = heard("a b c d e f g h", 0, 0.3);
  const out = alignLyrics(h, "x a y b z\nc q r d\ne f g h s t");
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
  const out = alignLyrics(h, `${intro}\nkalbimiz hafif şimdi\ngece boyunca dans`);
  const lastIntro = out[8 * 6 - 1];
  const verse = out[8 * 6];
  const lineStarts = out.filter((w) => w.cue).slice(0, 8).map((w) => w.start);
  const paced = lineStarts.every((t, n) => n === 0 || t - lineStarts[n - 1] > 2);
  check("tekrarlanan giriş sıkışmaz", paced && lastIntro.end <= verse.start, JSON.stringify(lineStarts));
  check("sonraki dize zamanını korur", verse.start === 30);
}

// A part not in the lyrics (another language) sits between two lines: the
// unheard line follows the previous one at singing pace, not spread over it.
{
  const h = [...heard("ilk satır burada", 0), ...heard("lorem ipsum dolor sit amet", 10), ...heard("son satır şurada", 30)];
  const out = alignLyrics(h, "ilk satır burada\nduyulmayan bir satır\nson satır şurada");
  check("başka dildeki kısmın üstüne yayılmaz", out[5].end < 10, JSON.stringify(out.slice(3, 6)));
}

// Caption styles break at lyric lines too.
{
  const words: Word[] = [
    { text: "bir", start: 0, end: 0.3, cue: true },
    { text: "iki", start: 0.3, end: 0.6 },
    { text: "üç", start: 0.6, end: 0.9, cue: true },
    { text: "dört", start: 0.9, end: 1.2 },
  ];
  const cues = buildCues(words);
  check("altyazı dizede kırılır", cues.length === 2 && cues[1].words[0].text === "üç");
}

// Taps: each line starts where it was tapped; heard words inside it keep their times.
{
  const h = heard("mavi deniz uzakta", 12, 0.5);
  const t = tapAlign(h, "bir zamanlar burada\nmavi deniz uzakta\nson söz", [2, 12, 20]);
  const w = t.words;
  check("dokunuş dize başı olur", w[0].start === 2 && w[3].start === 12 && w[6].start === 20);
  check("dize içi duyulan zamanı alır", w[4].start === h[1].start && t.anchored[4]);
  check("dokunulmayan söz sıradaki dizeyi geçmez", w[2].end <= 12, JSON.stringify(w.slice(0, 3)));
}
{
  const t = tapAlign([], "ilk dize\nikinci dize\nüçüncü dize", [1, 5]);
  check("dokunulmayan dize sonrakine dizilir", t.words[4].start >= t.words[3].end && t.words[4].start < 9);
}

// Audio spans: a few lines each, at most 30 s; an untimed line looks between its neighbours.
{
  const words: Word[] = [
    { text: "a", start: 1, end: 1.5, cue: true },
    { text: "b", start: 1.5, end: 2 },
    { text: "c", start: 3, end: 3.5, cue: true },
    { text: "d", start: 50, end: 50.5, cue: true },
  ];
  const spans = planSpans({ words, anchored: [true, true, false, true] }, 60);
  const plan = spans.map((x) => [x.start, x.end, x.first, x.last].join(" ")).join(" | ");
  check("ses aralıkları", plan === "0 3 0 1 | 2 31 2 2 | 49 51.5 3 3", plan);
  check("aralık 30 saniyeyi geçmez", spans.every((x) => x.end - x.start <= 30));

  const timing = { words, anchored: [true, true, false, true] };
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

let threw = false;
try {
  alignLyrics(heard("bir iki"), "\n\n");
} catch {
  threw = true;
}
check("boş söz hata verir", threw);

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
