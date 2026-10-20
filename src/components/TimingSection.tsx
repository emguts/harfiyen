import { useEffect } from "react";
import { Button, Hint, Section } from "./ui";

/** Whole-transcript moves with [ and ] (with Shift: the bigger one), seconds. */
const SHIFT = 0.1;
const SHIFT_BIG = 0.5;
const STEPS = [-SHIFT_BIG, -SHIFT, SHIFT, SHIFT_BIG];

/** Every caption earlier or later at once; null when there is nothing to move. */
export function TimingSection({ onShiftAll }: { onShiftAll: ((seconds: number) => void) | null }) {
  // [ and ] outside text fields.
  useEffect(() => {
    if (!onShiftAll) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.code === "BracketLeft") onShiftAll(e.shiftKey ? -SHIFT_BIG : -SHIFT);
      else if (e.code === "BracketRight") onShiftAll(e.shiftKey ? SHIFT_BIG : SHIFT);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onShiftAll]);

  return (
    <Section title="Zamanlama">
      <div className="flex flex-wrap gap-1.5">
        {STEPS.map((d) => (
          <Button
            key={d}
            disabled={!onShiftAll}
            onClick={() => onShiftAll?.(d)}
            title={`${Math.abs(d) === SHIFT ? "" : "Shift + "}${d < 0 ? "[" : "]"}`}
          >
            {d > 0 ? "+" : "−"}
            {String(Math.abs(d)).replace(".", ",")} sn
          </Button>
        ))}
      </div>
      <Hint>
        Bütün altyazıyı öne ya da geriye alır; <b>[</b> ve <b>]</b>, Shift ile 0,5 sn. Tek bir satırın ya da kelimenin
        zamanı için transkriptte satırın üstüne gelip saat simgesine tıkla. Her değişiklik ⌘Z / Ctrl+Z ile geri alınır.
      </Hint>
    </Section>
  );
}
