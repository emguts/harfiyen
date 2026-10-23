// A pasted text timed from a transcription of the same audio: song lyrics, a
// speech's script, a poem read aloud. The transcript mishears words, but where
// it hears them is mostly right: the text's words are matched to the
// transcribed ones (global alignment, words compared by spelling), a matched
// word takes the time of the word it matched, and the words in between share
// the time around them. With `lines`, each line of the text becomes a caption
// line.
//
// Adapted from emguts/harfiyen (sarki-ozellikleri branch, src/lib/lyrics.ts).

import type { Word } from "../engine";

/** Cost of a text word with no transcribed word, and of a transcribed word with no text word. */
const GAP_TEXT = 0.5;
const GAP_HEARD = 0.5;
/** Spellings less alike than this are different words. */
const MIN_SIM = 0.5;
/** Seconds an unmatched word gets: a base plus a little per letter. */
const WORD_BASE = 0.22;
const WORD_PER_CHAR = 0.05;
/** No one says or sings words faster than this, seconds per word. */
const MIN_WORD = 0.15;
/**
 * Long texts are matched this many words at a time, each block against the
 * transcript from where the one before it ended: a one-hour talk would
 * otherwise compare every word with every word.
 */
const BLOCK = 400;

/**
 * Lines of the text, as words. Blank lines, section tags such as "[Nakarat]"
 * or "(x2)" on a line of their own, and music notes are skipped.
 */
export function textLines(text: string): string[][] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^[[(].*[\])]$/.test(l))
    .map((l) => l.split(/\s+/).filter((w) => w && !/^[-–—♪♫]+$/.test(w)))
    .filter((ws) => ws.length > 0);
}

/** Short lines (lyrics, a poem) are caption lines; paragraphs are not. */
export function looksLined(text: string): boolean {
  const lines = textLines(text);
  if (lines.length < 2) return false;
  return lines.reduce((n, l) => n + l.length, 0) / lines.length <= 12;
}

/** Letters and digits only, lower case, without accents; Turkish dotless i is i. */
export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/ı/g, "i")
    .replace(/[^\p{L}\p{N}]/gu, "");

function editDistance(a: string, b: string) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 1 for the same spelling, 0 for nothing in common. */
export function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  return 1 - editDistance(a, b) / Math.max(a.length, b.length);
}

/**
 * For each text word, the index of the transcribed word it matched, or -1.
 * Words are normalized. Transcribed words before the first and after the
 * last text word are free to skip (talk, an intro, Whisper repeating itself
 * at the end).
 */
function matchNormalized(a: string[], b: string[]): number[] {
  const N = a.length;
  const M = b.length;
  const W = M + 1;
  // Speech says the same words again and again: each pair is compared once.
  const seen = new Map<string, number>();
  const sim = (x: string, y: string) => {
    // Lengths this far apart cannot reach MIN_SIM.
    if (Math.min(x.length, y.length) < MIN_SIM * Math.max(x.length, y.length)) return 0;
    const key = `${x}\0${y}`;
    let v = seen.get(key);
    if (v === undefined) seen.set(key, (v = similarity(x, y)));
    return v;
  };
  const score = new Float32Array((N + 1) * W);
  // 0: match, 1: text word unmatched (up), 2: transcribed word skipped (left).
  const move = new Uint8Array((N + 1) * W);
  for (let j = 1; j <= M; j++) move[j] = 2; // Free leading skips: score stays 0.
  for (let i = 1; i <= N; i++) {
    score[i * W] = -GAP_TEXT * i;
    move[i * W] = 1;
    for (let j = 1; j <= M; j++) {
      // Words spelled too differently never match: a part in another language
      // must not claim lines just because skipping costs more.
      const s = sim(a[i - 1], b[j - 1]);
      const diag = s >= MIN_SIM ? score[(i - 1) * W + j - 1] + 2 * s - 1 : -Infinity;
      const up = score[(i - 1) * W + j] - GAP_TEXT;
      const left = score[i * W + j - 1] - GAP_HEARD;
      let best = diag;
      let m = 0;
      if (up > best) (best = up), (m = 1);
      if (left > best) (best = left), (m = 2);
      score[i * W + j] = best;
      move[i * W + j] = m;
    }
  }
  // Free trailing skips: end wherever the last row scores best.
  let j = 0;
  for (let k = 1; k <= M; k++) if (score[N * W + k] > score[N * W + j]) j = k;
  const out = new Array<number>(N).fill(-1);
  let i = N;
  while (i > 0) {
    const m = j > 0 ? move[i * W + j] : 1;
    if (m === 0) out[--i] = --j;
    else if (m === 1) i--;
    else j--;
  }
  return out;
}

