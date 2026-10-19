import { useEffect, useRef } from "react";
import type { TimeRange } from "../lib/useTranscriber";
import type { Cue } from "../lib/cues";
import { clock } from "../lib/format";
import type { LiveMeter } from "../render/aura";
import { PEAK_STEP } from "../worker/protocol";

/** The timeline box; on phones it takes its own full-width row in the transport. */
export const TIMELINE =
  "relative my-2 ml-2 flex-1 touch-none self-stretch rounded-md border border-line-soft bg-[#101316] max-[860px]:-order-1 max-[860px]:m-0 max-[860px]:h-16 max-[860px]:flex-[1_0_100%]";

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
 * A trim dims what is outside it. While it is being edited (`onRange`), the
 * range is tinted and two handles move its ends; dragging a handle shows
 * that moment in the player.
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
}: {
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
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const total = Math.max(duration, decoded, peaks.length * PEAK_STEP, 1);

  // Latest props for the animation loop, which never restarts.
  const editing = !!onRange;
  const props = useRef({ peaks, total, decoded, doneFrom, time, media, cues, live, range, editing });
  props.current = { peaks, total, decoded, doneFrom, time, media, cues, live, range, editing };

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
    };
    let raf = 0;
    let shown = props.current.decoded; // animated frontier
    let lastKey = "";

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
      const key = p.live
        ? `live${now}`
        : `${w}x${h}|${dpr}|${shown}|${p.doneFrom}|${t}|${p.peaks.length}|${p.total}|${p.cues.length}|${p.range?.start}|${p.range?.end}|${p.editing}`;
      if (key === lastKey) return;
      lastKey = key;

      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);

      const waveH = h - 14;
      const mid = 4 + waveH / 2;
      const bar = 2;
      const step = 3;
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

      const total = p.total;
      const playX = (t / total) * w;
      // The range being edited is tinted behind the bars.
      const rx0 = p.range ? (p.range.start / total) * w : 0;
      const rx1 = p.range ? (p.range.end / total) * w : w;
      if (p.editing) {
        g.fillStyle = "rgba(54, 194, 180, 0.14)";
        g.fillRect(rx0, 0, rx1 - rx0, h);
      }
      const known = p.peaks.length * PEAK_STEP;
      for (let x = 0; x < w; x += step) {
        const t0 = (x / w) * total;
        const t1 = ((x + step) / w) * total;
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
        const x0 = (cue.start / total) * w;
        const x1 = Math.max(x0 + 2, (cue.end / total) * w);
        g.fillStyle = t >= cue.start && t <= cue.end + 0.3 ? C.cueOn : C.cue;
        g.beginPath();
        g.roundRect(x0, h - 8, x1 - x0, 5, 2);
        g.fill();
      }

      // Outside the trim: dimmed; while editing, the range framed in its colour.
      if (p.range) {
        g.fillStyle = "rgba(10, 12, 14, 0.62)";
        g.fillRect(0, 0, rx0, h);
        g.fillRect(rx1, 0, w - rx1, h);
      }
      if (p.editing) {
        g.fillStyle = C.trim;
        g.fillRect(rx0, 0, rx1 - rx0, 2);
        g.fillRect(rx0, h - 2, rx1 - rx0, 2);
      }

      if (t > 0 || p.media) {
        g.fillStyle = "#fff";
        g.fillRect(Math.min(w - 2, Math.max(0, playX - 1)), 0, 2, h);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const seekAt = (clientX: number) => {
    if (live) return;
    const r = canvas.current!.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * total);
  };

  return (
    <div
      className={`${TIMELINE} ${live ? "cursor-default" : ""}`}
      role="slider"
      tabIndex={live ? -1 : 0}
      aria-label="Zaman çizelgesi"
      aria-valuemin={0}
      aria-valuemax={Math.round(total)}
      aria-valuenow={Math.round(time)}
      aria-valuetext={clock(time)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        seekAt(e.clientX);
      }}
      onPointerMove={(e) => e.buttons === 1 && seekAt(e.clientX)}
      onKeyDown={(e) => {
        if (live) return;
        if (e.key === "ArrowRight") onSeek(Math.min(total, time + 5));
        else if (e.key === "ArrowLeft") onSeek(Math.max(0, time - 5));
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
  );
}

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
  /** A range reaching both ends is no trim at all. */
  const set = (s: number, e: number) => {
    const a = Math.max(0, Math.min(s, total - MIN_TRIM));
    const b = Math.min(total, Math.max(e, a + MIN_TRIM));
    onRange(a <= 0.01 && b >= total - 0.01 ? null : { start: a, end: b });
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
        className="absolute top-0 bottom-0 z-1 grid w-3 -translate-x-1/2 cursor-ew-resize touch-none place-items-center outline-none focus-visible:[&>span]:ring-2 focus-visible:[&>span]:ring-white [@media(pointer:coarse)]:w-6"
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
        <span
          className={`h-full w-1.5 bg-firuze shadow-[0_0_4px_rgba(0,0,0,0.5)] ${
            which === "start" ? "rounded-l-[3px]" : "rounded-r-[3px]"
          }`}
        />
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
