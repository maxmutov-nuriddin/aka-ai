# Jigar 2.0 — Global va EcoSystem'ga ajratish rejasi

> Holat: REJA (kod hali o'zgarmagan). Yangi sessiyada shu fayldan boshlanadi.
> Asosiy qoida: o'quvchilar tizimi (Global) **buzilmaydi** — har qadamdan keyin `npm test` (245+ test) va brauzer sinovi.

## Maqsad

Ikki mustaqil yo'nalish:

| | **Global** (hozirgi loyiha) | **EcoSystem** (yangi) |
|---|---|---|
| Kim uchun | O'quvchilar (maktab, imtihon, til, suhbat) | Support / shaxsiy yordamchi ("Jarvis") |
| Jigar | O'qituvchi (xarakterlar, quiz, chizma, kamera) | Kundalik yordamchi: internet, xotira, eslatma, fayl, "Hey Jigar" |
| Platformalar | Veb + Chrome kengaytmasi | Windows (.exe), macOS (.app), iOS, Android |
| Support panel | Qoladi (foydalanuvchilar, tariflar, ovoz/miya tanlash) — **Jigar-yordamchisiz** | Yo'q (o'z sozlamalari ilova ichida) |

Ikkalasi aralashmaydi: alohida papka, alohida server, alohida baza.

## QAT'IY QOIDA: Global va EcoSystem bir-biriga ARALASHMAYDI
- Bir papkadagi kod ikkinchisidan **import qilinmaydi** (`../Global/...` yoki `../EcoSystem/...` yo'q). Umumiy kod — faqat nusxa.
- Alohida: `package.json`, `node_modules`, `.env`, API kalitlar, baza fayli, port, domen, hisoblar (auth).
- Global'da yordamchi (Jarvis) kodi qolmaydi; EcoSystem'da o'quvchi (dars, tarif, to'lov, quiz) kodi bo'lmaydi.
- Bir tizimdagi o'zgarish ikkinchisini **hech qachon** buzmasligi kerak — har birining testlari alohida yuritiladi.
- Tekshiruv: `grep -r "EcoSystem" Global/` va `grep -r "Global" EcoSystem/` — natija bo'sh bo'lishi shart.

## Papka tuzilmasi

```
aka-ai/
├── Global/        ← hozirgi loyiha (o'quvchilar + support panel), support-yordamchi qismi olib tashlanadi
└── EcoSystem/     ← yangi: support-yordamchi to'liq ko'chiriladi
    ├── server/    (Node: chat, ovoz, xotira, eslatmalar, qidiruv)
    ├── web/       (umumiy UI — hamma platforma shuni o'raydi)
    ├── desktop/   (Tauri yoki Electron → .exe / .app)
    ├── mobile/    (Capacitor → Android / iOS)
    └── test/
```

## EcoSystem'ga ko'chadigan narsalar (hozirgi koddan)

**Server**
- `server/assistant/` (store.js, routes.js) — xotira, eslatmalar, `tashkentNowNote`
- `prompts/mode-support.md` → EcoSystem'ning **asosiy** prompti (o'quvchi qoidalarisiz yangi `system-prompt.md`)
- `server/core/jigar.js` dan: `unrestricted` yo'li — web_search vositasi, `pause_turn` davomi, `memoryPromptFor`, `nowNote`, `levelFor` (sinfsiz rejim), `pageBlock` ning support shoxi
- `server/core/parse.js` dan: `[XOTIRA]`, `[ESLATMA]`, `[FAYL]`, `FILE_TYPES`, `parseFacts/parseReminders/parseFile`
- `server/app.js` dan: `saveAssistantParts`, `isSupport` bilan bog'liq yordamchi shoxlari (chat, TTS "student" ovozi)
- Baza: `memories`, `reminders` jadvallari (migratsiya 11) — EcoSystem bazasiga
- Ovoz xizmatlari (`server/voice/*`), oqim (NDJSON streaming), kamera, PDF, chizma — **nusxa** (ikkalasida ham kerak)

**Brauzer**
- `web/app/assistant.js`, `web/app/wake.js`
- `web/app/index.html` dagi `.support-only` qatorlar ("Hey Jigar", "Xotira va eslatmalar" oynasi)
- `web/app/app.js` dagi yordamchi qismi: `createAssistant`, `announceAssistant`, `fileButton`, wake ulanishi

**Testlar**: `test/server/assistant.test.js` + `jigar.test.js` dagi support testlari (unrestricted, sinfsiz rejim, support prompti).

## Global'da qoladigan / olib tashlanadigan

- Qoladi: o'quvchilar ilovasi, kengaytma, landing, to'lovlar, **support panel** (`/admin`: foydalanuvchilar, tariflar, ovoz/miya tanlash).
- Olib tashlanadi (EcoSystem ishga tushgandan **keyin**): `unrestricted` shoxlari, `/api/assistant` yo'llari, `mode-support.md`, assistant.js, wake.js, support-only UI.
- Support hisobi Global'da faqat **panel** uchun; Jigar bilan gaplashsa — oddiy rejim (yoki panelda "EcoSystem'ni ochish" havolasi).
- `memories`/`reminders` jadvallari Global bazada qoladi (migratsiyani o'chirib bo'lmaydi), ishlatilmaydi — EcoSystem'ga eksport skripti bilan ko'chiriladi.

## Bosqichlar (ehtiyotkorlik bilan, har biri alohida commit)

