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
[Whisper large-v3 turbo](https://huggingface.co/openai/whisper-large-v3-turbo) da seçilebilir. Bir video ya da ses dosyası yüklersin, kelimeler
zaman kodlarıyla belirir, istediğin altyazı stilini seçersin ve altyazılı videoyu indirirsin. Mikrofonla
konuşurken de canlı çalışır.

## Neler yapabilir

### Yazıya döküm

- Video ve ses dosyaları: MP4, MOV, MKV, WebM, MP3, M4A, WAV, FLAC, OGG. Uzun dosyaları parça parça işler,
  bellek şişmez.
- Canlı mikrofon: kelimeler konuştuktan yaklaşık bir saniye sonra belirir, kayıt aynı anda saklanır.
- İki model, üst çubuktan seçilir:
  - **Seda** (varsayılan, ~105 MB): küçük ve hızlı, canlı mikrofonda ve her cihazda çalışır. Üç doğruluk
    ayarı var: **Hızlı**, **Dengeli** ve dil modeliyle **En doğru**.
  - **Whisper Turbo** (~1,5 GB) ve **Whisper Turbo Hafif** (~600 MB, 4 bit encoder): daha az hata,
    noktalamayı, büyük harfleri ve rakamları kendisi yazar. Hafif sürüm zor seste biraz daha fazla hata
    yapabilir. Yalnızca dosyalarda ve ekran kartında (WebGPU, `shader-f16`) çalışır; sesi 30 saniyelik
    parçalar hâlinde işler. Sessiz bölümlerde metin uydurmaması için ses etkinliği algılayıcı (Silero VAD)
    kullanır.
- Otomatik noktalama ve büyük harf: döküm bitince nokta, virgül ve soru işareti eklenir; cümle başları
  ve özel adlar büyük harfle yazılır. Türkçe özel ad ekleri için kesme işareti eklenir ("İstanbul'da",
  "Van Gölü'nün"); yapım ve çokluk ekleri TDK'ya göre ayrılmaz ("İstanbullu", "Ahmetler").
  Kelime zamanları korunur; işlem ⌘Z / Ctrl+Z ile geri alınabilir.
- Kelime düzeyinde zaman: bir kelimeye tıkla, kayıt o ana atlasın; çalarken konuşulan kelime vurgulanır.
- Düzenleme: satıra çift tıkla ve düzelt, satırı sil, ⌘Z ile geri al. Değişmeyen kelimelerin zamanları
  korunur.
- Bul ve değiştir (⌘F / Ctrl+F): yanlış tanınan bir kelimeyi ya da ismi bütün transkriptte düzelt. Büyük/küçük
  harfe bakmaz, istenirse yalnızca tam kelimeleri bulur.
- SRT ve VTT açma: hazır altyazı açılıp stillendirilir ve videoya yazılır. Satırlar ve zamanlar korunur;
  düzeltilen altyazı aynı satırlarla yeniden indirilebilir. UTF-8 dışında Windows-1254 kodlu dosyalar da
  okunur.

### Altyazı

- Yedi stil: **Klasik**, **Karaoke** (söylenen kelimeler belirginleşir), **Akış** (kelimeler söylendikçe
  yerinde belirir), **Vurgu** (konuşulan kelime renkli kutuda), **Pop** (ortada iri, zıplayan kelimeler),
  **Tek kelime** (ortada yalnızca söylenen kelime), **Sade**.
- Sekiz yazı tipi, hepsi Türkçe karakterlerin tamamıyla: Google Sans Flex, Montserrat, Poppins, Inter,
  Anton, Bebas Neue, Schibsted Grotesk, Literata.
- Boyut, konum, zemin (kutu, kontur, gölge), yazı ve vurgu rengi, Türkçe kurallarına uygun büyük harf
  (i → İ).

### Görüntü ve dışa aktarma

- WebGPU oynatıcı: önizlemede gördüğün, dışa aktarılan videonun birebir aynısıdır.
- Altyazılı MP4: kareler ekran kartında birleştirilir, video H.264 ya da HEVC olarak kodlanır, ses kopyalanır.
  Tarayıcı destekliyorsa ekran kartı, desteklemiyorsa işlemci kullanılır; menü hangisinin kullanılacağını gösterir.
- Dışa aktarırken çözünürlük (kaynakla aynı ya da daha küçük: 1080p, 720p) ve kalite seçilir; tahmini dosya
  boyutu seçim yapılırken görünür.
- Ses dosyaları ve kayıtlar için **aura**: sesle hareket eden yumuşak bir gradyan ve sakin bir ses
  görselleştirmesi. Bunlar da altyazılı MP4 olarak 720p, 1080p ya da 4K dışa aktarılabilir.
- SRT, WebVTT, düz metin, kelime zamanlı JSON ve panoya kopyalama.

### Seslendirme

- Transkript, [EMA Lightning](https://huggingface.co/canberkkkkkk/ema-lightning) ya da
  [Antalia Mini](https://huggingface.co/cloud0day3/antalia-mini) ile yapay bir Türkçe sesle yeniden okunur. Her
  altyazı satırı kendi zamanında başlar; yerine sığmayan satır en fazla 1,35 kat hızlı okunur.
- Ses tonu yarım ton adımlarla kalınlaştırılıp inceltilebilir; satırların süresi değişmez. Seed aynı sesi farklı
  bir vurguyla okutur. Ayarlar seslendirmeden önce ilk satırla dinlenebilir.
- Açıkken oynatıcı ve altyazılı MP4 orijinal ses yerine yapay sesi kullanır. Ses ayrıca WAV olarak
  indirilebilir. Modeller ilk kullanımda indirilir: EMA Lightning yaklaşık 36 MB, Antalia Mini 23 MB.

### İngilizce çeviri

- Transkript, [opus-mt-tc-big-tr-en](https://huggingface.co/Helsinki-NLP/opus-mt-tc-big-tr-en) ile cümle cümle
  İngilizceye çevrilir. Her cümle Türkçesinin zamanında görünür; kelimeleri o süreyi uzunluklarına göre paylaşır.
- Transkriptin üstündeki **TR / EN** ile gösterilen dil seçilir: altyazı, zaman çizelgesi, SRT/VTT/metin ve
  altyazılı MP4 o dilde olur (dosya adına `.en` eklenir). Çeviri de düzenlenebilir, bulup değiştirilebilir.
- Çeviri projeyle birlikte kaydedilir. Transkript sonradan değişirse çevirinin eskidiği söylenir.
  Model ilk kullanımda yaklaşık 360 MB indirir ve işlemcide (WASM) çalışır.

### Projeler

- Otomatik kayıt: transkript, düzeltmeler, altyazı stili ve dalga formu tarayıcıda (IndexedDB) saklanır;
  sekme kapansa da kaybolmaz.
- Son projeler **Projeler** menüsünde ve boş ekranda listelenir; tek tıkla model yeniden çalışmadan açılır.
  Projeler yeniden adlandırılabilir ve silinebilir.
- Medya kopyalanmadan bağlanır: Chrome ve Edge dosyanın kendisine erişim izni saklar, diğer tarayıcılar
  1 GB'a kadar dosyaların kopyasını tutar. Tarayıcı izin isterse ya da dosya bulunamazsa tek düğmeyle yeniden
  bağlanır; kelime zamanları korunur.
- **.harfiyen** proje dosyası: projeyi dosya olarak indir, başka zaman ya da başka tarayıcıda aç. Medya
  dosyası içine eklenmez, açarken bir kez seçilir.

> Konuşma tanıma modeli küçük harfli, noktalamasız metin üretir; noktalama ve büyük harf ayrı bir modelle
> sonradan eklenir. Sayılar yazıyla kalır ("bin dokuz yüz yirmi üç").

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
önbellekten, internetsiz çalışır. Whisper Turbo seçilirse ilk dosyada ayrıca yaklaşık 1,5 GB (Hafif: 600 MB) indirilir. Noktalama ilk kullanıldığında ayrıca yaklaşık 60 MB, İngilizce çeviri yaklaşık 360 MB indirilir ve
önbelleğe alınır. Ses ve metin işlenmek için sunucuya gönderilmez.

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
| Mikrofonla kayıt           | Alttaki kırmızı düğme ya da **R**                                                          |
| Oynat / duraklat           | **Boşluk** ya da görüntüye tıkla                                                           |
| 5 sn geri / ileri          | **←** / **→**                                                                              |
| Tam ekran                  | **F** ya da görüntüye çift tıkla                                                           |
| Satırı düzenlemek          | Satıra çift tıkla, **Enter** kaydeder, **Esc** vazgeçer                                    |
| Geri al                    | **⌘Z** / **Ctrl+Z**                                                                        |
| Otomatik noktalama         | Sağ panelde **Noktalama ve büyük harf → Otomatik ekle** (varsayılan açık; tercih saklanır) |
| Noktalamayı elle uygulamak | Döküm bitince aynı bölümde **Şimdi uygula**                                                |
| Dışa aktarmak              | Sağ üstte **Dışa aktar**                                                                   |
| Kayıtlı projeyi açmak      | **Projeler** menüsü ya da boş ekrandaki **Son projeler**                                   |
| Proje adını değiştirmek    | Üstteki proje adına tıkla, **Enter** kaydeder, **Esc** vazgeçer                            |
| Proje dosyası              | **Projeler → Projeyi dosya olarak indir**; açmak için **Dosya aç** ya da sürükle-bırak     |

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

---

## Lisanslar ve teşekkür

- Konuşma tanıma modeli [atasoglu/seda-v0.1](https://huggingface.co/atasoglu/seda-v0.1): Apache-2.0.
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
- Dil modeli dosyaları (`rnnlm`, `2gram`): CC BY-SA 4.0 (Türkçe Vikipedi üzerinde eğitildi).
- Noktalama ölçüm metinleri (`tests/data/`): Türkçe Vikipedi, CC BY-SA 4.0; kaynak makaleler dosyalarda.
- Algoritmalar [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)'ten (Apache-2.0) uyarlandı.
- [ONNX Runtime Web](https://onnxruntime.ai) (MIT), [mediabunny](https://mediabunny.dev) (MPL-2.0),
  [React](https://react.dev) (MIT), [Tailwind CSS](https://tailwindcss.com) (MIT).
- Yazı tipleri: SIL Open Font License 1.1.
