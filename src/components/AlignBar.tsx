import { useEffect, useMemo, useRef, useState } from "react";
import { looksLined, textLines, textUnits } from "../lib/align";
import { IconClose } from "./icons";
import { Button, IconButton } from "./ui";

const FIELD =
  "min-h-[120px] w-full resize-y rounded-ui-sm border border-line bg-bg px-2 py-1.5 text-[12.5px] leading-[1.5] text-fg outline-none placeholder:text-fg-3 focus:border-cini";
const SMALL = "h-[26px] flex-none px-2";

const REFINE_KEY = "harfiyen.alignRefine";
const OFFSET_KEY = "harfiyen.tapOffset";
/** Reaction time taken off each tap, ms: its default, limit and step. */
const OFFSET_DEFAULT = 150;
const OFFSET_MAX = 600;
const OFFSET_STEP = 25;
/** Arrow-key jump while timing by hand, seconds. */
const JUMP = 5;

const load = <T,>(key: string, read: (v: string) => T | null, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (read(v) ?? fallback);
  } catch {
    return fallback;
  }
};
const save = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered; the choice still holds for now.
  }
};

/** The player, for timing by hand. */
export interface TapPlayback {
  /** Plays from the start (of the trim, if there is one). */
  start: () => void;
  stop: () => void;
  toggle: () => void;
  seek: (t: number) => void;
  /** The playhead, now. */
  time: () => number;
}

/**
 * A text pasted over the transcript: song lyrics, a speech's script, a poem.
 * Its words replace the transcript's, timed from where the transcript heard
 * them, or by hand: the media plays and a key press marks where each line (or
 * sentence) starts. With `refine` Whisper then looks for the words in the
 * audio itself. The callbacks resolve with an error to show, or null when it
 * is done. The text is kept by the caller, so closing the bar does not lose it.
 */
