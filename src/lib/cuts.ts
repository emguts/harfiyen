// Jump cut: the quiet stretches between words (and filler sounds, "ııı") are
// taken out, so the video goes straight from one sentence to the next. Times
// stay the file's everywhere; only playback skips the cuts, and the exports
// leave them out (output time).

import type { Word } from "../engine";
import { BAND_RATE } from "../render/aura";
import type { TimeRange } from "./useTranscriber";

export interface JumpCut {
  on: boolean;
  /** The shortest quiet stretch that is cut, seconds. */
  gap: number;
  /** Quiet kept on each side of speech, seconds, so words are not clipped. */
  pad: number;
  /** Filler sounds ("ııı", "eee", "hmm") are cut too. */
  fillers: boolean;
}

export const DEFAULT_JUMP_CUT: JumpCut = { on: false, gap: 0.6, pad: 0.15, fillers: true };

const FILLER = /^(?:[ıiea]{2,}|[ıe]+m+|h+m+|m{2,})$/;

/** "Iıı", "eee…", "hmm": a sound, not a word. */
export const isFiller = (text: string) => FILLER.test(text.toLocaleLowerCase("tr").replace(/[^\p{L}]/gu, ""));

/** A loud blip shorter than this (a click, a breath) does not end a quiet stretch, seconds. */
const BLIP = 0.12;

/** Ranges sorted and joined where they touch. */
function merge(ranges: TimeRange[]): TimeRange[] {
  const out: TimeRange[] = [];
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = out.at(-1);
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ start: r.start, end: r.end });
  }
  return out;
}