/**
 * For each text word, the index of the transcribed word it matched, or -1.
 * The first block is looked for in the whole transcript (the text may start
 * after a long intro); each later one from where the one before it ended.
 */
export function matchWords(text: string[], heard: string[]): number[] {
  const a = text.map(normalize);
  const b = heard.map(normalize);
  const out: number[] = [];
  let from = 0;
  for (let k = 0; k < a.length; k += BLOCK) {
    const part = a.slice(k, k + BLOCK);
    const to = k === 0 ? b.length : Math.min(b.length, from + 2 * part.length + 200);
    const m = matchNormalized(part, b.slice(from, to));
    let last = -1;
    for (const j of m) {
      out.push(j < 0 ? -1 : j + from);
      if (j >= 0) last = j + from;
    }
    if (last >= 0) from = last + 1;
  }
  return out;
}

const length = (w: string) => WORD_BASE + WORD_PER_CHAR * normalize(w).length;

/**
 * Drops matches that would squeeze the text words between them into too
 * little time: short common words ("ve", "bir") match anywhere, and a few
 * heard in an intro can pull lines from all over the song into one second.
 * Keeps the chain of matches with the most weight (longer, closer spellings
 * weigh more) in which the words between every two matches fit. In place.
 */
export function keepPlausible(match: number[], text: string[], heard: Word[]) {
  const at = match.flatMap((j, i) => (j >= 0 ? [i] : []));
  const weight = at.map((i) => {
    const a = normalize(text[i]);
    return similarity(a, normalize(heard[match[i]].text)) * Math.min(a.length, 8);
  });
  const fits = (p: number, q: number) =>
    heard[match[q]].start - heard[match[p]].end >= (q - p - 1) * MIN_WORD - 1e-9;
  const best = new Float64Array(at.length);
  const from = new Int32Array(at.length).fill(-1);
  for (let b = 0; b < at.length; b++) {
    // A chain may start here only if the words before it fit before it.
    best[b] = heard[match[at[b]]].start >= at[b] * MIN_WORD ? weight[b] : -Infinity;
    for (let a = 0; a < b; a++) {
      if (best[a] + weight[b] > best[b] && fits(at[a], at[b])) {
        best[b] = best[a] + weight[b];
        from[b] = a;
      }
    }
  }
  let end = -1;
  for (let b = 0; b < at.length; b++) if (best[b] > -Infinity && (end < 0 || best[b] > best[end])) end = b;
  const keep = new Set<number>();
  for (let b = end; b >= 0; b = from[b]) keep.add(at[b]);
  for (const i of at) if (!keep.has(i)) match[i] = -1;
}

interface Parsed {
  words: string[];
  /** Per word, the line (or, without lines, the sentence) it belongs to. */
  groupOf: number[];
  /** Words that start a caption line. */
  firsts: Set<number>;
}

/**
 * The units a text is timed by hand in: its lines with `lines`, else its
 * sentences (a paragraph's lines mean nothing). One tap starts each.
 */
export function textUnits(text: string, lines: boolean): string[][] {
  const p = parse(text, lines);
  const units: string[][] = [];
  p.words.forEach((w, i) => (units[p.groupOf[i]] ??= []).push(w));
  return units;
}

