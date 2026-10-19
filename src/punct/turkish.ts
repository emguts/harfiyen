// Turkish text helpers for punctuation.

const lower = (s: string) => s.toLocaleLowerCase("tr-TR");

/** Strip punctuation and case so a transcript can be punctuated again. */
export function plainWord(text: string): string {
  return lower(text.replace(/['’]/g, "").replace(/[^\p{L}\p{N}-]/gu, ""));
}
