import { useEffect, useRef, useState } from "react";
import type { Cue } from "../lib/cues";
import { formatTime, parseTime } from "../lib/timing";
import { Button } from "./ui";

/** Nudge steps, seconds: plain and with Shift. */
const STEP = 0.1;
const BIG_STEP = 0.5;

const FIELD =
  "h-[26px] w-[74px] rounded-ui-sm border border-line bg-bg px-1.5 text-[12.5px] text-fg tabular-nums outline-none focus:border-cini";
const SMALL = "h-[26px] px-2 text-[12px]";

/** A time field: typed times apply on Enter or when the field is left. */
function TimeField({ label, value, onChange }: { label: string; value: number; onChange: (t: number) => void }) {
  const [text, setText] = useState(formatTime(value));
  useEffect(() => setText(formatTime(value)), [value]);
  const apply = () => {
    const t = parseTime(text);
    if (Number.isFinite(t) && Math.abs(t - value) >= 0.005) onChange(t);
    else setText(formatTime(value));
  };
  return (
    <input
      className={FIELD}
      value={text}
      aria-label={label}
      spellCheck={false}
      onChange={(e) => setText(e.target.value)}
      onBlur={apply}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          apply();
        }
      }}
    />
  );
}

/**
 * Start and end of a line, or of one of its words, edited by hand: typed,
 * nudged, or set to the playhead. `now`: the playhead. The callbacks take
 * absolute word indices (cue.first on).
 */
export function TimingEditor({
  cue,
  now,
  onRetime,
  onShift,
  onClose,
}: {
  cue: Cue;
  now: () => number;
  onRetime: (first: number, count: number, start: number, end: number) => void;
  onShift: (first: number, count: number, seconds: number) => void;
  onClose: () => void;
}) {
  /** A word of the line (index within it), or null for the whole line. */
  const [word, setWord] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => box.current?.focus(), []);
  const w = word !== null && word < cue.words.length ? word : null;
  const first = w === null ? cue.first : cue.first + w;
  const count = w === null ? cue.words.length : 1;
  const start = w === null ? cue.start : cue.words[w].start;
  const end = w === null ? cue.end : cue.words[w].end;
  const setStart = (t: number) => onRetime(first, count, t, Math.max(end, t + 0.05));
  const setEnd = (t: number) => onRetime(first, count, start, t);
  const step = (big: boolean) => (big ? BIG_STEP : STEP);

  return (
    <div
      ref={box}
      tabIndex={-1}
      className="col-span-2 mt-1.5 ml-3 grid gap-2 rounded-ui border border-line-soft bg-well p-2 text-[12px] text-fg-2 outline-none"
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).tagName === "INPUT") return;
        if (e.key === "Escape") onClose();
        else if (e.altKey && e.key === "ArrowLeft") onShift(first, count, -step(e.shiftKey));
        else if (e.altKey && e.key === "ArrowRight") onShift(first, count, step(e.shiftKey));
        else return;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          className={`rounded-[4px] border-0 px-1.5 py-0.5 text-[12px] ${w === null ? "bg-cini text-white" : "bg-raised text-fg-2"}`}
          onClick={() => setWord(null)}
        >
          Satırın tamamı
        </button>
        {cue.words.map((x, i) => (
          <button
            key={i}
            type="button"
            className={`rounded-[4px] border-0 px-1.5 py-0.5 text-[12px] ${w === i ? "bg-cini text-white" : "bg-raised text-fg"}`}
            onClick={() => setWord(i)}
            title={`${formatTime(x.start)} – ${formatTime(x.end)}`}
          >
            {x.text}
          </button>
        ))}
      </div>
      {(
        [
          ["Başlangıç", start, setStart],
          ["Bitiş", end, setEnd],
        ] as const
      ).map(([label, t, set]) => (
        <div key={label} className="flex flex-wrap items-center gap-1.5">
          <span className="w-[62px]">{label}</span>
          <TimeField label={label} value={t} onChange={set} />
          <Button className={SMALL} onClick={(e) => set(t - step(e.shiftKey))} title="Shift ile 0,5 sn">
            −0,1
          </Button>
          <Button className={SMALL} onClick={(e) => set(t + step(e.shiftKey))} title="Shift ile 0,5 sn">
            +0,1
          </Button>
          <Button className={SMALL} onClick={() => set(now())} title="Oynatıcının şu anki zamanı">
            Şu an
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-[62px]">Kaydır</span>
        <Button className={SMALL} onClick={(e) => onShift(first, count, -step(e.shiftKey))} title="Alt + ← (Shift ile 0,5 sn)">
          ← 0,1
        </Button>
        <Button className={SMALL} onClick={(e) => onShift(first, count, step(e.shiftKey))} title="Alt + → (Shift ile 0,5 sn)">
          0,1 →
        </Button>
        <span className="flex-1" />
        <Button className={SMALL} onClick={onClose} title="Esc">
          Kapat
        </Button>
      </div>
      <p className="m-0 text-[11.5px] leading-normal text-fg-3">
        Bir kelimeye tıklayınca yalnız onun zamanı değişir. Satırın uzunluğu değişince kelimeleri aynı oranda
        yayılır. Zamanlar önceki ve sonraki kelimeleri geçmez. Alt + ← / → kaydırır, Shift ile 0,5 sn; her değişiklik
        ⌘Z / Ctrl+Z ile geri alınır.
      </p>
    </div>
  );
}
