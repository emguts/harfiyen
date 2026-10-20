// Pasted song lyrics, timed from a transcription of the song. Whisper mishears
// sung words, but where it hears them is mostly right: the lyrics are matched
// to the transcribed words (global alignment, words compared by spelling), a
// lyric word takes the time of the word it matched, and the words in between
// share the time around them. Each lyric line becomes a caption line.

import type { Word } from "../engine";

/** Cost of a lyric word with no transcribed word, and of a transcribed word with no lyric word. */
const GAP_LYRIC = 0.5;
const GAP_HEARD = 0.5;
/** Spellings less alike than this are different words. */
const MIN_SIM = 0.5;
/** Seconds an unmatched word gets: a base plus a little per letter. */
const WORD_BASE = 0.22;
const WORD_PER_CHAR = 0.05;

/**
 * Lines of pasted lyrics, as words. Blank lines, section tags such as
 * "[Chorus]" or "(x2)" on a line of their own, and music notes are skipped.
 */
export function lyricLines(text: string): string[][] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^[[(].*[\])]$/.test(l))
    .map((l) => l.split(/\s+/).filter((w) => w && !/^[-–—♪♫]+$/.test(w)))
    .filter((ws) => ws.length > 0);
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
 * For each lyric word, the index of the transcribed word it matched, or -1.
 * Transcribed words before the first and after the last lyric word are free
 * to skip (talk, an intro, Whisper repeating itself at the end).
 */
