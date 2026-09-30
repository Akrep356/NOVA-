# NOVA Music Server

NOVA'nın Android uygulamasındaki **Müzik Oluştur** bölümünün güvenli sunucu tarafıdır.

## Gereken ortam değişkeni

Sunucuyu çalıştıran platformda:

`STABILITY_API_KEY`

adıyla Stability AI API anahtarını tanımla.

API anahtarını bu projeye veya GitHub'a yazma.

## API

### GET /health

Sunucunun çalışıp çalışmadığını kontrol eder.

### POST /generate

JSON örneği:

```json
{
  "prompt": "Enerjik Türkçe pop, 110 BPM, parlak synthler, güçlü davullar ve modern bas",
  "duration": 30
}
```

Başarılı sonuç MP3 ses verisi olarak döner.

## Çalıştırma

```bash
npm install
npm start
```

Varsayılan port:

`3000`

## Not

Stable Audio isteği sunucu tarafından yapılır; API anahtarı Android APK içine gömülmez.
