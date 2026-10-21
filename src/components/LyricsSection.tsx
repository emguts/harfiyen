import { useEffect, useMemo, useRef, useState } from "react";
import { lyricLines } from "../lib/lyrics";
import { Progress } from "./Indicators";
import { Button, Hint, Section, SectionActions } from "./ui";

/** Tap reaction time limit and step, milliseconds. */
const MAX_OFFSET = 600;
const OFFSET_STEP = 25;
/** Arrow-key jump while timing by hand, seconds. */
const JUMP = 5;
/** Going back to a line plays this much before it, seconds. */
const PREROLL = 2;

/** m:ss */
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

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
  playback,
}: {
  disabled: boolean;
  /** Why the audio refinement cannot run, if it cannot. */
  canRefine: string | null;
  aligning: { done: number; total: number } | null;
  onAlign: (text: string, opts: LyricsOptions) => Promise<string | null>;
  onTaps: (text: string, taps: number[], opts: LyricsOptions) => Promise<string | null>;
  playback: {
    start: () => void;
    stop: () => void;
    toggle: () => void;
    playing: boolean;
    time: () => number;
    seek: (t: number) => void;
  };
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

  /** Playback time, refreshed while timing by hand. */
  const [now, setNow] = useState(0);
  const timeRef = useRef(playback.time);
  timeRef.current = playback.time;
  const timing = !!taps;
  useEffect(() => {
    if (!timing) return;
    const id = setInterval(() => setNow(timeRef.current()), 100);
    return () => clearInterval(id);
  }, [timing]);
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    listRef.current?.querySelector("[data-current]")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [taps?.length]);

  const finish = async (done: number[]) => {
    setTaps(null);
    playback.stop();
    if (done.length) setError(await onTaps(text, done, opts));
  };
  const cancel = () => {
    setTaps(null);
    playback.stop();
  };
  const tap = () => {
    if (!taps) return;
    const t = Math.max(taps[taps.length - 1] ?? 0, playback.time() - offset / 1000);
    const next = [...taps, t];
    if (next.length >= lines.length) void finish(next);
    else setTaps(next);
  };
  /** Time line `n` again: forget its mark and the ones after, and play from just before it. */
  const redoFrom = (n: number) => {
    if (!taps || n >= taps.length) return;
    playback.seek(Math.max(taps[n - 1] ?? 0, taps[n] - PREROLL, 0));
    setTaps(taps.slice(0, n));
  };
  const undoTap = () => taps?.length && redoFrom(taps.length - 1);
  /** Jump back or ahead; going back forgets the lines marked after the new time. */
  const jump = (d: number) => {
    if (!taps) return;
    const t = Math.max(0, playback.time() + d);
    playback.seek(t);
    if (d < 0) setTaps(taps.filter((x) => x < t));
  };
  const restart = () => {
    setTaps([]);
    playback.start();
  };

  // While timing by hand these keys come before the page's own shortcuts
  // (Space still plays and pauses).
  useEffect(() => {
    if (!taps) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") tap();
      else if (e.key === "Backspace") undoTap();
      else if (e.key === "Escape") void finish(taps);
      else if (e.key === "ArrowLeft") jump(-JUMP);
      else if (e.key === "ArrowRight") jump(JUMP);
      else if (e.key === "+" || e.key === "=") nudgeOffset(OFFSET_STEP);
      else if (e.key === "-" || e.key === "_") nudgeOffset(-OFFSET_STEP);
      else return;
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
        <div className="flex items-center gap-2 text-[12px] text-fg-3 tabular-nums">
          <span className="flex-1">
            Dize {n + 1} / {lines.length} · {clock(now)}
          </span>
          <Button onClick={playback.toggle} title="Boşluk">
            {playback.playing ? "Duraklat" : "Çal"}
          </Button>
          <Button onClick={restart} title="İşaretleri silip baştan başla">
            Baştan
          </Button>
        </div>
        <ol ref={listRef} className="m-0 max-h-[260px] list-none overflow-y-auto rounded-ui-sm border border-line p-1">
          {lines.map((l, i) => {
            const current = i === n;
            return (
              <li key={i} data-current={current || undefined}>
                <button
                  type="button"
                  disabled={i > n}
                  onClick={() => redoFrom(i)}
                  title={i < n ? "Bu dizeden yeniden işaretle" : undefined}
                  className={`flex w-full gap-2 rounded-ui-sm border-0 border-l-2 bg-transparent px-1.5 py-1 text-left text-[12.5px] leading-[1.45] ${
                    current
                      ? "border-cini text-fg-strong"
                      : i < n
                        ? "cursor-pointer border-transparent text-fg-2 hover:bg-line"
                        : "border-transparent text-fg-3"
                  }`}
                >
                  <span className="w-9 shrink-0 text-[11px] text-fg-3 tabular-nums">{i < n ? clock(taps[i]) : ""}</span>
                  <span>{l.join(" ")}</span>
                </button>
              </li>
            );
          })}
        </ol>
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
          <b>Enter</b> dize başladı · <b>Backspace</b> son işareti sil ve şarkıyı o dizenin {PREROLL} sn öncesine al ·{" "}
          <b>←</b> / <b>→</b> {JUMP} sn geri / ileri (geri gidince sonraki işaretler silinir) · <b>Boşluk</b> duraklat ·{" "}
          <b>+</b> / <b>−</b> tepki payı · <b>Esc</b> bitir. Listede işaretli bir dizeye tıklarsan oradan yeniden
          işaretlersin. Tepki payı her basıştan düşülür: altyazılar geç geliyorsa artır, erken geliyorsa azalt. Kalan
          dizeler sonuncunun ardına dizilir.
        </Hint>
        <SectionActions>
          <Button variant="primary" onClick={tap}>
            Dize başladı
          </Button>
          <Button disabled={!n} onClick={undoTap}>
            Geri
          </Button>
          <Button onClick={() => void finish(taps)}>Bitir</Button>
          <Button onClick={cancel} title="İşaretleri uygulamadan çık">
            Vazgeç
          </Button>
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
