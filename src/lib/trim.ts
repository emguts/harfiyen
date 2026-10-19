// The trim: the part of the file that is transcribed, played and exported.

import type { Word } from "../engine";
import type { TimeRange } from "./useTranscriber";

/**
 * The words that fall in the range (any overlap), cut to it. `shift` times
 * them from the range's start, as in an export of only that part.
 */
export function wordsIn(words: Word[], range: TimeRange | null, shift = false): Word[] {
  if (!range) return words;
  const { start, end } = range;
  const by = shift ? start : 0;
  return words
    .filter((w) => w.end > start && w.start < end)
    .map((w) => ({ ...w, start: Math.max(start, w.start) - by, end: Math.min(end, w.end) - by }));
}
