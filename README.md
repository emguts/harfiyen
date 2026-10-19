<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/brand/harfiyen-logo-light.png" />
    <img src="public/brand/harfiyen-logo.png" alt="Harfiyen" width="360" />
  </picture>
</p>

<p align="center">
  <strong>Türkçe konuşmayı tarayıcıda yazıya döker, altyazıyı videonun içine yazar.</strong><br />
  Ses ve video bilgisayarından çıkmaz. 
</p>

<p align="center">
  Turkish speech-to-text and styled video captions, right in your browser.<br />
  Transcribe files or live audio, add punctuation, and export captioned videos — all processed locally.
</p>

<p align="center">
  <code>WebGPU</code> · <code>Türkçe</code> · <code>Lokal İşleme</code> · <code>Altyazı Stilleri</code> · <code>Canlı Mikrofon</code>
</p>

<p align="center">
  <a href="https://harfiyen.dev"><strong>harfiyen.dev</strong></a> ·
  <a href="#hızlı-başlangıç">Hızlı başlangıç</a> ·
  <a href="#neler-yapabilir">Özellikler</a> ·
  <a href="#kullanım">Kullanım</a> ·
  <a href="#yapılacaklar">Yapılacaklar</a>
</p>

<p align="center">
  <img src="docs/screenshot.jpg" alt="Harfiyen ekran görüntüsü. Solda transkript, ortada sesle hareket eden aura üzerinde karaoke altyazı, sağda altyazı stilleri" width="900" />
</p>

https://github.com/user-attachments/assets/72944ea4-75aa-4462-b5eb-b98a2f604bfc

---

