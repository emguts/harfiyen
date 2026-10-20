import { useEffect, useMemo, useState } from "react";
import { lyricLines } from "../lib/lyrics";
import { Progress } from "./Indicators";
import { Button, Hint, Section, SectionActions } from "./ui";

/** Tap reaction time limit and step, milliseconds. */
const MAX_OFFSET = 600;
const OFFSET_STEP = 25;
/** Arrow-key jump while timing by hand, seconds. */
const JUMP = 5;
/** Whole-transcript moves with [ and ] (with Shift: the bigger one), seconds. */
const SHIFT = 0.1;
const SHIFT_BIG = 0.5;

const FIELD =
  "min-h-[140px] w-full resize-y rounded-ui-sm border border-line bg-bg px-2 py-1.5 text-[12.5px] leading-[1.5] text-fg outline-none placeholder:text-fg-3 focus:border-cini";

export interface LyricsOptions {
  /** Let Whisper time the words in the audio itself, after the transcript gives the rough places. */
  acoustic: boolean;
}

/**
 * Song lyrics pasted over a transcription: the transcript takes their words
 * and lines. Timed from what was transcribed, or by hand (a key press as each
 * line starts), and optionally refined in the audio by Whisper. The callbacks
 * resolve with an error to show, if any.
 */
export function LyricsSection({
  disabled,
  canRefine,
  aligning,
  onAlign,
  onTaps,
  onShift,
  playback,
}: {
  disabled: boolean;
  /** Why the audio refinement cannot run, if it cannot. */
  canRefine: string | null;
  aligning: { done: number; total: number } | null;
  onAlign: (text: string, opts: LyricsOptions) => Promise<string | null>;
  onTaps: (text: string, taps: number[], opts: LyricsOptions) => Promise<string | null>;
  /** Moves every word of the transcript by `seconds`; null when there is nothing to move. */
  onShift: ((seconds: number) => void) | null;
  playback: { start: () => void; stop: () => void; time: () => number; seek: (t: number) => void };
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [acoustic, setAcoustic] = useState(() => localStorage.getItem("harfiyen.lyricsAcoustic") === "1");
  useEffect(() => localStorage.setItem("harfiyen.lyricsAcoustic", acoustic ? "1" : "0"), [acoustic]);
  /** Line start times while timing by hand; null when not. */
  const [taps, setTaps] = useState<number[] | null>(null);
  /** Reaction time taken off each tap, milliseconds: a key press comes a little after the line starts. */
  const [offset, setOffset] = useState(() => {
    const v = Number(localStorage.getItem("harfiyen.tapOffset"));
    return Number.isFinite(v) && v >= 0 && v <= MAX_OFFSET && localStorage.getItem("harfiyen.tapOffset") !== null ? v : 150;
  });
  useEffect(() => localStorage.setItem("harfiyen.tapOffset", String(offset)), [offset]);
  const nudgeOffset = (d: number) => setOffset((o) => Math.min(MAX_OFFSET, Math.max(0, o + d)));
  const lines = useMemo(() => lyricLines(text), [text]);
  const opts = { acoustic: acoustic && !canRefine };
  const busy = !!aligning;

  const finish = async (done: number[]) => {
    setTaps(null);
    playback.stop();
    if (done.length) setError(await onTaps(text, done, opts));
  };
  const tap = () => {
    if (!taps) return;
    const t = Math.max(taps[taps.length - 1] ?? 0, playback.time() - offset / 1000);
    const next = [...taps, t];
    if (next.length >= lines.length) void finish(next);
    else setTaps(next);
  };
  const undoTap = () => taps && setTaps(taps.slice(0, -1));
  /** Jump back or ahead; going back forgets the lines marked after the new time. */
  const jump = (d: number) => {
    if (!taps) return;
    const t = Math.max(0, playback.time() + d);
    playback.seek(t);
    if (d < 0) setTaps(taps.filter((x) => x < t));
  };

  // While timing by hand these keys come before the page's own shortcuts
  // (Space still plays and pauses). Otherwise [ and ] move every word.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (taps) {
        if (e.key === "Enter") tap();
        else if (e.key === "Backspace") undoTap();
        else if (e.key === "Escape") void finish(taps);
        else if (e.key === "ArrowLeft") jump(-JUMP);
        else if (e.key === "ArrowRight") jump(JUMP);
        else if (e.key === "+" || e.key === "=") nudgeOffset(OFFSET_STEP);
        else if (e.key === "-" || e.key === "_") nudgeOffset(-OFFSET_STEP);
        else return;
      } else {
        const el = e.target as HTMLElement | null;
        if (!onShift || e.ctrlKey || e.metaKey || e.altKey) return;
        if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
        if (e.code === "BracketLeft") onShift(e.shiftKey ? -SHIFT_BIG : -SHIFT);
        else if (e.code === "BracketRight") onShift(e.shiftKey ? SHIFT_BIG : SHIFT);
        else return;
      }
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  if (taps) {
    const n = taps.length;
    return (
      <Section title="Şarkı sözleri · elle tempo">
        <p className="m-0 text-[12px] text-fg-3 tabular-nums">
          Dize {n + 1} / {lines.length}
        </p>
        <p className="m-0 text-[13px] leading-[1.5] text-fg-strong">{lines[n]?.join(" ")}</p>
        {lines[n + 1] && <p className="m-0 text-[12px] leading-[1.5] text-fg-3">Sonra: {lines[n + 1].join(" ")}</p>}
        <div className="flex items-center gap-2 text-[12px] text-fg-2">
          <span className="flex-1 tabular-nums">Tepki payı: {offset} ms</span>
          <Button onClick={() => nudgeOffset(-OFFSET_STEP)} title="Eksi (−)">
            −
          </Button>
          <Button onClick={() => nudgeOffset(OFFSET_STEP)} title="Artı (+)">
            +
          </Button>
        </div>
        <Hint>
          <b>Enter</b> dize başladı · <b>Backspace</b> son işareti sil · <b>←</b> / <b>→</b> {JUMP} sn geri / ileri (geri
          gidince sonraki işaretler silinir) · <b>Boşluk</b> duraklat · <b>+</b> / <b>−</b> tepki payı · <b>Esc</b> bitir.
          Tepki payı her basıştan düşülür: altyazılar geç geliyorsa artır, erken geliyorsa azalt. Kalan dizeler sonuncunun
          ardına dizilir.
        </Hint>
        <SectionActions>
          <Button variant="primary" onClick={tap}>
            Dize başladı
          </Button>
          <Button disabled={!n} onClick={undoTap}>
            Geri
          </Button>
          <Button onClick={() => void finish(taps)}>Bitir</Button>
        </SectionActions>
      </Section>
    );
  }

  return (
    <Section title="Şarkı sözleri">
      <textarea
        className={FIELD}
        value={text}
        placeholder={"Her dize ayrı satırda.\n[Nakarat] gibi başlıklar atlanır."}
        aria-label="Şarkı sözleri"
        spellCheck={false}
        disabled={disabled || busy}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
      />
      <label className="flex items-center gap-1.5 text-[12px] text-fg-2" title={canRefine ?? undefined}>
        <input
          type="checkbox"
          checked={acoustic && !canRefine}
          disabled={!!canRefine || busy}
          onChange={(e) => setAcoustic(e.target.checked)}
        />
        Sesle ince ayar (Whisper, daha yavaş)
      </label>
      {onShift && (
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-fg-2">
          <span className="flex-1">Tüm zamanları kaydır</span>
          {[-SHIFT_BIG, -SHIFT, SHIFT, SHIFT_BIG].map((d) => (
            <Button
              key={d}
             
              disabled={busy}
              onClick={() => onShift(d)}
              title={`${Math.abs(d) === SHIFT ? "" : "Shift + "}${d < 0 ? "[" : "]"}`}
            >
              {d > 0 ? "+" : "−"}
              {String(Math.abs(d)).replace(".", ",")} sn
            </Button>
          ))}
        </div>
      )}
      {aligning && <Progress label="Sesle hizalanıyor" value={aligning.total ? aligning.done / aligning.total : 0} />}
      {error ? (
        <Hint>{error}</Hint>
      ) : aligning ? (
        <Hint>
          Whisper sözleri seste arıyor: {aligning.done} / {aligning.total} parça.
        </Hint>
      ) : (
        <Hint>
          Önce şarkıyı Müzik modu açıkken yazıya dök. <b>Sözleri hizala</b> sözleri dökümle eşleştirir: kelimeler
          sözlerden, zamanlar dökümden gelir. Dökümde izi olmayan dizeler için <b>Elle tempo tut</b>: şarkı baştan
          çalar, her dize başlarken Enter'a basarsın. <b>Sesle ince ayar</b> açıkken Whisper kelimeleri ayrıca seste
          arar. Her dize ayrı bir altyazı satırı olur; ⌘Z / Ctrl+Z ile geri alınır.
          {canRefine && ` ${canRefine}`}
        </Hint>
      )}
      <SectionActions>
        <Button
          variant="primary"
          disabled={disabled || busy || !lines.length}
          onClick={async () => setError(await onAlign(text, opts))}
        >
          Sözleri hizala
        </Button>
        <Button
          disabled={disabled || busy || !lines.length}
          onClick={() => {
            setError(null);
            setTaps([]);
            playback.start();
          }}
        >
          Elle tempo tut
        </Button>
      </SectionActions>
    </Section>
  );
}
