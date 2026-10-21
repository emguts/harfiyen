import { useEffect, useRef, useState } from "react";
import { captionStack, FONTS, fontById, loadCaptionFont, type FontId } from "../captions/fonts";
import { useUserFonts } from "../captions/userFonts";
import type { Word } from "../engine";
import {
  KINETIC_PALETTES,
  KINETIC_STYLES,
  kineticPaletteById,
  KineticRenderer,
  kineticStyleById,
  type KineticPaletteId,
  type KineticSettings,
  type KineticStyleId,
} from "../render/kinetic";
import { IconCheck } from "./icons";
import { OPT, OPT_TITLE, Select } from "./Select";
import { Hint, RowGroup, RowLabel, Section } from "./ui";

const SAMPLE: Word[] = [
  { text: "bugün", start: 0, end: 0.35 },
  { text: "hava", start: 0.35, end: 0.7 },
  { text: "çok", start: 0.7, end: 1.0 },
  { text: "güzel", start: 1.0, end: 1.5 },
];

const FRAME = { w: 480, h: 270 };

function KineticCard({
  id,
  label,
  selected,
  kinetic,
  onPick,
}: {
  id: KineticStyleId;
  label: string;
  selected: boolean;
  kinetic: KineticSettings;
  onPick: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [fontTick, setFontTick] = useState(0);

  useEffect(() => {
    let live = true;
    loadCaptionFont(kinetic.font, document.fonts).then(() => live && setFontTick((n) => n + 1));
    return () => {
      live = false;
    };
  }, [kinetic.font]);

  useEffect(() => {
    const c = canvas.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(c.clientWidth * dpr);
    c.height = Math.round(c.clientHeight * dpr);
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, c.width, c.height);
    const r = new KineticRenderer(SAMPLE, { ...kinetic, on: true, style: id, backdrop: "stage" }, FRAME.w, FRAME.h);
    const img = r.frame(1.22, { low: 0.5, mid: 0.65, high: 0.4 });
    if (!img) return;
    g.drawImage(img.source, 0, 0, c.width, c.height);
  }, [id, kinetic.palette, kinetic.font, fontTick]);

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className="group/card grid gap-1.5 border-0 bg-transparent p-0 text-left"
      onClick={onPick}
    >
      <span
        className={`relative block aspect-video cursor-pointer overflow-hidden rounded-ui transition-all duration-150 ease-[ease] group-hover/card:-translate-y-px ${
          selected
            ? "shadow-[0_0_0_2px_var(--cini),0_4px_12px_rgba(71,109,230,0.35),inset_0_0_0_1px_rgba(255,255,255,0.1)]"
            : "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] group-hover/card:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25)]"
        }`}
      >
        <canvas ref={canvas} className="absolute inset-0 size-full" aria-hidden />
        {selected && (
          <span
            className="absolute top-1.5 right-1.5 grid size-4.5 place-items-center rounded-full bg-cini text-white shadow-[0_1px_4px_rgba(0,0,0,0.4)]"
            aria-hidden
          >
            <IconCheck size={12} />
          </span>
        )}
      </span>
      <span className={`pl-0.5 text-[12px] font-[550] tracking-[-0.01em] ${selected ? "text-fg-strong" : "text-fg-2"}`}>
        {label}
      </span>
    </button>
  );
}

/** The kinetic stage's own choices: style, palette and font (the Sahne tab turns it on and picks its ground). */
export function KineticControls({
  kinetic,
  onChange,
  disabled,
}: {
  kinetic: KineticSettings;
  onChange: (k: KineticSettings) => void;
  disabled?: boolean;
}) {
  const userFonts = useUserFonts();
  const set = (patch: Partial<KineticSettings>) => onChange({ ...kinetic, ...patch });
  const styleInfo = kineticStyleById(kinetic.style);
  const font = fontById(kinetic.font);

  useEffect(() => {
    for (const f of [...FONTS, ...userFonts.fonts]) void loadCaptionFont(f.id, document.fonts);
  }, [userFonts.fonts]);

  const fontOptions = [
    ...userFonts.fonts.map((f) => ({ value: f.id, label: f.label, group: "Yüklediklerin" })),
    ...FONTS.map((f) => ({ value: f.id, label: f.label, group: userFonts.fonts.length ? "Hazır" : undefined })),
  ];

  return (
    <>
      <Section title="Kinetik stil">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Kinetik sahne stili">
          {KINETIC_STYLES.map((s) => (
            <KineticCard
              key={s.id}
              id={s.id}
              label={s.label}
              selected={kinetic.style === s.id}
              kinetic={kinetic}
              onPick={() => set({ style: s.id })}
            />
          ))}
        </div>
        <Hint>{styleInfo.note}</Hint>
      </Section>

      <Section title="Kinetik görünüm">
        <RowGroup>
          <RowLabel>Renk paleti</RowLabel>
          <Select<KineticPaletteId>
            label="Kinetik renk paleti"
            value={kinetic.palette}
            options={KINETIC_PALETTES.map((p) => ({ value: p.id, label: p.label }))}
            onChange={(palette) => set({ palette })}
            disabled={disabled}
            render={(o) => {
              const p = kineticPaletteById(o.value);
              return (
                <span className={OPT}>
                  <span
                    className="grid h-[22px] w-[30px] flex-none place-items-center rounded-ui-sm border border-line text-[11px] font-bold"
                    style={{ background: p.bg, color: p.accent }}
                    aria-hidden
                  >
                    Aa
                  </span>
                  <span className={OPT_TITLE}>{o.label}</span>
                </span>
              );
            }}
          />
        </RowGroup>

        <RowGroup>
          <RowLabel>Yazı tipi</RowLabel>
          <Select<FontId>
            label="Kinetik yazı tipi"
            value={font.id}
            options={fontOptions}
            onChange={(f) => set({ font: f })}
            disabled={disabled}
            render={(o) => {
              const f = fontById(o.value);
              return (
                <span
                  className={OPT_TITLE}
                  style={{ fontFamily: captionStack(f.id), fontWeight: f.weight }}
                >
                  {f.label}
                </span>
              );
            }}
          />
        </RowGroup>
      </Section>
    </>
  );
}
