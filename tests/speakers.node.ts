// Who speaks when (src/lib/speakers.ts): turns, words, corrections and exports, without a model.
//
//   npx tsx tests/speakers.node.ts
//
// Exits non-zero on failure.

import type { Word } from "../src/engine";
import { cluster, turnsOf, windowsOf } from "../src/diarize";
import { buildCues, READING_RULES } from "../src/lib/cues";
import { toSrt, toText, toVtt } from "../src/lib/exporters";
import { assign, fromLabels, labelWords, merge, readSpeakers, rename, speakerAt, talkTime } from "../src/lib/speakers";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `\n        ${detail}`}`);
  if (!ok) failed++;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const w = (text: string, start: number, end: number): Word => ({ text, start, end });
// Two people: A says 0-2.6, B 3-4.5, A again 5-6.
const words = [
  w("Merhaba,", 0, 0.5),
  w("hoş", 0.6, 1),
  w("geldiniz.", 1, 1.6),
  w("Bugün", 1.8, 2.2),
  w("başlıyoruz.", 2.2, 2.6),
  w("Teşekkürler.", 3, 3.8),
  w("Sağ", 3.9, 4.1),
  w("olun.", 4.1, 4.5),
  w("Peki.", 5, 6),
];
const labels = [0, 0, 0, 0, 0, 1, 1, 1, 0];
const sp = fromLabels(words, labels);

check("turns from labels", same(sp.turns, [
  { start: 0, end: 2.6, speaker: 0 },
  { start: 3, end: 4.5, speaker: 1 },
  { start: 5, end: 6, speaker: 0 },
]), JSON.stringify(sp.turns));
check("default names", same(sp.names, ["Konuşmacı 1", "Konuşmacı 2"]));
check("speaker in a gap goes to the nearer turn", speakerAt(sp.turns, 2.7) === 0 && speakerAt(sp.turns, 2.95) === 1);
check("speaker before the first and after the last turn", speakerAt(sp.turns, -1) === 0 && speakerAt(sp.turns, 9) === 0);

const labelled = labelWords(words, sp);
check("words get their speaker", same(labelled.map((x) => x.speaker), labels));
check("labelling again changes nothing", labelWords(labelled, sp) === labelled);
check("no speakers strips them", labelWords(labelled, undefined).every((x) => x.speaker === undefined));
check("no speakers on plain words is the same array", labelWords(words, undefined) === words);

// An edited word, at a new time, still finds its speaker.
const edited = [...labelled.slice(0, 5), w("Çok", 3, 3.3), w("teşekkürler.", 3.3, 3.8), ...labelled.slice(6)];
check("an edited word finds its speaker", labelWords(edited, sp)[5].speaker === 1 && labelWords(edited, sp)[6].speaker === 1);

const cues = buildCues(labelled, READING_RULES);
// Without the sentence ends, the pauses alone would not break these lines.
const run = labelled.map((x) => ({ ...x, text: x.text.replace(/[.,]$/, "") }));
check("lines break where the speaker changes", same(buildCues(run, READING_RULES).map((c) => c.words.length), [5, 3, 1]), JSON.stringify(buildCues(run, READING_RULES).map((c) => c.words.map((x) => x.text))));

// Corrections.
const moved = assign(sp, 5, 6, 1);
check("a line given to the other speaker joins their turn", same(moved.turns, [
  { start: 0, end: 2.6, speaker: 0 },
  { start: 3, end: 6, speaker: 1 },
]), JSON.stringify(moved.turns));
const added = assign(sp, 1.8, 2.6, 2);
check("a new speaker for part of a turn", same(added.names, ["Konuşmacı 1", "Konuşmacı 2", "Konuşmacı 3"]) && same(added.turns, [
  { start: 0, end: 1.8, speaker: 0 },
  { start: 1.8, end: 2.6, speaker: 2 },
  { start: 3, end: 4.5, speaker: 1 },
  { start: 5, end: 6, speaker: 0 },
]), JSON.stringify(added));
const renamed = rename(sp, 1, "  Ayşe ");
check("rename trims", renamed.names[1] === "Ayşe");
check("an empty name is the default", rename(renamed, 1, " ").names[1] === "Konuşmacı 2");
const merged = merge(rename(added, 1, "Ayşe"), 0, 1);
check("merge drops a speaker and renumbers", same(merged.names, ["Ayşe", "Konuşmacı 2"]) && same(merged.turns, [
  { start: 0, end: 1.8, speaker: 0 },
  { start: 1.8, end: 2.6, speaker: 1 },
  { start: 3, end: 6, speaker: 0 },
]), JSON.stringify(merged));
check("giving every line to one speaker leaves one", assign(sp, 3, 4.5, 0).names.length === 1);
check("talk time", same(talkTime(sp).map((x) => Math.round(x * 10) / 10), [3.6, 1.5]));

// Project files.
check("read back", same(readSpeakers(JSON.parse(JSON.stringify(sp))), sp));
check("broken turns are dropped", same(readSpeakers({ names: ["A"], turns: [{ start: 0, end: 1, speaker: 3 }, { start: 1, end: 2, speaker: 0 }] }), {
  names: ["A"],
  turns: [{ start: 1, end: 2, speaker: 0 }],
}));
check("not speakers", readSpeakers(null) === undefined && readSpeakers({ names: [], turns: [] }) === undefined);

// Exports.
const names = ["Ali", "Ayşe"];
const srt = toSrt(cues, names);
check("SRT names the speaker where they take over", srt.includes("Ali: Merhaba,") && srt.includes("Ayşe: Teşekkürler.") && srt.includes("Ali: Peki."), srt);
check("SRT without speakers is unchanged", !/Ali|Ayşe/.test(toSrt(cues)) && toSrt(cues).includes("\nMerhaba,"));
check("WebVTT voice tags", toVtt(cues, names).includes("<v Ayşe>Teşekkürler."));
check("text names the speaker where they take over", toText(run, names) === "Ali: Merhaba hoş geldiniz Bugün başlıyoruz\n\nAyşe: Teşekkürler Sağ olun\n\nAli: Peki", toText(run, names));

// The model-free parts of diarize.
const wins = windowsOf([w("a", 0, 0.3), w("b", 2, 6)], 10);
check("a short stretch gets one window of at least a second", wins[0].end - wins[0].start >= 1 - 1e-9 && wins[0].speechEnd === 0.3);
check("a long stretch is covered end to end", wins[1].start === 2 && Math.abs(wins.at(-1)!.end - 6) < 1e-9);
const v = (...x: number[]) => {
  const a = Float32Array.from(x);
  const n = Math.hypot(...a);
  return a.map((y) => y / n);
};
const prints = [v(1, 0.1, 0), v(1, 0, 0.1), v(0, 1, 0.1), v(0.1, 1, 0), v(0.9, 0.1, 0.1)];
check("clusters by count", same(cluster(prints, 2, 0), [0, 0, 1, 1, 0]));
check("clusters by threshold", Math.max(...cluster(prints, undefined, 0.5)) === 1);
check("turnsOf joins a speaker's words", turnsOf(words, labels).length === 3);

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
