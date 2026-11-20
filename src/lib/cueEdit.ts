import type { Word } from "../engine";
import { buildCues, importedCues, type Cue } from "./cues";

/** Keep the current cue boundaries before the first manual split or merge. */
export function freezeCues(words: Word[], cues: Cue[]): Word[] {
  const starts = new Set(cues.map((c) => c.words[0]));
  return words.map((w) => {
    if (starts.has(w)) return w.cue ? w : { ...w, cue: true };
    if (!w.cue) return w;
    const { cue: _, ...rest } = w;
    return rest;
  });
}

/** Start a cue at an internal word boundary. */
export function splitAt(words: Word[], index: number): Word[] {
  if (!Number.isInteger(index) || index <= 0 || index >= words.length || words[index].cue) return words;
  const out = words.slice();
  out[index] = { ...words[index], cue: true };
  return out;
}

/** Join adjacent cues while keeping the first cue's explicit boundary. */
export function mergeWithNext(words: Word[], cueFirstIndex: number, nextFirstIndex: number): Word[] {
  if (!Number.isInteger(cueFirstIndex) || !Number.isInteger(nextFirstIndex) || cueFirstIndex < 0 || nextFirstIndex <= cueFirstIndex || nextFirstIndex >= words.length || !words[nextFirstIndex].cue) return words;
  if (words.slice(cueFirstIndex + 1, nextFirstIndex).some((w) => w.cue)) return words;
  const out = words.slice();
  out[cueFirstIndex] = { ...words[cueFirstIndex], cue: true };
  const { cue: _, ...rest } = words[nextFirstIndex];
  out[nextFirstIndex] = rest;
  return out;
}

/** A gap uses the following word; inside a word, use its nearer end. */
export function splitIndex(cue: Cue, time: number): number {
  if (cue.words.length < 2 || time <= cue.start || time >= cue.end) return -1;
  for (let i = 0; i < cue.words.length; i++) {
    const w = cue.words[i];
    if (time <= w.start) return i || -1;
    if (time < w.end) {
      const index = time - w.start < w.end - time ? i : i + 1;
      return index > 0 && index < cue.words.length ? index : -1;
    }
  }
  return -1;
}

/** Freeze and edit in memory so the caller records a single undo entry. */
export function splitCue(words: Word[], index: number, cues = importedCues(words) ?? buildCues(words)): Word[] {
  if (!Number.isInteger(index) || index <= 0 || index >= words.length) return words;
  if (!cues.some((c) => c.words.slice(1).includes(words[index]))) return words;
  return splitAt(freezeVisible(words, cues), index);
}

export function mergeCue(words: Word[], first: number, next: number, cues = importedCues(words) ?? buildCues(words)): Word[] {
  const at = cues.findIndex((c) => c.words[0] === words[first]);
  if (at < 0 || !words[next] || cues[at + 1]?.words[0] !== words[next]) return words;
  return mergeWithNext(freezeVisible(words, cues), first, next);
}

/** Preserve off-screen cues too when a trim or jump cut changes the exported grouping. */
function freezeVisible(words: Word[], cues: Cue[]): Word[] {
  if (!cues.length) return words;
  const indices = new Map(words.map((w, i) => [w, i]));
  const first = indices.get(cues[0].words[0]);
  const last = indices.get(cues.at(-1)!.words.at(-1)!);
  if (first === undefined || last === undefined) return words;
  const outside = (importedCues(words) ?? buildCues(words)).filter((c) => c.first < first || c.first > last);
  return freezeCues(words, [...outside, ...cues]);
}
