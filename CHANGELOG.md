# Neler değişti

Yeni sürümler en üstte.

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
