import type { LangChoice } from "../engine";
import { MAIN_LANGS, SPEECH_LANGS } from "../engine/languages";
import { langName } from "../lib/lang";
import { modelKnows, type ModelInfo } from "../models";
import { OPT_NOTE, OPT_TITLE, Select, type Option } from "./Select";

const OPTIONS: Option<LangChoice>[] = [
  { value: "auto", label: "Otomatik" },
  ...SPEECH_LANGS.map((l) => ({
    value: l.code,
    label: l.name,
    group: MAIN_LANGS.includes(l.code) ? "Ana diller" : "Diğer diller",
  })),
];

/** The language spoken in the media, chosen before transcribing. */
export function VideoLang({
  value,
  onChange,
  music,
  onMusic,
  vocals,
  onVocals,
  disabled,
}: {
  value: LangChoice;
  onChange: (l: LangChoice) => void;
  /** Songs: Whisper keeps sung words the speech VAD would drop. */
  music?: boolean;
  onMusic?: (on: boolean) => void;
  /** Music mode: separate the vocals from the band before Whisper hears them. */
  vocals?: boolean;
  onVocals?: (on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-[12px] text-fg-2">
      <span className="flex min-w-[200px] flex-1 items-center gap-2.5">
        <span className="flex-none">Videodaki dil</span>
        <Select<LangChoice>
          label="Videodaki dil"
          value={value}
          options={OPTIONS}
          onChange={onChange}
          disabled={disabled}
          render={(o, inList) => (
            <span className="flex min-w-0 items-baseline justify-between gap-3">
              <span className={OPT_TITLE}>{o.label}</span>
              {inList && o.value === "auto" && <span className={`${OPT_NOTE} flex-none`}>dili bulur</span>}
              {inList && o.value !== "auto" && !MAIN_LANGS.includes(o.value) && (
                <span className={`${OPT_NOTE} flex-none`}>deneysel</span>
              )}
            </span>
          )}
        />
      </span>
      {onMusic && (
        <label className="flex items-center gap-1.5" title="Whisper'da ses etkinliği algılayıcı kapanır; şarkı sözleri atılmaz">
          <input type="checkbox" checked={!!music} disabled={disabled} onChange={(e) => onMusic(e.target.checked)} />
          Müzik modu
        </label>
      )}
      {music && onVocals && (
        <label
          className="flex items-center gap-1.5"
          title="Whisper'dan önce şarkıdaki ses çalgılardan ayrılır (Mel-Band RoFormer, ilk kullanımda ~460 MB); sözler daha az kaçar, çalgı yerlerinde uydurma azalır. Ekran kartı gerekir, döküm daha uzun sürer."
        >
          <input type="checkbox" checked={!!vocals} disabled={disabled} onChange={(e) => onVocals(e.target.checked)} />
          Vokali ayır
        </label>
      )}
    </div>
  );
}

/** Why the chosen model cannot transcribe `lang`, if it cannot; `gpuReason`: why Whisper cannot run here. */
export function langProblem(lang: LangChoice, model: ModelInfo, gpuReason: string | null) {
  if (modelKnows(model, lang)) return null;
  const what = lang === "auto" ? "Dili kendiliğinden bulmak" : `${langName(lang)} yazıya dökmek`;
  if (gpuReason) return `${what} yalnızca Whisper ile olur; Whisper bu cihazda çalışmıyor. ${gpuReason}`;
  return `${model.name} yalnızca Türkçe anlar; ${what} için üst çubuktan Whisper Turbo ya da Whisper Turbo Hafif'i seç.`;
}
