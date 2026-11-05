import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { Word } from "../engine";
import type { TimeRange } from "../lib/useTranscriber";
import { cueText, type Cue } from "../lib/cues";
import { clock } from "../lib/format";
import type { LiveMeter } from "../render/aura";
import { PEAK_STEP } from "../worker/protocol";
import { useTheme } from "../lib/theme";
import { previewTiming } from "../lib/timelineEdit";
import { splitIndex } from "../lib/cueEdit";

interface BlockDrag {
  pointer: number;
  words: Word[];
  first: number;
  count: number;
  edge: "start" | "end" | "move";
  x: number;
  secondsPerPixel: number;
  moved: boolean;
  preview: Word[] | null;
  /** Where a click (a press without a drag) takes the playhead: the block's start. */
  seekTo: number;
}

/** The timeline box; on phones it takes its own full-width row in the transport. */
export const TIMELINE =
  "relative my-2 ml-2 flex-1 touch-none self-stretch rounded-md border border-line-soft bg-well max-[860px]:-order-1 max-[860px]:m-0 max-[860px]:h-16 max-[860px]:flex-[1_0_100%]";

/**
 * Editor timeline drawn on one canvas at display refresh rate.
 *
 * - File: the whole recording. The waveform is there from the start (read
 *   when the file opens, see useWaveform), faint where nothing is
 *   transcribed yet; the transcribed part takes its colour behind a softly
 *   animated frontier. Caption blocks sit underneath; the playhead reads the
 *   media clock every frame.
 * - Recording: a voice-memo strip fed straight from the microphone meter.
 *   Bars enter on the right and, once the strip is full, scroll left.
 *
 * With a trim, the timeline spans only the trimmed part (times stay the
 * file's: only the scale changes). While the trim is being edited
 * (`onRange`) it spans the whole file again, so the ends can move anywhere:
 * the range is tinted, what is outside it dimmed, and two handles move its
 * ends; dragging a handle shows that moment in the player.
 *
 * Jump cuts are dimmed like what is outside the trim, a thin line at each.
 *
 * Nothing is drawn while nothing changes.
 */
