import { setThemeChoice, useThemeChoice, type ThemeChoice } from "../lib/theme";
import { Hint } from "./ui";

// Settings → Görünüm: the colour theme.

const CHOICES: { value: ThemeChoice; label: string; note: string }[] = [
  { value: "system", label: "Sistem", note: "Bilgisayarın ya da telefonun temasını izler." },
  { value: "light", label: "Açık", note: "Açık zemin, koyu yazı." },
  { value: "dark", label: "Koyu", note: "Koyu zemin, açık yazı." },
];

const OPTION =
  "grid gap-0.5 rounded-ui border border-line bg-pane-2 px-3 py-2 text-left transition-colors duration-120 hover:border-line-strong aria-checked:border-cini aria-checked:bg-cini-wash";

export function AppearanceSettings() {
  const choice = useThemeChoice();
  return (
    <div className="grid gap-3">
      <h3 className="m-0 text-[11px] font-semibold tracking-[0.05em] text-fg-3 uppercase">Tema</h3>
      <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-2 max-[480px]:grid-cols-1">
        {CHOICES.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={choice === c.value}
            className={OPTION}
            onClick={() => setThemeChoice(c.value)}
          >
            <span className="text-[12.5px] font-medium text-fg">{c.label}</span>
            <span className="text-[11.5px] leading-[1.35] text-fg-3">{c.note}</span>
          </button>
        ))}
      </div>
      <Hint>Oynatıcının çevresi her iki temada da koyu kalır; videonun renkleri koyu zeminde doğru görünür.</Hint>
    </div>
  );
}
