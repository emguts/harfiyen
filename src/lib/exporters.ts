import type { Word } from "../engine";
import { buildCues, cueText, type Cue } from "./cues";
import { stamp } from "./format";

/** Split a cue into at most two balanced lines for subtitles. */
function twoLines(text: string, max = 42): string {
  if (text.length <= max) return text;
  const mid = text.length / 2;
  let best = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === " " && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  return best < 0 ? text : `${text.slice(0, best)}\n${text.slice(best + 1)}`;
}

/** Cues break where the speaker changes, so a cue has one. */
const speakerOf = (c: Cue) => c.words[0]?.speaker;

/**
 * The name before a cue's text where its speaker takes over from another; "" otherwise.
 * `speakers` (here and below): the speakers' names, when they were told apart (the words carry `speaker`).
 */
function lead(cues: Cue[], i: number, speakers?: string[]): string {
  const s = speakerOf(cues[i]);
  if (!speakers || s === undefined || (i > 0 && speakerOf(cues[i - 1]) === s)) return "";
  return `${speakers[s]}: `;
}

export function toSrt(cues: Cue[], speakers?: string[]): string {
  return cues
    .map((c, i) => `${i + 1}\n${stamp(c.start, ",")} --> ${stamp(c.end, ",")}\n${twoLines(lead(cues, i, speakers) + cueText(c))}\n`)
    .join("\n");
}

/** Speakers go in WebVTT's voice tag, on every cue: players show or style it as they like. */
export function toVtt(cues: Cue[], speakers?: string[]): string {
  const voice = (c: Cue) => {
    const s = speakerOf(c);
    return speakers && s !== undefined ? `<v ${speakers[s].replace(/[<>&]/g, "")}>` : "";
  };
  const body = cues.map((c) => `${stamp(c.start, ".")} --> ${stamp(c.end, ".")}\n${voice(c)}${twoLines(cueText(c))}\n`).join("\n");
  return `WEBVTT\n\n${body}`;
}

/** Plain text, one paragraph per longer pause (or speaker). */
export function toText(words: Word[], speakers?: string[]): string {
  const cues = buildCues(words, { gap: 1.5, maxDuration: Infinity, maxChars: Infinity });
  return cues.map((c, i) => lead(cues, i, speakers) + cueText(c)).join("\n\n");
}

export function toJson(words: Word[], meta: Record<string, unknown>, speakers?: string[]): string {
  const r = (x: number) => Math.round(x * 100) / 100;
  return JSON.stringify(
    {
      ...meta,
      ...(speakers && { speakers }),
      words: words.map((w) => ({
        text: w.text,
        start: r(w.start),
        end: r(w.end),
        ...(speakers && w.speaker !== undefined && { speaker: speakers[w.speaker] }),
      })),
    },
    null,
    2,
  );
}

export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
