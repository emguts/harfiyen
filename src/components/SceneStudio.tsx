import type { CaptionSettings } from "../captions/style";
import { AURA_PALETTES, AURA_STYLES, paletteById, type AuraPaletteId, type AuraStyleId } from "../render/aura";
import { DEFAULT_KINETIC, kineticPaletteById } from "../render/kinetic";
import { STUDIO } from "./CaptionStudio";
import { KineticControls } from "./KineticStudio";
import { OPT, OPT_TITLE, Select } from "./Select";
import { Hint, LinkButton, RowGroup, RowLabel, Section } from "./ui";

/** What is written over the picture of an audio project. */
export type TextMode = "captions" | "kinetic" | "none";

/** The text mode as the settings keep it: kinetic.on and hidden. */
const textModeOf = (s: CaptionSettings): TextMode =>
  s.kinetic?.on ? "kinetic" : s.hidden ? "none" : "captions";

const TEXT_MODES: { value: TextMode; label: string; note: string }[] = [
  { value: "captions", label: "Altyazı", note: "Arka planın üstünde altyazı; görünümü Altyazı sekmesinde." },
  { value: "kinetic", label: "Kinetik", note: "Altyazı yerine bütün ekranı kullanan kinetik tipografi." },
  { value: "none", label: "Yok", note: "Yalnız arka plan; SRT, VTT ve metin dışa aktarımları etkilenmez." },
];

const CHOICE =
  "h-[26px] rounded-ui border border-line bg-raised text-[12px] text-fg-2 hover:not-disabled:text-fg aria-pressed:border-cini aria-pressed:text-fg-strong disabled:opacity-45";

/**
 * The Sahne tab, for audio-only projects: how the picture is made. What is
 * written (captions, kinetic typography or nothing) and what is behind it
 * (one of the auras, or the kinetic palette's own plain ground).
 */
export function SceneStudio({
  settings,
  onChange,
  onCaptions,
  disabled,
}: {
  settings: CaptionSettings;
  onChange: (s: CaptionSettings) => void;
  /** Opens the Altyazı tab. */
  onCaptions: () => void;
  disabled?: boolean;
}) {
  const kinetic = settings.kinetic ?? DEFAULT_KINETIC;
  const mode = textModeOf(settings);
  const plain = mode === "kinetic" && kinetic.backdrop === "stage";
  const auraStyle = settings.auraStyle ?? "aura";

  const setMode = (m: TextMode) =>
    onChange({ ...settings, hidden: m === "none", kinetic: { ...kinetic, on: m === "kinetic" } });
  const setAura = (style: AuraStyleId) =>
    onChange({ ...settings, auraStyle: style, kinetic: { ...kinetic, backdrop: "aura" } });
  const setPlain = () => onChange({ ...settings, kinetic: { ...kinetic, backdrop: "stage" } });

  return (
    <fieldset className={STUDIO} disabled={disabled}>
      <Section title="Yazı">
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Ekrandaki yazı">
          {TEXT_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              className={CHOICE}
              aria-pressed={mode === m.value}
              onClick={() => setMode(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <Hint>{TEXT_MODES.find((m) => m.value === mode)!.note}</Hint>
        {mode === "captions" && (
          <LinkButton type="button" className="justify-self-start" onClick={onCaptions}>
            Altyazının görünümünü ayarla
          </LinkButton>
        )}
      </Section>

      {mode === "kinetic" && (
        <KineticControls
          kinetic={kinetic}
          onChange={(k) => onChange({ ...settings, kinetic: k })}
          disabled={disabled}
        />
      )}

      <Section title="Arka plan">
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Arka plan">
          {AURA_STYLES.map((st) => (
            <button
              key={st.id}
              type="button"
              className={CHOICE}
              aria-pressed={!plain && auraStyle === st.id}
              onClick={() => setAura(st.id)}
            >
              {st.label}
            </button>
          ))}
          {mode === "kinetic" && (
            <button type="button" className={CHOICE} aria-pressed={plain} onClick={setPlain}>
              Düz
            </button>
          )}
        </div>
        {plain ? (
          <Hint>
            Kinetik paletin kendi zemini ({kineticPaletteById(kinetic.palette).label}); sesle hafifçe parlar.
          </Hint>
        ) : (
          <>
            <RowGroup>
              <RowLabel>Renkler</RowLabel>
              <Select<AuraPaletteId>
                label="Arka plan renkleri"
                value={settings.aura}
                options={AURA_PALETTES.map((p) => ({ value: p.id, label: p.label }))}
                onChange={(aura) => onChange({ ...settings, aura })}
                disabled={disabled}
                render={(o) => {
                  const [a, b, c] = paletteById(o.value).colors;
                  return (
                    <span className={OPT}>
                      <span
                        className="h-[22px] w-[30px] flex-none rounded-ui-sm"
                        aria-hidden
                        style={{
                          background: `radial-gradient(circle at 30% 40%, ${a}, transparent 60%), radial-gradient(circle at 70% 60%, ${b}, transparent 55%), radial-gradient(circle at 50% 90%, ${c}, transparent 50%), #05070b`,
                        }}
                      />
                      <span className={OPT_TITLE}>{o.label}</span>
                    </span>
                  );
                }}
              />
            </RowGroup>
            <Hint>{AURA_STYLES.find((st) => st.id === auraStyle)?.note}</Hint>
          </>
        )}
      </Section>
    </fieldset>
  );
}
