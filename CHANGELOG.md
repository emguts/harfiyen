# Neler değişti

Yeni sürümler en üstte.

## Yayımlanmadı

- **Seda v0.2:** Seda, [seda-v0.2](https://huggingface.co/atasoglu/seda-v0.2)'ye geçti. Daha çok veriyle eğitildi;
  daha az hata yapıyor, özellikle gürültülü, yankılı ve telefon kalitesindeki seste. Dil modeli daha büyük. Eski v0.1
  dosyaları **Ayarlar**'dan silinebilir. Lisansı CC BY-SA 4.0.
- **Dosyalarda daha doğru Seda:** Dosyalar modelin 5,12 saniyelik parçalarla çalışan `final` sürümüyle, sekiz yollu
  aramayla yazıya dökülür (FLEURS-TR'de %6,4 hata). Mikrofon anında yazmak için 0,64 saniyelik parçalarla devam
  eder. İlk indirme yaklaşık 190 MB.
- **Duraklamada kesinleşen cümleler:** Seda cümle sonlarını 1,2 saniyelik sessizlik kuralı yerine ses etkinliği
  algılayıcıyla (Silero VAD) bulur; canlı kayıtta kısa bir duraklamada metin kesinleşir. Uzun konuşmalar
  duraklamalarda bölünür.
- **Çevir ve seslendir:** Çeviri gereken seslendirmede iki buton yerine tek buton var; önce çevirir, sonra okur.
  Çeviri modelinin indirilmesi, çeviri ve seslendirme aynı yerde yüzde ve ilerleme çubuğuyla görünür, **Durdur** ile
  durdurulabilir.
- **İngilizce videolar:** Yazıya dökmeden önce videodaki dil (Türkçe ya da İngilizce) seçilir; İngilizce videolar
  Whisper ile İngilizce yazıya dökülür, altyazı ve SRT/VTT İngilizce olur, Supertonic ile İngilizce seslendirilebilir.
  Dil projeyle saklanır. Eskiden İngilizce konuşma Türkçe sanılıp bozuk yazılıyordu.
- **İngilizceden Türkçeye çeviri:** İngilizce videonun transkripti
  [opus-mt-tc-big-en-tr](https://huggingface.co/Helsinki-NLP/opus-mt-tc-big-en-tr) ile Türkçeye çevrilir (yaklaşık
  360 MB, ilk kullanımda iner). Türkçe altyazı ve Türkçe seslendirme (voice-over) yapılabilir.
- **Seslendirme projeyle saklanır:** Proje yeniden açılınca seslendirme yeniden yapılmadan hazırdır; ses ayarı da
  onunla gelir. Transkript ya da çeviri sonradan değiştiyse eskidiği söylenir. Proje silinince seslendirmesi de
  silinir.
- **Altyazısız video:** Altyazı sekmesindeki **Altyazıyı göster** kapatılınca oynatıcıda ve dışa aktarılan videoda
  altyazı olmaz; varsa kadraj, logo ve seslendirme kalır. Dosya adı `.altyazili.mp4` yerine `.seslendirme.mp4` (ya da
  `.mp4`) olur. Seçim projeyle saklanır; yeni projeler altyazılı başlar.
- **Açık tema:** **Ayarlar → Görünüm**'den Sistem, Açık ya da Koyu seçilir. Varsayılan sistemin teması; sistem
  teması değişince uygulama da değişir. Oynatıcının çevresi videonun renkleri doğru görünsün diye her iki temada da
  koyu kalır.
- **İngilizce seslendirme (voice-over):** Seslendirme sekmesinde dil İngilizce seçilince çeviri
  [Supertonic 3](https://huggingface.co/Supertone/supertonic-3) ile okunur (203 MB, ilk kullanımda iner). Her
  cümle Türkçesinin başladığı anda başlar. On ses var: Alex, James, Robert, Sam, Daniel, Sarah, Lily, Jessica,
  Olivia, Emily. Supertonic Türkçe de okur; Türkçe seslendirmede dördüncü ses olarak seçilebilir.
- **Orijinal ses seviyesi:** Seslendirme açıkken orijinal ses %0 ile %50 arasında altta duyulabilir; oynatıcıda ve
  altyazılı MP4'te aynı karışım kullanılır.
- **Altyazı seslendirmeyi takip eder:** Altyazı seslendirmeyle aynı dildeyse her cümle sesinin başladığı ve bittiği
  anda görünür; SRT/VTT ve altyazılı MP4 de bu zamanları kullanır.
- **Seslendirme videoya sığar:** Modellerin cümle başına ve sonuna koyduğu sessizlik kırpılıyor, seslendirme zamanla
  geride kalmıyor. Videonun sonuna taşan cümleler geriye kayar ve gerekirse biraz hızlanır; yine sığmazsa uyarı
  çıkar, **Cümleye git** ve seçili bölümde **Bölümü uzat** ile düzeltilir.
- **Kırpma düğmeleri:** Seçili oranın ve modun üstüne gelince yazı artık kaybolmuyor.
- **Logo:** Altyazı sekmesinden kendi logonu (PNG, SVG, WebP ya da JPEG) ekleyebilirsin. Seçtiğin köşede durur;
  boyutu ve saydamlığı ayarlanır. Önizlemede ve altyazılı videoda aynı görünür, kadrajlı videoda yeni kareye
  göre yerleşir. Logo bu tarayıcıda saklanır ve sonraki projelerde de hazırdır; her projede gizlenebilir.
- **Kadraj:** Oynatıcının üstündeki kırpma düğmesiyle (ya da **C**) video 9:16, 4:5, 1:1, 16:9 ya da serbest
  oranda kadrajlanır. **Doldur** kareyi kaplar; kutu sürüklenir, köşelerinden boyutlandırılır, taşan kısım
  kesilir. **Sığdır** videonun tamamını karenin içine sığdırır; boşluklar bulanık ya da siyah olur. Altyazı
  yeni kareye göre yerleşir, kadraj projeyle birlikte saklanır. 4K yatay videodan dikey Reels çıkarmak için:
  9:16'da dışa aktarma 1080×1920 önerir.
- **Kes:** Zaman çizelgesinin sonundaki **Kes** düğmesiyle videonun kullanılacak bölümü seçilir; uçlar
  sürüklenir ya da oynatırken **I** ve **O** ile işaretlenir. Yalnızca o bölüm yazıya dökülür, oynatılır ve dışa
  aktarılır; video ve SRT/VTT zamanları 0:00'dan başlar. 20 dakikalık videodan 30 saniye seçilince yalnızca
  30 saniye işlenir.
- **Yazıya döküm düğmeyle başlar:** Dosya açılınca hemen dökülmez; önce kadraj ve bölüm seçilebilir, sonra
  **Yazıya dök**. Yeniden dökmek yeni proje açmaz; eski transkript ⌘Z ile geri gelir.
- **Ses grafiği hemen görünür:** Dosya açılınca ses grafiği çizilir, bölüm seçerken konuşmanın yeri görülür.
  Henüz dökülmemiş kısım soluk, döküm ilerledikçe dökülen kısım rengine kavuşur.
- **Seslendirme modeli** açılır listeden seçiliyor; listede her sesin boyutu ve kısa açıklaması görünür.
- **Yeni ses Ahenk Cep:** Seslendirmeye üçüncü ses olarak
  [Ahenk Cep](https://huggingface.co/ozgurguler/ahenk-cep-tr) eklendi. 18 MB, ekran kartı istemez. Rakamları,
  tarihleri ve kısaltmaları diğer seslerden daha doğru okur ("Dr.", "TBMM'de"); biraz daha yavaştır.

## v0.3.0 (15 Ekim 2026)

- **Yeni model Duyu:** [Duyu-small](https://huggingface.co/KaanAydinli/Duyu-small) eklendi. 85 MB,
  ekran kartı istemez; noktalama ve büyük harfi kendisi yazar. İşlemcide çalışır, canlı kayıtta
  kullanılmaz.
- **Durdur, devam et, iptal:** Yazıya dökme durdurulup sonra kaldığı yerden sürdürülebilir; sayfa
  yenilense de kalınan yer unutulmaz. Yanlış dosya İptal ile bırakılır, uzun işlerde önce onay sorulur.
  Döküm sürerken önizleme yazılanı takip eder; oynatınca ya da sarınca takip durur.
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
- **Sesle vurgula:** Yüksek sesle söylenen kelimeler altyazıda büyür ve vurgu renginde yazılır. Yeni
  projeler kapalı başlar.
- **Stil değişince ayarlar korunur:** Elle değiştirdiğin zemin, renk, boyut gibi ayarlar başka stile
  geçince kaybolmaz. **Stilin varsayılanlarına dön** ile stilin kendi görünümüne dönülür.
- **Altyazı ortalaması:** Altyazı artık büyük harflerin yüksekliğine göre ortalanıyor; kutunun içinde aşağıda
  durmuyor. Her yazı tipinde aynı şekilde çalışır.
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
- **Hakkında ve lisans:** Ayarlar'da sürümü ve bağlantıları gösteren Hakkında bölümü var. Harfiyen artık MIT
  lisanslı.
- **Mobil:** Telefonda model, işlemci ve ayarlar düğmeleri tek bir **⋯** menüsünde toplandı.
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
