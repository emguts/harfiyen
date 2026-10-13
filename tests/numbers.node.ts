// Number words -> digits (src/lib/numbers.ts), without a model.
//
//   npx tsx tests/numbers.node.ts
//
// Input is finished transcript text (punctuated, capitalised). Exits non-zero
// on mismatch.

import { digitize, formatNumber, ordinalWord, spellNumber, spellSmall, writeNumbers } from "../src/lib/numbers";

let failed = 0;
function check(group: string, input: string, expected: string, min = 10) {
  const out = digitize(input.split(" "), min);
  const got = out.map((o) => o.text).join(" ");
  const covered = out.reduce((n, o) => n + o.count, 0);
  const ok = got === expected && covered === input.split(" ").length;
  console.log(`${ok ? "PASS" : "FAIL"}  ${group}: ${input} -> ${expected}${min !== 10 ? ` (min ${min})` : ""}`);
  if (!ok) {
    console.log(`        got: ${got}`);
    failed++;
  }
}

// Plain numbers.
check("sayı", "Cumhuriyet bin dokuz yüz yirmi üç yılında kuruldu.", "Cumhuriyet 1923 yılında kuruldu.");
check("sayı", "On beş kişi geldi.", "15 kişi geldi.");
check("sayı", "Toplam yüz yirmi kitap var.", "Toplam 120 kitap var.");
check("sayı", "İki yüz bin kişi izledi.", "200.000 kişi izledi.");
check("sayı", "Nüfusu beş milyon altı yüz otuz dokuz bin yetmiş altı.", "Nüfusu 5.639.076.");
check("sayı", "Bin beş yüz asker vardı.", "1500 asker vardı.");
check("sayı", "Üç bin kişi geldi.", "3000 kişi geldi.");
check("sayı", "On beş bin kişi.", "15.000 kişi.");
check("sayı", "Bir milyon kişi.", "1 milyon kişi.");
check("sayı", "On beş milyonun üzerinde albüm.", "15 milyonun üzerinde albüm.");
check("sayı", "Bir milyon yedi yüz on yedi bin dokuz yüz kırk iki turist.", "1.717.942 turist.");
check("sayı", "Bin bir gece masalları.", "1001 gece masalları.");

// Suffixes, with an apostrophe.
check("ek", "Bin dokuz yüz yirmi üçte kuruldu.", "1923'te kuruldu.");
check("ek", "Bin dört yüz elli üçten sonra.", "1453'ten sonra.");
check("ek", "Ayın yirmisinde döndü.", "Ayın 20'sinde döndü.");
check("ek", "Ayın on dördünde geldi.", "Ayın 14'ünde geldi.");
check("ek", "Bin dokuz yüz yetmişlerde çok popülerdi.", "1970'lerde çok popülerdi.");
check("ek", "Seksenli yıllarda.", "80'li yıllarda.");
check("ek", "Kırkından sonra evlendi.", "40'ından sonra evlendi.");

// Ordinals.
check("sıra", "Yirminci yüzyılda büyüdü.", "20. yüzyılda büyüdü.");
check("sıra", "On dördüncü sırada.", "14. sırada.");
check("sıra", "Yüzüncü yıl kutlandı.", "100. yıl kutlandı.");
check("sıra", "Takım ikinci oldu.", "Takım ikinci oldu.");
check("sıra", "Takım ikinci oldu.", "Takım 2. oldu.", 1);
check("sıra", "Sonunda yirminci.", "Sonunda 20.");

// Small numbers stay as words by default.
check("küçük sayı", "Üç kişi geldi.", "Üç kişi geldi.");
check("küçük sayı", "Üç kişi geldi.", "3 kişi geldi.", 1);
check("küçük sayı", "Saat dokuzda başladı.", "Saat 9'da başladı.", 1);

