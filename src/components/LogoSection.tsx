import { useRef, useState } from "react";
import { DEFAULT_LOGO, type Corner, type LogoSettings } from "../captions/style";
import { removeLogo, setLogoFile, useLogo } from "../lib/logo";
import { Hint, LinkButton, Range, Row, RowGroup, RowLabel, RowValue, Section, Switch } from "./ui";

const CORNERS: { value: Corner; label: string; at: string }[] = [
  { value: "tl", label: "Sol üst", at: "top-[3px] left-[3px]" },
  { value: "tr", label: "Sağ üst", at: "top-[3px] right-[3px]" },
  { value: "bl", label: "Sol alt", at: "bottom-[3px] left-[3px]" },
  { value: "br", label: "Sağ alt", at: "bottom-[3px] right-[3px]" },
];

const CORNER_BTN =
  "relative h-6 flex-1 cursor-pointer rounded-ui-sm border border-line bg-bg p-0 hover:not-disabled:border-line-strong aria-pressed:border-cini";

/** The caption tab's logo: one image of the user's, in a corner, at a size and opacity. */
export function LogoSection({
  value = DEFAULT_LOGO,
  onChange,
}: {
  value?: LogoSettings;
  onChange: (l: LogoSettings) => void;
}) {
  const { logo } = useLogo();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<LogoSettings>) => onChange({ ...value, ...patch });

  const add = async (f: File) => {
    setBusy(true);
    setError(null);
    try {
      await setLogoFile(f);
      set({ on: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Logo">
      <input
        ref={file}
        type="file"
        accept="image/png,image/svg+xml,image/webp,image/jpeg"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = ""; // The same file can be picked again.
          if (f) void add(f);
        }}
      />
      {logo ? (
        <>
          <div className="flex min-w-0 items-center gap-2.5">
            {/* On a checkerboard, so a transparent logo shows as one. */}
            <span
              className="grid h-9 w-12 flex-none place-items-center rounded-ui-sm border border-line bg-[repeating-conic-gradient(#2a3038_0%_25%,#1c2127_0%_50%)] bg-size-[10px_10px] p-1"
              aria-hidden
            >
              <img src={logo.url} alt="" className="max-h-full max-w-full object-contain" />
            </span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-2">{logo.name}</span>
            <LinkButton type="button" disabled={busy} onClick={() => file.current?.click()}>
              Değiştir
            </LinkButton>
            <LinkButton type="button" onClick={() => void removeLogo()}>
              Kaldır
            </LinkButton>
          </div>
          <Row>
            <RowLabel wide>Bu videoda göster</RowLabel>
            <Switch checked={value.on} onChange={(e) => set({ on: e.target.checked })} />
          </Row>
          {value.on && (
            <>
              <RowGroup role="radiogroup" aria-label="Logonun köşesi">
                <RowLabel>Köşe</RowLabel>
                {CORNERS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className={CORNER_BTN}
                    role="radio"
                    aria-checked={value.corner === c.value}
                    aria-pressed={value.corner === c.value}
                    aria-label={c.label}
                    title={c.label}
                    onClick={() => set({ corner: c.value })}
                  >
                    <span
                      className={`absolute size-[7px] rounded-[2px] ${c.at} ${value.corner === c.value ? "bg-cini" : "bg-fg-3"}`}
                      aria-hidden
                    />
                  </button>
                ))}
              </RowGroup>
              <Row>
                <RowLabel>Boyut</RowLabel>
                <Range
                  min={0.05}
                  max={0.35}
                  step={0.005}
                  value={value.size}
                  onChange={(e) => set({ size: Number(e.target.value) })}
                />
                <RowValue>{Math.round(value.size * 100)}</RowValue>
              </Row>
              <Row>
                <RowLabel>Saydamlık</RowLabel>
                <Range
                  min={0}
                  max={0.9}
                  step={0.05}
                  value={1 - value.opacity}
                  onChange={(e) => set({ opacity: 1 - Number(e.target.value) })}
                  onDoubleClick={() => set({ opacity: 1 })}
                />
                <RowValue>%{Math.round((1 - value.opacity) * 100)}</RowValue>
              </Row>
            </>
          )}
        </>
      ) : (
        <>
          <div>
            <LinkButton type="button" disabled={busy} onClick={() => file.current?.click()}>
              {busy ? "Logo açılıyor…" : "Bilgisayarından logo ekle"}
            </LinkButton>
          </div>
          <Hint>
            PNG, SVG ya da WebP; şeffaf zeminli bir logo en iyi durur. Bir köşede gösterilir, bu tarayıcıda saklanır ve
            sonraki projelerde de hazır olur.
          </Hint>
        </>
      )}
      {error && <p className="m-0 text-[12px] leading-normal text-mercan">{error}</p>}
    </Section>
  );
}
