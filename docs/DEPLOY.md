# Yayına alma

Canlı sürüm [harfiyen.dev](https://harfiyen.dev) adresinde Cloudflare Pages'te çalışır; modeller
`cdn.harfiyen.dev` alt alan adına bağlı bir R2 bucket'ından gelir. Aşağıdaki adımlar kendi kopyanı yayınlamak
içindir; `YOUR-DOMAIN` gibi yer tutucuları kendi adreslerinle değiştir.

## Statik sunucu

`npm run build` sonrası `dist/` herhangi bir statik sunucudan yayınlanabilir; model dosyaları `dist/models/`
altında uygulamayla birlikte gider. Sunucunun şu iki başlığı göndermesi gerekir (geliştirme sunucusu zaten
gönderiyor):

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

## Cloudflare Pages ve R2

Pages'te build komutu `npm run build`, çıktı klasörü `dist` olmalıdır. `public/_headers` gerekli başlıkları
derlemeye ekler. Kendi alan adını Pages projesinin **Custom domains** bölümünden bağlayabilirsin.

Pages'in dosya boyutu sınırı nedeniyle modeller ve büyük ONNX Runtime WASM dosyası R2'de barındırılır.
Bucket'a **Settings → Custom Domains** bölümünden bir alt alan adı bağla (ör. `cdn.YOUR-DOMAIN`); `r2.dev`
adresi hız sınırlıdır ve üretim için önerilmez. Build ortamına şu değişkenleri ekle:

```text
VITE_MODELS_BASE_URL=https://cdn.YOUR-DOMAIN/models
VITE_ORT_WASM_URL=https://cdn.YOUR-DOMAIN/runtime/ort-wasm-simd-threaded.asyncify.wasm
```

Değişkenler build sırasında koda gömülür; değiştirdikten sonra yeni bir build gerekir.
`VITE_ORT_WASM_URL` tanımlandığında büyük WASM dosyası Pages çıktısına eklenmez. Değişkenler tanımlanmazsa
yerel dosyalar kullanılır.

### Dosyaları R2'ye yükleme

R2'ye `public/models/` içeriğini `models/` altında, kullanılan ONNX Runtime sürümüne ait
`node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm` dosyasını `runtime/` altında yükle.
Bunu `npm run upload-models` yapar (`boto3` gerekir): yalnızca uygulamanın indirdiği dosyaları gönderir,
büyük dosyaları parça parça yükler, bucket'ta aynısı olanları atlar. `--dry-run` neyin gideceğini gösterir.
R2 bilgilerini `.env.local` dosyasına yaz (`.env.example`'daki `R2_*` değişkenleri; dosya git'e girmez).

GitHub'dan build alırken modeller zaten repo dışında kalır; yerel `dist/` klasörünü elle yayınlıyorsan
içindeki `models/` klasörünü Pages'e yükleme.

### CORS

Model alt alan adı uygulamadan farklı bir origin sayılır ve COEP ayarı bu dosyaları yalnızca CORS
başlıklarıyla kabul eder. Bucket'ın **CORS Policy** ayarı:

```json
[
  {
    "AllowedOrigins": ["https://YOUR-DOMAIN", "https://www.YOUR-DOMAIN"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 86400
  }
]
```

Siteyi `*.pages.dev` adresinden de açacaksan o adresi de listeye ekle.
