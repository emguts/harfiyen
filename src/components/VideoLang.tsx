import type { SpeechLang } from "../engine";
import { LANG_NAMES } from "../lib/lang";

const LANGS: SpeechLang[] = ["tr", "en"];

const BTN =
  "h-6 rounded-[5px] border-0 bg-transparent px-2.5 text-[12px] font-medium text-fg-2 hover:not-disabled:not-aria-pressed:text-fg aria-pressed:bg-raised aria-pressed:text-fg-strong aria-pressed:shadow-[0_1px_3px_var(--shadow-pop)] disabled:opacity-45";

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
  value: SpeechLang;
  onChange: (l: SpeechLang) => void;
  /** Songs: Whisper keeps sung words the speech VAD would drop. */
  music?: boolean;
  onMusic?: (on: boolean) => void;
  /** Music mode: separate the vocals from the band before Whisper hears them. */
  vocals?: boolean;
  onVocals?: (on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <span className="flex flex-wrap items-center gap-2.5 text-[12px] text-fg-2">
      Videodaki dil
      <span className="flex gap-0.5 rounded-md border border-line-soft bg-well p-0.5" role="group" aria-label="Videodaki dil">
        {LANGS.map((l) => (
          <button
            key={l}
            type="button"
            className={BTN}
            aria-pressed={value === l}
            disabled={disabled}
            onClick={() => onChange(l)}
          >
            {LANG_NAMES[l]}
          </button>
        ))}
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
    </span>
  );
}

/** Why the chosen model cannot transcribe `lang`, if it cannot; `gpuReason`: why Whisper cannot run here. */
export function langProblem(lang: SpeechLang, modelName: string, modelLangs: SpeechLang[], gpuReason: string | null) {
  if (modelLangs.includes(lang)) return null;
  if (gpuReason) return `${LANG_NAMES[lang]} yalnızca Whisper ile yazıya dökülür; Whisper bu cihazda çalışmıyor. ${gpuReason}`;
  return `${modelName} yalnızca Türkçe anlar; ${LANG_NAMES[lang]} için üst çubuktan Whisper Turbo ya da Whisper Turbo Hafif'i seç.`;
}
