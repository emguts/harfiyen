// Hand edits to word times: a line or a single word moved or stretched, or the
// whole transcript shifted. Words keep their order: an edit is held between the
// words around it rather than pushing them. A neighbour that touches the edited
// words (most transcribed words end where the next begins) shares the boundary:
// it follows the edit, down to MIN_SPAN of its own.
//
// Adapted from emguts/harfiyen (sarki-ozellikleri branch).

import type { Word } from "../engine";

/** Shortest time a word or a line is given, seconds. */
export const MIN_SPAN = 0.05;

/** Neighbours closer than this share their boundary. */
const TOUCH = 0.01;

const round = (t: number) => Math.round(t * 1000) / 1000;

/**
 * Where words first..first+count-1 may lie: after the word before, before the
 * word after. A touching neighbour gives way down to MIN_SPAN (`joinPrev`,
 * `joinNext`: it moves with the edit).
 */
export function room(words: Word[], first: number, count: number) {
  const prev = words[first - 1];
  const next = words[first + count];
  const s = words[first].start;
  const e = words[first + count - 1].end;
  const joinPrev = !!prev && s - prev.end < TOUCH;
  const joinNext = !!next && next.start - e < TOUCH;
  const lo = !prev ? 0 : joinPrev ? Math.min(s, prev.start + MIN_SPAN) : prev.end;
  const hi = !next ? Infinity : joinNext ? Math.max(e, next.end - MIN_SPAN) : next.start;
  return { lo, hi, joinPrev, joinNext };
}

/**
 * Words first..first+count-1 placed in start..end: their times are scaled
 * from the old span to the new one, so the gaps between them keep their
 * proportions. The span is held between the neighbouring words.
 */
export function retime(words: Word[], first: number, count: number, start: number, end: number): Word[] {
  if (count <= 0) return words;
  const { lo, hi, joinPrev, joinNext } = room(words, first, count);
  let s = Math.max(lo, start);
  let e = Math.min(hi, end);
  if (e - s < MIN_SPAN) {
    // Too tight: keep the length asked for as far as the room allows.
    s = Math.max(lo, Math.min(s, hi - MIN_SPAN));
    e = Math.min(hi, s + Math.max(MIN_SPAN, end - start));
  }
  const old0 = words[first].start;
  const old1 = Math.max(words[first + count - 1].end, old0 + 1e-6);
  const k = (e - s) / (old1 - old0);
  const at = (t: number) => round(s + (t - old0) * k);
  const out = words.slice();
  for (let i = first; i < first + count; i++) {
    const w = words[i];
    out[i] = { ...w, start: at(w.start), end: Math.max(at(w.start), at(w.end)) };
  }
  if (joinPrev) out[first - 1] = { ...words[first - 1], end: out[first].start };
  if (joinNext) out[first + count] = { ...words[first + count], start: out[first + count - 1].end };
  return out;
}

/** Words first..first+count-1 moved by `seconds` without changing length, as far as the neighbours allow. */
export function shiftSpan(words: Word[], first: number, count: number, seconds: number): Word[] {
  if (count <= 0) return words;
  const { lo, hi } = room(words, first, count);
  const s = words[first].start;
  const e = words[first + count - 1].end;
  const d = Math.min(Math.max(seconds, lo - s), hi - e);
  return retime(words, first, count, s + d, e + d);
}

/** Every word moved by `seconds`; nothing goes before 0. */
export function shiftAll(words: Word[], seconds: number): Word[] {
  const d = Math.max(seconds, -(words[0]?.start ?? 0));
  return words.map((w) => ({ ...w, start: round(w.start + d), end: round(w.end + d) }));
}

/** "1:02.35"; minutes only when needed: "2.35". */
export function formatTime(t: number): string {
  const cs = Math.round(Math.max(0, t) * 100);
  const m = Math.floor(cs / 6000);
  const s = (cs % 6000) / 100;
  const sec = s.toFixed(2).padStart(5, "0");
  return m ? `${m}:${sec}` : s.toFixed(2);
}

/** "1:02.35", "62.35", "62,35" or "1:02" as seconds; NaN if it is not a time. */
export function parseTime(text: string): number {
  const m = text.trim().replace(",", ".").match(/^(?:(\d+):)?(\d+(?:\.\d*)?)$/);
  if (!m) return NaN;
  return (m[1] ? +m[1] * 60 : 0) + +m[2];
}