// Words that are also ordinary words.
check("belirsiz", "Bir gün yine geldi.", "Bir gün yine geldi.", 1);
check("belirsiz", "Masanın altı tozluydu.", "Masanın altı tozluydu.", 1);
check("belirsiz", "O yedi ve gitti.", "O yedi ve gitti.", 1);
check("belirsiz", "Arabaya bin hemen.", "Arabaya bin hemen.");
check("belirsiz", "Yüz yüze görüştük.", "Yüz yüze görüştük.");
check("belirsiz", "Bir yüz ifadesi.", "Bir yüz ifadesi.");
check("belirsiz", "Onu gördüm, ona söyledim, onun evi.", "Onu gördüm, ona söyledim, onun evi.");
check("belirsiz", "Onlar geldi.", "Onlar geldi.");
check("belirsiz", "Binlerce kişi, yüzlerce araba.", "Binlerce kişi, yüzlerce araba.");
check("belirsiz", "Yüzde on arttı.", "Yüzde 10 arttı.");
check("belirsiz", "Bu bir birlik.", "Bu bir birlik.", 1);
check("belirsiz", "Altı yüz kişi.", "600 kişi.");

// Ranges and punctuation keep numbers apart.
check("aralık", "Beş altı kişi geldi.", "5 altı kişi geldi.", 1);
check("aralık", "On beş, yirmi dakika.", "15, 20 dakika.");
check("aralık", "İki bin üç ile iki bin beş arasında.", "2003 ile 2005 arasında.");

// Dates: the day in digits whatever the threshold, the month capitalised (TDK).
check("tarih", "Yirmi üç nisan bin dokuz yüz yirmide açıldı.", "23 Nisan 1920'de açıldı.");
check("tarih", "Üç mart günü geldi.", "3 Mart günü geldi.");
check("tarih", "Dokuz eylülde kurtuldu.", "9 Eylül'de kurtuldu.");
check("tarih", "Bir mayıs kutlandı.", "1 Mayıs kutlandı.");
check("tarih", "On beş temmuz, iki bin on altı.", "15 Temmuz, 2016.");
check("tarih", "Bir aralık sessiz kaldı.", "Bir aralık sessiz kaldı.");
check("tarih", "Bir aralık iki bin yirmi.", "1 Aralık 2020.");
check("tarih", "Otuz iki ocak yaktılar.", "32 ocak yaktılar.");
check("tarih", "Nisanda gelecek.", "Nisanda gelecek.");
check("tarih", "23 nisanda açıldı.", "23 Nisan'da açıldı.");

// Times after "saat".
check("saat", "Saat on beş otuzda başlar.", "Saat 15.30'da başlar.");
check("saat", "Toplantı saat dokuzda.", "Toplantı saat 9'da.");
check("saat", "Saat üç buçukta buluşalım.", "Saat 3.30'da buluşalım.");
check("saat", "Saat dokuz beş geçti.", "Saat 9.05 geçti.");
check("saat", "Saat yirmi.", "Saat 20.");
check("saat", "Saat on iki kırk beşte kalktı.", "Saat 12.45'te kalktı.");
check("saat", "İki saat sürdü.", "İki saat sürdü.");
check("saat", "Saat kulesi.", "Saat kulesi.");

// "rule" writes 1-9 in words, whoever wrote them in digits (Whisper does).
function small(group: string, input: string, expected: string) {
  const got = spellSmall(input.split(" ")).join(" ");
  const ok = got === expected;
  console.log(`${ok ? "PASS" : "FAIL"}  ${group}: ${input} -> ${expected}`);
  if (!ok) {
    console.log(`        got: ${got}`);
    failed++;
  }
}
small("yazıyla", "Salona 15 kişi geldi, 3 kişi kaldı.", "Salona 15 kişi geldi, üç kişi kaldı.");
small("yazıyla", "3 kişi geldi.", "Üç kişi geldi.");
small("yazıyla", "Saat 3'te 2'si geldi, 4'ü gitti.", "Saat 3'te ikisi geldi, dördü gitti.");
small("yazıyla", "Sayfa 3 ve 3 Mart, 5 km, 2 milyon, yüzde 5.", "Sayfa 3 ve 3 Mart, 5 km, 2 milyon, yüzde 5.");
small("yazıyla", "3. sırada, 3-4 kişi, 3,5 saat, %3.", "3. sırada, 3-4 kişi, 3,5 saat, %3.");
small("yazıyla", "Toplam 3 4 kişi.", "Toplam 3 4 kişi.");
const modes = (mode: "rule" | "all" | "keep") =>
  writeNumbers(["Salona", "on", "beş", "kişi", "geldi,", "üç", "kişi", "kaldı."].map((text, i) => ({ text, start: i, end: i + 0.5 })), mode)
    .map((x) => x.text)
    .join(" ");
