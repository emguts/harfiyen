import { useEffect, useMemo, useRef, useState } from "react";
import { looksLined, textLines } from "../lib/align";
import { IconClose } from "./icons";
import { Button, IconButton } from "./ui";

const FIELD =
  "min-h-[120px] w-full resize-y rounded-ui-sm border border-line bg-bg px-2 py-1.5 text-[12.5px] leading-[1.5] text-fg outline-none placeholder:text-fg-3 focus:border-cini";

const REFINE_KEY = "harfiyen.alignRefine";

/**
 * A text pasted over the transcript: song lyrics, a speech's script, a poem.
 * Its words replace the transcript's, timed from where the transcript heard
 * them, and with `refine` looked for in the audio itself by Whisper. `onAlign`
 * resolves with an error to show, or null when it is done. The text is kept
 * by the caller, so closing the bar does not lose it.
 */
export function AlignBar({
  text,
  onText,
  lang,
  refineIssue,
  progress,
  onAlign,
  onClose,
}: {
  text: string;
  onText: (t: string) => void;
  lang: string;
  /** Why "Sesle ince ayar" cannot run, or null when it can. */
  refineIssue: string | null;
  /** Spans of audio done of total while Whisper looks for the words. */
  progress: { done: number; total: number } | null;
  onAlign: (text: string, lines: boolean, refine: boolean) => Promise<string | null>;
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
  const [refineChoice, setRefineChoice] = useState(() => {
    try {
      return localStorage.getItem(REFINE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const refine = refineChoice && !refineIssue;
  const changeRefine = (on: boolean) => {
    setRefineChoice(on);
    try {
      localStorage.setItem(REFINE_KEY, on ? "1" : "0");
    } catch {
      // Not remembered; the choice still holds for now.
    }
  };

  const align = () => {
    if (!count || busy) return;
    setBusy(true);
    setError(null);
    // A long text takes a moment: let "Hizalanıyor…" show first.
    setTimeout(async () => {
      const err = await onAlign(text, lines, refine);
      setBusy(false);
      if (err) setError(err);
    }, 30);
  };

  return (
    <div className="grid flex-none gap-1.5 border-b border-line-soft px-3.5 py-2 text-[12px] text-fg-2">
      <div className="flex items-center gap-1.5">
        <span className="flex-1 font-medium text-fg">Metni sese hizala</span>
        <IconButton onClick={onClose} title="Kapat (Esc)" aria-label="Metni hizalamayı kapat">
          <IconClose size={14} />
        </IconButton>
      </div>
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
      <div className="flex items-center gap-1.5">
        <span className="flex-1 text-[11.5px] leading-normal text-fg-3">
          Kelimeler metinden, zamanlar dökümden gelir. <b>[Nakarat]</b> gibi tek başına duran başlıklar atlanır.
          ⌘Z / Ctrl+Z geri alır.
        </span>
        <Button variant="primary" className="h-[26px] flex-none px-2" onClick={align} disabled={!count || busy}>
          {busy ? (progress ? `Seste aranıyor ${progress.done}/${progress.total}` : "Hizalanıyor…") : "Sese hizala"}
        </Button>
      </div>
    </div>
  );
}
