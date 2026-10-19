// Small status marks shared by the status bar, menus and the stage.

/** Thin progress bar, 0..1. Width comes from `className` (72px by default). */
export function Meter({ value, className = "w-[72px]" }: { value: number; className?: string }) {
  return (
    <span className={`relative block h-[3px] flex-none overflow-hidden rounded-[2px] bg-line ${className}`} aria-hidden>
      <span
        className="absolute inset-0 origin-left bg-linear-to-r from-[#3a62e0] to-[#4f74e8] transition-transform duration-200 ease-linear motion-reduce:transition-none"
        style={{ transform: `scaleX(${value})` }}
      />
    </span>
  );
}

/** A task's progress in a panel: what it is doing, and how far along (0..1). */
export function Progress({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2.5 text-[12px] text-fg-2">
      <span className="flex-1">{label}</span>
      <Meter value={value} />
    </div>
  );
}

/** Blinking red dot: the microphone is on. */
export const RecDot = () => (
  <span className="size-2 flex-none animate-rec rounded-full bg-mercan motion-reduce:animate-none" aria-hidden />
);