0. **Commit** — hozirgi ishlayotgan holat (30+ fayl hali saqlanmagan!). Git tag: `v1-before-split`.
1. `Global/` papkasiga hozirgi loyihani ko'chirish (`git mv`); yo'llarni tuzatish (package.json scripts, `.env`, `data/`, `scripts/build-extension.js`, `omnivoice/`, `pronounce/`) → `npm test` + brauzer: **hech narsa o'zgarmagan** bo'lishi kerak.
2. `EcoSystem/` — Global'dan **nusxa** (server + web), keyin o'quvchi qismlarini olib tashlash: tariflar, to'lov, onboarding (sinf/maqsad), quiz, kengaytma. Xarakter — bitta yordamchi yoki "moslashuvchan". Alohida port (masalan 3100) va baza (`EcoSystem/data/eco.db`).
3. EcoSystem testlari yashil + brauzer sinovi (xotira, eslatma, qidiruv, fayl, "Hey Jigar").
4. Global'dan yordamchi qismini olib tashlash (yuqoridagi ro'yxat) → Global testlari yashil, o'quvchi oqimi va support panel brauzerda tekshiriladi.
5. Ma'lumot ko'chirish: support'ning `memories`/`reminders` → EcoSystem bazasi (bir martalik skript).
6. Platformalar:
   - **Desktop**: Tauri (yengil) yoki Electron → `.exe` (Windows), `.app`/`.dmg` (macOS); "Hey Jigar" — Picovoice Porcupine (qurilmaning o'zida).
   - **Android**: Capacitor + foreground service + Porcupine → doim tinglaydi; standart yordamchi sifatida tanlash.
   - **iOS**: Capacitor; doim tinglash Apple tomonidan taqiqlangan → "Hey Siri, Jigar" (Shortcuts / App Intents).
7. EcoSystem serverini internetga chiqarish (HTTPS, domen) — mobil/desktop ilovalar shunga ulanadi.

## Xavflar va qarorlar

- **Umumiy kod ikki nusxada** (ovoz, parse, avatar): avval nusxa (tez, xavfsiz); keyin kerak bo'lsa `shared/` paketiga chiqariladi.
- **API kalitlar**: xarajatni ajratish uchun EcoSystem'ga alohida Anthropic/Gemini kaliti tavsiya.
- **Kirish (auth)**: EcoSystem'da alohida hisob (email+parol, faqat egasi) — Global'dagi `SUPPORT_EMAILS` ga bog'lanmaydi.
- Porcupine: shaxsiy foydalanishga bepul, sotuvga — litsenziya. Google Play: $25 bir marta; App Store: $99/yil.
- Har bosqichdan oldin: `git status` toza, testlar yashil. Buzilsa — oldingi commit'ga qaytish.

## Hozirgi holat (2026-11-12)

- Global'da ishlaydi: o'quvchi Jigar (6 xarakter, streaming ovoz, savolga mos chizma/SVG, yuz ifodasi, kamera, PDF, UZ/RU tanlash), support panel.
- Support-yordamchi (EcoSystem'ga ko'chadigan) hozircha Global ichida ishlaydi: internet qidiruvi, xotira, eslatmalar, fayl, "Hey Jigar", sinfsiz erkin rejim.
- Testlar: 245/245.

## Bajarilganlar

- [x] **0-bosqich** — `jigar-2-split` tarmog'i, qaytish nuqtasi: tag `v1-before-split`.
- [x] **1-bosqich** — loyiha `Global/` ga ko'chirildi (git tarixi saqlangan). `.env`, `data/`, `node_modules/`, `dist/`, `omnivoice/.venv` ham `Global/` ichida. Tekshirildi: 245/245 test, kengaytma yig'iladi, server haqiqiy baza bilan ochiladi.
  Endi ishga tushirish: `cd Global && npm start`.
- [x] **2–3-bosqich** — `EcoSystem/`: Global'dan nusxa, o'quvchi qismlari olib tashlandi (tarif, to'lov, limit, admin, landing, kengaytma). Kirgan har kim — egasi (`ECO_OWNER_EMAILS`), port 3100, `data/eco.db`, `.env`: `ECO_TTS`, `ECO_LLM`. Testlar 179/179, brauzerda tekshirildi.
- [x] **4-bosqich** — Global'dan yordamchi qismi olib tashlandi (assistant, wake, unrestricted, web_search, [XOTIRA]/[ESLATMA]/[FAYL], memories/reminders migratsiyasi). Global support — faqat panel. Testlar 234/234, brauzerda tekshirildi.
- [x] **5-bosqich** — ko'chiradigan ma'lumot yo'q: haqiqiy Global baza 10-versiyada edi (xotira jadvallari hech qachon yaratilmagan).
- [x] **6-bosqich (qobiqlar)** — `EcoSystem/desktop` (Electron; macOS `.app` yig'ildi, imzosiz; Cmd/Ctrl+Shift+J), `EcoSystem/mobile` (Capacitor 8; iOS va Android loyihalari, mikrofon/kamera ruxsatlari).
- [ ] **6-bosqich (qolgan)** — "Hey Jigar" doim tinglash: Porcupine (desktop, Android), iOS — Siri Shortcuts. Imzolash (Apple Developer), Android SDK bilan yig'ish.
- [ ] **7-bosqich** — EcoSystem serverini internetga chiqarish (VPS, domen, HTTPS) → `capacitor.config.json` va `desktop/main.js` dagi manzil.
- [x] **EcoSystem tozalandi** — o'z asosiy prompti (shaxsiy yordamchi, o'qituvchi qoidalarisiz), `jigar.js` qayta yozildi (yo'nalish, sinf, beparvo, til/suhbat mashqi, dars xulosasi, talaffuz yo'q), profil: til/uzunlik/xarakter, kirish — 3 savol, "Tugatish" yo'q. Testlar 131/131, brauzerda tekshirildi.
