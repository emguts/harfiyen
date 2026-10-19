// Turkish-aware casing: trnorm/casing.py, and the str methods (isalpha, isupper...) the normalizer leans on.

export function trLower(text: string): string {
  return text.replace(/I/g, "ı").replace(/İ/g, "i").toLowerCase().replace(/i̇/g, "i");
}

export function trUpper(text: string): string {
  return text.replace(/i/g, "İ").replace(/ı/g, "I").toUpperCase();
}

/** Uppercase the first letter only (Turkish rules), keep the rest. */
export function trCapitalize(word: string): string {
  return word ? trUpper(word[0]) + word.slice(1) : word;
}

/** At least two letters, every one uppercase. */
export function isAllCaps(word: string): boolean {
  const letters = [...word].filter(isAlpha);
  return letters.length >= 2 && letters.every(isUpper);
}

// Python's str predicates, for the characters they are used on here.
export const isAlpha = (s: string) => /^\p{L}+$/u.test(s);
export const isUpper = (s: string) => /\p{Lu}/u.test(s) && !/[\p{Ll}\p{Lt}]/u.test(s);
export const isLower = (s: string) => /\p{Ll}/u.test(s) && !/[\p{Lu}\p{Lt}]/u.test(s);
export const isDigits = (s: string) => /^\d+$/.test(s);
export const isAlnum = (s: string) => /^[\p{L}\p{N}]+$/u.test(s);
