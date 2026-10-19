import type { ComponentProps, ReactNode } from "react";

// Shared building blocks: buttons, side panes and inspector form rows.

// ---- buttons ----

const BUTTON_VARIANT = {
  danger:
    "border-[rgba(239,100,78,0.55)] bg-[rgba(239,100,78,0.14)] text-mercan-text hover:not-disabled:border-mercan hover:not-disabled:bg-mercan hover:not-disabled:text-white",
  default:
    "border-line bg-raised text-fg hover:not-disabled:border-line-strong hover:not-disabled:bg-raised-hover hover:not-disabled:text-fg-strong",
  primary:
    "border-[rgba(71,109,230,0.7)] bg-linear-to-b from-[#4f74e8] to-[#3e63db] text-white shadow-[0_1px_2px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.2)] hover:not-disabled:border-cini hover:not-disabled:from-[#5b80f4] hover:not-disabled:to-[#466be5] hover:not-disabled:shadow-[0_2px_8px_rgba(71,109,230,0.35),inset_0_1px_0_rgba(255,255,255,0.25)]",
};

const BUTTON_SIZE = {
  md: "h-[29px] rounded-ui px-3 text-[12.5px] font-medium",
  lg: "h-9 rounded-lg px-5 text-[13.5px] font-[550]",
};

