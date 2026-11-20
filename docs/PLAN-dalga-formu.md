# Plan: dalga formu üzerinde altyazı düzenleme

> 24 Ekim 2026: Üç ana adım uygulandı. `test:cueedit`, `test:timing`,
> `test:cuts`, `typecheck` ve `build` kontrolleri geçti. Örnek ses ve SRT
> projesiyle sürükleme, tek adımlık geri alma, bölme/birleştirme, çeviri
> düzenleme ve SRT çıktısı, yakınlaşma/kaydırma, trim ve dar ekran görünümü
> arayüzde doğrulandı. Gerçek mikrofon kaydı ve modelle yeni döküm bu
> doğrulamaya dahil değil. İsteğe bağlı iki satırlı SRT satır sonu koruması
> bu çalışmaya dahil edilmedi.

Amaç: Subtitle Edit'teki gibi, altyazıları dalga formunun üstünde görüp düzenlemek.
- Bloklarda metin görünür.
- Fare tekerleğiyle yakınlaşılır.
- Kenar sürüklenerek başlangıç ve bitiş ayarlanır.
- Kısayollarla bölünür ve birleştirilir.

Mevcut ince zaman çizelgesi varsayılan olarak aynı kalır. Düzenleme, "genişlet" ile açılan bir modda yapılır.

Kod yorumları İngilizce olmalı ve çevredeki kodun üslubuna uymalı. Arayüz metinleri Türkçe olmalı.

---

## Mevcut durum (bunları okumadan başlama)

| Dosya | Ne yapıyor |
|---|---|
| `src/components/Timeline.tsx` | Tek canvas, `requestAnimationFrame` döngüsü, `props` ref'i ile son değerleri okur. `view: [v0, v1]` görünen zaman aralığı; şu an sadece trim'e göre değişiyor. Bloklar altta 5 px'lik şerit, metinsiz. Tıklama ve sürükleme sadece `onSeek`. `TrimHandles` sürüklenebilir tutamak örneği. |
| `src/lib/timing.ts` | `retime(words, first, count, start, end)` ve `shiftSpan(...)`. Komşu kelimeye değen sınırı birlikte taşır (`room`, `joinPrev`/`joinNext`), kelime sırasını bozmaz. Sürükleme bunları kullanmalı, yeni zaman matematiği yazılmamalı. |
| `src/App.tsx` ~938–1000 | `commitWords(next)` geri alma geçmişine yazar ve transkripti ya da çeviriyi günceller. `onRetime` ve `onShiftSpan` bunun üstünde. `editable` bayrağı da burada. |
| `src/App.tsx` ~905–916 | Zaman çizelgesine giden bloklar: `groups = buildCues(captionWords, presetById(settings.preset).grouping)`. `captionWords = wordsOutside(dubTimed ?? liveWords, cuts)`. |
| `src/App.tsx` ~2300 | `<Timeline ... cues={groups} />` |
| `src/lib/cues.ts` | `buildCues(words, rules)`. `Word.cue === true` olan kelimede her zaman yeni blok başlar. `importedCues(words)`: herhangi bir kelimede `cue` varsa bloklar **yalnızca** bu işaretlerden çıkar. |
| `src/components/ExportMenu.tsx:132` | SRT çıktısı: `importedCues(words) ?? buildCues(words)` (varsayılan SUBTITLE_RULES). |
| `src/components/Transcript.tsx:324` | Transkript paneli: `importedCues(all) ?? buildCues(all, READING_RULES)`. |
| `src/components/TimingEditor.tsx` | Satır ve kelime zamanını alanlardan ayarlama. Dokunma, buradaki davranış korunmalı. |
| `src/worker/protocol.ts` | `PEAK_STEP = 0.1` sn, yani dalga formu çözünürlüğü 100 ms. |

### Dikkat edilmesi gereken üç nokta

1. **Üç farklı gruplama var.** Zaman çizelgesi stil önayarına göre, panel READING_RULES'a göre, SRT varsayılan kurallara göre gruplar. Düzenleme modunda zaman çizelgesinde **SRT'ye giden bloklar** gösterilmeli: `importedCues(shown) ?? buildCues(shown)`. Kullanıcı ne düzenlerse dışa aktarılan da o olmalı.
2. **Bloktan transkript dizinine geçiş.** `captionWords`, `shown` içinden filtrelenmiş bir liste ama aynı nesneleri taşıyor (`wordsOutside` sadece filtreler). Bloğun `first` alanı `shown` dizini değil. Dizin, nesne kimliğiyle bulunmalı: `shown` için `Map<Word, number>` kurulur ve `cue.words[0]` ile son kelimeye bakılır. Seslendirme (`dubTimed`) açıkken kelimeler yeni nesneler olur; o durumda düzenleme kapalı kalmalı.
3. **Bölme işlemi "dondurma" gerektirir.** Transkriptte hiç `cue` işareti yokken tek bir kelimeye `cue: true` koymak `importedCues`'u devreye sokar ve bütün transkript tek işarete göre gruplanır, yani her şey bozulur. Kural şu: ilk bölme ya da birleştirmede, o an görünen her bloğun ilk kelimesine `cue: true` yazılır, sonra asıl işlem yapılır. Bunun tek geri alma adımı olması gerekir.

