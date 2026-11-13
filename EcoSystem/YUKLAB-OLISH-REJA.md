# Reja: veb-sahifadan barcha ilovalarni yuklab olish

Maqsad: `npm start` bilan EcoSystem ochilganda veb-sahifada "Yuklab olish" bo'limi bo'lsin. Undan macOS (.dmg), Windows (.exe), Android (.apk) va iOS ilovalari olinadi.

Holat (2026-11-13):
- ✅ Server: `/api/downloads`, `/downloads/:file`, `/download` sahifasi (QR, OS aniqlash, yo'riqnomalar), testlar.
- ✅ Sozlamalarda "📥 Ilovalarni yuklab olish" havolasi; PWA manifest (iPhone uchun).
- ✅ macOS: `npm run build:mac` → `downloads/Jigar-mac.dmg` (universal, imzosiz) — yig'ildi.
- ✅ Windows: `npm run build:win-zip` → `downloads/Jigar-win.zip` (o'rnatishsiz Jigar.exe, belgisiz). Belgili `.exe` o'rnatuvchi — GitHub Actions (`eco-v*` tegi), artifact'ni `downloads/Jigar-win.exe` ga qo'yish.
- ⏳ Android: kod tayyor; Android SDK kerak, keyin `npm run build:android` (debug APK, imzosiz).
- ✅ Desktop/mobil: birinchi ochilishda server manzili so'raladi (desktop — oyna va tray menyusi; telefon — ichki sahifa).
- ⏳ iOS: TestFlight (Apple Developer akkaunti bo'lsa).

## 1. Fayllar qayerda turadi
- Yig'ilgan (build) fayllar uchun papka: `EcoSystem/downloads/`. Git'ga kirmaydi (`.gitignore`).
- Fayl nomlari:
  - `Jigar-mac.dmg` (Apple Silicon va Intel uchun bitta "universal" fayl)
  - `Jigar-win.exe` (NSIS o'rnatuvchi)
  - `Jigar-android.apk`
- Server `GET /downloads/:file` yo'lini qo'shadi. Faqat ro'yxatdagi uchta nom beriladi, path traversal yo'q. Javobda `Content-Disposition: attachment` bo'ladi.
- `GET /api/downloads` qaysi fayl borligini, hajmini, versiyasini va SHA-256 summasini qaytaradi. Sahifa shu ma'lumotga qarab tugmalarni ko'rsatadi.

## 2. Yuklab olish sahifasi
- Manzil: `/download` (kirish talab qilinmaydi). Ilovaning Sozlamalar oynasiga havola qo'shiladi: "📥 Ilovalarni yuklab olish".
- Har platforma uchun karta: belgi, nomi, hajmi va "Yuklab olish" tugmasi. Fayl yo'q bo'lsa: "hali tayyor emas".
- Brauzer qaysi tizimda ochilganini aniqlaydi (`navigator.userAgent`) va mos kartani tepaga chiqaradi.
- Telefon uchun QR-kod: kompyuterdagi QR telefonda skanerlanadi, telefon LAN IP orqali `/download` ga o'tadi (`lanAddresses()` allaqachon `server/index.js` da bor).
- Har karta ostida o'rnatish yo'riqnomasi:
  - **macOS:** imzosiz ilova. Birinchi ochishda o'ng tugma → Open. Keyin Screen Recording ruxsatini bering.
  - **Windows:** SmartScreen ogohlantirishi chiqadi: "More info" → "Run anyway".
  - **Android:** "Noma'lum manbalardan o'rnatish"ga ruxsat bering.
  - **iOS:** pastdagi 5-bo'limga qarang.

## 3. Yig'ish (build) skriptlari
- `desktop/package.json` ga qo'shiladi:
  - `dist:mac`: `electron-builder --mac dmg --universal`
  - `dist:win`: `electron-builder --win nsis --x64 --arm64`
  - natija `../downloads/` ga ko'chiriladi
- `.exe` ni macOS'da yig'ish uchun Wine kerak. Yaxshiroq yo'l: GitHub Actions'da `windows-latest` runner (`.github/workflows/build.yml`).
- Android: `mobile/` da `npx cap sync android`, keyin `cd android && ./gradlew assembleRelease`. Imzolash uchun keystore kerak (`ANDROID_KEYSTORE` env, git'ga KIRMAYDI). Natija `downloads/Jigar-android.apk`.
- Barchasini bitta buyruq bilan yig'ish uchun ildiz `EcoSystem/package.json` ga `"build:all"` skripti qo'shiladi: mac va android (shu Mac'da), windows (CI orqali).
- Desktop ilova server manzilini bilishi kerak. Birinchi ochilishda oynada server manzili so'raladi (hozir standart qiymat `localhost:3100`).

## 4. Mobil ilovaning server manzili
- `mobile/capacitor.config.json` dagi `server.url` hozir namuna (`https://jigar.example.uz/app/`). Haqiqiy HTTPS manzil kerak (mikrofon faqat HTTPS'da ishlaydi).
- Variantlar:
  - (a) VPS + domen + HTTPS;
  - (b) uy uchun Cloudflare Tunnel yoki Tailscale (bepul, HTTPS bor).
- Ilova birinchi ochilganda "Server manzili" oynasi (`mobile/www/index.html`) chiqadi. Manzil saqlanadi, keyin ilova shu manzilga o'tadi.

## 5. iOS — cheklovlar
- iPhone'ga `.ipa` faylni oddiy yuklab olib o'rnatib bo'lmaydi (Apple taqiqlaydi). Yo'llar:
  1. **TestFlight** (eng to'g'ri yo'l): Apple Developer akkaunti kerak ($99/yil). Sahifada TestFlight havolasi turadi.
  2. **Xcode orqali:** bepul Apple ID bilan, 7 kunlik imzo. Faqat egasining o'zi uchun.
  3. **PWA:** Safari → "Ulashish" → "Bosh ekranga qo'shish". Bepul va darhol ishlaydi. Buning uchun `web/app/manifest.webmanifest` va ikonkalar qo'shiladi.
- Sahifadagi iOS kartasi: TestFlight havolasi (bo'lsa), aks holda PWA yo'riqnomasi.

## 6. Xavfsizlik
- Fayllarda maxfiy narsa yo'q: kalitlar `.env` da va ilovaga kirmaydi.
- `/downloads` ga cheklov (rate limit) qo'yiladi: `rateLimiter`, 5 daqiqada 30 ta.
- Har bir fayl uchun SHA-256 summasi sahifada ko'rsatiladi.

## 7. Testlar
- `test/server/downloads.test.js`:
  - ro'yxat: faqat mavjud fayllar;
  - `/downloads/../../.env` → 404;
  - noma'lum nom → 404;
  - `Content-Disposition` sarlavhasi bor.
- Qo'lda tekshiruv: sahifani telefonda (QR orqali) va kompyuterda ochish, `.dmg` ni o'rnatish.

## Bajarish tartibi (keyingi sessiya)
1. Server: `/api/downloads`, `/downloads/:file` yo'llari va testlari.
2. Sahifa: `web/download/index.html` (QR, OS aniqlash, yo'riqnomalar) va Sozlamalardagi havola.
3. `build:all` skriptlari; mac `.dmg` ni yig'ib, sahifada sinash.
4. Desktop: birinchi ochilishda server manzilini so'rash.
5. Mobil: server manzili oynasi va Android `.apk` (Android SDK kerak).
6. PWA manifest (iOS uchun bepul yo'l), keyin TestFlight (Apple akkaunti bo'lsa).
7. Windows `.exe`: GitHub Actions workflow.