Harfiyen, [seda-v0.1](https://huggingface.co/atasoglu/seda-v0.1) Türkçe konuşma tanıma modelini doğrudan
tarayıcıda, ekran kartı üzerinde (**WebGPU**) çalıştırır. Daha yüksek doğruluk için
[Whisper large-v3 turbo](https://huggingface.co/openai/whisper-large-v3-turbo), ekran kartı olmayan cihazlarda da
[Duyu-small](https://huggingface.co/KaanAydinli/Duyu-small) seçilebilir. Bir video ya da ses dosyası yüklersin,
istersen kadrajını (örneğin dikey 9:16) ve kullanacağın bölümü seçip **Yazıya dök** dersin; kelimeler zaman
kodlarıyla belirir, istediğin altyazı stilini seçersin ve altyazılı videoyu indirirsin. Mikrofonla konuşurken de
canlı çalışır.

## Neler yapabilir

### Yazıya döküm

- Video ve ses dosyaları: MP4, MOV, MKV, WebM, MP3, M4A, WAV, FLAC, OGG. Uzun dosyaları parça parça işler,
  bellek şişmez.
- Döküm düğmeyle başlar: dosya açılınca ses grafiği çizilir, döküm beklemede kalır. Önce istersen kadraj ve
  bölüm seçilir, sonra **Yazıya dök**. Bölüm seçildiyse yalnızca o kısım dökülür; 20 dakikalık videodan
  30 saniye seçilince yalnızca 30 saniye işlenir. Döküm ilerledikçe ses grafiğinde dökülen kısım rengine
  kavuşur.
- Canlı mikrofon: kelimeler konuştuktan yaklaşık bir saniye sonra belirir, kayıt aynı anda saklanır.
- Durdur, devam et, iptal: döküm durdurulunca o ana kadar yazılan proje olarak kalır ve sonra kaldığı yerden
  sürdürülebilir; sayfa yenilense de kalınan yer unutulmaz. Yanlış dosya **İptal** ile bırakılır, uzun işlerde
  önce onay sorulur.
- Döküm sürerken önizleme yazılanı takip eder: görüntü ve altyazı o an yazılan yeri gösterir. Oynatınca ya da
  sarınca takip durur.
- Üç model, üst çubuktan (telefonda **⋯** menüsünden) seçilir:
  - **Seda** (varsayılan, ~105 MB): küçük ve hızlı, canlı mikrofonda ve her cihazda çalışır. Üç doğruluk
    ayarı var: **Hızlı**, **Dengeli** ve dil modeliyle **En doğru**.
  - **Duyu** (~85 MB): ekran kartı istemez, işlemcide çalışır; noktalamayı ve büyük harfleri kendisi yazar.
    Yalnızca dosyalarda çalışır, canlı kayıtta kullanılmaz; sesi 12–15 saniyelik parçalar hâlinde işler.
  - **Whisper Turbo** (~1,5 GB) ve **Whisper Turbo Hafif** (~600 MB, 4 bit encoder): daha az hata,
    noktalamayı, büyük harfleri ve rakamları kendisi yazar. Hafif sürüm zor seste biraz daha fazla hata
    yapabilir. Yalnızca dosyalarda ve ekran kartında (WebGPU, `shader-f16`) çalışır; sesi 30 saniyelik
    parçalar hâlinde işler. Sessiz bölümlerde metin uydurmaması için ses etkinliği algılayıcı (Silero VAD)
    kullanır.
- Otomatik noktalama ve büyük harf: döküm bitince nokta, virgül ve soru işareti eklenir; cümle başları
  ve özel adlar büyük harfle yazılır. Türkçe özel ad ekleri için kesme işareti eklenir ("İstanbul'da",
  "Van Gölü'nün"); yapım ve çokluk ekleri TDK'ya göre ayrılmaz ("İstanbullu", "Ahmetler").
  Kelime zamanları korunur; işlem ⌘Z / Ctrl+Z ile geri alınabilir.
- Sayı yazımı: sayılar **kurala göre** (TDK'ya göre: 1–9 yazıyla, 10 ve üstü rakamla) ya da **hepsi
  rakamla** yazılır, istenirse hiç dokunulmaz. Ekler, sıra sayıları, tarih ve saat de doğru yazılır
  ("Saat 15.30'da 15 kişi geldi").
- Kelime düzeyinde zaman: bir kelimeye tıkla, kayıt o ana atlasın; çalarken konuşulan kelime vurgulanır.
- Düzenleme: satıra çift tıkla ve düzelt, satırı sil, ⌘Z ile geri al. Değişmeyen kelimelerin zamanları
  korunur.
- Bul ve değiştir (⌘F / Ctrl+F): yanlış tanınan bir kelimeyi ya da ismi bütün transkriptte düzelt. Büyük/küçük
  harfe bakmaz, istenirse yalnızca tam kelimeleri bulur.
- SRT ve VTT açma: hazır altyazı açılıp stillendirilir ve videoya yazılır. Satırlar ve zamanlar korunur;
  düzeltilen altyazı aynı satırlarla yeniden indirilebilir. UTF-8 dışında Windows-1254 kodlu dosyalar da
  okunur.

### Altyazı

- On bir stil, üç grupta:
  - **Sakin:** **Klasik** (koyu kutuda iki satır), **Sade** (kutusuz, hafif gölgeli), **Cam** (arkadaki
    video buzlu camla bulanıklaşır).
  - **Vurgulu:** **Karaoke** (söylenen kelimeler belirginleşir), **Dolgu** (söylenen kelime konuşma hızında
    soldan sağa renkle dolar), **Akış** (kelimeler söylendikçe yerinde belirir), **Odak** (kelimeler
    bulanıktan netleşir), **Vurgu** (konuşulan kelime renkli kutuda).
  - **İri:** **Pop** (ortada iri, zıplayan kelimeler), **Tek kelime** (ortada yalnızca söylenen kelime),
    **Netleş** (tek iri kelime bulanıktan netleşerek gelir).
- **Sesle vurgula:** çevresindekilerden yüksek sesle söylenen kelimeler büyük ve vurgu renginde yazılır.
- On yazı tipi, hepsi Türkçe karakterlerin tamamıyla: Google Sans Flex, Montserrat, Poppins, Inter, Anton,
  Bebas Neue, Bangers, Luckiest Guy, Schibsted Grotesk, Literata. Kendi yazı tipin de (TTF, OTF, WOFF, WOFF2)
  eklenebilir; tarayıcıda saklanır.
- Boyut, konum, zemin (kutu, kontur, gölge), yazı ve vurgu rengi, Türkçe kurallarına uygun büyük harf
  (i → İ).
- Logo: kendi logon (PNG, SVG, WebP, JPEG) seçtiğin köşede, istediğin boyut ve saydamlıkta durur. Bu
  tarayıcıda saklanır, sonraki projelerde de hazırdır; her projede gizlenebilir.

### Görüntü ve dışa aktarma

- WebGPU oynatıcı: önizlemede gördüğün, dışa aktarılan videonun birebir aynısıdır.
- Kadraj: oynatıcının üstündeki kırpma düğmesiyle (ya da **C**) 9:16, 4:5, 1:1, 16:9 ya da serbest oran.
  **Doldur** kareyi kaplar; kutu sürüklenir, köşelerinden boyutlandırılır, taşan kısım kesilir. **Sığdır**
  videonun tamamını karenin içine sığdırır; boşluklar bulanık ya da siyah olur. Altyazı yeni kareye göre
  yerleşir. 4K yatay videodan 9:16 kadrajla 1080×1920 dikey video (Reels, Shorts) çıkar; dışa aktarma menüsü
  9:16'da 1080p'yi önerir.
- Kesme: zaman çizelgesinin sonundaki **Kes** ile videonun bir bölümü seçilir; seçilen kısım renklenir, uçlar
  sürüklenince oynatıcı o kareyi gösterir. Yalnızca o bölüm yazıya dökülür, oynatılır ve dışa aktarılır; video,
  SRT ve VTT zamanları 0:00'dan başlar.
- Altyazılı MP4: kareler ekran kartında birleştirilir, video H.264 ya da HEVC olarak kodlanır, ses kopyalanır.
  Tarayıcı destekliyorsa ekran kartı, desteklemiyorsa işlemci kullanılır; menü hangisinin kullanılacağını gösterir.
- Dışa aktarırken çözünürlük (kaynakla aynı ya da daha küçük: 1080p, 720p) ve kalite seçilir; tahmini dosya
  boyutu seçim yapılırken görünür.
- Ses dosyaları ve kayıtlar için **aura**: sesle hareket eden yumuşak bir gradyan ve sakin bir ses
  görselleştirmesi. Bunlar da altyazılı MP4 olarak 720p, 1080p ya da 4K dışa aktarılabilir.
- SRT, WebVTT, düz metin, kelime zamanlı JSON ve panoya kopyalama.

### Seslendirme

- Transkript, [EMA Lightning](https://huggingface.co/canberkkkkkk/ema-lightning),
  [Antalia Mini](https://huggingface.co/cloud0day3/antalia-mini) ya da
  [Ahenk Cep](https://huggingface.co/ozgurguler/ahenk-cep-tr) ile yapay bir Türkçe sesle yeniden okunur. Her
  altyazı satırı kendi zamanında başlar; yerine sığmayan satır en fazla 1,35 kat hızlı okunur. Ahenk Cep rakamları,
  tarihleri ve kısaltmaları en iyi okuyan sestir; diğerlerinden biraz yavaştır.
- Ses tonu yarım ton adımlarla kalınlaştırılıp inceltilebilir; satırların süresi değişmez. Seed aynı sesi farklı
  bir vurguyla okutur. Ayarlar seslendirmeden önce ilk satırla dinlenebilir.
- Açıkken oynatıcı ve altyazılı MP4 orijinal ses yerine yapay sesi kullanır. Ses ayrıca WAV olarak
  indirilebilir. Modeller ilk kullanımda indirilir: EMA Lightning yaklaşık 36 MB, Antalia Mini 23 MB,
  Ahenk Cep 18 MB.

### İngilizce çeviri

- Transkript, [opus-mt-tc-big-tr-en](https://huggingface.co/Helsinki-NLP/opus-mt-tc-big-tr-en) ile cümle cümle
  İngilizceye çevrilir. Her cümle Türkçesinin zamanında görünür; kelimeleri o süreyi uzunluklarına göre paylaşır.
- Transkriptin üstündeki **TR / EN** ile gösterilen dil seçilir: altyazı, zaman çizelgesi, SRT/VTT/metin ve
  altyazılı MP4 o dilde olur (dosya adına `.en` eklenir). Çeviri de düzenlenebilir, bulup değiştirilebilir.
- Çeviri projeyle birlikte kaydedilir. Transkript sonradan değişirse çevirinin eskidiği söylenir.
  Model ilk kullanımda yaklaşık 360 MB indirir ve işlemcide (WASM) çalışır.

### Projeler

- Otomatik kayıt: transkript, düzeltmeler, altyazı stili, kadraj, seçilen bölüm ve dalga formu tarayıcıda
  (IndexedDB) saklanır; sekme kapansa da kaybolmaz. Henüz yazıya dökülmemiş dosyalar da projelerde durur.
- Son projeler **Projeler** menüsünde ve boş ekranda listelenir; tek tıkla model yeniden çalışmadan açılır.
  Projeler yeniden adlandırılabilir ve silinebilir.
- Medya kopyalanmadan bağlanır: Chrome ve Edge dosyanın kendisine erişim izni saklar, diğer tarayıcılar
  1 GB'a kadar dosyaların kopyasını tutar. Tarayıcı izin isterse ya da dosya bulunamazsa tek düğmeyle yeniden
  bağlanır; kelime zamanları korunur.
- **.harfiyen** proje dosyası: projeyi dosya olarak indir, başka zaman ya da başka tarayıcıda aç. Medya
  dosyası içine eklenmez, açarken bir kez seçilir.

### Ayarlar ve modeller

- **Ayarlar → Modeller:** her modelin indirilip indirilmediği ve ne kadar yer kapladığı görünür. Modeller
  tek tek indirilip silinebilir; bu cihaza uygun olanların hepsi tek düğmeyle indirilir. Başka bir modelin
  de kullandığı dosyalar silinmez.
- Büyük modeller 32 MB'lık parçalar hâlinde iner ve saklanır; bağlantı koparsa ya da sekme kapanırsa indirme
  kaldığı yerden sürer.
- Modeller tarayıcının bu siteye ayırdığı alanda (Cache Storage) durur. Tarayıcı ayarlarından site verisini
  silmek projeleri de siler; yalnızca modellerden yer açmak için Ayarlar kullanılır.

> Seda küçük harfli, noktalamasız metin üretir; noktalama ve büyük harf ayrı bir modelle sonradan eklenir.
> Sayılar seçilen kurala göre rakama çevrilir.

## Hızlı başlangıç

Gerekenler: Node.js 20+, Python 3.10+ (yalnızca modeli bir kez hazırlamak için) ve WebGPU destekli bir
tarayıcı (masaüstü Chrome veya Edge önerilir).

```bash
npm install
python3 -m pip install -r scripts/requirements.txt
npm run models     # konuşma tanıma, noktalama ve çeviri modellerini indirir ve tarayıcı için dönüştürür (bir kez, Whisper dahil ~3 GB)
npm run dev        # http://localhost:5173
```

İlk açılışta tarayıcı yaklaşık 105 MB indirir (Seda ve ONNX Runtime) ve saklar; sonraki açılışlar
önbellekten, internetsiz çalışır. Whisper Turbo seçilirse ilk dosyada ayrıca yaklaşık 1,5 GB (Hafif: 600 MB), Duyu
seçilirse yaklaşık 85 MB indirilir. Noktalama ilk kullanıldığında ayrıca yaklaşık 60 MB, İngilizce çeviri yaklaşık 360 MB indirilir ve
önbelleğe alınır. Modeller **Ayarlar → Modeller**'den önceden indirilebilir ya da silinebilir. Ses ve metin
işlenmek için sunucuya gönderilmez.

### Telefondan veya ağdaki başka bir cihazdan açmak

Mikrofon, WebGPU ve çok iş parçacıklı WASM yalnızca güvenli bağlamda çalışır; `localhost` güvenli
sayılır ama `http://192.168.x.x` sayılmaz. Yerel bir sertifika üret, geliştirme sunucusu `.cert/`
klasörünü görünce kendiliğinden HTTPS ile ağa açılır (klasör git'e girmez):

```bash
mkcert -install
mkdir -p .cert
mkcert -cert-file .cert/dev.pem -key-file .cert/dev-key.pem localhost 127.0.0.1 <bilgisayarın-yerel-IP'si>
npm run dev        # https://<bilgisayarın-yerel-IP'si>:5173
```

Telefonda uyarısız açılması için `mkcert -CAROOT` klasöründeki `rootCA.pem` dosyasını cihaza yükleyip
güvenilir yap (iOS: Ayarlar → Genel → Hakkında → Sertifika Güven Ayarları).

## Kullanım

| İşlem                      | Nasıl yapılır                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| Dosya açmak                | **Dosya aç** ya da dosyayı pencereye sürükle                                               |
| Yazıya dökmek              | Transkript panelinde **Yazıya dök**; dosya açılınca kendiliğinden başlamaz                 |
| Mikrofonla kayıt           | Alttaki kırmızı düğme ya da **R**                                                          |
| Dökümü durdurmak           | Alt çubukta **Durdur**; sürdürmek için **Devam et**, bırakmak için **İptal**               |
| Oynat / duraklat           | **Boşluk** ya da görüntüye tıkla                                                           |
| 5 sn geri / ileri          | **←** / **→**                                                                              |
| Tam ekran                  | **F** ya da görüntüye çift tıkla                                                           |
| Logo eklemek               | Sağ panelde **Altyazı → Logo → Bilgisayarından logo ekle**                                 |
| Kadraj                     | Oynatıcının üstünde kırpma düğmesi ya da **C**; **Enter** uygular, **Esc** vazgeçer        |
| Bölüm seçmek (kesme)       | Zaman çizelgesinin sonunda **Kes**, uçları sürükle, **Tamam**; oynatırken **I** / **O**    |
| Satırı düzenlemek          | Satıra çift tıkla, **Enter** kaydeder, **Esc** vazgeçer                                    |
| Geri al                    | **⌘Z** / **Ctrl+Z**                                                                        |
| Otomatik noktalama         | Sağ panelde **Noktalama ve büyük harf → Otomatik ekle** (varsayılan açık; tercih saklanır) |
| Noktalamayı elle uygulamak | Döküm bitince aynı bölümde **Şimdi uygula**                                                |
| Dışa aktarmak              | Sağ üstte **Dışa aktar**                                                                   |
| Kayıtlı projeyi açmak      | **Projeler** menüsü ya da boş ekrandaki **Son projeler**                                   |
| Proje adını değiştirmek    | Üstteki proje adına tıkla, **Enter** kaydeder, **Esc** vazgeçer                            |
| Proje dosyası              | **Projeler → Projeyi dosya olarak indir**; açmak için **Dosya aç** ya da sürükle-bırak     |
| Modelleri yönetmek         | Üst çubukta **Ayarlar → Modeller**                                                         |
| Sürüm ve bağlantılar       | **Ayarlar → Hakkında**                                                                     |

## Performans

Apple Silicon (Metal), Chrome, dil modeliyle beam search:

| İşlem                   | Ölçüm                                                               |
| ----------------------- | ------------------------------------------------------------------- |
| Yazıya döküm            | gerçek zamanın ~12 katı (encoder ~38 ms / 0,64 sn'lik parça)        |
| Videoya altyazı yazma   | 640×360 videoda ~70 kare/sn; sesten 1080p video ~3 kat gerçek zaman |
| İlk açılış              | ~105 MB indirme, sonrası önbellekten                                |
| İlk noktalama kullanımı | ek ~60 MB indirme, sonrası önbellekten                              |

Ölçümler kısa test kayıtlarıyla yapıldı; uzun ve yüksek çözünürlüklü dosyalarda farklı olabilir.

Model kartındaki doğruluk değerleri (WER, düşük olan iyi):

| Test seti            | Hızlı | Dengeli | En doğru  |
| -------------------- | ----- | ------- | --------- |
| FLEURS-TR            | 15,14 | 14,24   | **11,52** |
| Common Voice 27.0 TR | 16,32 | 15,59   | **13,61** |
| ISSAI TSC            | 16,00 | 15,72   | **15,23** |

## Yayına alma

`npm run build` sonrası `dist/` herhangi bir statik sunucudan yayınlanabilir. Gerekli başlıklar ve Cloudflare
Pages + R2 kurulumu için [docs/DEPLOY.md](docs/DEPLOY.md).

Uygulama bir web manifest'i ile gelir; Chrome ve Edge'de adres çubuğundan masaüstü uygulaması olarak
kurulabilir.

## Geliştirme

```bash
npm run typecheck  # TypeScript kontrolü
npm run test:whisper -- kayit.wav   # Whisper motorunu Node'da dener (16 bit WAV)
npm run test:turkish                # Türkçe yazım kurallarını dener (model gerekmez)
npm run eval:punct                  # noktalamayı Vikipedi metniyle ölçer (puan verir, model gerekir)
npm run test:numbers                # sayıları rakama çevirme kurallarını dener
npm run eval:numbers                # rakama çevirmeyi Vikipedi metniyle ölçer (puan verir)
npm run test:translate -- ref.json  # çeviriyi Python referansıyla karşılaştırır (scripts/make_mt_refs.py)
npm run build      # üretim derlemesi
npm run preview    # derlemeyi lokalinde önizle
```

Arayüz [Tailwind CSS v4](https://tailwindcss.com) ile yazılır (`@tailwindcss/vite` eklentisi):

- `src/index.css`: Tailwind'in giriş dosyası. Preflight (sıfırlama stilleri) kullanılmaz; tasarım
  değişkenleri `@theme` ile Tailwind'e bağlanır (`bg-pane`, `text-fg-2`, `border-line`, `bg-cini`,
  `text-firuze`, `rounded-ui` ...). Animasyonlar ve kaydırıcı / anahtar stilleri de buradadır.
- `src/styles.css`: renk ve yazı tipi değişkenleri ile temel eleman stilleri.
- `src/components/ui.tsx`, `Menu.tsx`, `Dropzone.tsx`, `Indicators.tsx`: ortak bileşenler (düğmeler,
  paneller, form satırları, açılır menüler).

## Bilinen sınırlar

- Altyazılı video oluşturulurken diske yazılır, uzun videolarda da bellek dolmaz: Chrome ve Edge önce kaydedilecek
  yeri sorar, diğer tarayıcılar videoyu tarayıcının kendi disk alanında hazırlayıp indirir. Sayfa ağdan `http://`
  ile açıldığında bu ikisi de kullanılamaz, video bellekte oluşturulur.
- Düzenleme metinle sınırlı; kelime zamanlarını elle kaydırmak yok.
- Kesme tek bölümle sınırlı; aradan parça çıkarmak (jump cut) yok. Bölüm dökümden sonra genişletilirse eksik
  kısım için yeniden yazıya dökmek gerekir.
- Kadraj videonun tamamı için sabittir; zamanla kayan kadraj yok. **Sığdır**'da videonun karedeki boyutu ve
  konumu değiştirilemez.
- Seslendirmede her modelin tek sesi var ve orijinal sesin tamamı (müzik, ortam sesi) kalkar. Konuşmacılar ayrılmaz,
  dudak hareketleriyle eşleşmez. Seslendirme projeye kaydedilmez.
- Çeviri yalnızca İngilizceye. Çevrilmiş kelimelerin kendi zamanı yok, bu yüzden "Sesle vurgula" çeviride
  çalışmaz. Yemek adları, özel adlar ve argo yanlış çevrilebilir. Seslendirme her zaman Türkçe transkripti okur.
- Ses dosyalarından üretilen MP4'te ses AAC ile kodlanır; tarayıcı AAC kodlayamıyorsa Opus kullanılır.
  Opus'lu MP4'ü QuickTime ve iPhone Fotoğraflar açmayabilir (Chrome, VLC ve sosyal platformlar açar).

## Yapılacaklar

Önerilen öncelik sırasıyla:

- [x] **Projeyi kaydetme ve geri açma:** transkript ve düzeltmeler için otomatik yerel kayıt;
      projeyi dosya olarak indirip yeniden açma.
- [ ] **Kelime zamanlarını düzenleme:** başlangıç ve bitiş zamanlarını değiştirme;
      tüm altyazıya toplu zaman kaydırma.
- [x] **Uzun video dışa aktarma:** büyük çıktıları belleği tüketmeden doğrudan diske yazma.
- [x] **Noktalama için Türkçe testleri:** özel ad ekleri, birleşik adlar, soru cümleleri ve tekrar uygulama;
      Vikipedi metniyle kesme işareti, büyük harf ve noktalama ölçümü.
- [x] **Sayıları rakama çevirme seçeneği:** "bin dokuz yüz yirmi üç" → "1923";
      kurala göre, hepsi rakamla ya da dokunma; tarih ve saat her zaman rakamla.
- [x] **Transkriptte bul ve değiştir:** yanlış tanınan bir kelimeyi veya ismi bütün kayıtta düzeltme.
- [x] **SRT / VTT içe aktarma:** hazır altyazıyı açıp stillendirme ve videoya yazma.
- [x] **Dikey video ve bölüm seçme:** kadraj (Doldur / Sığdır), kesme ve yalnızca seçili bölümü yazıya dökme.
- [ ] **Jump cut:** sessizlikleri ve dolgu kelimeleri ("ııı", "şey") kesme; transkriptten kesme.
- [ ] **Değişken yazı tipleri için kalınlık ve italik:** yüklenen ve hazır değişken yazı tiplerinde kalınlık
      kaydırıcısı (yazı tipinin kendi aralığında) ve italik anahtarı.

---

## Lisanslar ve teşekkür

Harfiyen [MIT](LICENSE) lisanslıdır; dilediğin gibi kullanabilir, değiştirebilir ve dağıtabilirsin. Bir yerde kullanırsan ya da işine yararsa haber vermen ya da adını anman beni çok sevindirir, ama zorunlu değil.

Lisans Harfiyen'in kendi kodunu kapsar. Aşağıdaki model, veri ve kütüphaneler kendi lisanslarıyla gelir:

- Konuşma tanıma modeli [atasoglu/seda-v0.1](https://huggingface.co/atasoglu/seda-v0.1): Apache-2.0.
- [KaanAydinli/Duyu-small](https://huggingface.co/KaanAydinli/Duyu-small): Apache-2.0.
- [openai/whisper-large-v3-turbo](https://huggingface.co/openai/whisper-large-v3-turbo) (MIT), ONNX
  sürümü [onnx-community](https://huggingface.co/onnx-community/whisper-large-v3-turbo_timestamped);
  kelime zamanlama [openai-whisper](https://github.com/openai/whisper)'dan (MIT) uyarlandı.
- [Silero VAD](https://github.com/snakers4/silero-vad) v5: MIT.
- Çeviri modeli [Helsinki-NLP/opus-mt-tc-big-tr-en](https://huggingface.co/Helsinki-NLP/opus-mt-tc-big-tr-en)
  (OPUS-MT, Tatoeba Challenge): CC-BY 4.0. ONNX'e `scripts/prepare_models.py` ile dönüştürülür.
- Seslendirme modeli [canberkkkkkk/ema-lightning](https://huggingface.co/canberkkkkkk/ema-lightning):
  Apache-2.0; metin normalleştirme [normalizer-tr](https://github.com/erdemtuna/normalizer-tr) (Apache-2.0).
- İkinci seslendirme modeli Antalia-2 Mini, Patientdesk.ai,
  [cloud0day3/antalia-mini](https://huggingface.co/cloud0day3/antalia-mini): Apache-2.0 (kod, metin işleme ve
  ağırlıklar). `src/tts/antalia-mini/` altındaki iki dosya modelin Space'inden değiştirilmeden alındı.
- Üçüncü seslendirme modeli [ozgurguler/ahenk-cep-tr](https://huggingface.co/ozgurguler/ahenk-cep-tr):
  ağırlıklar CC BY 4.0. EMA Lightning (Apache-2.0) mimarisinde, Alania verilerinden (PatientDesk AI, CC BY 4.0)
  türeyen Ahenk sesinden öğrenmiş küçük model. Okuma adımları ve metin normalleştirme (`src/tts/trnorm/`)
  [ozguradmin/ahenk-turkish-tts](https://github.com/ozguradmin/ahenk-turkish-tts)'ten (Apache-2.0) uyarlandı.
- Dil modeli dosyaları (`rnnlm`, `2gram`): CC BY-SA 4.0 (Türkçe Vikipedi üzerinde eğitildi).
- Noktalama ölçüm metinleri (`tests/data/`): Türkçe Vikipedi, CC BY-SA 4.0; kaynak makaleler dosyalarda.
- Algoritmalar [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)'ten (Apache-2.0) uyarlandı.
- [ONNX Runtime Web](https://onnxruntime.ai) (MIT), [mediabunny](https://mediabunny.dev) (MPL-2.0),
  [React](https://react.dev) (MIT), [Tailwind CSS](https://tailwindcss.com) (MIT).
- Yazı tipleri: SIL Open Font License 1.1.