for (const [mode, expected] of [
  ["rule", "Salona 15 kişi geldi, üç kişi kaldı."],
  ["all", "Salona 15 kişi geldi, 3 kişi kaldı."],
  ["keep", "Salona on beş kişi geldi, üç kişi kaldı."],
] as const) {
  const ok = modes(mode) === expected;
  console.log(`${ok ? "PASS" : "FAIL"}  yazım ${mode}: ${expected}`);
  if (!ok) {
    console.log(`        got: ${modes(mode)}`);
    failed++;
  }
}
const whisper = writeNumbers(["Salona", "15", "kişi", "geldi,", "3", "kişi", "kaldı."].map((text, i) => ({ text, start: i, end: i + 0.5 })), "rule")
  .map((x) => x.text)
  .join(" ");
const whisperOk = whisper === "Salona 15 kişi geldi, üç kişi kaldı.";
console.log(`${whisperOk ? "PASS" : "FAIL"}  Whisper metni kurala göre: ${whisper}`);
if (!whisperOk) failed++;

// spellNumber / ordinalWord, used to build the evaluation text.
const spelled: [number, string][] = [
  [1923, "bin dokuz yüz yirmi üç"],
  [1001, "bin bir"],
  [120, "yüz yirmi"],
  [200000, "iki yüz bin"],
  [5639076, "beş milyon altı yüz otuz dokuz bin yetmiş altı"],
  [1001000, "bir milyon bin"],
];
for (const [n, words] of spelled) {
  const ok = spellNumber(n) === words && digitize(words.split(" "))[0].text === formatNumber(n);
  console.log(`${ok ? "PASS" : "FAIL"}  spellNumber: ${n} <-> ${words}`);
  if (!ok) failed++;
}
for (const [words, ord] of [["yirmi", "yirminci"], ["dört", "dördüncü"], ["on", "onuncu"], ["bin dokuz yüz", "bin dokuz yüzüncü"], ["altı", "altıncı"], ["kırk", "kırkıncı"]]) {
  const ok = ordinalWord(words) === ord;
  console.log(`${ok ? "PASS" : "FAIL"}  ordinalWord: ${words} -> ${ord}`);
  if (!ok) failed++;
}

// Transcript words: merged words keep the first start and the last end; subtitle lines stay apart.
const w = (text: string, start: number, cue?: true) => ({ text, start, end: start + 0.5, ...(cue ? { cue } : {}) });
const merged = writeNumbers([w("Bin", 0), w("dokuz", 1), w("yüz", 2), w("yirmi", 3), w("üçte", 4), w("kuruldu.", 5)], "rule");
const timingOk = merged.length === 2 && merged[0].text === "1923'te" && merged[0].start === 0 && merged[0].end === 4.5 && merged[1].start === 5;
console.log(`${timingOk ? "PASS" : "FAIL"}  zamanlama: 1923'te 0-4.5 sn`);
if (!timingOk) failed++;
const lines = writeNumbers([w("on", 0, true), w("beş", 1, true), w("kişi", 2)], "rule");
const cueOk = lines.map((x) => x.text).join(" ") === "10 beş kişi";
console.log(`${cueOk ? "PASS" : "FAIL"}  altyazı satırları birleşmez`);
if (!cueOk) failed++;

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
