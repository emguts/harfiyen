// Number conversion quality on Turkish text with numbers.
//
//   npx tsx tests/numbers-eval.node.ts [data.json] [--all]
//
// The text (tests/data/numbers-eval.tr.json, from scripts/make_number_eval.py)
// has its numbers spelled out the way speech recognition gives them
// ("1923'te" -> "bin dokuz yüz yirmi üçte"), is converted back with
// digitize, and the numbers are compared with the original. Dates lose their
// capital and apostrophe ("16 Mart'ta" -> "on altı martta"). Both thresholds
// are measured: 10 (the default) and 1. Prints scores, not pass/fail.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { digitize, ordinalWord, spellNumber } from "../src/lib/numbers";

const args = process.argv.slice(2);
const showAll = args.includes("--all");
const dataPath = args.find((a) => !a.startsWith("--")) ?? join(import.meta.dirname, "data", "numbers-eval.tr.json");
const data: { articles: { title: string; text: string }[] } = JSON.parse(readFileSync(dataPath, "utf8"));

const NUMBER = /^((?:[1-9]\d{0,2}(?:\.\d{3})+|[1-9]\d*|0))(?:'(\p{L}+))?([.,?!]?)$/u;
const value = (digits: string) => Number(digits.replaceAll(".", ""));
const MONTH = /^(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)(?:'(\p{L}+))?([.,?!]?)$/u;
/** "16 Mart": a day before a month name. */
const isDay = (tokens: string[], i: number) => /^\d{1,2}$/.test(tokens[i]) && MONTH.test(tokens[i + 1] ?? "");

/** A number token as speech recognition writes it. */
function spoken(token: string, next: string | undefined, prev: string | undefined): string[] {
  const month = MONTH.exec(token);
  if (month && prev && /^\d{1,2}$/.test(prev)) return [month[1].toLocaleLowerCase("tr-TR") + (month[2] ?? "") + month[3]];
  const m = NUMBER.exec(token);
  if (!m) return [token];
  const [, digits, suffix, post] = m;
  const words = spellNumber(value(digits)).split(" ");
  // "20. yüzyıl": an ordinal when a lowercase word follows.
  if (post === "." && !suffix && next && next[0] === next[0].toLocaleLowerCase("tr-TR")) {
    return ordinalWord(words.join(" ")).split(" ");
  }
  if (suffix) {
    const last = words.pop()!;
    words.push((last === "dört" && /^[üu]/.test(suffix) ? "dörd" : last) + suffix);
  }
  words[words.length - 1] += post;
  return words;
}

const hasDigit = (w: string) => /\d/.test(w);

const SCALE: Record<string, number> = { bin: 1e3, milyon: 1e6, milyar: 1e9, trilyon: 1e12 };
/**
 * Numbers by value, whatever the writing: "40 bin", "40.000" and "40000" are
 * all "40000"; "1 milyon 717 bin 942" is "1717942"; "15 milyonun" is "15000000'un".
 */
function byValue(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    let total = 0;
    let j = i;
    let suffix = "";
    let post = "";
    while (j + 1 < tokens.length && /^\d[\d.]*$/.test(tokens[j])) {
      const m = /^(bin|milyon|milyar|trilyon)(\p{L}*)([.,?!]?)$/u.exec(tokens[j + 1]);
      if (!m) break;
      total += value(tokens[j]) * SCALE[m[1]];
      suffix = m[2];
      post = m[3];
      j += 2;
      if (suffix || post) break;
    }
    if (j > i) {
      // "1 milyon 717 bin 942": a plain number after the scales belongs to them.
      const rest = !suffix && !post && j < tokens.length ? NUMBER.exec(tokens[j]) : null;
      if (rest && value(rest[1]) < 1000) {
        total += value(rest[1]);
        suffix = rest[2] ?? "";
        post = rest[3];
        j++;
      }
      out.push(`${total}${suffix ? `'${suffix}` : ""}${post}`);
      i = j - 1;
    } else out.push(tokens[i].replace(/(\d)\.(?=\d{3})/g, "$1"));
  }
  return out.filter(hasDigit);
}
const kind = (w: string) =>
  /^\d[\d.]*\.$/.test(w) && !/\d{4}\.$/.test(w) ? "sıra sayısı" : w.includes("'") ? "ekli" : value(w.replace(/[^\d.]/g, "").replace(/\.$/, "")) >= 10000 ? "10.000 ve üstü" : "düz";

for (const min of [10, 1]) {
  let refCount = 0;
  let hit = 0;
  let valueCount = 0;
  let valueHit = 0;
  const byKind: Record<string, [number, number]> = {};
  const extra: string[] = [];
  const missed: string[] = [];
  let paragraphs = 0;
  let same = 0;
  let dates = 0;
  let dateHit = 0;

  for (const article of data.articles) {
    for (const para of article.text.split("\n")) {
      const ref = para.split(" ");
      const input = ref.flatMap((w, i) => spoken(w, ref[i + 1], ref[i - 1]));
      const ours = digitize(input, min).map((o) => o.text);
      paragraphs++;
      if (ours.join(" ") === para) same++;

      // Days are digits whatever the threshold; the date must come back as written.
      const days = new Map<string, number>();
      const ourDates = new Map<string, number>();
      ours.forEach((w, i) => isDay(ours, i) && ourDates.set(`${w} ${ours[i + 1]}`, (ourDates.get(`${w} ${ours[i + 1]}`) ?? 0) + 1));
      ref.forEach((w, i) => {
        if (!isDay(ref, i)) return;
        days.set(w, (days.get(w) ?? 0) + 1);
        dates++;
        const pair = `${w} ${ref[i + 1]}`;
        if (ourDates.get(pair)) {
          ourDates.set(pair, ourDates.get(pair)! - 1);
          dateHit++;
        } else missed.push(`${pair}  · ${article.title}`);
      });
      const counted = (w: string, v: number) => {
        if (v >= min) return true;
        if (!days.get(w)) return false;
        days.set(w, days.get(w)! - 1);
        return true;
      };

      // By value: does each number come back, however it is written?
      const ourValues = new Map<string, number>();
      for (const w of byValue(ours)) ourValues.set(w, (ourValues.get(w) ?? 0) + 1);
      const dayValues = new Map(days);
      for (const w of byValue(ref)) {
        const v = value(w.replace(/'.*$/, "").replace(/[^\d]/g, ""));
        if (v < min && !dayValues.get(w)) continue;
        if (v < min) dayValues.set(w, dayValues.get(w)! - 1);
        valueCount++;
        if (ourValues.get(w)) {
          ourValues.set(w, ourValues.get(w)! - 1);
          valueHit++;
        }
      }

      // Numbers on each side as written, as a multiset.
      const left = new Map<string, number>();
      for (const w of ours.filter(hasDigit)) left.set(w, (left.get(w) ?? 0) + 1);
      for (const w of ref.filter(hasDigit)) {
        // At this threshold small numbers stay words by design: not counted.
        const v = value(w.replace(/'.*$/, "").replace(/[^\d.]/g, "").replace(/\.$/, ""));
        if (!counted(w, v)) continue;
        refCount++;
        const k = kind(w);
        byKind[k] ??= [0, 0];
        byKind[k][1]++;
        if (left.get(w)) {
          left.set(w, left.get(w)! - 1);
          hit++;
          byKind[k][0]++;
        } else missed.push(`${w}  · ${article.title}`);
      }
      for (const [w, n] of left) for (let i = 0; i < n; i++) extra.push(`${w}  · ${article.title}`);
    }
  }

  const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) + "%" : "-");
  console.log(`\n== eşik ${min}: ${data.articles.length} makale, ${paragraphs} paragraf; birebir aynı paragraf: ${pct(same, paragraphs)}`);
  console.log(`değer doğru       ${pct(valueHit, valueCount).padStart(6)}  (${valueHit} / ${valueCount})`);
  console.log(`yazım da aynı     ${pct(hit, refCount).padStart(6)}  (${hit} / ${refCount})`);
  console.log(`tarih (gün + ay)  ${pct(dateHit, dates).padStart(6)}  (${dateHit} / ${dates})`);
  for (const [k, [a, b]] of Object.entries(byKind)) console.log(`  ${k.padEnd(16)} ${pct(a, b).padStart(6)}  (${a} / ${b})`);
  console.log(`fazladan    ${extra.length} sayı (metinde sözcükle yazılmış ya da yanlış çevrilmiş)`);
  const show = (title: string, list: string[]) => {
    if (!list.length) return;
    const n = showAll ? list.length : 10;
    console.log(`${title} (${list.length}${list.length > n ? `, ilk ${n}` : ""}):`);
    for (const line of list.slice(0, n)) console.log("  " + line);
  };
  show("Eksik", missed);
  show("Fazladan", extra);
}
