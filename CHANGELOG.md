# Neler değişti

Yeni sürümler en üstte.

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
