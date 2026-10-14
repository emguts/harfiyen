# Neler değişti

Yeni sürümler en üstte.

## v0.3.0 (14 Ekim 2026)

- **İngilizce çeviri:** Transkript cümle cümle İngilizceye çevrilir; her cümle Türkçesinin zamanında
  görünür. Transkriptin üstündeki TR / EN ile altyazı, dışa aktarma ve video istenen dilde olur. Çeviri
  düzenlenebilir ve projeyle birlikte kaydedilir. Çeviri de tarayıcıda yapılır, metin bilgisayarından
  çıkmaz.
- **Ayarlar ve model yönetimi:** Yeni Ayarlar penceresinde hangi modelin indirildiğini, ne kadar yer
  kapladığını görebilir; modelleri tek tek indirip silebilirsin. Bu cihaza uygun modellerin hepsi tek
  düğmeyle indirilebilir. Silmek için artık tarayıcının site verilerini (ve onunla projelerini)
  temizlemen gerekmez.
- **Kaldığı yerden devam eden indirme:** Büyük modeller parça parça iner. Bağlantı koparsa ya da sekme
  kapanırsa indirme baştan değil, kaldığı yerden sürer.
- **Yeni altyazı stilleri:** Akış, Tek kelime, Dolgu, Netleş, Cam ve Odak. Stiller Sakin, Vurgulu ve İri
  diye gruplara ayrıldı. Cam'da arkadaki video buzlu camla bulanıklaşır; Odak ve Netleş'te kelimeler
  bulanıktan netleşir.
- **Sesle vurgula:** Yüksek sesle söylenen kelimeler altyazıda büyür ve vurgu renginde yazılır.
- **Yazı tipleri:** Bangers ve Luckiest Guy eklendi. Kendi yazı tipini de (TTF, OTF, WOFF, WOFF2)
  yükleyebilirsin.
- **Sayı yazımı:** Sayılar kurala göre ya da hepsi rakamla yazılır; istersen hiç dokunulmaz. Ekler, sıra
  sayıları, tarih ve saat de doğru yazılır ("15.30'da"). Düğme hangi sayıların değişeceğini gösterir.
- **Video çıktısı:** Dışa aktarırken video kodlamasını (H.264 ya da HEVC), çözünürlüğü (kaynakla aynı,
  1080p ya da 720p) ve kaliteyi seçebilirsin; dosya boyutu baştan tahmin edilir. Büyük videolar belleğe değil diske yazılır.
  Tarayıcının açamadığı video kodlamaları işe başlamadan bildirilir.
- **Daha isabetli kelime zamanları:** Seda'nın yaklaşık 150 ms'lik gecikmesi düzeltildi. Whisper cümle
  başındaki ve sonundaki sessizliği artık kelimeye katmıyor, altyazı konuşmaya daha iyi oturuyor.
- **Noktalama:** Özel adlardaki kesme işareti kuralları düzeltildi, tanınan yer adı listesi genişletildi.
- **Düzeltmeler:** Safari'de proje silinemiyordu, düzeltildi. Proje silme onayı artık tarayıcının açılır
  penceresinde değil, listenin içinde soruluyor. İndirilen model dosyaları kullanılmadan önce
  doğrulanıyor; bozuk ya da yarım kalmış bir dosya yeniden indiriliyor.

## v0.2.0 (12 Ekim 2026)

- **Seslendirme:** Transkript, [EMA Lightning](https://huggingface.co/canberkkkkkk/ema-lightning) ya da
  [Antalia Mini](https://huggingface.co/cloud0day3/antalia-mini) ile yapay bir Türkçe sesle yeniden okunur.
  Her satır kendi zamanında başlar. Oynatıcı ve altyazılı video yapay sesi kullanabilir, ses WAV olarak da
  indirilebilir.
- **Bul ve değiştir (⌘F / Ctrl+F):** Yanlış tanınan bir kelimeyi ya da ismi bütün transkriptte tek seferde
  düzelt. Büyük/küçük harfe bakmaz, Türkçe harfleri doğru eşler; istersen yalnızca tam kelimeleri bulur.
  Değiştirme tek adımda geri alınır.
- **SRT ve VTT açma:** Hazır altyazıyı aç, stilini seç, videoya yaz. Açık bir video varsa altyazı ona
  bağlanır. Altyazının satırları ve zamanları korunur; düzeltip yeniden SRT ya da VTT olarak indirebilirsin.
  Eski Windows araçlarıyla kaydedilmiş Türkçe dosyalar da doğru okunur.

## v0.1.0 (11 Ekim 2026)

İlk herkese açık sürüm. Harfiyen, Türkçe konuşmayı tarayıcıda yazıya döker ve altyazıyı videonun içine
yazar. Ses ve video bilgisayarından çıkmaz.

- **Tarayıcıda yazıya döküm:** [seda-v0.1](https://huggingface.co/atasoglu/seda-v0.1) modeli ekran
  kartında (WebGPU) çalışır. WebGPU yoksa işlemciye geçilebilir.
- **Whisper Turbo ve Whisper Turbo Hafif:** Daha az hata yapar, noktalamayı ve rakamları kendisi yazar.
  Yalnızca dosyalarda ve WebGPU ile çalışır.
- **Dosyalar:** MP4, MOV, MKV, WebM, MP3, M4A, WAV, FLAC, OGG. Uzun dosyalar parça parça işlenir.
- **Canlı mikrofon:** Konuşurken kelimeler yaklaşık bir saniye sonra belirir (Seda modeliyle).
- **Otomatik noktalama ve büyük harf:** Özel ad eklerine kesme işareti de eklenir ("İstanbul'da").
  ⌘Z / Ctrl+Z ile geri alınabilir.
- **Altyazı stilleri:** Altyazılı video olarak dışa aktarılabilir.
- **Projeler:** Kaydedilir, sonra kaldığın yerden açılır.
