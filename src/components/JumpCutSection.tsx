import type { JumpCut } from "../lib/cuts";
import { clock, duration as fmtDuration } from "../lib/format";
import { Hint, Range, Row, RowLabel, Section, Switch } from "./ui";

/** What the jump cut does to the video: how many cuts, and its length before and after. */
export interface JumpCutSummary {
  count: number;
  before: number;
  after: number;
}

const secs = (s: number) => `${s.toFixed(2).replace(/0$/, "").replace(".", ",")} sn`;

/** A value in seconds beside its slider ("0,15 sn" is wider than RowValue). */
const Secs = ({ value }: { value: number }) => (
  <span className="w-[50px] text-right text-[12px] text-fg-3 tabular-nums [font-feature-settings:'tnum'_1]">{secs(value)}</span>
);

/**
 * Cutting out the quiet between words (and filler sounds) of the transcript;
 * `unavailable` says why it cannot be done now.
 */
export function JumpCutSection({
  value,
  onChange,
  unavailable,
  summary,
}: {
  value: JumpCut;
  onChange: (j: JumpCut) => void;
  unavailable: string | null;
  summary: JumpCutSummary | null;
}) {
  const set = (p: Partial<JumpCut>) => onChange({ ...value, ...p });
  const off = !!unavailable || !value.on;
  return (
    <Section title="Boşlukları kes">
      <Row>
        <RowLabel wide>Sessizlikleri at</RowLabel>
        <Switch checked={value.on} disabled={!!unavailable} onChange={(e) => set({ on: e.target.checked })} />
      </Row>
      <Row>
        <RowLabel>En kısa</RowLabel>
        <Range
          min={0.3}
          max={2}
          step={0.1}
          value={value.gap}
          disabled={off}
          aria-label="Kesilecek en kısa sessizlik"
          onChange={(e) => set({ gap: Number(e.target.value) })}
        />
        <Secs value={value.gap} />
      </Row>
      <Row>
        <RowLabel>Pay</RowLabel>
        <Range
          min={0}
          max={0.4}
          step={0.05}
          value={value.pad}
          disabled={off}
          aria-label="Konuşmanın iki yanında bırakılan sessizlik"
          onChange={(e) => set({ pad: Number(e.target.value) })}
        />
        <Secs value={value.pad} />
      </Row>
      <Row>
        <RowLabel wide>Dolgu sesleri (ııı, eee)</RowLabel>
        <Switch checked={value.fillers} disabled={off} onChange={(e) => set({ fillers: e.target.checked })} />
      </Row>
      {unavailable ? (
        <Hint>{unavailable}</Hint>
      ) : value.on && summary ? (
        <Hint>
          {summary.count
            ? `${summary.count} yer kesiliyor, video ${fmtDuration(summary.before - summary.after)} kısalıyor: ${clock(summary.before)} → ${clock(summary.after)}.`
            : "Bu ayarlarla kesilecek boşluk yok."}{" "}
          Oynatırken kesilen yerler atlanır, zaman çizelgesinde soluk görünür.
        </Hint>
      ) : (
        <Hint>
          Kelimeler arasındaki uzun sessizlikleri videodan çıkarır, cümleler arka arkaya gelir. <b>Pay</b>, kelimelerin
          kırpılmaması için konuşmanın iki yanında bırakılan sessizlik. Transkripte dokunulmaz; kapatınca video eski hâline
          döner.
        </Hint>
      )}
    </Section>
  );
}