function quantile(values: number[], q: number): number {
  const s = values.sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

/**
 * The loudness under which a frame counts as quiet: a third of the way from
 * the room's floor to the voice. null when the two are too close to tell
 * apart (music under the voice, say): the words alone decide then.
 */
function quietBelow(loudness: Float32Array, span: TimeRange, talk: TimeRange[]): number | null {
  const all: number[] = [];
  const voice: number[] = [];
  const end = Math.min(loudness.length, Math.ceil(span.end * BAND_RATE));
  let k = 0;
  for (let i = Math.max(0, Math.floor(span.start * BAND_RATE)); i < end; i++) {
    const t = (i + 0.5) / BAND_RATE;
    all.push(loudness[i]);
    while (k < talk.length && talk[k].end <= t) k++;
    if (k < talk.length && talk[k].start <= t) voice.push(loudness[i]);
  }
  if (all.length < BAND_RATE || voice.length < BAND_RATE / 2) return null;
  const floor = quantile(all, 0.1);
  const level = quantile(voice, 0.5);
  return level - floor < 1.5 ? null : floor + (level - floor) / 3;
}

/**
 * The quiet stretches of a..b: frames under `below` (all of it without one),
 * and filler sounds whatever their loudness. Each comes with whether a filler
 * is in it.
 */
function quietRuns(
  a: number,
  b: number,
  loudness: Float32Array,
  below: number | null,
  fillers: TimeRange[],
): { start: number; end: number; filler: boolean }[] {
  const inFiller = (t: number) => fillers.some((f) => f.start <= t && t < f.end);
  if (below === null) return [{ start: a, end: b, filler: fillers.some((f) => f.end > a && f.start < b) }];
  const i0 = Math.floor(a * BAND_RATE);
  const i1 = Math.ceil(b * BAND_RATE);
  const quiet: boolean[] = [];
  for (let i = i0; i < i1; i++) {
    const t = (i + 0.5) / BAND_RATE;
    // Past what was measured: nothing says there is sound.
    quiet.push(i >= loudness.length || loudness[i] < below || inFiller(t));
  }
  // Blips between quiet frames count as quiet.
  const blip = Math.round(BLIP * BAND_RATE);
  for (let i = 0; i < quiet.length; ) {
    if (quiet[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < quiet.length && !quiet[j]) j++;
    if (i > 0 && j < quiet.length && j - i <= blip) quiet.fill(true, i, j);
    i = j;
  }
  const runs: { start: number; end: number; filler: boolean }[] = [];
  for (let i = 0; i < quiet.length; ) {
    if (!quiet[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < quiet.length && quiet[j]) j++;
    const start = Math.max(a, (i0 + i) / BAND_RATE);
    const end = Math.min(b, (i0 + j) / BAND_RATE);
    if (end > start) runs.push({ start, end, filler: fillers.some((f) => f.end > start && f.start < end) });
    i = j;
  }
  return runs;
}

/**
 * The stretches of `span` to cut, sorted, in file time: quiet between the
 * words of at least `gap` (less `pad` on each side that touches speech), and
 * filler sounds. `keep` is sound that must stay as well (the dub's lines).
 * None without words: the whole span would go.
 */
export function findCuts(
  words: Word[],
  span: TimeRange,
  jc: JumpCut,
  loudness: Float32Array,
  keep: TimeRange[] = [],
): TimeRange[] {
  const speech: TimeRange[] = [];
  const fillers: TimeRange[] = [];
  for (const w of words) {
    if (w.end <= span.start || w.start >= span.end) continue;
    (jc.fillers && isFiller(w.text) ? fillers : speech).push({ start: w.start, end: w.end });
  }
  if (!speech.length) return [];
  const talk = merge(
    [...speech, ...keep]
      .filter((r) => r.end > span.start && r.start < span.end)
      .map((r) => ({ start: Math.max(span.start, r.start), end: Math.min(span.end, r.end) })),
  );
  const below = quietBelow(loudness, span, talk);
  const cuts: TimeRange[] = [];
  for (let i = 0; i <= talk.length; i++) {
    const a = i === 0 ? span.start : talk[i - 1].end;
    const b = i === talk.length ? span.end : talk[i].start;
    if (b - a <= 0) continue;
    for (const q of quietRuns(a, b, loudness, below, fillers)) {
      // The span's own ends are not speech: cut right up to them.
      const s = q.start <= span.start + 1e-3 ? span.start : q.start + jc.pad;
      const e = q.end >= span.end - 1e-3 ? span.end : q.end - jc.pad;
      // A filler goes however short; silence only from `gap` on.
      if (e - s > 0.05 && (q.filler || q.end - q.start >= jc.gap - 1e-6)) cuts.push({ start: s, end: e });
    }
  }
  return cuts;
}

/** A part of the file that stays, and where it begins in the output (seconds from its start). */
export interface Kept {
  start: number;
  end: number;
  at: number;
}

/** What is left of the span once the cuts (sorted, inside it) are taken out. */
export function keptParts(span: TimeRange, cuts: TimeRange[]): Kept[] {
  const parts: Kept[] = [];
  let from = span.start;
  let at = 0;
  for (const c of [...cuts, { start: span.end, end: span.end }]) {
    if (c.start > from) {
      parts.push({ start: from, end: c.start, at });
      at += c.start - from;
    }
    from = Math.max(from, c.end);
  }
  return parts;
}

/** How long the output is. */
export const keptLength = (parts: Kept[]) => parts.reduce((s, p) => s + (p.end - p.start), 0);

/** The last part starting at or before `t` in `key` (file `start` or output `at`); -1 before the first. */
function partAt(parts: Kept[], t: number, key: "start" | "at"): number {
  let lo = 0;
  let hi = parts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (parts[mid][key] <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** File time to output time. A moment inside a cut is where the cut is, between the parts on either side. */
export function toOutput(t: number, parts: Kept[]): number {
  const i = partAt(parts, t, "start");
  if (i < 0) return 0;
  const p = parts[i];
  return p.at + Math.min(t, p.end) - p.start;
}

/** Output time to file time. */
export function toFile(o: number, parts: Kept[]): number {
  const p = parts[Math.max(0, partAt(parts, o, "at"))];
  return p ? Math.min(p.end, p.start + Math.max(0, o - p.at)) : o;
}

/** Whether file time `t` is in a kept part. */
export function isKept(t: number, parts: Kept[]): boolean {
  const i = partAt(parts, t, "start");
  return i >= 0 && t < parts[i].end;
}

/** The words not wholly inside a cut (a cut filler is not captioned). */
export function wordsOutside(words: Word[], cuts: TimeRange[]): Word[] {
  if (!cuts.length) return words;
  return words.filter((w) => !cuts.some((c) => w.start >= c.start - 0.01 && w.end <= c.end + 0.01));
}

/**
 * The words of the span at output time, as in an export of the jump-cut
 * video: shifted to its start, the cuts closed up, words inside a cut gone.
 */
export function wordsThrough(words: Word[], span: TimeRange, cuts: TimeRange[]): Word[] {
  const parts = keptParts(span, cuts);
  const out: Word[] = [];
  for (const w of words) {
    if (w.end <= span.start || w.start >= span.end) continue;
    const start = toOutput(Math.max(span.start, w.start), parts);
    const end = toOutput(Math.min(span.end, w.end), parts);
    if (end - start > 0.01) out.push({ ...w, start, end });
  }
  return out;
}
