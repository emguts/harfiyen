// Languages. The transcript's is the project's (DecodeOptions.lang); this is the one when nothing says otherwise.
export const TRANSCRIPT_LANG = "tr";

/** Names of the languages the app speaks, as the interface writes them. */
export const LANG_NAMES: Record<string, string> = { tr: "Türkçe", en: "İngilizce" };

/** Languages with a dotted and a dotless i (i ↔ İ, ı ↔ I). */
export const hasDottedI = (lang: string) => lang === "tr" || lang === "az";
