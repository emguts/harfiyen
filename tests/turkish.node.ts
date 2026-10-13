// Turkish finishing rules (src/punct/turkish.ts), without the model.
//
//   npx tsx tests/turkish.node.ts
//
// Each case is the model's output written as text: a capital first letter
// means the model capitalised the word, "." "?" "!" end a sentence, "," is
// kept, and a trailing "|" ends a sentence without punctuation. The expected
// text follows TDK spelling. Exits non-zero on mismatch.

import type { WordMark } from "../src/punct/punctuator";
import { finishTurkish, plainWord } from "../src/punct/turkish";

function marks(model: string): WordMark[] {
  return model.split(" ").map((w) => {
    const bar = w.endsWith("|");
    const m = /^(.*?)([.,?!]?)\|?$/u.exec(w)!;
    const text = m[1];
    return {
      text,
      post: m[2] || null,
      sentenceEnd: bar || /[.?!]/.test(m[2]),
      capitalised: text[0] !== text[0].toLocaleLowerCase("tr-TR"),
    };
  });
}

let failed = 0;
function check(group: string, model: string, expected: string) {
  const got = finishTurkish(marks(model)).join(" ");
  const ok = got === expected;
  console.log(`${ok ? "PASS" : "FAIL"}  ${group}: ${expected}`);
  if (!ok) {
    console.log(`        got: ${got}`);
    failed++;
  }
}

// Proper noun + inflectional suffix -> apostrophe.
check("özel ad eki", "bugün İstanbulda hava güzel.", "Bugün İstanbul'da hava güzel.");
check("özel ad eki", "başkenti Ankaradır.", "Başkenti Ankara'dır.");
check("özel ad eki", "Türkiyenin başkenti Ankara.", "Türkiye'nin başkenti Ankara.");
check("özel ad eki", "yarın İzmire gidiyoruz.", "Yarın İzmir'e gidiyoruz.");
check("özel ad eki", "Kadıköydeki kitapçı kapandı.", "Kadıköy'deki kitapçı kapandı.");
check("özel ad eki", "Atatürkün evi.", "Atatürk'ün evi.");
// Places from the list are fixed even when the model missed the capital.
check("küçük harfli yer", "bugün istanbulda hava güzel.", "Bugün İstanbul'da hava güzel.");
check("küçük harfli yer", "başkent ankara.", "Başkent Ankara.");
check("küçük harfli yer", "babası selanikte doğdu.", "Babası Selanik'te doğdu.");
check("küçük harfli yer", "yazın kuşadasına gittik.", "Yazın Kuşadası'na gittik.");
check("belirsiz kelime", "masada bir şamdan vardı.", "Masada bir şamdan vardı.");
check("belirsiz kelime", "bebek uyuyor.", "Bebek uyuyor.");
// The longest stem wins.
check("en uzun kök", "Afyonkarahisarda kar var.", "Afyonkarahisar'da kar var.");
// All caps from the model are kept.
check("büyük harf", "TÜRKİYEDE seçim var.", "TÜRKİYE'de seçim var.");

// Consonant softening: the stem is written in its dictionary form.
check("ünsüz yumuşaması", "Orhan Pamuk iyi bir yazar. dün Pamuğun kitabını aldım.", "Orhan Pamuk iyi bir yazar. Dün Pamuk'un kitabını aldım.");

// Names learned from the transcript.
check("öğrenilen ad", "dün Ahmet geldi. bugün Ahmetle konuştum.", "Dün Ahmet geldi. Bugün Ahmet'le konuştum.");
check("öğrenilen ad", "bugün Ahmetle konuştum.", "Bugün Ahmetle konuştum.");

// Ambiguous words: only when the model capitalised them mid-sentence.
check("belirsiz kelime", "dün Vanda kar yağdı.", "Dün Van'da kar yağdı.");
check("belirsiz kelime", "dün vanayı kapattım.", "Dün vanayı kapattım.");
check("belirsiz kelime", "dün ordu sınıra geldi.", "Dün ordu sınıra geldi.");
check("belirsiz kelime", "Ahmet Beye söyledim.", "Ahmet Bey'e söyledim.");
// A sentence start is capitalised anyway: that alone is no proper noun.
check("belirsiz kelime", "Hocaya söyledim.", "Hocaya söyledim.");
check("belirsiz kelime", "Kaşları çatıldı.", "Kaşları çatıldı.");