function parse(text: string, lines: boolean): Parsed {
  const ls = textLines(text);
  const words = ls.flat();
  if (!words.length) throw new Error("Yapıştırılan metinde kelime bulunamadı.");
  const firsts = new Set<number>();
  if (lines) ls.reduce((at, l) => (firsts.add(at), at + l.length), 0);
  // Without lines, unheard words keep to their sentence instead.
  let group = 0;
  const groupOf = lines
    ? ls.flatMap((l, n) => l.map(() => n))
    : words.map((_, i) => (i > 0 && /[.?!…]["'”’)]*$/.test(words[i - 1]) ? ++group : group));
  return { words, groupOf, firsts };
}

/**
 * Times for the words that have none (NaN), from the ones around them. Nothing
 * says where unheard words were said, and a gap may hold a part not in the
 * text (another language, an instrumental), so they are not spread over it:
 * the words of the next timed word's line go just before it, the rest follow
 * the previous timed word at speaking pace or, at the start, `startAt`.
 */
function fill(out: Word[], p: Parsed, startAt: number) {
  const need = (ns: number[]) => ns.reduce((s, n) => s + length(p.words[n]), 0);
  let i = 0;
  while (i < out.length) {
    if (!isNaN(out[i].start)) {
      i++;
      continue;
    }
    let k = i;
    while (k < out.length && isNaN(out[k].start)) k++;
    const prev = i > 0 ? out[i - 1] : null;
    const next = k < out.length ? out[k] : null;
    const run = Array.from({ length: k - i }, (_, n) => i + n);
    const total = need(run);
    const before = next ? run.filter((n) => p.groupOf[n] === p.groupOf[k]) : [];
    const after = run.filter((n) => !before.includes(n));
    const from = prev ? prev.end : Math.max(0, Math.min(startAt, (next?.start ?? 0) - total));
    const to = next ? next.start : from + total;
    const room = Math.max(0, to - from);
    const scale = total > room ? room / total : 1;
    const place = (ns: number[], at: number) => {
      let t = at;
      for (const n of ns) {
        const d = length(p.words[n]) * scale;
        Object.assign(out[n], { start: t, end: t + d });
        t += d;
      }
    };
    place(after, from);
    place(before, to - need(before) * scale);
    i = k;
  }
  // Times only go forward, and a word never ends before it starts.
  let last = 0;
  for (const w of out) {
    w.start = Math.max(w.start, last);
    w.end = Math.max(w.end, w.start);
    last = w.start;
  }
}

/** Timed text words, and which of them got their time from a matched word. */
export interface TextTiming {
  words: Word[];
  anchored: boolean[];
}

/**
 * The text as timed words: matched words take their transcribed word's time,
 * the others are laid out next to the matched words around them (with their
 * own line's matched word where there is one) and squeezed in when the gap is
 * short. With `lines`, the first word of each line starts a caption line.
 */
/** The text's words, untimed (NaN), the first of each line marked when `lines`. */
const blank = (p: Parsed): Word[] =>
  p.words.map((t, i) => (p.firsts.has(i) ? { text: t, start: NaN, end: NaN, cue: true } : { text: t, start: NaN, end: NaN }));

/** Text words `idx` take the times of the transcribed words they match. */
function timesFromHeard(p: Parsed, idx: number[], heard: Word[], out: Word[], anchored: boolean[]) {
  const text = idx.map((i) => p.words[i]);
  const match = matchWords(
    text,
    heard.map((w) => w.text),
  );
  keepPlausible(match, text, heard);
  match.forEach((j, n) => {
    if (j < 0) return;
    Object.assign(out[idx[n]], { start: heard[j].start, end: heard[j].end });
    anchored[idx[n]] = true;
  });
}

export function alignText(heard: Word[], text: string, { lines }: { lines: boolean }): TextTiming {
  const p = parse(text, lines);
  const out = blank(p);
  const anchored = p.words.map(() => false);
  timesFromHeard(
    p,
    p.words.map((_, i) => i),
    heard,
    out,
    anchored,
  );
  if (!anchored.some(Boolean)) throw new Error("Metin dökümle eşleşmedi; doğru dosya ve dil mi?");
  fill(out, p, heard[0]?.start ?? 0);
  return { words: out, anchored };
}

/**
 * The text timed by hand: `taps[n]` is when unit n (a line, or without
 * lines a sentence; see textUnits) starts, as the user pressed a key when it
 * began. Within a unit, words take the times of the transcribed words heard
 * between its tap and the next; units after the last tap follow it at
 * speaking pace. From emguts/harfiyen.
 */
export function tapAlign(heard: Word[], text: string, taps: number[], { lines }: { lines: boolean }): TextTiming {
  const p = parse(text, lines);
  if (!taps.length) throw new Error("Hiç işaret konmadı.");
  const out = blank(p);
  const anchored = p.words.map(() => false);
  const members: number[][] = [];
  p.groupOf.forEach((g, i) => (members[g] ??= []).push(i));
  taps.slice(0, members.length).forEach((t, n) => {
    const end = taps[n + 1] ?? Infinity;
    const idx = members[n];
    timesFromHeard(
      p,
      idx,
      heard.filter((w) => w.start >= t - 0.2 && w.start < end),
      out,
      anchored,
    );
    // The tap is when the unit starts, whatever was heard.
    const f = out[idx[0]];
    const fEnd = isNaN(f.end) ? t + length(f.text) : Math.min(Math.max(f.end, t + 0.1), end);
    Object.assign(f, { start: t, end: fEnd });
    anchored[idx[0]] = true;
    // Heard words before the tap, or past the next one, do not belong to this unit.
    for (const i of idx.slice(1)) {
      if (anchored[i] && (out[i].start < t || out[i].end > end)) {
        Object.assign(out[i], { start: NaN, end: NaN });
        anchored[i] = false;
      }
    }
  });
  fill(out, p, taps[0]);
  return { words: out, anchored };
}

/** Longest stretch of audio Whisper aligns at once, seconds; a window is 30. */
const SPAN_MAX = 29;
/** Audio kept around a line's words, seconds. */
const SPAN_PAD = 1;

/**
 * Stretches of audio to time the text in ("Sesle ince ayar"), a few lines
 * each. A line with a matched word is looked for around its words; a line
 * without one anywhere between the matched words around it (at most SPAN_MAX
 * from the earlier). Without caption lines, sentences stand in for lines.
 * `first`..`last`: the text words of the span.
 */
export function planSpans(t: TextTiming, duration: number): { start: number; end: number; first: number; last: number }[] {
  const { words, anchored } = t;
  const lines: { first: number; last: number }[] = [];
  const lined = words.some((x) => x.cue);
  words.forEach((w, i) => {
    const starts = w.cue || !lines.length || (!lined && /[.?!…]["'”’)]*$/.test(words[i - 1].text));
    if (starts) lines.push({ first: i, last: i });
    else lines[lines.length - 1].last = i;
  });
  const prevTimed = (i: number) => {
    for (let k = i - 1; k >= 0; k--) if (anchored[k]) return words[k].end;
    return 0;
  };
  const nextTimed = (i: number) => {
    for (let k = i + 1; k < words.length; k++) if (anchored[k]) return words[k].start;
    return duration;
  };
  const range = (l: { first: number; last: number }) => {
    let a: number, b: number;
    const timed = anchored.slice(l.first, l.last + 1).some(Boolean);
    if (timed) {
      a = Math.max(prevTimed(l.first), words[l.first].start - SPAN_PAD);
      b = Math.min(nextTimed(l.last), words[l.last].end + SPAN_PAD);
    } else {
      a = prevTimed(l.first);
      b = Math.min(nextTimed(l.last), a + SPAN_MAX);
    }
    a = Math.max(0, a);
    b = Math.min(duration, Math.max(b, a + 0.5));
    return { a, b };
  };
  const spans: { start: number; end: number; first: number; last: number }[] = [];
  for (const l of lines) {
    const { a, b } = range(l);
    const cur = spans[spans.length - 1];
    if (cur && Math.max(cur.end, b) - Math.min(cur.start, a) <= SPAN_MAX) {
      cur.start = Math.min(cur.start, a);
      cur.end = Math.max(cur.end, b);
      cur.last = l.last;
    } else spans.push({ start: a, end: Math.min(b, a + SPAN_MAX + 1), first: l.first, last: l.last });
  }
  return spans;
}

/** Further from its evidence than this, seconds, an audio time is not trusted. */
const TRUST = 2;

/**
 * The text with the times Whisper found in the audio, span by span. A span
 * whose new times stray from the evidence it had (matched words) keeps the
 * old ones; so does a span Whisper could not align.
 */
export function applySpans(
  t: TextTiming,
  spans: { first: number; last: number }[],
  found: ({ start: number; end: number }[] | null)[],
): Word[] {
  const out = t.words.map((w) => ({ ...w }));
  spans.forEach((s, n) => {
    const times = found[n];
    if (!times || times.length !== s.last - s.first + 1) return;
    let checked = 0;
    let close = 0;
    times.forEach((x, k) => {
      const i = s.first + k;
      if (!t.anchored[i]) return;
      checked++;
      if (Math.abs(x.start - t.words[i].start) <= TRUST) close++;
    });
    if (checked && close < checked / 2) return;
    times.forEach((x, k) => Object.assign(out[s.first + k], { start: x.start, end: x.end }));
  });
  let last = 0;
  for (const w of out) {
    w.start = Math.max(w.start, last);
    w.end = Math.max(w.end, w.start);
    last = w.start;
  }
  return out;
}
