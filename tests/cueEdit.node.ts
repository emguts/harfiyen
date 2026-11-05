// Cue edits, export boundaries and waveform timing previews, without a model.
// npm run test:cueedit
import type { Word } from "../src/engine";
import { freezeCues, mergeCue, mergeWithNext, splitAt, splitCue, splitIndex } from "../src/lib/cueEdit";
import { buildCues, cueText, importedCues } from "../src/lib/cues";
import { toSrt } from "../src/lib/exporters";
import { parseSubtitles } from "../src/lib/subtitles";
import { previewTiming, snapToQuiet } from "../src/lib/timelineEdit";
import { retime, shiftSpan } from "../src/lib/timing";
import { wordsOutside, wordsThrough } from "../src/lib/cuts";
import { wordsIn } from "../src/lib/trim";
import { subtitleTimelineCues } from "../src/lib/subtitleTimeline";

let failed = 0;
function check(name: string, ok: boolean) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
}
const cuesOf = (words: Word[]) => importedCues(words) ?? buildCues(words);
const shape = (words: Word[]) => cuesOf(words).map((c) => [Math.round(c.start * 1000) / 1000, Math.round(c.end * 1000) / 1000, cueText(c)]);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const source: Word[] = [
  { text: "Birinci", start: 0, end: 0.5 },
  { text: "cümle", start: 0.5, end: 1 },
  { text: "burada.", start: 1, end: 1.5 },
  { text: "İkinci", start: 3, end: 3.5 },
  { text: "cümle", start: 3.5, end: 4 },
  { text: "burada.", start: 4, end: 4.5 },
  { text: "Son", start: 6, end: 6.5 },
  { text: "cümle.", start: 6.5, end: 7 },
];
const saved = JSON.stringify(source);
{
  const before = shape(source);
  const frozen = freezeCues(source, buildCues(source));
  check("dondurma mevcut blokları aynen korur", same(shape(frozen), before));
  const out = splitCue(source, 4);
  check("işaretsiz dökümün ortasında bölme yalnız seçili bloğu böler", same(shape(out), [before[0], [3, 3.5, "İkinci"], [3.5, 4.5, "cümle burada."], before[2]]));
  check("ilk işlem bütün blok sınırlarını sabitler", out.filter((w) => w.cue).length === 4 && out[0].cue === true && out[6].cue === true);
  check("bölme sonrası birleştirme önceki blokları geri getirir", same(shape(mergeCue(out, 3, 4)), before));
  check("işaretli sınırda yeniden bölme değişiklik yapmaz", splitCue(out, 4) === out);
  check("otomatik blok başında bölme değişiklik yapmaz", splitCue(source, 3) === source);
  check("geçersiz bölmeler değişiklik yapmaz", [-1, 0, source.length, 1.5].every((i) => splitCue(source, i) === source));
}
{
  const out = splitCue(source, 1);
  check("ilk blok bölünür ve son blok korunur", cuesOf(out)[0].words.length === 1 && same(shape(out).at(-1), shape(source).at(-1)));
  const last = splitCue(source, 7);
  check("son blok bölünür ve ilk blok korunur", cuesOf(last).length === 4 && same(shape(last)[0], shape(source)[0]));
  const one = [source[0]];
  check("tek kelimelik blok bölünmez", splitCue(one, 0) === one && splitCue(one, 1) === one && splitIndex(buildCues(one)[0], 0.3) === -1);
  check("son blok sonrakiyle birleştirilemez", mergeCue(source, 6, 8) === source);
  check("birleştirme ara bloğu atlayamaz", mergeCue(source, 0, 6) === source);
  const merged = mergeCue(source, 0, 3);
  check("ilk birleştirme kalan otomatik sınırları korur", same(shape(merged), [[0, 4.5, "Birinci cümle burada. İkinci cümle burada."], shape(source)[2]]));
}
{
  const imported = parseSubtitles("1\n00:00:00,000 --> 00:00:02,000\nBirinci satır\n\n2\n00:00:02,000 --> 00:00:04,000\nİkinci satır\n\n3\n00:00:05,000 --> 00:00:06,000\nSon\n");
  const out = mergeCue(imported, 0, 2);
  check("içe aktarılan SRT blokları birleşir", same(shape(out), [[0, 4, "Birinci satır İkinci satır"], [5, 6, "Son"]]));
  check("sonraki işaret silinir, ilk işaret kalır", out[0].cue === true && !("cue" in out[2]) && out[4].cue === true);
  check("SRT yeniden içe aktarılınca bloklar aynıdır", same(shape(parseSubtitles(toSrt(cuesOf(out)))), shape(out)));
  const again = mergeCue(out, 0, 4);
  check("tek bloğa birleştirince otomatik gruplama geri açılmaz", importedCues(again)?.length === 1);
  check("saf yardımcılar geçersiz dizinlerde değişiklik yapmaz", splitAt(imported, -1) === imported && mergeWithNext(imported, 2, 0) === imported && mergeWithNext(imported, 0, 4) === imported);
}
{
  const cue = buildCues(source)[0];
  check("kelimenin başına yakın oynatma noktası önceki sınırı seçer", splitIndex(cue, 0.6) === 1);
  check("kelimenin sonuna yakın oynatma noktası sonraki sınırı seçer", splitIndex(cue, 0.9) === 2);
  check("blok dışında veya uçlarında bölme yapılmaz", [-1, 0, 0.1, 1.4, 1.5, 9].every((t) => splitIndex(cue, t) === -1));
  const gap = { ...cue, words: [source[0], { ...source[1], start: 0.8 }] };
  check("kelimeler arasındaki boşlukta sonraki kelime seçilir", splitIndex(gap, 0.65) === 1);
}
{
  const peaks = new Float32Array([0.8, 0.8, 0.8, 0.01, 0.8, 0.8, 0.8]);
  check("kenar 150 ms içindeki en sessiz ölçüme yapışır", Math.abs(snapToQuiet(0.42, peaks) - 0.3) < 1e-6);
  check("tepe verisi yoksa yapışma yapılmaz", snapToQuiet(0.42, new Float32Array()) === 0.42);
  check("ölçülmemiş alanda yapışma yapılmaz", snapToQuiet(8, peaks) === 8);
  const out = previewTiming(source, 1, 2, "start", -2, 7, peaks, false);
  check("önizleme bitişik komşunun en kısa süresinde durur", out[0].end === 0.05 && out[1].start === 0.05);
  check("önizleme ve bırakma aynı zamanları üretir", same(out, retime(source, 1, 2, out[1].start, out[2].end, true)));
  const snapped = previewTiming(source, 0, 1, "end", -0.08, 7, peaks, true);
  const free = previewTiming(source, 0, 1, "end", -0.08, 7, peaks, false);
  check("Alt ile yapışma kapanır", snapped[0].end === 0.3 && free[0].end === 0.42);
  const moved = previewTiming(source, 3, 3, "move", 20, 7, peaks, false);
  check(
    "blok taşıma sonraki bloğu en kısa süresine kadar iter, süreyi korur",
    moved[3].start === 4.95 && moved[5].end === 6.45 && moved[6].start === 6.45 && moved[6].end === 6.5,
  );
  check("taşıma önizlemesi ve bırakma aynıdır", same(moved, shiftSpan(source, 3, 3, moved[3].start - source[3].start, true)));
  const back = previewTiming(source, 3, 3, "move", -1, 7, peaks, false);
  check("geri taşınan blok komşularını çekmez", back[3].start === 2 && back[2].end === 1.5 && back[6].start === 6);
  const ending = previewTiming(source, 6, 2, "end", 20, 8, peaks, false);
  check("son blok dosya sonunu geçmez", ending[7].end === 8);
  const visible = wordsOutside(source, [{ start: 0.5, end: 1 }]);
  const indices = new Map(source.map((w, i) => [w, i]));
  const c = buildCues(visible)[0];
  check("filtrelenen kelimelerden kaynak dizinleri nesne kimliğiyle bulunur", indices.get(c.words.at(-1)!) === 2 && c.words.length === 2);
}
check("kaynak kelimeler yerinde değiştirilmez", JSON.stringify(source) === saved);
{
  const cuts = [{ start: 1.5, end: 2.9 }];
  const view = subtitleTimelineCues(source, null, cuts);
  const exported = cuesOf(wordsThrough(source, { start: 0, end: 7 }, cuts));
  check("kesilen boşluklar sonrası bloklar SRT ile aynı gruplamayı kullanır", same(view.map(cueText), exported.map(cueText)));
  check("zaman çizelgesi kaynak kelime kimliğini ve dosya zamanını korur", view[1].words[0] === source[3] && view[1].start === 3);
  const noPunctuation = source.map((w) => ({ ...w, text: w.text.replace(/\./g, "") }));
  const joined = subtitleTimelineCues(noPunctuation, null, cuts);
  check("sessizlik kesilince otomatik bloklar çıktı zamanına göre birleşir", joined.length === 2 && joined[0].words.length === 6);
  const divided = splitCue(noPunctuation, 1, joined);
  check("kesilen boşluktaki eski otomatik sınır bölmede geri gelmez", same(subtitleTimelineCues(divided, null, cuts).map(cueText), ["Birinci", "cümle burada İkinci cümle burada", "Son cümle"]));
  const range = { start: 0.75, end: 6.75 };
  const trimmed = subtitleTimelineCues(source, range, []);
  check("trim görünümü SRT ile aynı metni ve blok sayısını kullanır", same(trimmed.map(cueText), cuesOf(wordsIn(source, range, true)).map(cueText)));
  check("trim kenarında kelime kimliği korunur, görüntü trim'e kırpılır", trimmed[0].words[0] === source[1] && trimmed[0].start === 0.75 && trimmed.at(-1)!.end === 6.75);
  const edited = splitCue(source, 2, trimmed);
  check("kısmi ilk blok bölünürken görünmeyen baştaki kelime kaybolmaz", edited[0].cue === true && edited[1].cue === true && edited[2].cue === true && edited.length === source.length);
  const merged = mergeCue(source, 1, 3, trimmed);
  check("trim'in içinden başlayan ilk blok sonrakiyle birleşir", subtitleTimelineCues(merged, range, []).length === 2 && merged[0].cue === true);
  check("görünür blok yokken bölme yapılmaz", splitCue(source, 2, []) === source);
  check("boş döküm düzenlenmez", splitCue([], 0).length === 0 && mergeCue([], 0, 1).length === 0 && subtitleTimelineCues([], null, []).length === 0);
}
if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
