// Languages. The transcript's is the project's (DecodeOptions.lang, or with
// "auto" the one Whisper heard most); this is the one when nothing says otherwise.

import type { LangChoice, SpeechLang } from "../engine/config";

export const TRANSCRIPT_LANG = "tr";

/** Names of the languages the app speaks, as the interface writes them. */
export const LANG_NAMES: Record<string, string> = { tr: "Türkçe", en: "İngilizce" };

let displayNames: Intl.DisplayNames | null | undefined;

/** Any language's name in Turkish ("fr" → "Fransızca"); the code itself when the browser does not know it. */
export function langName(code: string): string {
  if (LANG_NAMES[code]) return LANG_NAMES[code];
  if (displayNames === undefined) {
    try {
      displayNames = new Intl.DisplayNames(["tr"], { type: "language" });
    } catch {
      displayNames = null;
    }
  }
  const name = displayNames?.of(code);
  return name && name !== code ? name.charAt(0).toLocaleUpperCase("tr") + name.slice(1) : code.toUpperCase();
}

/** The name of a language choice, "Otomatik" for Whisper's own. */
export const choiceName = (l: LangChoice) => (l === "auto" ? "Otomatik" : LANG_NAMES[l]);

export const isSpeechLang = (code: string): code is SpeechLang => code === "tr" || code === "en";

/**
 * The language a transcript is in: the one chosen, or with "auto" the one
 * Whisper heard most (`detected`); Turkish until it has heard anything.
 */
export const transcriptLang = (chosen: LangChoice | undefined, detected?: string): string =>
  chosen === "auto" ? (detected ?? TRANSCRIPT_LANG) : (chosen ?? TRANSCRIPT_LANG);

/** Languages with a dotted and a dotless i (i ↔ İ, ı ↔ I). */
export const hasDottedI = (lang: string) => lang === "tr" || lang === "az";
