import { Button, Hint, Section } from "./ui";

/** Whole-transcript moves, seconds; [ and ] (with Shift: the bigger one) are read in App. */
export const SHIFT = 0.1;
export const SHIFT_BIG = 0.5;
const STEPS = [-SHIFT_BIG, -SHIFT, SHIFT, SHIFT_BIG];

/**
 * Every caption earlier or later at once; null when there is nothing to move.
 * Adapted from emguts/harfiyen.
 */
export function TimingSection({ onShiftAll }: { onShiftAll: ((seconds: number) => void) | null }) {
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
        Bütün altyazıyı, çevirisiyle birlikte öne ya da geriye alır; <b>[</b> ve <b>]</b>, Shift ile 0,5 sn. Tek bir
        satırın ya da kelimenin zamanı için transkriptte satırın üstüne gelip saat simgesine tıkla. Her değişiklik
        ⌘Z / Ctrl+Z ile geri alınır.
      </Hint>
    </Section>
  );
}
