import { useEffect, useMemo, useRef, useState } from "react";
import { MT_LANGS } from "../engine/languages";
import { looksLined, textLines, textUnits } from "../lib/align";
import { LANG_NAMES } from "../lib/lang";
import type { TranslationLang } from "../lib/translation";
import { IconClose } from "./icons";
import { OPT_TITLE, Select, type Option } from "./Select";
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
/** Going back to a line plays this much before it, seconds. */
const PREROLL = 2;

/** m:ss */
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

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
  playing: boolean;
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
  lineCount,
  refineIssue,
  progress,
  playback,
  onAlign,
  onPlaceLines,
  onTaps,
  onClose,
}: {
  text: string;
  onText: (t: string) => void;
  lang: string;
  /** Number of existing timed lines available for 1-to-1 line placement. */
  lineCount: number;
  /** Why "Sesle ince ayar" cannot run, or null when it can. */
  refineIssue: string | null;
  /** Spans of audio done of total while Whisper looks for the words. */
  progress: { done: number; total: number } | null;
  /** null when there is nothing to play (no media file): no timing by hand. */
  playback: TapPlayback | null;
  onAlign: (text: string, lines: boolean, refine: boolean) => Promise<string | null>;
  onPlaceLines: (
    text: string,
    lines: boolean,
    asTranslation?: TranslationLang,
  ) => string | null;
  onTaps: (text: string, lines: boolean, taps: number[], refine: boolean) => Promise<string | null>;
  onClose: () => void;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => area.current?.focus(), []);
  const [mode, setMode] = useState<"align" | "lines">("align");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** null: decided by the text (short lines are caption lines, paragraphs are not). */
  const [linesChoice, setLinesChoice] = useState<boolean | null>(null);
  const auto = useMemo(() => looksLined(text), [text]);
  const lines = linesChoice ?? (mode === "lines" ? true : auto);
  const parsedLines = useMemo(() => textLines(text), [text]);
  const pastedLines = parsedLines.length;
  const count = useMemo(() => parsedLines.reduce((n, l) => n + l.length, 0), [parsedLines]);
  const [asTranslation, setAsTranslation] = useState(() => lang !== "tr");
  const [targetLang, setTargetLang] = useState<TranslationLang>(() =>
    lang === "tr" ? "en" : "tr",
  );
  const targetOptions = useMemo<Option<TranslationLang>[]>(
    () =>
      MT_LANGS.filter((code) => code !== lang).map((code) => ({
        value: code,
        label: LANG_NAMES[code] ?? code.toUpperCase(),
      })),
    [lang],
  );
  const effectiveTarget: TranslationLang = targetOptions.some((o) => o.value === targetLang)
    ? targetLang
    : (targetOptions[0]?.value ?? "tr");
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
  const linesMatch = lineCount > 0 && pastedLines === lineCount;
  const placeLines = () => {
    if (!count || busy || !linesMatch) return;
    const err = onPlaceLines(text, lines, asTranslation ? effectiveTarget : undefined);
    if (err) setError(err);
    else onClose();
  };
  const submit = () => (mode === "lines" ? placeLines() : align());

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
  /** Times unit `n` again: forgets its mark and the ones after, and plays from just before it. */
  const redoFrom = (n: number) => {
    if (!taps || !playback || n >= taps.length) return;
    playback.seek(Math.max(taps[n - 1] ?? 0, taps[n] - PREROLL, 0));
    setTaps(taps.slice(0, n));
  };
  const undoTap = () => taps?.length && redoFrom(taps.length - 1);
  const restart = () => {
    if (!playback) return;
    setTaps([]);
    playback.start();
  };

  /** The playhead, refreshed while timing by hand. */
  const [now, setNow] = useState(0);
  const timeRef = useRef(playback?.time);
  timeRef.current = playback?.time;
  const timing = !!taps;
  useEffect(() => {
    if (!timing) return;
    const id = setInterval(() => setNow(timeRef.current?.() ?? 0), 100);
    return () => clearInterval(id);
  }, [timing]);
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    listRef.current?.querySelector("[data-current]")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [taps?.length]);
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
        <div className="flex items-center gap-1.5">
          <span className="flex-1 tabular-nums text-fg-3">{clock(now)}</span>
          <Button className={SMALL} onClick={() => playback?.toggle()} title="Boşluk">
            {playback?.playing ? "Duraklat" : "Çal"}
          </Button>
          <Button className={SMALL} onClick={restart} title="İşaretleri silip baştan başla">
            Baştan
          </Button>
        </div>
        <ol ref={listRef} className="m-0 max-h-[200px] list-none overflow-y-auto rounded-ui-sm border border-line p-1" lang={lang}>
          {units.map((u, i) => (
            <li key={i} data-current={i === n || undefined}>
              <button
                type="button"
                disabled={i > n}
                onClick={() => redoFrom(i)}
                title={i < n ? `Bu ${lines ? "satırdan" : "cümleden"} yeniden işaretle` : undefined}
                className={`flex w-full gap-2 rounded-ui-sm border-0 border-l-2 bg-transparent px-1.5 py-1 text-left leading-[1.45] ${
                  i === n
                    ? "border-cini text-[13px] font-medium text-fg"
                    : i < n
                      ? "cursor-pointer border-transparent text-fg-2 hover:bg-line"
                      : "border-transparent text-fg-3"
                }`}
              >
                <span className="w-9 shrink-0 text-[11px] text-fg-3 tabular-nums">{i < n ? clock(taps[i]) : ""}</span>
                <span>{u.join(" ")}</span>
              </button>
            </li>
          ))}
        </ol>
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
          {unitName} başlarken <b>Enter</b> · <b>Backspace</b> son işareti siler ve kaydı onun {PREROLL} sn öncesine
          alır · <b>←</b> / <b>→</b> {JUMP} sn geri / ileri (geri gidince sonraki işaretler silinir) · <b>Boşluk</b>{" "}
          duraklatır · <b>+</b> / <b>−</b> tepki payı · <b>Esc</b> bitirir. Listede işaretli bir{" "}
          {lines ? "satıra" : "cümleye"} tıklarsan oradan yeniden işaretlersin. Tepki payı her basıştan düşülür: altyazı
          geç geliyorsa artır, erken geliyorsa azalt. İşaretlenmeyen {lines ? "satırlar" : "cümleler"} sonuncunun
          ardına dizilir.
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

  const lineDiff = pastedLines - lineCount;
  const modeTab = (id: "align" | "lines", label: string) => (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setMode(id);
        setError(null);
      }}
      className={`rounded px-2.5 py-1 text-[11.5px] transition-colors ${
        mode === id ? "bg-bg-3 font-medium text-fg-1 shadow-xs" : "text-fg-3 hover:text-fg-2"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="grid flex-none gap-1.5 border-b border-line-soft px-3.5 py-2 text-[12px] text-fg-2">
      {head("Metni sese hizala", onClose)}
      <div className="inline-flex w-fit items-center gap-0.5 rounded-md border border-line bg-bg-1 p-0.5">
        {modeTab("align", "Sese hizala")}
        {modeTab("lines", "Satır zamanlarına")}
      </div>
      <textarea
        ref={area}
        className={FIELD}
        value={text}
        lang={mode === "lines" && asTranslation ? effectiveTarget : lang}
        spellCheck
        placeholder={
          mode === "lines"
            ? "Mevcut satırlarla bire bir eşleşen metni (ör. çeviriyi) yapıştır…"
            : "Şarkı sözlerini, konuşma metnini ya da şiiri yapıştır…"
        }
        aria-label={mode === "lines" ? "Satır zamanlarına yerleştirilecek metin" : "Hizalanacak metin"}
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
            submit();
          }
        }}
      />
      {mode === "lines" && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-fg-3">
          <span>
            Mevcut: <b className="text-fg-2">{lineCount}</b> · Yapıştırılan:{" "}
            <b className="text-fg-2">{pastedLines}</b>
          </span>
          {lineCount === 0 ? (
            <span className="text-mercan">Yerleştirilecek mevcut satır yok</span>
          ) : pastedLines > 0 && lineDiff === 0 ? (
            <span className="font-medium text-fg-1">Eşleşiyor</span>
          ) : pastedLines > 0 && lineDiff > 0 ? (
            <span className="text-mercan">{lineDiff} fazla</span>
          ) : pastedLines > 0 ? (
            <span className="text-mercan">{-lineDiff} eksik</span>
          ) : null}
        </div>
      )}
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={lines} onChange={(e) => setLinesChoice(e.target.checked)} />
        Her satır ayrı altyazı satırı olsun
      </label>
      {mode === "lines" ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={asTranslation}
              disabled={busy}
              onChange={(e) => {
                setAsTranslation(e.target.checked);
                setError(null);
              }}
            />
            Çeviri olarak ekle
          </label>
          {asTranslation && (
            <Select<TranslationLang>
              value={effectiveTarget}
              options={targetOptions}
              onChange={(v) => {
                setTargetLang(v);
                setError(null);
              }}
              disabled={busy}
              label="Çeviri dili"
              render={(o) => <span className={OPT_TITLE}>{o.label}</span>}
            />
          )}
        </div>
      ) : (
        <>
          <label
            className={`flex items-center gap-1.5 ${refineIssue ? "opacity-60" : ""}`}
            title={
              refineIssue ??
              "Whisper kelimeleri doğrudan seste arar; dökümün kaçırdığı kelimeler de gerçek zamanını alır."
            }
          >
            <input
              type="checkbox"
              checked={refine}
              disabled={!!refineIssue || busy}
              onChange={(e) => changeRefine(e.target.checked)}
            />
            Sesle ince ayar (daha isabetli, daha yavaş)
          </label>
          {refineIssue && <p className="m-0 -mt-1 pl-5 text-[11.5px] text-fg-3">{refineIssue}</p>}
        </>
      )}
      {error && (
        <p className="m-0 text-mercan" role="alert">
          {error}
        </p>
      )}
      {mode === "lines" ? (
        <>
          <p className="m-0 text-[11.5px] leading-normal text-fg-3">
            <b>Satır zamanlarına</b>: yapıştırdığın her satır, karşılık gelen mevcut satırın başlangıç ve bitiş
            zamanına bire bir konur (çeviri veya farklı dil sözler için). <b>Çeviri olarak ekle</b> seçilirse
            mevcut döküm korunur. <b>[Nakarat]</b> gibi tek başına duran başlıklar atlanır. ⌘Z / Ctrl+Z geri alır.
          </p>
          <div className="flex items-center justify-end gap-1.5">
            <Button
              variant="primary"
              className={SMALL}
              onClick={placeLines}
              disabled={!count || busy || !linesMatch}
            >
              Satırlara yerleştir
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="m-0 text-[11.5px] leading-normal text-fg-3">
            <b>Sese hizala</b>: kelimeler metinden, zamanlar dökümden gelir. Dökümün duymadığı yerler için <b>Elle
            tempo tut</b>: kayıt baştan çalar, her {lines ? "satır" : "cümle"} başlarken Enter'a basarsın.{" "}
            <b>[Nakarat]</b> gibi tek başına duran başlıklar atlanır. ⌘Z / Ctrl+Z geri alır.
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
        </>
      )}
    </div>
  );
}