---

## Adım 1: Genişletilebilir zaman çizelgesi, yakınlaşma ve bloklarda metin

**Kapsam:** Sadece görüntü ve gezinme, veri değişmiyor.

- `Timeline`'a `expanded: boolean` prop'u ekle.
  - App'te taşıma çubuğunun yanına bir düğme koy (ikon: `icons.tsx` içinde uygun olanı kullan ya da ekle), `title="Dalga formunu genişlet"`.
  - Tercih `settings` içinde ya da localStorage'da kalıcı olsun; App'teki benzer UI tercihlerinin saklandığı yere bak.
- Genişletilmiş modda yükseklik yaklaşık 140–180 px olsun:
  - dalga formu üstte;
  - bloklar altta yaklaşık 36 px'lik bir bantta, yuvarlatılmış dikdörtgen olarak;
  - metin blok genişliğine sığdırılsın, taşan kısım "…" ile kesilsin, blok çok darsa metin hiç çizilmesin;
  - etkin blok `--cini`.
- **Yakınlaşma:**
  - Fare tekerleği (Ctrl'siz) imlecin altındaki zamanı sabit tutarak yakınlaştırsın ve uzaklaştırsın.
  - Shift+tekerlek ya da yatay tekerlek kaydırsın.
  - En yakın görünüm yaklaşık 2 sn, en uzak görünüm tüm dosya ya da trim aralığı olsun.
  - Yakınlaştırılmış görünüm kullanıcının; trim değişirse ya da yeni dosya açılırsa sıfırlansın.
  - Mevcut `view` ve `zoom` animasyonu korunsun; kullanıcı görünümü `spanOf`'un hedefi yerine geçer.
- **Takip:** Oynatma sırasında çizgi görünümün sağ %85'ini geçerse görünüm sayfa sayfa kaydırılsın. Kullanıcı elle kaydırdıysa birkaç saniye beklensin.
- **Zaman cetveli:** Genişletilmiş modda en üstte ince bir zaman cetveli olsun, aralıklar yakınlaşmaya göre 0,5 / 1 / 5 / 10 sn seçilsin. Mevcut `clock()` kullanılabilir.
- **Kenar durumlar:** Telefon genişliğinde (`max-[860px]`) mevcut davranış korunsun. Kayıt (`live`) modu ve trim düzenleme modu aynen çalışmaya devam etsin.
- Çizim döngüsündeki `key` dizgisine yeni durumlar eklensin (kullanıcı görünümü, `expanded`, seçili blok). Değişiklik yoksa çizim yapılmaması ilkesi korunsun.

**Bitti sayılır:** Yakınlaşma ve kaydırma akıcı, metinler okunur, eski ince görünüm piksel piksel aynı. `npm run typecheck` temiz.

## Adım 2: Seçme, kenar sürükleme, blok taşıma

- **Yeni prop'lar:** `onRetime(first, count, start, end)`, `onShift(first, count, seconds)`, `wordIndex: (w: Word) => number | -1` (nokta 2'deki Map) ve `editable`. App'teki mevcut `onRetime` ve `onShiftSpan` aynen verilsin. `editable` şu durumlarda false olmalı:
  - App'teki `editable` false;
  - kayıt sürüyor;
  - trim düzenleniyor;
  - `dubTimed` var.
- **Etkileşim** (sadece genişletilmiş modda ve blok bandında; dalga formu alanında tıklama yine sadece `onSeek`):
  - Bloğa tıklamak bloğu seçer ve başına gider.
  - Kenara yaklaşık 6 px yakınken imleç `ew-resize` olur. Sürükleme sırasında önizleme yerel durumla çizilir, bırakınca bir kez `onRetime` çağrılır; böylece tek geri alma adımı olur. `retime` komşu bloğa değen sınırı zaten birlikte taşıyor (Subtitle Edit davranışı).
  - Bloğun ortasından sürükleme bloğu taşır, bırakınca `onShift` çağrılır.
  - Sürüklerken en az süre `MIN_SPAN` olsun, komşuyu geçme `room()` ile engellensin. Önizlemede de aynı sınırlar uygulanmalı; bunun için önizleme hesabında `retime` saf fonksiyonu çağrılabilir.
- **Sessizliğe yapışma:**
  - Sürüklenen kenar, 0,15 sn içindeki en düşük tepe değerine yapışsın.
  - Alt tuşu basılıyken yapışma kapalı olsun.
  - Çözünürlük 100 ms; bu yeterli kabul edilir.