export function matchWords(lyrics: string[], heard: string[]): number[] {
  const N = lyrics.length;
  const M = heard.length;
  const W = M + 1;
  const score = new Float32Array((N + 1) * W);
  // 0: match, 1: lyric word unmatched (up), 2: transcribed word skipped (left).
  const move = new Uint8Array((N + 1) * W);
  const a = lyrics.map(normalize);
  const b = heard.map(normalize);
  for (let j = 1; j <= M; j++) move[j] = 2; // Free leading skips: score stays 0.
  for (let i = 1; i <= N; i++) {
    score[i * W] = -GAP_LYRIC * i;
    move[i * W] = 1;
    for (let j = 1; j <= M; j++) {
      // Words spelled too differently never match: a part sung in another
      // language must not claim lyric lines just because skipping costs more.
      const sim = similarity(a[i - 1], b[j - 1]);
      const diag = sim >= MIN_SIM ? score[(i - 1) * W + j - 1] + 2 * sim - 1 : -Infinity;
      const up = score[(i - 1) * W + j] - GAP_LYRIC;
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

const length = (w: string) => WORD_BASE + WORD_PER_CHAR * normalize(w).length;

/** No one sings faster than this, seconds per word. */
const MIN_WORD = 0.15;

/**
 * Drops matches that would squeeze the lyric words between them into too
 * little time: short common words ("we", "the") match anywhere, and a few
 * heard in an intro can pull lines from all over the song into one second.
 * Keeps the chain of matches with the most weight (longer, closer spellings
 * weigh more) in which the words between every two matches fit. In place.
 */
export function keepPlausible(match: number[], lyrics: string[], heard: Word[]) {
  const at = match.flatMap((j, i) => (j >= 0 ? [i] : []));
  const weight = at.map((i) => {
    const a = normalize(lyrics[i]);
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

/** Timed lyric words, and which of them got their time from evidence (a matched word, a tap). */
export interface LyricTiming {
  words: Word[];
  anchored: boolean[];
}

interface Parsed {
  words: string[];
  lineOf: number[];
  firsts: Set<number>;
  lines: string[][];
}

function parse(text: string): Parsed {
  const lines = lyricLines(text);
  const words = lines.flat();
  if (!words.length) throw new Error("Yapıştırılan metinde söz bulunamadı.");
  const firsts = new Set<number>();
  lines.reduce((at, l) => (firsts.add(at), at + l.length), 0);
  return { words, lineOf: lines.flatMap((l, n) => l.map(() => n)), firsts, lines };
}

/**
 * Times for the words that have none (NaN), from the ones around them. Nothing
 * says where unheard words were sung, and a gap may hold a part not in the
 * lyrics (another language, an instrumental), so they are not spread over it:
 * the words of the next timed word's line go just before it, the rest follow
 * the previous timed word at singing pace or, at the start, `startAt`.
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
    const before = next ? run.filter((n) => p.lineOf[n] === p.lineOf[k]) : [];
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

/** Lyric words with the times of the transcribed words they match (NaN for the rest). */
function timesFromHeard(p: Parsed, idx: number[], heard: Word[], out: Word[], anchored: boolean[]) {
  const match = matchWords(
    idx.map((i) => p.words[i]),
    heard.map((w) => w.text),
  );
  keepPlausible(
    match,
    idx.map((i) => p.words[i]),
    heard,
  );
  match.forEach((j, n) => {
    if (j < 0) return;
    Object.assign(out[idx[n]], { start: heard[j].start, end: heard[j].end });
    anchored[idx[n]] = true;
  });
}

const blank = (p: Parsed): Word[] =>
  p.words.map((text, i) => {
    const w: Word = { text, start: NaN, end: NaN };
    if (p.firsts.has(i)) w.cue = true;
    return w;
  });

/**
 * The lyrics as timed words: matched words take their transcribed word's
 * time, the others are laid out next to the matched words around them (with
 * their own line's matched word where there is one) and squeezed in when the
 * gap is short. The first word of each line starts a caption line.
 */
export function roughAlign(heard: Word[], text: string): LyricTiming {
  const p = parse(text);
  const out = blank(p);
  const anchored = p.words.map(() => false);
  timesFromHeard(
    p,
    p.words.map((_, i) => i),
    heard,
    out,
    anchored,
  );
  if (!anchored.some(Boolean)) throw new Error("Sözler dökümle eşleşmedi; doğru şarkı ve dil mi?");
  fill(out, p, heard[0]?.start ?? 0);
  return { words: out, anchored };
}

export const alignLyrics = (heard: Word[], text: string) => roughAlign(heard, text).words;

/**
 * Lyrics timed by hand: `taps[n]` is when line n starts (the user pressed a
 * key as it began). Within a line, words take the times of the transcribed
 * words heard between its tap and the next; lines after the last tap follow
 * it at singing pace.
 */
export function tapAlign(heard: Word[], text: string, taps: number[]): LyricTiming {
  const p = parse(text);
  if (!taps.length) throw new Error("Hiç dize işaretlenmedi.");
  const out = blank(p);
  const anchored = p.words.map(() => false);
  const firstOf = [...p.firsts].sort((a, b) => a - b);
  taps.slice(0, p.lines.length).forEach((t, n) => {
    const end = taps[n + 1] ?? Infinity;
    const idx = p.words.flatMap((_, i) => (p.lineOf[i] === n ? [i] : []));
    timesFromHeard(
      p,
      idx,
      heard.filter((w) => w.start >= t - 0.2 && w.start < end),
      out,
      anchored,
    );
    // The tap is when the line starts, whatever was heard.
    const f = out[firstOf[n]];
    const fEnd = isNaN(f.end) ? t + length(f.text) : Math.min(Math.max(f.end, t + 0.1), end);
    Object.assign(f, { start: t, end: fEnd });
    anchored[firstOf[n]] = true;
    // Heard words before the tap, or past the next one, do not belong to this line.
    for (const i of idx) if (i !== firstOf[n] && anchored[i] && (out[i].start < t || out[i].end > end)) {
      Object.assign(out[i], { start: NaN, end: NaN });
      anchored[i] = false;
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
 * Stretches of audio to time the lyrics in, a few lines each. A line with a
 * timed word is looked for around its words; a line without one anywhere
 * between the timed words around it (at most SPAN_MAX from the earlier).
 * `first`..`last`: the lyric words of the span.
 */
export function planSpans(t: LyricTiming, duration: number): { start: number; end: number; first: number; last: number }[] {
  const { words, anchored } = t;
  const lines: { first: number; last: number }[] = [];
  words.forEach((w, i) => (w.cue || !lines.length ? lines.push({ first: i, last: i }) : (lines[lines.length - 1].last = i)));
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
 * The lyrics with the times Whisper found in the audio, span by span. A span
 * whose new times stray from the evidence it had (matched words, taps) keeps
 * the old ones; so does a span Whisper could not align.
 */
export function applySpans(
  t: LyricTiming,
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
