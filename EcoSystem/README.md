# Jigar (aka-ai)

"Jigar" — maktab va litsey o'quvchilari (12-18 yosh) uchun o'quv yordamchisi. O'quvchi ko'rayotgan sahifani jaydari, hazilkash, lekin aniq tilda tushuntirib beradi, chizma chizadi va quiz beradi. Dars oxirida xulosa chiqaradi.

Ikki xil ishlatish mumkin:

- **Veb-chat** — sahifa matnini nusxalab qo'yasan, Jigar tushuntiradi.
- **Chrome kengaytmasi** — yon panelda ochiladi va joriy sahifani o'zi o'qiydi. Sahifadan bir qismni belgilab qo'ysang, aynan shuni tushuntiradi.

## Ishga tushirish

Node.js 20+ kerak.

```bash
npm install
cp .env.example .env        # ichiga ANTHROPIC_API_KEY ni yozing
node --env-file=.env server/index.js
# yoki: ANTHROPIC_API_KEY=sk-ant-... npm start
```

Brauzerda http://localhost:3000 ni oching.

### Ovoz

Jigar bilan asosan ovoz orqali gaplashiladi, yozish — qo'shimcha ("⌨️ Yozish" tugmasi).

- **ElevenLabs bilan (tavsiya):** `.env` ga `ELEVENLABS_API_KEY` ni yozing. Mikrofonni (yoki Space) bosib turib gapirasan, qo'yib yuborsang — ovoz serverda `scribe_v2` bilan o'zbekcha matnga aylanadi. Jigar `eleven_v3` ovozida javob beradi, `[laughs]` kabi teglar ohangni jonli qiladi (ekranda ko'rinmaydi). Jigar gapirayotganda bossang — jim bo'lib tinglaydi. Ovozni `ELEVENLABS_VOICE_ID` bilan tanlang.
- **ElevenLabs'siz:** tinglash brauzerning Web Speech API'si bilan (Chrome, `uz-UZ`), gapirish Azure (`AZURE_SPEECH_KEY`) yoki brauzer ovozi bilan.

## Qanday ishlaydi

```
Brauzer (veb yoki kengaytma)  ──POST /api/chat──▶  Express server  ──▶  Claude API
       ▲                                              │
       └──── {text, parsed: {tushuntirish, esdaQolsin, vizual, quiz}} ◀┘
```

- **Tizim prompti:** [`prompts/system-prompt.md`](prompts/system-prompt.md). Server uni ishga tushganda o'qiydi, shuning uchun promptni o'zgartirgandan keyin serverni qayta ishga tushirish kifoya.
- **Sahifa matni** suhbatning birinchi xabariga qo'shiladi va keyin o'zgarmaydi. Shu sababli tizim prompti bilan sahifa keshlanadi (prompt caching) va keyingi savollar arzonroq, tezroq bo'ladi. 60 000 belgidan uzun sahifa kesiladi, bu haqda modelga ham, o'quvchiga ham aytiladi.
- **Suhbat tarixi** brauzerda saqlanadi. Server hech narsani saqlamaydi.
- **Javob** `[TUSHUNTIRISH]`, `[ESDA QOLSIN]`, `[VIZUAL]`, `[QUIZ]` bo'limlariga ajratiladi ([`server/parse.js`](server/parse.js)). Quiz JSON'i buzilgan bo'lsa ham ilova sinmaydi, faqat quiz ko'rsatilmaydi. Mermaid chizmasi xato bo'lsa, kod matn sifatida chiqadi.
- **Quiz:** variantni bosganda to'g'ri yoki xato darhol ko'rinadi. Javob Jigarga ham yuboriladi, u maqtaydi yoki tushuntiradi va yangi savol beradi.
- **Personaj:** Jigar — ekrandagi kichik robot ([`web/avatar.js`](web/avatar.js)). U tinglaganda antennasi yonadi, o'ylaganda ko'zlari aylanadi. Gapirganda og'zi ovoz balandligiga qarab ochiladi.
- **Til:** yuqoridagi UZ / RU tugmasi. Ruscha tanlansa, interfeys, Jigarning javobi, ovozi va gapni tanish ruschaga o'tadi ([`prompts/lang-ru.md`](prompts/lang-ru.md), [`web/i18n.js`](web/i18n.js)).
- **Sozlamalar (⚙):** javob uzunligi — Qisqa (2-3 gap, standart) yoki Odatiy; "Sodda tushuntirish" — oddiy so'zlar, qisqa gaplar (standart yoqiq). Promptlar: [`prompts/style-short.md`](prompts/style-short.md), [`prompts/style-simple.md`](prompts/style-simple.md).
- **Beparvo rejim:** yuqoridagi "Beparvo" tugmasi. Yoqilsa, Jigar qo'pol gapiradi, baqiradi va o'rtacha so'kinadi ([`prompts/beparvo-mode.md`](prompts/beparvo-mode.md)). Uyatli so'z, ota-onani so'kish va kamsitish bu rejimda ham taqiqlangan. O'chirilsa, Jigar odatdagi odobli holatiga qaytadi. Tanlov brauzerda saqlanadi.
- **Darsni tugatish:** barcha savol-javoblar va quiz natijalari `XULOSA_SO'ROVI` bilan yuboriladi, Jigar xulosa yozadi.
- **Xavfsizlik:** API kalit faqat serverda turadi. So'rovlar soni cheklangan (bir IP uchun 5 daqiqada 40 ta), kiruvchi ma'lumotlar tekshiriladi. Model rad etsa (`refusal`), o'quvchiga yumshoq "darsga qaytamiz" javobi ko'rsatiladi.

### API

| Endpoint | Body | Javob |
| --- | --- | --- |
| `POST /api/chat` | `{ page?: {title, url, text}, history: [{role, content}], selection?, mode?: "oddiy" \| "beparvo" }`. `history` user bilan boshlanib, user bilan tugaydi. Birinchi xabar bo'sh bo'lsa, "sahifani tushuntir" degani. | `{ text, parsed, refused, truncated, pageTruncated, usage }` |
| `POST /api/summary` | `{ pageTitle?, items: [{savol, javob, quiz?: {savol, togri, tanlangan}}], mode? }` | `{ text }` |
| `POST /api/tts` | `{ text }` (1000 belgigacha) | `audio/mpeg` (ElevenLabs, bo'lmasa Azure). Sozlanmagan bo'lsa 503 |
| `POST /api/stt` | audio yozuv (`audio/webm`, 10 MB gacha) | `{ text }` (ElevenLabs Scribe). Sozlanmagan bo'lsa 503 |
| `GET /api/voice-config` | — | `{ tts, stt }` — qaysi ovoz xizmatlari yoqilgan |
| `GET /api/health` | — | `{ ok: true }` |

### Sozlamalar

Barcha sozlamalar [`.env.example`](.env.example) faylida izohlari bilan berilgan: model, effort, CORS, so'rovlar cheklovi.

## Testlar

```bash
npm test
```

## Tuzilma

```
prompts/system-prompt.md   Jigarning tizim prompti
prompts/beparvo-mode.md    Beparvo rejim qo'shimchasi
server/index.js            Express server (API + veb-ilova)
server/jigar.js            So'rovni tuzish, Claude'ga yuborish
server/parse.js            Javobni bo'limlarga ajratish (brauzerda ham ishlatiladi)
server/elevenlabs.js       Ovoz va gapni tanish (ElevenLabs)
server/tts.js              Zaxira ovoz (Azure Speech)
web/voice.js, web/speech.js Mikrofon va ovozli javob
web/avatar.js              Jigar personaji (robot, kayfiyatlar)
web/caption.js             Ovoz bilan birga yoziladigan matn
web/logo.svg               Logo (favicon); kengaytma belgilari: extension/icons/
web/                       Veb-chat interfeysi
extension/                 Chrome kengaytmasining o'ziga xos fayllari
scripts/build-extension.js dist/extension ni yig'adi
test/                      Testlar (node:test)
```
