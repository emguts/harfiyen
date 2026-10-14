// Language of the transcript text. Whisper is fixed to Turkish today; once
// other languages are transcribed this becomes a per-project value.
export const TRANSCRIPT_LANG = "tr";

/** Languages with a dotted and a dotless i (i ↔ İ, ı ↔ I). */
export const hasDottedI = (lang: string) => lang === "tr" || lang === "az";
