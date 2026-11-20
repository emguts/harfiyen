import type { Word } from "../engine";
import { PEAK_STEP } from "../worker/protocol";
import { MIN_SPAN, retime, shiftSpan } from "./timing";

/** The quietest measured point within 150 ms, preferring the nearest on a tie. */
export function snapToQuiet(time: number, peaks: Float32Array): number {
  let best = time;
  let level = Infinity;
  const lo = Math.max(0, Math.ceil((time - 0.15) / PEAK_STEP));
  const hi = Math.min(peaks.length - 1, Math.floor((time + 0.15) / PEAK_STEP));
  for (let i = lo; i <= hi; i++) {
    const at = i * PEAK_STEP;
    if (peaks[i] < level || (peaks[i] === level && Math.abs(at - time) < Math.abs(best - time))) {
      best = at;
      level = peaks[i];
    }
  }
  return best;
}

/** Preview and commit push a neighbour back where the edit runs into it, and never pull it along. */
export function previewTiming(
  words: Word[], first: number, count: number, edge: "start" | "end" | "move",
  delta: number, total: number, peaks: Float32Array, snap: boolean,
): Word[] {
  const start = words[first].start;
  const end = words[first + count - 1].end;
  if (edge === "move") return shiftSpan(words, first, count, Math.min(delta, total - end), true);
  const wanted = (edge === "start" ? start : end) + delta;
  const at = snap ? snapToQuiet(wanted, peaks) : wanted;
  return edge === "start"
    ? retime(words, first, count, Math.max(0, Math.min(end - MIN_SPAN, at)), end, true)
    : retime(words, first, count, start, Math.min(total, Math.max(start + MIN_SPAN, at)), true);
}
