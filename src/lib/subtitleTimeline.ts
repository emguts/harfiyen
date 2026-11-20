import type { Word } from "../engine";
import { buildCues, importedCues, type Cue } from "./cues";
import { wordsThrough } from "./cuts";
import { wordsIn } from "./trim";
import type { TimeRange } from "./useTranscriber";

/** Group at export time, but keep file times and source word identities for editing. */
export function subtitleTimelineCues(words: Word[], range: TimeRange | null, cuts: TimeRange[]): Cue[] {
  const source = words.map((word) => ({ ...word, source: word }));
  const span = range ?? { start: 0, end: words.at(-1)?.end ?? 0 };
  const output = cuts.length ? wordsThrough(source, span, cuts) : wordsIn(source, range, true);
  return (importedCues(output) ?? buildCues(output)).map((cue) => {
    const original = output.slice(cue.first, cue.first + cue.words.length).map((w) => w.source);
    return {
      first: cue.first,
      words: original,
      start: Math.max(span.start, original[0].start),
      end: Math.min(span.end, original.at(-1)!.end),
    };
  });
}