// Derivational suffixes and the plural take no apostrophe (TDK).
check("yapım eki", "o İstanbullu biri.", "O İstanbullu biri.");
check("yapım eki", "Ankaralılar sevindi.", "Ankaralılar sevindi.");
check("çokluk eki", "dün Ahmet geldi. bütün Ahmetler burada.", "Dün Ahmet geldi. Bütün Ahmetler burada.");
check("çokluk eki", "dün Türkler geldi. Azeri Türkleri burada.", "Dün Türkler geldi. Azeri Türkleri burada.");
check("birleşik ad", "dün Göl kurudu. bugün Van Gölü taştı.", "Dün Göl kurudu. Bugün Van Gölü taştı.");
check("birleşik ad", "bu bölge İç Anadolu Bölgesinde yer alır.", "Bu bölge İç Anadolu Bölgesi'nde yer alır.");
check("birleşik ad", "Van Gölünün suyu tuzludur.", "Van Gölü'nün suyu tuzludur.");
check("birleşik ad", "en büyük yapı Selimiye Camiidir.", "En büyük yapı Selimiye Camii'dir.");
check("birleşik ad", "Mostar Köprüsünü yaptı.", "Mostar Köprüsü'nü yaptı.");
check("birleşik ad", "dün Ahmet Kayanın evine gittik.", "Dün Ahmet Kayanın evine gittik.");
check("birleşik ad", "dün Ahmet evinde kaldı.", "Dün Ahmet evinde kaldı.");
check("kurum adı", "Ankara Üniversitesinde okudu.", "Ankara Üniversitesinde okudu.");
check("birleşik ad", "o dönem Ankaranın Çağında yaşadı.", "O dönem Ankara'nın Çağında yaşadı.");
check("dil adı", "dün Yunanca konuştu. Yunancada bu kelime yok.", "Dün Yunanca konuştu. Yunancada bu kelime yok.");

// Place names that are also common words.
check("cins ad", "başımda bir ağrı var.", "Başımda bir ağrı var.");
check("cins ad", "bir kartal yükseğe uçtu.", "Bir kartal yükseğe uçtu.");
check("cins ad", "çorbayı tuzla tatlandırdı.", "Çorbayı tuzla tatlandırdı.");
check("cins ad", "eşyaları bodruma indirdik.", "Eşyaları bodruma indirdik.");
check("cins ad", "köydeki çeşme kurudu.", "Köydeki çeşme kurudu.");
check("cins ad", "bu romanı çok sevdim.", "Bu romanı çok sevdim.");
check("cins ad", "romanda bir hata var.", "Romanda bir hata var.");
check("cins ad", "sabah avcılar ormana girdi.", "Sabah avcılar ormana girdi.");
check("cins ad", "dün Aynalı Kilise gezildi.", "Dün Aynalı Kilise gezildi.");
check("cins ad", "yarın Romaya gidiyoruz.", "Yarın Roma'ya gidiyoruz.");
// The model capitalises every inflected form: only the bare one is a stem.
check("öğrenilen ad", "dün Manço geldi. Mançonun şarkısı, Mançoya sordum.", "Dün Manço geldi. Manço'nun şarkısı, Manço'ya sordum.");

// Sentences: Turkish capitals and a closing mark.
check("cümle", "ışık yandı. ilk gün zordu.", "Işık yandı. İlk gün zordu.");
check("cümle", "geldi| sonra gitti.", "Geldi. Sonra gitti.");
check("cümle", "yarın görüşürüz", "Yarın görüşürüz.");
check("cümle", "evet, geliyorum.", "Evet, geliyorum.");

// Questions keep their mark.
check("soru", "yarın gelecek misin?", "Yarın gelecek misin?");
check("soru", "nereye gidiyorsun? ben eve gidiyorum.", "Nereye gidiyorsun? Ben eve gidiyorum.");
check("soru", "Ankaraya mı gidiyorsun?", "Ankara'ya mı gidiyorsun?");

// plainWord undoes all of it, so the text can be punctuated again.
const plain: [string, string][] = [
  ["İstanbul'da,", "istanbulda"],
  ["Pamuk'un", "pamukun"],
  ["Işık.", "ışık"],
  ["misin?", "misin"],
  ["Ahmet’le", "ahmetle"],
  ["1923'te", "1923te"],
  ["e-posta", "e-posta"],
];
for (const [input, expected] of plain) {
  const got = plainWord(input);
  const ok = got === expected;
  console.log(`${ok ? "PASS" : "FAIL"}  plainWord: ${input} -> ${expected}`);
  if (!ok) {
    console.log(`        got: ${got}`);
    failed++;
  }
}

// Re-punctuating starts from plainWord: every finished word must turn back
// into the word the model was given, so a second pass sees the same input.
const input = "dün Ahmet İstanbula geldi. bugün Ahmetle Pamuğun kitabını konuştuk, ışık yandı| yarın görüşürüz";
const finished = finishTurkish(marks(input));
const back = finished.map(plainWord).join(" ");
const words = marks(input).map((m) => m.text.toLocaleLowerCase("tr-TR")).join(" ");
console.log(`${back === words ? "PASS" : "FAIL"}  tekrar uygulama: ${finished.join(" ")}`);
if (back !== words) {
  console.log(`        got: ${back}`);
  failed++;
}

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
