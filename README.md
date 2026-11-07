# aka-ai

"Aka" — maktab va litsey o'quvchilari (12-18 yosh) uchun o'quv yordamchisi. O'quvchi ko'rayotgan sahifani jaydari, hazilkash, lekin aniq tilda tushuntirib beradi, chizma chizadi va quiz beradi. Dars oxirida xulosa chiqaradi.

Ikki xil ishlatish mumkin:

- **Veb-chat** — sahifa matnini nusxalab qo'yasan, Aka tushuntiradi.
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

### Chrome kengaytmasi

```bash
npm run build:extension
```

1. Chrome'da `chrome://extensions` ni oching va **Developer mode** ni yoqing.
2. **Load unpacked** tugmasini bosib, `dist/extension` papkasini tanlang.
3. Server boshqa manzilda bo'lsa, kengaytma sozlamalaridan (**Options**) server manzilini kiriting.
4. Istalgan sahifada Aka belgisini bosing, yon panel ochiladi.

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
- **Quiz:** variantni bosganda to'g'ri yoki xato darhol ko'rinadi. Javob Aka'ga ham yuboriladi, u maqtaydi yoki tushuntiradi va yangi savol beradi.
- **Darsni tugatish:** barcha savol-javoblar va quiz natijalari `XULOSA_SO'ROVI` bilan yuboriladi, Aka xulosa yozadi.
- **Xavfsizlik:** API kalit faqat serverda turadi. So'rovlar soni cheklangan (bir IP uchun 5 daqiqada 40 ta), kiruvchi ma'lumotlar tekshiriladi. Model rad etsa (`refusal`), o'quvchiga yumshoq "darsga qaytamiz" javobi ko'rsatiladi.

### API

| Endpoint | Body | Javob |
| --- | --- | --- |
| `POST /api/chat` | `{ page?: {title, url, text}, history: [{role, content}], selection? }`. `history` user bilan boshlanib, user bilan tugaydi. Birinchi xabar bo'sh bo'lsa, "sahifani tushuntir" degani. | `{ text, parsed, refused, truncated, pageTruncated, usage }` |
| `POST /api/summary` | `{ pageTitle?, items: [{savol, javob, quiz?: {savol, togri, tanlangan}}] }` | `{ text }` |
| `GET /api/health` | — | `{ ok: true }` |

### Sozlamalar

Barcha sozlamalar [`.env.example`](.env.example) faylida izohlari bilan berilgan: model, effort, CORS, so'rovlar cheklovi.

## Testlar

```bash
npm test
```

## Tuzilma

```
prompts/system-prompt.md   Aka'ning tizim prompti
server/index.js            Express server (API + veb-ilova)
server/aka.js              So'rovni tuzish, Claude'ga yuborish
server/parse.js            Javobni bo'limlarga ajratish (brauzerda ham ishlatiladi)
web/                       Veb-chat interfeysi
extension/                 Chrome kengaytmasining o'ziga xos fayllari
scripts/build-extension.js dist/extension ni yig'adi
test/                      Testlar (node:test)
```