export function AlignBar({
  text,
  onText,
  lang,
  refineIssue,
  progress,
  playback,
  onAlign,
  onTaps,
  onClose,
}: {
  text: string;
  onText: (t: string) => void;
  lang: string;
  /** Why "Sesle ince ayar" cannot run, or null when it can. */
  refineIssue: string | null;
  /** Spans of audio done of total while Whisper looks for the words. */
  progress: { done: number; total: number } | null;
  /** null when there is nothing to play (no media file): no timing by hand. */
  playback: TapPlayback | null;
  onAlign: (text: string, lines: boolean, refine: boolean) => Promise<string | null>;
  onTaps: (text: string, lines: boolean, taps: number[], refine: boolean) => Promise<string | null>;
  onClose: () => void;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => area.current?.focus(), []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** null: decided by the text (short lines are caption lines, paragraphs are not). */
  const [linesChoice, setLinesChoice] = useState<boolean | null>(null);
  const auto = useMemo(() => looksLined(text), [text]);
  const lines = linesChoice ?? auto;
  const count = useMemo(() => textLines(text).reduce((n, l) => n + l.length, 0), [text]);
  const [refineChoice, setRefineChoice] = useState(() => load(REFINE_KEY, (v) => v === "1", false));
  const refine = refineChoice && !refineIssue;
  const changeRefine = (on: boolean) => {
    setRefineChoice(on);
    save(REFINE_KEY, on ? "1" : "0");
  };

  /** Where each line (or sentence) starts while timing by hand; null when not. */
  const [taps, setTaps] = useState<number[] | null>(null);
  const [offset, setOffset] = useState(() =>
    load(OFFSET_KEY, (v) => (Number.isFinite(+v) && +v >= 0 && +v <= OFFSET_MAX ? +v : null), OFFSET_DEFAULT),
  );
  const nudgeOffset = (d: number) =>
    setOffset((o) => {
      const v = Math.min(OFFSET_MAX, Math.max(0, o + d));
      save(OFFSET_KEY, String(v));
      return v;
    });
  /** What one tap starts: the lines, or without lines the sentences. */
  const units = useMemo(() => (count ? textUnits(text, lines) : []), [text, lines, count]);
  const unitName = lines ? "Satır" : "Cümle";
  const tapBox = useRef<HTMLDivElement>(null);

  /** Runs a callback with "busy" on; a long text takes a moment, so "Hizalanıyor…" shows first. */
  const run = (job: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    setTimeout(async () => {
      const err = await job();
      setBusy(false);
      if (err) setError(err);
    }, 30);
  };
  const align = () => {
    if (!count || busy) return;
    run(() => onAlign(text, lines, refine));
  };

  const startTaps = () => {
    if (!units.length || busy || !playback) return;
    setError(null);
    setTaps([]);
    playback.start();
  };
  /** Stops timing by hand; with taps, the text is timed from them. */
  const finish = (done: number[] | null) => {
    setTaps(null);
    playback?.stop();
    if (done?.length) run(() => onTaps(text, lines, done, refine));
  };
  const tap = () => {
    if (!taps || !playback) return;
    const t = Math.max(taps[taps.length - 1] ?? 0, playback.time() - offset / 1000);
    const next = [...taps, t];
    if (next.length >= units.length) finish(next);
    else setTaps(next);
  };
  const undoTap = () => taps && setTaps(taps.slice(0, -1));
  /** Jumps back or ahead; going back forgets the marks after the new time. */
  const jump = (d: number) => {
    if (!taps || !playback) return;
    const t = Math.max(0, playback.time() + d);
    playback.seek(t);
    if (d < 0) setTaps(taps.filter((x) => x < t));
  };

  // While timing by hand these keys come before the page's own shortcuts and
  // before any focused button (Enter or Space would press it).
  useEffect(() => {
    if (!taps) return;
    tapBox.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter") tap();
      else if (e.key === " ") playback?.toggle();
      else if (e.key === "Backspace") undoTap();
      else if (e.key === "Escape") finish(taps);
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

  const head = (title: string, close: () => void) => (
    <div className="flex items-center gap-1.5">
      <span className="flex-1 font-medium text-fg">{title}</span>
      <IconButton onClick={close} title="Kapat" aria-label="Metni hizalamayı kapat">
        <IconClose size={14} />
      </IconButton>
    </div>
  );

  if (taps) {
    const n = taps.length;
    return (
      <div
        ref={tapBox}
        tabIndex={-1}
        className="grid flex-none gap-1.5 border-b border-line-soft px-3.5 py-2 text-[12px] text-fg-2 outline-none"
      >
        {head(`Elle tempo · ${unitName} ${n + 1} / ${units.length}`, () => finish(null))}
        <p className="m-0 text-[14px] leading-[1.5] font-medium text-fg" lang={lang}>
          {units[n]?.join(" ")}
        </p>
        {units[n + 1] && (
          <p className="m-0 leading-[1.5] text-fg-3" lang={lang}>
            Sonra: {units[n + 1].join(" ")}
          </p>
        )}
        <div className="flex items-center gap-1.5">
          <span className="flex-1 tabular-nums">Tepki payı: {offset} ms</span>
          <Button className={SMALL} onClick={() => nudgeOffset(-OFFSET_STEP)} title="Eksi (−)">
            −
          </Button>
          <Button className={SMALL} onClick={() => nudgeOffset(OFFSET_STEP)} title="Artı (+)">
            +
          </Button>
        </div>
        <p className="m-0 text-[11.5px] leading-normal text-fg-3">
          {unitName} başlarken <b>Enter</b> · <b>Backspace</b> son işareti siler · <b>←</b> / <b>→</b> {JUMP} sn geri /
          ileri (geri gidince sonraki işaretler silinir) · <b>Boşluk</b> duraklatır · <b>+</b> / <b>−</b> tepki payı ·
          <b> Esc</b> bitirir. Tepki payı her basıştan düşülür: altyazı geç geliyorsa artır, erken geliyorsa azalt.
          İşaretlenmeyen {lines ? "satırlar" : "cümleler"} sonuncunun ardına dizilir.
        </p>
        <div className="flex items-center gap-1.5">
          <Button variant="primary" className={SMALL} onClick={tap}>
            {unitName} başladı
          </Button>
          <Button className={SMALL} disabled={!n} onClick={undoTap}>
            Geri
          </Button>
          <span className="flex-1" />
          <Button className={SMALL} onClick={() => finish(null)} title="İşaretleri at, metni değiştirme">
            Vazgeç
          </Button>
          <Button className={SMALL} disabled={!n} onClick={() => finish(taps)}>
            Bitir
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid flex-none gap-1.5 border-b border-line-soft px-3.5 py-2 text-[12px] text-fg-2">
      {head("Metni sese hizala", onClose)}
      <textarea
        ref={area}
        className={FIELD}
        value={text}
        lang={lang}
        spellCheck
        placeholder="Şarkı sözlerini, konuşma metnini ya da şiiri yapıştır…"
        aria-label="Hizalanacak metin"
        onChange={(e) => {
          onText(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            align();
          }
        }}
      />
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={lines} onChange={(e) => setLinesChoice(e.target.checked)} />
        Her satır ayrı altyazı satırı olsun
      </label>
      <label
        className={`flex items-center gap-1.5 ${refineIssue ? "opacity-60" : ""}`}
        title={refineIssue ?? "Whisper kelimeleri doğrudan seste arar; dökümün kaçırdığı kelimeler de gerçek zamanını alır."}
      >
        <input type="checkbox" checked={refine} disabled={!!refineIssue || busy} onChange={(e) => changeRefine(e.target.checked)} />
        Sesle ince ayar (daha isabetli, daha yavaş)
      </label>
      {refineIssue && <p className="m-0 -mt-1 pl-5 text-[11.5px] text-fg-3">{refineIssue}</p>}
      {error && (
        <p className="m-0 text-mercan" role="alert">
          {error}
        </p>
      )}
      <p className="m-0 text-[11.5px] leading-normal text-fg-3">
        <b>Sese hizala</b>: kelimeler metinden, zamanlar dökümden gelir. Dökümün duymadığı yerler için <b>Elle tempo
        tut</b>: kayıt baştan çalar, her {lines ? "satır" : "cümle"} başlarken Enter'a basarsın. <b>[Nakarat]</b> gibi
        tek başına duran başlıklar atlanır. ⌘Z / Ctrl+Z geri alır.
      </p>
      <div className="flex items-center justify-end gap-1.5">
        <Button
          className={SMALL}
          onClick={startTaps}
          disabled={!count || busy || !playback}
          title={playback ? undefined : "Bu projede çalınacak ses dosyası yok."}
        >
          Elle tempo tut
        </Button>
        <Button variant="primary" className={SMALL} onClick={align} disabled={!count || busy}>
          {busy ? (progress ? `Seste aranıyor ${progress.done}/${progress.total}` : "Hizalanıyor…") : "Sese hizala"}
        </Button>
      </div>
    </div>
  );
}
