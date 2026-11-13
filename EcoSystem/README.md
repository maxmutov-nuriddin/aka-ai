# Jigar EcoSystem — shaxsiy yordamchi

Global (o'quvchilar) tizimidan **to'liq alohida**: o'z serveri (port 3100), bazasi (`data/eco.db`), `.env` va kalitlari.
Imkoniyatlar: internet qidiruvi, xotira, eslatmalar, fayl tayyorlash (Word/Excel), kamera, PDF, "Hey Jigar" (Chrome).

## 1. Server

```bash
cd EcoSystem
cp .env.example .env      # kalitlarni yozing; ECO_OWNER_EMAILS — faqat o'z emailingiz
npm install
npm start                 # http://localhost:3100
npm test
```

Telefon va boshqa kompyuterlardan ulanish uchun server internetda **HTTPS** bilan turishi kerak
(masalan, VPS + domen + Caddy/Nginx). `.env`: `NODE_ENV=production`, `TRUST_PROXY=1`.

## 2. Desktop (macOS / Windows) — `desktop/`

Electron qobig'i serverni oynada ochadi; tray (menyu satri) belgisi; **Cmd/Ctrl+Shift+J** — Jigar ochiladi va tinglaydi.

```bash
cd EcoSystem/desktop
npm install
ECO_URL=http://localhost:3100 npm start     # sinash
npm run dist:mac                            # → dist/Jigar-*.dmg  (Mac'da)
npm run dist:win                            # → dist/Jigar Setup *.exe  (Windows'da yoki CI'da)
```

- Imzosiz ilova: Mac birinchi ochishda ogohlantiradi → o'ng tugma → "Open". Tarqatish uchun Apple Developer ($99/yil) bilan imzolash.
- Internetdagi server uchun `main.js` dagi `ECO_URL` standart qiymatini https manzilga o'zgartiring.

## 3. Mobil (Android / iOS) — `mobile/`

Capacitor qobig'i. Server manzili: `mobile/capacitor.config.json` → `server.url` (**https** bo'lishi shart).

```bash
cd EcoSystem/mobile
npm install
npx cap sync
npm run ios        # Xcode ochiladi → Signing (Apple ID) → telefonga Run
npm run android    # Android Studio ochiladi → Run (Android SDK kerak)
```

Mikrofon va kamera ruxsatlari qo'shilgan (iOS `Info.plist`, Android `AndroidManifest.xml`).

## "Hey Jigar" — doim tinglash

| Platforma | Holat |
|---|---|
| Brauzer (Chrome) | Ishlaydi — ilova ochiq turganda (sozlamalar → "Hey Jigar") |
| Desktop | Hozircha **Cmd/Ctrl+Shift+J**. Doim tinglash — keyingi qadam: Picovoice Porcupine (qurilmada, shaxsiy foydalanishga bepul) |
| Android | Keyingi qadam: Porcupine + foreground service (ekran o'chiq bo'lsa ham tinglaydi) |
| iOS | Apple doim tinglashga ruxsat bermaydi → "Hey Siri, Jigar" (Shortcuts) |

Porcupine uchun: console.picovoice.ai da AccessKey va "Hey Jigar" so'zi modeli (.ppn) yaratiladi.

## Serverga joylash
HTTPS bilan internetga chiqarish: [DEPLOY.md](DEPLOY.md) (Docker + Caddy).