export function Timeline({
  peaks,
  duration,
  decoded,
  doneFrom = 0,
  time,
  media,
  cues,
  live,
  onSeek,
  range = null,
  onRange,
  cuts = NO_CUTS,
  expanded,
  words,
  wordIndex,
  editable,
  onRetime,
  onShift,
  onSelect,
  onSplit,
  onMerge,
}: {
  expanded: boolean;
  words: Word[];
  wordIndex: (w: Word) => number;
  editable: boolean;
  /** `push`: neighbours give way where the edit runs into them and are never pulled along. */
  onRetime: (first: number, count: number, start: number, end: number, push?: boolean) => void;
  onShift: (first: number, count: number, seconds: number, push?: boolean) => void;
  onSelect: (first: number | null) => void;
  onSplit: (index: number) => void;
  onMerge: (first: number, nextFirst: number) => void;
  peaks: Float32Array;
  duration: number;
  /** Transcribed from `doneFrom` up to here (the frontier); `decoded` ≤ `doneFrom` for nothing yet. */
  decoded: number;
  doneFrom?: number;
  /** Fallback clock when there is no media element. */
  time: number;
  media: HTMLMediaElement | null;
  cues: Cue[];
  /** Microphone meter while recording. */
  live: LiveMeter | null;
  onSeek: (t: number) => void;
  /** The trim; null for the whole file. */
  range?: TimeRange | null;
  /** Editing the trim: shows the handles. null is the whole file again. */
  onRange?: (r: TimeRange | null) => void;
  /** Stretches the jump cut takes out, in file time. */
  cuts?: TimeRange[];
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const total = Math.max(duration, decoded, peaks.length * PEAK_STEP, 1);
  // The span shown: the trim once it is kept, the whole file while it is edited (or with none).
  const [v0, v1] = spanOf(range, !!onRange, total);
  // `user`: the view the wheel asked for; `view`: the one drawn; `jump`: show `user` at once, without easing.
  const viewport = useRef({ user: null as [number, number] | null, view: [v0, v1] as [number, number], reset: "", touchedAt: 0, jump: false });
  const [selected, setSelected] = useState<number | null>(null);
  /** Page the editor along with the playhead while playing. */
  const [follow, setFollow] = useState(() => localStorage.getItem("harfiyen.timelineFollow") !== "0");
  useEffect(() => localStorage.setItem("harfiyen.timelineFollow", follow ? "1" : "0"), [follow]);
  const thumb = useRef<HTMLDivElement>(null);
  const zoomLabel = useRef<HTMLSpanElement>(null);
  const drag = useRef<BlockDrag | null>(null);
  const seeking = useRef(false);
  /** A drag with the middle button: the file slides under the pointer. */
  const panning = useRef<{ pointer: number; x: number; view: [number, number] } | null>(null);
  const interactionVersion = useRef(0);
  useEffect(() => {
    if (!expanded) {
      setSelected(null);
      drag.current = null;
      interactionVersion.current++;
    }
  }, [expanded]);

  // Latest props for the animation loop, which never restarts.
  const editing = !!onRange;
  // Counts the cut lists seen, so a new one redraws without comparing them.
  const cutsSeen = useRef(0);
  const cutsVersion = useMemo(() => ++cutsSeen.current, [cuts]);
  const cuesSeen = useRef(0);
  const cuesVersion = useMemo(() => ++cuesSeen.current, [cues]);
  const props = useRef({ peaks, total, decoded, doneFrom, time, media, cues, live, range, editing, cuts, cutsVersion, cuesVersion, expanded, words, wordIndex, editable, selected, follow });
  props.current = { peaks, total, decoded, doneFrom, time, media, cues, live, range, editing, cuts, cutsVersion, cuesVersion, expanded, words, wordIndex, editable, selected, follow };
  // The colours are read once per theme.
  const theme = useTheme();

  /** The view asked for (the one being eased to), else the one drawn. */
  const viewNow = () => viewport.current.user ?? viewport.current.view;
  /** Show this view at once, and leave it for a while before following the playhead again. */
  const setView = (v: [number, number]) => {
    const n = viewport.current;
    n.user = v;
    n.touchedAt = performance.now();
    n.jump = true;
  };
  /** Zoom by `k` (below 1: in) about the point `x` of the width (0..1); by default the playhead, when in view. */
  const zoomBy = (k: number, anchor?: number) => {
    const p = props.current;
    const bounds = spanOf(p.range, p.editing, p.total);
    const [a, b] = viewNow();
    const t = p.media ? p.media.currentTime : p.time;
    const x = anchor ?? (t >= a && t <= b ? (t - a) / (b - a) : 0.5);
    const at = a + Math.max(0, Math.min(1, x)) * (b - a);
    const span = Math.min(bounds[1] - bounds[0], Math.max(Math.min(MIN_VIEW, bounds[1] - bounds[0]), (b - a) * k));
    setView(clampView(at - x * span, span, bounds));
  };

  useEffect(() => {
    const el = canvas.current!.parentElement!;
    // In the editor the wheel scrolls along the file and Ctrl/⌘ + wheel (or a pinch) zooms at the
    // pointer, as in audio editors.
    const wheel = (e: WheelEvent) => {
      const p = props.current;
      if (!p.expanded || p.live || p.editing || drag.current) return;
      e.preventDefault();
      const width = el.clientWidth;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? width : 1;
      if (e.ctrlKey || e.metaKey) {
        const x = (e.clientX - el.getBoundingClientRect().left) / width;
        zoomBy(Math.exp(e.deltaY * unit * 0.004), x);
      } else {
        const [a, b] = viewNow();
        const bounds = spanOf(p.range, p.editing, p.total);
        const delta = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * unit;
        setView(clampView(a + (delta / width) * (b - a), b - a, bounds));
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  useEffect(() => {
    const c = canvas.current!;
    const g = c.getContext("2d")!;
    const css = getComputedStyle(c);
    const color = (n: string) => css.getPropertyValue(n).trim();
    const C = {
      wave: color("--wave"),
      played: color("--wave-played"),
      pending: color("--wave-pending"),
      pendingPlayed: color("--wave-pending-played"),
      trim: color("--firuze"),
      empty: color("--line"),
      cue: color("--raised"),
      cueOn: color("--cini"),
      rec: color("--mercan"),
      dim: color("--dim"),
      playhead: color("--playhead"),
      text: color("--text"),
      textOn: "#fff",
      block: color("--cini-wash"),
      blockOn: color("--cini-glow"),
      strong: color("--text-strong"),
      muted: color("--text-3"),
    };
    let raf = 0;
    let shown = props.current.decoded; // animated frontier
    let lastKey = "";
    // The span shown, eased when the trim is kept or edited again; set at once otherwise
    // (a file opening, its length becoming known).
    let view: [number, number] | null = null;
    let zoom: { from: [number, number]; to: [number, number]; at: number } | null = null;
    let lastMode = "";
    let lastTotal = 0;
    const still = matchMedia("(prefers-reduced-motion: reduce)");

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const p = props.current;
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (!w || !h) return;

      shown += (p.decoded - shown) * 0.12;
      if (Math.abs(p.decoded - shown) < 0.005) shown = p.decoded;
      const t = p.media && !p.live ? p.media.currentTime : p.time;
      const now = performance.now();
      if (drag.current && (!p.editable || drag.current.words !== p.words)) {
        drag.current = null;
        interactionVersion.current++;
      }

      const bounds = spanOf(p.range, p.editing, p.total);
      const n = viewport.current;
      const reset = `${p.total}|${p.editing}|${p.range?.start}|${p.range?.end}|${p.expanded}`;
      if (reset !== n.reset) {
        n.reset = reset;
        n.user = null;
      }
      // The editor opens on a stretch around the playhead, not the whole file.
      if (p.expanded && !n.user && bounds[1] - bounds[0] > OPEN_VIEW) {
        n.user = clampView(t - OPEN_VIEW * 0.1, OPEN_VIEW, bounds);
        n.jump = true;
      }
      // Following: a page on when the playhead runs off the view (not while the view was just moved by hand).
      if (p.expanded && p.follow && n.user && !drag.current && !seeking.current && p.media && !p.media.paused && now - n.touchedAt > 1500) {
        const [a, b] = n.user;
        if (t > b - (b - a) * 0.05 || t < a) {
          n.user = clampView(t - (b - a) * 0.05, b - a, bounds);
          n.jump = true;
        }
      }
      const target = p.expanded && n.user ? n.user : bounds;
      const mode = `${p.editing}|${p.range?.start}|${p.range?.end}|${p.expanded}|${target[0]}|${target[1]}`;
      if (!view || p.total !== lastTotal || still.matches) zoom = null;
      else if (mode !== lastMode && (view[0] !== target[0] || view[1] !== target[1])) {
        zoom = { from: view, to: target, at: now };
      }
      if (n.jump) {
        n.jump = false;
        zoom = null;
      }
      lastMode = mode;
      lastTotal = p.total;
      if (zoom) {
        const k = Math.min(1, (now - zoom.at) / ZOOM_MS);
        const e = 1 - Math.pow(1 - k, 3);
        view = [zoom.from[0] + (zoom.to[0] - zoom.from[0]) * e, zoom.from[1] + (zoom.to[1] - zoom.from[1]) * e];
        if (k >= 1) zoom = null;
      } else view = target;
      n.view = view;
      if (thumb.current && p.expanded) {
        const whole = bounds[1] - bounds[0] || 1;
        thumb.current.style.left = `${((view[0] - bounds[0]) / whole) * 100}%`;
        thumb.current.style.width = `${Math.max(2, ((view[1] - view[0]) / whole) * 100)}%`;
      }
      if (zoomLabel.current && p.expanded) {
        const shownSpan = view[1] - view[0];
        zoomLabel.current.textContent = shownSpan < 60 ? `${Math.round(shownSpan)} sn` : clock(shownSpan);
      }

      const key = p.live
        ? `live${now}`
        : `${w}x${h}|${dpr}|${shown}|${p.doneFrom}|${t}|${p.peaks.length}|${p.total}|${p.cuesVersion}|${p.range?.start}|${p.range?.end}|${p.editing}|${view[0]}|${view[1]}|${p.cutsVersion}|${p.expanded}|${p.selected}|${interactionVersion.current}`;
      if (key === lastKey) return;
      lastKey = key;

      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);

      const [v0, v1] = view;
      const span = v1 - v0;
      /** x of a file time in the span shown. */
      const X = (s: number) => ((s - v0) / span) * w;
      const playX = X(t);
      const known = p.peaks.length * PEAK_STEP;
      // The range being edited is tinted behind the bars.
      const rx0 = p.range ? X(p.range.start) : 0;
      const rx1 = p.range ? X(p.range.end) : w;
      if (p.editing) {
        g.fillStyle = "rgba(54, 194, 180, 0.14)";
        g.fillRect(rx0, 0, rx1 - rx0, h);
      }
      const bar = 2;
      const step = 3;
      const drawBarAt = (x: number, mid: number, a: number) => {
        g.beginPath();
        g.roundRect(x, mid - a, bar, a * 2, 1);
        g.fill();
      };

      if (p.expanded) {
        // The editor: every caption a region over the waveform, as in Subtitle Edit. The region's text
        // at its top, its number and length at its bottom, its start and end as lines through it; the
        // bars inside a caption are bright, the selected one's in the accent. The ruler is below.
        const waveH = h - RULER;
        // The bars keep clear of the text lines at the region's top and bottom.
        const mid = waveH / 2;
        const amp = (peak: number) => Math.max(1, Math.min(1, Math.sqrt(peak)) * (mid - 20));
        const preview = drag.current?.preview;
        const regions: { start: number; end: number; chosen: boolean; n: number; cue: Cue }[] = [];
        p.cues.forEach((cue, i) => {
          const first = p.wordIndex(cue.words[0]);
          const last = p.wordIndex(cue.words.at(-1)!);
          const start = preview?.[first]?.start ?? cue.start;
          const end = preview?.[last]?.end ?? cue.end;
          if (end < v0 || start > v1) return;
          const chosen = p.selected !== null && p.selected >= first && p.selected <= last;
          regions.push({ start, end, chosen, n: i + 1, cue });
        });
        for (const r of regions) {
          g.fillStyle = r.chosen ? C.blockOn : C.block;
          g.fillRect(X(r.start), 0, X(r.end) - X(r.start), waveH);
        }
        let ri = 0;
        for (let x = 0; x < w; x += step) {
          const t0 = v0 + (x / w) * span;
          const t1 = v0 + ((x + step) / w) * span;
          if (t0 >= known) {
            g.fillStyle = C.empty;
            g.fillRect(x, mid - 0.5, bar, 1);
            continue;
          }
          let pk = 0;
          for (let k = Math.floor(t0 / PEAK_STEP); k < Math.ceil(t1 / PEAK_STEP) && k < p.peaks.length; k++) {
            pk = Math.max(pk, p.peaks[k]);
          }
          const tm = (t0 + t1) / 2;
          while (ri < regions.length && regions[ri].end < tm) ri++;
          const r = regions[ri] && regions[ri].start <= tm ? regions[ri] : null;
          const done = t1 > p.doneFrom && t0 < shown;
          g.fillStyle = !done ? C.pending : r?.chosen ? C.cueOn : r ? (x < playX ? C.played : C.wave) : C.pending;
          drawBarAt(x, mid, Math.max(1, amp(pk)));
        }
        for (const r of regions) {
          const x0 = X(r.start);
          const x1 = X(r.end);
          const lw = r.chosen ? 2 : 1;
          g.fillStyle = C.trim;
          g.fillRect(x0, 0, lw, waveH);
          g.fillStyle = C.rec;
          g.fillRect(x1 - lw, 0, lw, waveH);
          const left = Math.max(0, x0) + 6;
          const right = Math.min(w, x1) - 6;
          if (right - left < 14) continue;
          g.save();
          g.beginPath();
          g.rect(left, 0, right - left, waveH);
          g.clip();
          g.font = "12px sans-serif";
          g.fillStyle = r.chosen ? C.strong : C.text;
          g.fillText(ellipsize(g, cueText(r.cue), right - left), left, 15);
          g.font = "10.5px sans-serif";
          g.fillStyle = C.muted;
          g.fillText(`#${r.n}  ${(r.end - r.start).toFixed(3).replace(".", ",")}`, left, waveH - 6);
          g.restore();
        }
        // The ruler: a tick a step that leaves room for its label.
        g.fillStyle = C.empty;
        g.fillRect(0, waveH, w, 1);
        const tick = TICKS.find((d) => (d / span) * w >= 56) ?? TICKS[TICKS.length - 1];
        g.font = "10px sans-serif";
        g.fillStyle = C.muted;
        for (let s = Math.ceil(v0 / tick) * tick; s <= v1; s += tick) {
          const x = X(s);
          g.fillRect(x, waveH, 1, 4);
          const label = clock(s) + (tick < 1 ? `,${Math.round((s % 1) * 10)}` : "");
          if (x + g.measureText(label).width + 4 < w) g.fillText(label, x + 3, h - 3);
        }
      } else {
        const waveH = h - 14;
        const mid = 4 + waveH / 2;
        const amp = (peak: number) => Math.max(1, Math.min(1, Math.sqrt(peak)) * (waveH / 2 - 2));
        const drawBar = (x: number, a: number) => {
          g.beginPath();
          g.roundRect(x, mid - a, bar, a * 2, 1);
          g.fill();
        };

        if (p.live) {
          // Voice-memo strip: 0.1 s per bar, newest on the right.
          const m = p.live;
          const elapsed = (now - m.startedAt) / 1000;
          const pps = step / m.chunkSeconds;
          const offset = Math.min(0, w - 8 - elapsed * pps);
          g.fillStyle = C.wave;
          const first = Math.max(0, Math.floor(-offset / step) - 1);
          for (let i = first; i < m.peaks.length; i++) {
            const x = offset + i * step;
            if (x > w) break;
            // The newest bar eases in instead of popping.
            const age = elapsed - (i + 1) * m.chunkSeconds;
            const grow = Math.min(1, Math.max(0.2, 1 + age / 0.12));
            drawBar(x, amp(m.peaks[i]) * grow);
          }
          const head = Math.min(w - 6, offset + elapsed * pps);
          g.fillStyle = C.rec;
          g.fillRect(head, 2, 2, h - 4);
          return;
        }

        for (let x = 0; x < w; x += step) {
          const t0 = v0 + (x / w) * span;
          const t1 = v0 + ((x + step) / w) * span;
          // Not read yet (nor transcribed): a flat line.
          if (t0 >= known) {
            g.fillStyle = C.empty;
            g.fillRect(x, mid - 0.5, bar, 1);
            continue;
          }
          let pk = 0;
          for (let k = Math.floor(t0 / PEAK_STEP); k < Math.ceil(t1 / PEAK_STEP) && k < p.peaks.length; k++) {
            pk = Math.max(pk, p.peaks[k]);
          }
          const done = t1 > p.doneFrom && t0 < shown;
          const played = x < playX;
          g.fillStyle = done ? (played ? C.played : C.wave) : played ? C.pendingPlayed : C.pending;
          drawBar(x, Math.max(1, amp(pk)));
        }

        // Caption blocks.
        for (const cue of p.cues) {
          if (cue.end < v0 || cue.start > v1) continue;
          const x0 = X(cue.start);
          const x1 = Math.max(x0 + 2, X(cue.end));
          g.fillStyle = t >= cue.start && t <= cue.end + 0.3 ? C.cueOn : C.cue;
          g.beginPath();
          g.roundRect(x0, h - 8, x1 - x0, 5, 2);
          g.fill();
        }

      }

      // The jump cuts: dimmed, an edge at each so cuts side by side stay apart (not while the trim is edited).
      if (!p.editing) {
        for (const cut of p.cuts) {
          if (cut.end < v0 || cut.start > v1) continue;
          const x0 = X(cut.start);
          const x1 = Math.max(x0 + 1, X(cut.end));
          g.fillStyle = C.dim;
          g.fillRect(x0, 0, x1 - x0, h);
          g.fillStyle = C.empty;
          g.fillRect(x0, 0, 1, h);
          g.fillRect(x1 - 1, 0, 1, h);
        }
      }

      // Outside the trim: dimmed; while editing, the range framed in its colour.
      if (p.range) {
        g.fillStyle = C.dim;
        g.fillRect(0, 0, rx0, h);
        g.fillRect(rx1, 0, w - rx1, h);
      }
      if (p.editing) {
        g.fillStyle = C.trim;
        g.fillRect(rx0, 0, rx1 - rx0, 2);
        g.fillRect(rx0, h - 2, rx1 - rx0, 2);
      }

      if (t > 0 || p.media) {
        // Outside the span shown (a word outside the trim was clicked, say): held at the edge, faint.
        const outside = t < v0 - 0.01 || t > v1 + 0.01;
        g.globalAlpha = outside ? 0.4 : 1;
        g.fillStyle = C.playhead;
        g.fillRect(Math.min(w - 2, Math.max(0, playX - 1)), 0, 2, h);
        g.globalAlpha = 1;
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [theme]);

  const seekAt = (clientX: number) => {
    if (live) return;
    onSeek(timeAt(clientX));
  };

  const choose = (first: number | null) => {
    setSelected(first);
    onSelect(first);
  };
  /** The caption under the pointer in the editor, and whether at its start or end line (to stretch) or inside (to move). */
  const hitAt = (clientX: number, clientY: number) => {
    if (!expanded || live) return null;
    const r = canvas.current!.getBoundingClientRect();
    if (clientY < r.top || clientY > r.bottom - RULER) return null;
    const [a, b] = viewport.current.view;
    const x = clientX - r.left;
    const X = (t: number) => ((t - a) / (b - a)) * r.width;
    // An edge wins over the inside of a neighbour, the nearer edge over the other.
    let best: { cue: Cue; edge: "start" | "end"; d: number } | null = null;
    for (const cue of cues) {
      for (const edge of ["start", "end"] as const) {
        const d = Math.abs(x - X(edge === "start" ? cue.start : cue.end));
        if (d <= EDGE && (!best || d < best.d)) best = { cue, edge, d };
      }
    }
    if (best) return { cue: best.cue, edge: best.edge };
    const cue = cues.find((c) => x >= X(c.start) && x <= X(c.end));
    return cue ? ({ cue, edge: "move" } as const) : null;
  };
  /** The file time at a pointer x in the view drawn. */
  const timeAt = (clientX: number) => {
    const r = canvas.current!.getBoundingClientRect();
    const [a, b] = viewport.current.view;
    return a + Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * (b - a);
  };
  const moveDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId || !editable || d.words !== words) return;
    if (!d.moved && Math.abs(e.clientX - d.x) < 3) return;
    d.moved = true;
    d.preview = previewTiming(d.words, d.first, d.count, d.edge, (e.clientX - d.x) * d.secondsPerPixel, total, peaks, !e.altKey);
    interactionVersion.current++;
  };
  const finishDrag = (e: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
    if (panning.current?.pointer === e.pointerId) {
      panning.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      e.currentTarget.style.cursor = "";
      return;
    }
    const d = drag.current;
    if (d && d.pointer !== e.pointerId) return;
    if (commit && d) moveDrag(e);
    drag.current = null;
    seeking.current = false;
    interactionVersion.current++;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    e.currentTarget.style.cursor = "";
    if (commit && d && !d.moved) onSeek(d.seekTo);
    if (!commit || !d?.preview || !editable || d.words !== words) return;
    const start = d.preview[d.first].start;
    const end = d.preview[d.first + d.count - 1].end;
    if (start === words[d.first].start && end === words[d.first + d.count - 1].end) return;
    if (d.edge === "move") onShift(d.first, d.count, start - words[d.first].start, true);
    else onRetime(d.first, d.count, start, end, true);
  };

  return (
    <div className={`${TIMELINE} flex flex-col overflow-hidden`}>
    <div
      className={`relative min-h-0 flex-1 outline-none ${live ? "cursor-default" : ""}`}
      role="slider"
      tabIndex={live ? -1 : 0}
      aria-label="Zaman çizelgesi"
      aria-valuemin={Math.round(v0)}
      aria-valuemax={Math.round(v1)}
      aria-valuenow={Math.round(time)}
      aria-valuetext={clock(time)}
      aria-description={expanded ? EDIT_HELP : undefined}
      title={expanded ? EDIT_HELP : undefined}
      onMouseDown={(e) => {
        // No autoscroll for the middle button in the editor: it drags the view.
        if (e.button === 1 && expanded) e.preventDefault();
      }}
      onPointerDown={(e) => {
        if (e.button === 1 && expanded && !live && !drag.current) {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          panning.current = { pointer: e.pointerId, x: e.clientX, view: viewNow() };
          e.currentTarget.style.cursor = "grabbing";
          return;
        }
        if (e.button !== 0 || live) return;
        e.currentTarget.focus({ preventScroll: true });
        e.currentTarget.setPointerCapture(e.pointerId);
        viewport.current.touchedAt = performance.now();
        const hit = hitAt(e.clientX, e.clientY);
        if (hit) {
          const first = wordIndex(hit.cue.words[0]);
          const last = wordIndex(hit.cue.words.at(-1)!);
          choose(first >= 0 ? first : null);
          if (editable && first >= 0 && last >= first) {
            // The playhead moves on release, and only if the block was not dragged.
            const [a, b] = viewport.current.view;
            drag.current = { pointer: e.pointerId, words, first, count: last - first + 1, edge: hit.edge, x: e.clientX, secondsPerPixel: (b - a) / canvas.current!.clientWidth, moved: false, preview: null, seekTo: timeAt(e.clientX) };
          } else onSeek(timeAt(e.clientX));
          return;
        }
        // Between captions: nothing selected, and the playhead follows the pointer.
        if (expanded && selected !== null) choose(null);
        seeking.current = true;
        seekAt(e.clientX);
      }}
      onPointerMove={(e) => {
        const pan = panning.current;
        if (pan && pan.pointer === e.pointerId) {
          const [a, b] = pan.view;
          const shift = ((pan.x - e.clientX) / e.currentTarget.clientWidth) * (b - a);
          setView(clampView(a + shift, b - a, spanOf(range, editing, total)));
          return;
        }
        if (drag.current) moveDrag(e);
        else if (seeking.current && e.buttons === 1) seekAt(e.clientX);
        else {
          const hit = hitAt(e.clientX, e.clientY);
          e.currentTarget.style.cursor = hit && editable ? hit.edge === "move" ? "grab" : "ew-resize" : "";
        }
      }}
      onPointerUp={(e) => finishDrag(e, true)}
      onPointerCancel={(e) => finishDrag(e, false)}
      onLostPointerCapture={(e) => finishDrag(e, false)}
      onKeyDown={(e) => {
        if (live || e.target !== e.currentTarget) return;
        if (drag.current && e.key !== "Escape") {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        const cue = expanded && selected !== null ? cues.find((c) => {
          const first = wordIndex(c.words[0]);
          const last = wordIndex(c.words.at(-1)!);
          return first >= 0 && selected >= first && selected <= last;
        }) : undefined;
        if (expanded && e.key === "Escape") {
          drag.current = null;
          interactionVersion.current++;
          choose(null);
        } else if (cue && editable && !e.ctrlKey && !e.metaKey && !e.altKey && (e.code === "BracketLeft" || e.code === "BracketRight")) {
          // Without a block to set, [ and ] go on to shift every caption, as everywhere else.
          const first = wordIndex(cue.words[0]);
          const count = wordIndex(cue.words.at(-1)!) - first + 1;
          const at = media?.currentTime ?? time;
          const next = previewTiming(words, first, count, e.code === "BracketLeft" ? "start" : "end", at - (e.code === "BracketLeft" ? words[first].start : words[first + count - 1].end), total, peaks, false);
          if (next[first].start !== words[first].start || next[first + count - 1].end !== words[first + count - 1].end) onRetime(first, count, next[first].start, next[first + count - 1].end, true);
        } else if (expanded && e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
          if (cue && editable) {
            const first = wordIndex(cue.words[0]);
            const count = wordIndex(cue.words.at(-1)!) - first + 1;
            const next = previewTiming(words, first, count, "move", (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 0.5 : 0.1), total, peaks, false);
            if (next[first].start !== words[first].start) onShift(first, count, next[first].start - words[first].start, true);
          }
        } else if (expanded && !e.altKey && ((!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "s") || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b"))) {
          if (cue && editable) {
            const index = splitIndex(cue, media?.currentTime ?? time);
            if (index > 0) onSplit(wordIndex(cue.words[index]));
          }
        } else if (expanded && !e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "m") {
          const next = cue && cues[cues.indexOf(cue) + 1];
          if (cue && next && editable) onMerge(wordIndex(cue.words[0]), wordIndex(next.words[0]));
        } else if (expanded && !e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "+" || e.key === "=" || e.key === "-")) {
          zoomBy(e.key === "-" ? ZOOM_STEP : 1 / ZOOM_STEP);
        } else if (e.altKey || e.ctrlKey || e.metaKey) return;
        else if (e.key === "ArrowRight") onSeek(Math.min(v1, time + 5));
        else if (e.key === "ArrowLeft") onSeek(Math.max(v0, time - 5));
        else return;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <canvas ref={canvas} className="block size-full" />
      {onRange && !live && total > 1 && (
        <TrimHandles total={total} range={range} onRange={onRange} onSeek={onSeek} />
      )}
    </div>
    {expanded && (
      <EditorBar
        thumb={thumb}
        zoomLabel={zoomLabel}
        follow={follow}
        onFollow={setFollow}
        onZoom={zoomBy}
        onFit={() => setView(spanOf(range, editing, total))}
        onScroll={(f) => {
          const bounds = spanOf(range, editing, total);
          const [a, b] = viewNow();
          setView(clampView(bounds[0] + f * (bounds[1] - bounds[0]) - (b - a) / 2, b - a, bounds));
        }}
        onDrag={(df) => {
          const bounds = spanOf(range, editing, total);
          const [a, b] = viewNow();
          setView(clampView(a + df * (bounds[1] - bounds[0]), b - a, bounds));
        }}
      />
    )}
    </div>
  );
}

const BAR_BTN =
  "grid h-[22px] min-w-[22px] place-items-center rounded-ui-sm border-0 bg-transparent px-1 text-[12px] text-fg-2 hover:bg-raised hover:text-fg";

/**
 * Under the editor: zoom out and in, the whole file, a scrollbar over the file (its thumb is the view,
 * moved by the drawing loop), how long the view is, and whether it follows the playhead.
 */
function EditorBar({
  thumb,
  zoomLabel,
  follow,
  onFollow,
  onZoom,
  onFit,
  onScroll,
  onDrag,
}: {
  thumb: RefObject<HTMLDivElement | null>;
  zoomLabel: RefObject<HTMLSpanElement | null>;
  follow: boolean;
  onFollow: (on: boolean) => void;
  onZoom: (k: number) => void;
  onFit: () => void;
  /** The view centred on this point of the file (0..1). */
  onScroll: (f: number) => void;
  /** The view moved by this much of the file. */
  onDrag: (df: number) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const grab = useRef<{ x: number; id: number } | null>(null);
  return (
    <div className="flex h-[26px] flex-none items-center gap-1 border-t border-line-soft px-1 select-none">
      <button type="button" className={BAR_BTN} onClick={() => onZoom(1 / ZOOM_STEP)} title="Yakınlaştır (+, Ctrl+tekerlek)" aria-label="Yakınlaştır">
        +
      </button>
      <button type="button" className={BAR_BTN} onClick={() => onZoom(ZOOM_STEP)} title="Uzaklaştır (−, Ctrl+tekerlek)" aria-label="Uzaklaştır">
        −
      </button>
      <button type="button" className={BAR_BTN} onClick={onFit} title="Bütün dosyayı göster">
        Tümü
      </button>
      <span ref={zoomLabel} className="w-[46px] text-center text-[11px] text-fg-3 tabular-nums" />
      <div
        ref={track}
        className="relative h-[10px] flex-1 cursor-pointer rounded-full bg-raised"
        onPointerDown={(e) => {
          if (e.target === thumb.current) return;
          const r = e.currentTarget.getBoundingClientRect();
          onScroll((e.clientX - r.left) / r.width);
        }}
      >
        <div
          ref={thumb}
          className="absolute top-0 h-full cursor-grab rounded-full bg-fg-3 hover:bg-fg-2 active:cursor-grabbing"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            grab.current = { x: e.clientX, id: e.pointerId };
          }}
          onPointerMove={(e) => {
            const g = grab.current;
            if (!g || g.id !== e.pointerId || !track.current) return;
            onDrag((e.clientX - g.x) / track.current.clientWidth);
            g.x = e.clientX;
          }}
          onPointerUp={() => (grab.current = null)}
          onPointerCancel={() => (grab.current = null)}
        />
      </div>
      <label className="ml-1 flex items-center gap-1 text-[11.5px] whitespace-nowrap text-fg-2">
        <input type="checkbox" checked={follow} onChange={(e) => onFollow(e.target.checked)} />
        Oynatırken takip et
      </label>
    </div>
  );
}

/**
 * The file times at the timeline's two ends: the kept trim, or the whole file
 * while the trim is edited (the handles need room to move) or when there is none.
 */
function spanOf(range: TimeRange | null, editing: boolean, total: number): [number, number] {
  if (!range || editing) return [0, total];
  const a = Math.max(0, Math.min(range.start, total));
  const b = Math.min(total, range.end);
  // A trim always has length; this only guards against a range past the end of what is known.
  return b - a > 0.05 ? [a, b] : [0, total];
}

const NO_CUTS: TimeRange[] = [];
const EDIT_HELP = "Tekerlek veya orta tuşla sürükle: kaydır · Ctrl+tekerlek veya + / −: yakınlaş · Tıkla: oraya git, altyazıyı seç · Yeşil / kırmızı çizgiyi sürükle: başlangıç / bitiş · Altyazıyı sürükle: taşı · Alt: yapışmayı kapat · Alt+ok: taşı (Shift: 0,5 sn) · [ / ]: başlangıç / bitiş oynatma noktasına · S / Ctrl+B: böl · M: birleştir · Esc: seçimi kaldır";
/** The editor's ruler under the waveform, px. */
const RULER = 16;
/** A caption's start or end line is grabbed this close, px. */
const EDGE = 5;
/** The editor opens on this many seconds, and zooms in no closer than MIN_VIEW. */
const OPEN_VIEW = 20;
const MIN_VIEW = 2;
/** One zoom step of the buttons and keys. */
const ZOOM_STEP = 1.5;
/** Ruler steps, seconds. */
const TICKS = [0.1, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];

function clampView(start: number, span: number, [lo, hi]: [number, number]): [number, number] {
  const length = Math.min(span, hi - lo);
  const a = Math.max(lo, Math.min(hi - length, start));
  return [a, a + length];
}

function ellipsize(g: CanvasRenderingContext2D, text: string, width: number): string {
  if (g.measureText(text).width <= width) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (g.measureText(text.slice(0, mid) + "…").width <= width) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + "…";
}

/** How long the timeline takes to zoom to the trim and back, ms. */
const ZOOM_MS = 260;

/** Shortest trim, in seconds. */
const MIN_TRIM = 0.5;

/** The trim's two ends over the timeline: drag them (or use the arrow keys on them). */
function TrimHandles({
  total,
  range,
  onRange,
  onSeek,
}: {
  total: number;
  range: TimeRange | null;
  onRange: (r: TimeRange | null) => void;
  onSeek: (t: number) => void;
}) {
  const start = range?.start ?? 0;
  const end = range?.end ?? total;
  /**
   * Stays a range while dragged, even across the whole file: turning into "no
   * trim" there changed the controls beside the timeline, which resized it
   * under the pointer and flipped the range back and forth. Whether it is the
   * whole file is settled when the trim is kept.
   */
  const set = (s: number, e: number) => {
    const a = Math.max(0, Math.min(s, total - MIN_TRIM));
    const b = Math.min(total, Math.max(e, a + MIN_TRIM));
    onRange({ start: a, end: b });
  };
  const at = (el: HTMLElement, clientX: number) => {
    const r = el.parentElement!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * total;
  };
  const handle = (which: "start" | "end") => {
    const value = which === "start" ? start : end;
    const move = (t: number) => {
      if (which === "start") set(Math.min(t, end - MIN_TRIM), end);
      else set(start, Math.max(t, start + MIN_TRIM));
      onSeek(Math.max(0, Math.min(total, t)));
    };
    return (
      <span
        key={which}
        role="slider"
        tabIndex={0}
        aria-label={which === "start" ? "Kesme başlangıcı" : "Kesme sonu"}
        aria-valuemin={0}
        aria-valuemax={Math.round(total)}
        aria-valuenow={Math.round(value)}
        aria-valuetext={clock(value)}
        title={`${which === "start" ? "Başlangıç" : "Bitiş"} ${clock(value)} · sürükle ya da oynatırken ${which === "start" ? "I" : "O"}`}
        className="absolute top-0 bottom-0 z-1 grid w-4 -translate-x-1/2 cursor-ew-resize touch-none place-items-center outline-none focus-visible:[&>span]:ring-2 focus-visible:[&>span]:ring-fg-strong [@media(pointer:coarse)]:w-6"
        style={{ left: `${(value / total) * 100}%` }}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => e.buttons === 1 && move(at(e.currentTarget, e.clientX))}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 1 : 0.1;
          if (e.key === "ArrowLeft") move(value - step);
          else if (e.key === "ArrowRight") move(value + step);
          else return;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {/* A grip with two lines, as in Apple's trim handles. */}
        <span
          className={`flex h-full w-3 items-center justify-center gap-[2px] bg-firuze shadow-[0_0_4px_rgba(0,0,0,0.5)] ${
            which === "start" ? "rounded-l-[4px]" : "rounded-r-[4px]"
          }`}
        >
          <span className="h-[38%] w-px rounded-full bg-black/45" />
          <span className="h-[38%] w-px rounded-full bg-black/45" />
        </span>
      </span>
    );
  };
  return (
    <>
      {handle("start")}
      {handle("end")}
    </>
  );
}