export function Button({
  variant = "default",
  size = "md",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof BUTTON_VARIANT; size?: keyof typeof BUTTON_SIZE }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 border tracking-[-0.01em] transition-all duration-150 ease-[ease] disabled:opacity-45 ${BUTTON_VARIANT[variant]} ${BUTTON_SIZE[size]} ${className}`}
      {...props}
    />
  );
}

/** Underlined text button. */
export const LinkButton = ({ className = "", ...props }: ComponentProps<"button">) => (
  <button
    className={`cursor-pointer border-0 bg-transparent p-0 text-[12px] text-wave-played underline underline-offset-[0.18em] ${className}`}
    {...props}
  />
);

/** Small square button holding an icon. */
export const IconButton = ({ className = "", ...props }: ComponentProps<"button">) => (
  <button
    className={`grid h-[22px] w-6 place-items-center rounded-ui-sm border-0 bg-transparent p-0 text-fg-2 hover:bg-line hover:text-fg ${className}`}
    {...props}
  />
);

// ---- toolbar buttons ----

const TB_FILL = {
  default:
    "border-line bg-pane-2 text-fg hover:not-disabled:border-line-strong hover:not-disabled:bg-raised-hover hover:not-disabled:text-fg-strong",
  primary:
    "border-[rgba(71,109,230,0.6)] text-white shadow-[0_1px_2px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.2)] hover:not-disabled:border-cini hover:not-disabled:shadow-[0_2px_6px_rgba(71,109,230,0.35),inset_0_1px_0_rgba(255,255,255,0.25)]",
};
const TB_GRADIENT = "bg-linear-to-b from-[#4f74e8] to-[#3e63db] hover:not-disabled:from-[#5b80f4] hover:not-disabled:to-[#466be5]";
/** A light sweep while the button's work runs (replaces the fill). */
const TB_BUSY =
  "bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)] bg-size-[200%_100%] animate-busy motion-reduce:animate-none";

/**
 * Classes for a toolbar button (also used on links). `compact` buttons get
 * narrower on phones, where their label (TbLabel) is hidden.
 */
export function toolbarButton({ primary = false, busy = false, compact = false } = {}) {
  return `inline-flex h-[29px] items-center gap-1.5 rounded-ui border px-[11px] text-[12.5px] font-medium tracking-[-0.01em] no-underline transition-all duration-150 ease-[ease] disabled:opacity-45 max-[860px]:whitespace-nowrap ${
    TB_FILL[primary ? "primary" : "default"]
  } ${busy ? TB_BUSY : primary ? TB_GRADIENT : ""} ${compact ? "max-[480px]:px-2" : ""}`;
}

/** Toolbar button text; phones show only the icon. */
export const TbLabel = ({ children }: { children: ReactNode }) => <span className="max-[480px]:hidden">{children}</span>;

// ---- panes ----

/** A side column: transcript on the left, inspector on the right. */
export function Pane({
  side,
  label,
  children,
}: {
  side: "left" | "right";
  label?: string;
  children: ReactNode;
}) {
  const Tag = side === "left" ? "section" : "aside";
  return (
    <Tag
      aria-label={label}
      className={`flex min-h-0 flex-col border-line-soft bg-pane max-[480px]:max-h-[60vh] max-[480px]:border-0 max-[480px]:border-t ${
        side === "left" ? "border-r max-[860px]:order-3" : "border-l max-[860px]:order-4"
      }`}
    >
      {children}
    </Tag>
  );
}

export const PaneHead = ({ children }: { children: ReactNode }) => (
  <div className="flex items-center justify-between gap-2 border-b border-line-soft px-3.5 pt-3 pb-2.5">{children}</div>
);

export const PaneTitle = ({ children }: { children: ReactNode }) => (
  <h2 className="m-0 text-[13px] font-semibold tracking-[-0.015em] text-fg">{children}</h2>
);

/** Small pill next to a pane title, e.g. a word count. */
export const PaneMeta = ({ children }: { children: ReactNode }) => (
  <span className="rounded-[10px] border border-line-soft bg-tint px-[7px] py-px text-[11px] font-medium text-fg-3 tabular-nums">
    {children}
  </span>
);

/** The scrolling part of a pane (found by `[data-scroll]`). */
export const PaneBody = ({ children }: { children: ReactNode }) => (
  <div
    data-scroll
    className="min-h-0 flex-1 overflow-auto [scrollbar-color:var(--raised)_transparent] [scrollbar-width:thin]"
  >
    {children}
  </div>
);

export const EmptyNote = (props: ComponentProps<"p">) => (
  <p className="mx-3.5 my-3 text-[12.5px] leading-[1.6] text-fg-3" {...props} />
);

// ---- inspector sections and rows ----

export const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="grid gap-2.5 border-b border-line-soft px-3.5 pt-3.5 pb-4">
    <h3 className="m-0 text-[11px] font-semibold tracking-[0.05em] text-fg-3 uppercase">{title}</h3>
    {children}
  </section>
);

export const SectionActions = ({ children }: { children: ReactNode }) => <div className="flex gap-2">{children}</div>;

export const Hint = ({ children }: { children: ReactNode }) => (
  <p className="m-0 text-[12px] leading-normal text-fg-3">{children}</p>
);

const ROW = "flex min-h-7 items-center gap-2.5";

/** Label and control on one line; a <label>, so clicking the text works. */
export const Row = ({ children }: { children: ReactNode }) => <label className={ROW}>{children}</label>;

/** A row that is not a label (it holds its own buttons). */
export const RowGroup = ({ wrap = false, ...props }: ComponentProps<"div"> & { wrap?: boolean }) => (
  <div className={`${ROW} ${wrap ? "flex-wrap" : ""}`} {...props} />
);

export const RowLabel = ({ wide = false, children }: { wide?: boolean; children: ReactNode }) => (
  <span className={`text-[12.5px] whitespace-nowrap text-fg-2 ${wide ? "flex-1" : "w-[66px] flex-none"}`}>
    {children}
  </span>
);

export const RowValue = ({ children }: { children: ReactNode }) => (
  <span className="w-8 text-right text-[12px] text-fg-3 tabular-nums [font-feature-settings:'tnum'_1]">{children}</span>
);

export const Range = (props: Omit<ComponentProps<"input">, "type">) => (
  <input type="range" className="slider m-0 h-[18px] min-w-0 flex-1" {...props} />
);

export const Switch = (props: Omit<ComponentProps<"input">, "type">) => (
  <input type="checkbox" className="switch" {...props} />
);
