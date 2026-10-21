// Who speaks when, kept as time ranges (turns) of the file: edits, the
// translation, the jump cut and the exports all keep the file's times, so
// any word, old or new, finds its speaker by when it is said.

import { turnsOf, type Turn } from "../diarize";
import type { Word } from "../engine";

export type { Turn };

export interface Speakers {
  /** One name per speaker; a turn's `speaker` indexes it. */
  names: string[];
  /** Sorted, not overlapping. */
  turns: Turn[];
}

export const defaultName = (i: number) => `Konuşmacı ${i + 1}`;

/** Told apart on light and dark panes alike. */
const COLORS = ["#476de6", "#e0703c", "#1f9e89", "#c04fa8", "#c9a227", "#6a8f2f", "#8a63d2", "#d1495b"];

export const speakerColor = (i: number) => COLORS[i % COLORS.length];

/** The speaker at time t: the turn around it, else the nearest one. */
export function speakerAt(turns: Turn[], t: number): number {
  if (!turns.length) return 0;
  let lo = 0;
  let hi = turns.length - 1;
  // The last turn starting at or before t.
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (turns[mid].start <= t) lo = mid;
    else hi = mid - 1;
  }
  const a = turns[lo];
  if (t <= a.end || lo === turns.length - 1 || a.start > t) return a.speaker;
  const b = turns[lo + 1];
  return t - a.end <= b.start - t ? a.speaker : b.speaker;
}

/**
 * The words with their speaker (by when they are said), or without one when
 * there are no speakers. The same array when nothing changes.
 */
export function labelWords(words: Word[], sp: Speakers | undefined): Word[] {
  if (!sp?.turns.length) return words.some((w) => w.speaker !== undefined) ? words.map(({ speaker: _, ...w }) => w) : words;
  let changed = false;
  const out = words.map((w) => {
    const speaker = speakerAt(sp.turns, (w.start + w.end) / 2);
    if (w.speaker === speaker) return w;
    changed = true;
    return { ...w, speaker };
  });
  return changed ? out : words;
}

/** Speakers from one label per word, as the worker gives them. */
export function fromLabels(words: Word[], labels: number[]): Speakers {
  const count = labels.length ? Math.max(...labels) + 1 : 0;
  return { names: Array.from({ length: count }, (_, i) => defaultName(i)), turns: turnsOf(words, labels) };
}

/** Turns sorted, with neighbours of one speaker joined. */
function tidy(turns: Turn[]): Turn[] {
  const out: Turn[] = [];
  for (const t of [...turns].sort((a, b) => a.start - b.start)) {
    const last = out.at(-1);
    if (last && last.speaker === t.speaker) last.end = Math.max(last.end, t.end);
    else out.push({ ...t });
  }
  return out;
}

/** start..end said by `speaker`; a new number adds a speaker. */
export function assign(sp: Speakers, start: number, end: number, speaker: number): Speakers {
  const turns: Turn[] = [];
  for (const t of sp.turns) {
    if (t.end <= start || t.start >= end) turns.push(t);
    else {
      if (t.start < start) turns.push({ ...t, end: start });
      if (t.end > end) turns.push({ ...t, start: end });
    }
  }
  turns.push({ start, end, speaker });
  const names = [...sp.names];
  while (names.length <= speaker) names.push(defaultName(names.length));
  return dropUnused({ names, turns: tidy(turns) });
}

export function rename(sp: Speakers, speaker: number, name: string): Speakers {
  return { ...sp, names: sp.names.map((n, i) => (i === speaker ? name.trim() || defaultName(i) : n)) };
}

/** `from`'s turns become `into`'s, and `from` is gone. */
export function merge(sp: Speakers, from: number, into: number): Speakers {
  return dropUnused({ names: sp.names, turns: tidy(sp.turns.map((t) => (t.speaker === from ? { ...t, speaker: into } : t))) });
}

/** Speakers left with no turn are removed, the later ones renumbered. */
function dropUnused(sp: Speakers): Speakers {
  const used = new Set(sp.turns.map((t) => t.speaker));
  if (used.size === sp.names.length) return sp;
  const map = new Map<number, number>();
  const names: string[] = [];
  sp.names.forEach((n, i) => {
    if (!used.has(i)) return;
    map.set(i, names.length);
    // A default name follows its new number; a given one stays.
    names.push(n === defaultName(i) ? defaultName(names.length) : n);
  });
  return { names, turns: sp.turns.map((t) => ({ ...t, speaker: map.get(t.speaker)! })) };
}

/** How long each speaker talks, seconds. */
export function talkTime(sp: Speakers): number[] {
  const out = sp.names.map(() => 0);
  for (const t of sp.turns) out[t.speaker] += t.end - t.start;
  return out;
}

/** Speakers read back from a project; undefined when missing or broken. */
export function readSpeakers(x: unknown): Speakers | undefined {
  const s = x as Partial<Speakers> | null;
  if (!s || !Array.isArray(s.names) || !Array.isArray(s.turns)) return undefined;
  const names = s.names.map((n, i) => (typeof n === "string" && n.trim() ? n : defaultName(i)));
  const ok = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  const turns = (s.turns as Partial<Turn>[]).filter(
    (t): t is Turn =>
      ok(t?.start) && ok(t.end) && t.end >= t.start && Number.isInteger(t.speaker) && t.speaker! >= 0 && t.speaker! < names.length,
  );
  return turns.length ? dropUnused({ names, turns: tidy(turns) }) : undefined;
}
