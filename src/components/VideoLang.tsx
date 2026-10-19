import type { SpeechLang } from "../engine";
import { LANG_NAMES } from "../lib/lang";

const LANGS: SpeechLang[] = ["tr", "en"];

const BTN =
  "h-6 rounded-[5px] border-0 bg-transparent px-2.5 text-[12px] font-medium text-fg-2 hover:not-disabled:not-aria-pressed:text-fg aria-pressed:bg-raised aria-pressed:text-fg-strong aria-pressed:shadow-[0_1px_3px_var(--shadow-pop)] disabled:opacity-45";

/** The language spoken in the media, chosen before transcribing. */
export function VideoLang({
  value,
  onChange,
  disabled,
}: {
  value: SpeechLang;
  onChange: (l: SpeechLang) => void;
  disabled?: boolean;
}) {
  return (
    <span className="flex items-center gap-2.5 text-[12px] text-fg-2">
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
    </span>
  );
}

/** Why the chosen model cannot transcribe `lang`, if it cannot; `gpuReason`: why Whisper cannot run here. */
export function langProblem(lang: SpeechLang, modelName: string, modelLangs: SpeechLang[], gpuReason: string | null) {
  if (modelLangs.includes(lang)) return null;
  if (gpuReason) return `${LANG_NAMES[lang]} yalnızca Whisper ile yazıya dökülür; Whisper bu cihazda çalışmıyor. ${gpuReason}`;
  return `${modelName} yalnızca Türkçe anlar; ${LANG_NAMES[lang]} için üst çubuktan Whisper Turbo ya da Whisper Turbo Hafif'i seç.`;
}