- **Klavye** (zaman çizelgesi odaktayken ve blok seçiliyken):
  - `Alt+←/→` seçili bloğu 0,1 sn kaydırır, Shift ile 0,5 sn (`TimingEditor` ile aynı).
  - `[` / `]` başlangıcı / bitişi oynatma noktasına getirir.
  - `Esc` seçimi kaldırır.
  - Mevcut genel kısayollarla çakışma kontrol edilsin: `src/App.tsx` ~1380–1418, `BracketLeft`/`BracketRight` zaten "her şeyi kaydır" için kullanılıyor. Çakışıyorsa bunlar sadece zaman çizelgesi odaktayken çalışsın ve `stopPropagation` yapılsın, ya da başka tuş seçilsin.
- Seçili blok, transkript panelinde ilgili satırı göstersin. Panelde seçim ya da kaydırma mekanizması varsa ona bağlanır; yoksa bu adımda atlanabilir, sadece oynatma noktası yeterli.

**Bitti sayılır:** Sürükleyip bırakınca SRT çıktısında yeni süreler görünüyor. Ctrl+Z her sürüklemeyi tek adımda geri alıyor. Çeviri gösterilirken çeviri düzenleniyor (zaten `commitWords` böyle).

## Adım 3: Bölme, birleştirme, kalıcı blok sınırları

- `src/lib/cues.ts` (ya da yeni `src/lib/cueEdit.ts`) içine saf fonksiyonlar yaz:
  - `freezeCues(words, cues): Word[]`: her bloğun ilk kelimesinde `cue: true`, diğerlerinde `cue` yok.
  - `splitAt(words, index): Word[]`: `index` kelimesine `cue: true`.
  - `mergeWithNext(words, cueFirstIndex, nextFirstIndex): Word[]`: sonraki bloğun ilk kelimesinden `cue` kaldırılır.
  - Nokta 3: işaret yoksa önce `freezeCues(shown, importedCues(shown) ?? buildCues(shown))`, sonra işlem. Sonuç tek `commitWords` çağrısıyla yazılır.
- **Kısayollar:**
  - `S` ya da `Ctrl+B`: seçili bloğu oynatma noktasında böler. Bölme noktası, oynatma noktasından sonra başlayan ilk kelimedir; kelimenin ortasına düşerse en yakın kelime sınırı seçilir.
  - `M`: seçili bloğu sonrakiyle birleştirir.
  - Metin alanları odaktayken kısayollar çalışmamalı. App'te zaten "metin alanında değilken" kontrolü var, ona bak.
- Blok bölünebilmesi için en az 2 kelime gerekir; yoksa hiçbir şey yapılmaz.
- Bu işaretler `importedCues` sayesinde panelde ve SRT'de de aynen geçerli olur. Ama zaman çizelgesi normal modda stil önayarının gruplamasını kullanıyor; işaretlerden sonra o da `buildCues` içinde `w.cue` kırılımını zaten uyguluyor, ek kırılımlar olabilir. Bu kabul edilebilir; videoya yakılan altyazı stile göre bölünmeye devam eder.
- **İsteğe bağlı:** İçe aktarılan iki satırlı SRT'lerde satır kırılımı korunmuyor; `parseSubtitles` satırları birleştiriyor. Bunun için `Word` tipine `br?: true` eklenebilir (satır sonundaki kelime). `parseSubtitles` bunu yazar, `toSrt` ve `toVtt` (`src/lib/exporters.ts`) bloğun içinde `br` görünce satır atlar. Proje kaydı ve yükleme (`projectStore.ts`) alanı taşıyor mu kontrol edilmeli. Ayrı bir commit olarak yapılsın.

**Bitti sayılır:**
- Hiç işaret olmayan bir transkriptte bölme yapılınca diğer bloklar değişmiyor.
- Bölme ve birleştirme tek tek geri alınıyor.
- SRT çıktısı zaman çizelgesindeki bloklarla birebir aynı.

---

## Test

- `cueEdit` saf fonksiyonları için `tests/` altında yeni bir node testi yaz. Mevcut testlerin biçimini izle (ör. `tests/timing.node.ts`) ve `package.json`'a `test:cueedit` ekle. Senaryolar:
  - işaretsiz transkriptte bölme;
  - içe aktarılmış SRT'de birleştirme;
  - ilk ve son blok;
  - tek kelimelik blok.
- Her adımın sonunda `npm run typecheck` ve `npm run build`.
- Elle deneme (`npm run dev`):
  - Bir ses dosyası aç, yazıya dök, genişlet.
  - Kenar sürükle, Ctrl+Z ile geri al.
  - Böl, SRT dışa aktar ve blokları karşılaştır.
  - Çeviri görünümünde de aynısını dene.
  - Kayıt ve trim modlarında bozulma olmadığını kontrol et.

## Kapsam dışı

- Çoklu seçim.
- Dalga formunda spektrogram.
- Yeni dalga formu çözünürlüğü: `PEAK_STEP` değişmeyecek.
- Seslendirme (dub) zamanlamasını düzenleme.
