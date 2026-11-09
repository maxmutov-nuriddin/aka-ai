# Jigar — loyiha g'oyasi

> Bu hujjat loyihani birinchi marta ko'rayotgan odam yoki AI uchun. Unda nima, kim uchun, qanday ishlashi va nega foydali ekani yozilgan.
> Ishga tushirish bo'yicha ko'rsatmalar `README.md` va `.env.example` da.

## 1. Bir gapda

**Jigar** — o'zbek va rus tilida ovoz bilan gaplashadigan AI-ustoz. O'quvchi ko'rayotgan sahifani yoki bergan savolini jonli, sodda va aniq tilda tushuntiradi, bilimini quiz bilan tekshiradi va dars oxirida xulosa beradi.

## 2. Muammo

- O'zbekistonda o'quvchilarga o'z tilida, istalgan paytda, sabr bilan tushuntiradigan yordamchi yo'q. Repetitor qimmat va hamma vaqt ham yonida bo'lmaydi.
- Mavjud AI chatlar asosan ingliz yoki rus tilida ishlaydi va matn bilan gaplashadi. Javoblari quruq, uzun, maktab dasturiga va yoshga moslanmagan.
- Bolalar yozishdan ko'ra gapirishni afzal ko'radi. Ularga "suhbatdosh" kerak, qidiruv tizimi emas.

## 3. Yechim

O'quvchi gapiradi, Jigar eshitadi, tushunadi va **ovoz bilan** javob beradi. Ekranda kichik robot-personaj bor: u tinglaydi, o'ylaydi, gapiradi va kayfiyatini yuz ifodasi bilan ko'rsatadi.

Javob har doim bir xil tuzilmada keladi:

| Bo'lim | Mazmuni |
|---|---|
| `[TUSHUNTIRISH]` | 40–70 so'z: birinchi gap savolga to'g'ridan-to'g'ri javob, keyin "nega", kerak bo'lsa bitta hayotiy misol |
| `[ESDA QOLSIN]` | Asosiy fikr bitta qisqa gapda |
| `[VIZUAL]` | Kerak bo'lsa Mermaid chizma |
| `[QUIZ]` | O'rni kelganda 4 variantli test (har javobda emas) |

Dars tugaganda Jigar xulosa yozadi: nimalar o'rganildi va nimani takrorlash kerak.

## 4. Kim uchun

- **Maktab o'quvchilari** (5–11-sinf): dars, uy vazifasi (tayyor javob bermaydi, yo'l ko'rsatadi).
- **Abituriyentlar**: DTM, attestatsiya, test tuzoqlari.
- **Olimpiadachilar**: isbot va nostandart masalalar.
- **Talabalar**: oliy ta'lim fanlari, kurs ishi rejasi.
- **Til o'rganuvchilar**: o'zbek o'quvchi rus tilini, rus o'quvchi o'zbek tilini gapirib o'rganadi.
- **Qiziquvchilar**: umumiy bilim va qiziqarli faktlar.

## 5. Asosiy imkoniyatlar

- **Ovozli suhbat.** Mikrofonga gapiriladi, javob ovoz bilan keladi va matni ekranda ham chiqadi. Yozish ham mumkin.
- **Ikki til.** O'zbek (lotin) va rus. O'quvchi qaysi tilda gapirsa, Jigar shu tilda javob beradi.
- **Shaxsiylashtirish.** Ro'yxatdan o'tishda 4 qadam so'raladi:
  - yo'nalish;
  - sinf yoki daraja (yo'nalishga mos variantlar chiqadi);
  - javob uzunligi: Qisqa, O'rtacha yoki Batafsil;
  - xarakter.
- **Xarakterlar (persona).** Neytral, Mehribon, Kinoyali, Jahldor, Romantik. Ular faqat ohangni o'zgartiradi. Aniqlik, tuzilma va uzunlik qoidalari hamma xarakterda bir xil.
- **Chrome kengaytmasi.** Yon panelda ochiladi va joriy sahifani o'zi o'qiydi. Belgilangan qismni alohida tushuntiradi.
- **Til o'rganish rejimi.** Erkin suhbat, rolli o'yin, yangi so'zlar va talaffuz bahosi (har so'z va tovush bo'yicha).
- **Quiz va xulosa.** Bilimni tekshiradi, xato bo'lsa boshqa misol bilan qayta tushuntiradi.

## 6. Qanday ishlaydi (texnik)

```
Brauzer / Chrome kengaytmasi
   │  ovoz yoki matn
   ▼
Express server (Node.js) ──▶ Miya (LLM): Claude yoki Gemini
   │                          tizim prompti + xarakter + uzunlik + yo'nalish + sinf
   ├──▶ Nutqni tanish (STT): Chrome Web Speech + ElevenLabs Scribe (ikkinchi tekshiruv)
   ├──▶ Ovoz (TTS): Gemini TTS / Fish Audio / ElevenLabs — support tanlaydi
   ├──▶ Talaffuz bahosi: lokal wav2vec2 servisi (pronounce/), zaxira — Azure
   └──▶ SQLite: foydalanuvchilar, kunlik sarf, to'lovlar, sozlamalar
```

Muhim qarorlar:
- **Ikki marta eshitish.** Gapni Chrome ham, ElevenLabs Scribe ham taniydi. Model ikkala variantni solishtirib, o'quvchining asl savolini tiklaydi. Bu mexanizm o'quvchiga hech qachon aytilmaydi.
- **Promptlar fayllarda** (`prompts/`): asosiy prompt, xarakterlar, uzunlik, rus tili va til o'rganish rejimi. Server ularni ishga tushganda o'qiydi.
- **Prompt keshlash.** Tizim prompti va sahifa keshlanadi, shuning uchun keyingi savollar arzon va tez.
- **Suhbat matni serverda saqlanmaydi.** Faqat hisob, profil, kunlik sarf soni va to'lovlar saqlanadi.
- **Ovoz bo'laklab o'qiladi.** Birinchi bo'lak qisqa bo'ladi, shuning uchun ovoz tez boshlanadi. Keyingi 3 bo'lak oldindan yuklanadi, shuning uchun gap orasida pauza bo'lmaydi.

## 7. Biznes modeli

Oylik obuna. Limit sifatida **kunlik daqiqa** beriladi va har kuni yarim tunda (Toshkent vaqti) yangilanadi.

| Tarif | Narx (so'm/oy) |
|---|---|
| Qiziqish | 199 000 |
| Maktab darslari | 249 000 |
| Imtihonga tayyorgarlik | 299 000 |
| Til o'rganish | 299 000 |
| Olimpiada | 399 000 |
| Universitet | 399 000 |

- **Konstruktor.** O'quvchi bir nechta yo'nalishni tanlab, kunlik daqiqa yoki oylik summani o'zi belgilashi mumkin. Narx sarfga qarab hisoblanadi: tayyor tarifni konstruktorda yig'sa, narx aynan bir xil chiqadi.
- **Daqiqa qanday sanaladi.** Har savol 0.5 daqiqa (`MINUTES_PER_CHAT`), unga Jigar gapirgan ovoz qo'shiladi: ~900 belgi = 1 daqiqa.
- **Teng foyda qoidasi.** Kunlik limit narxdan avtomatik hisoblanadi: `limit = narx × 83% ÷ (1 daqiqa tannarxi × 30)`. O'quvchi limitni har kuni oxirigacha ishlatsa ham, har tarif va har miya+ovoz juftligida **17% foyda** qoladi. Arzon juftlik tanlansa, o'quvchi ko'proq daqiqa oladi.
- **Tannarx** (1 daqiqa): Claude 195 so'm, Gemini 250. Ovoz: Gemini TTS 173, Fish 355, ElevenLabs 1205. Masalan, Claude + Gemini TTS = 368 so'm.
- **To'lov.** PayGate orqali kartaga o'tkazma. Server to'lovni avtomatik tasdiqlaydi (callback va imzo tekshiruvi), shundan keyin obuna 30 kunga ochiladi. Avtomatik yangilanish yo'q.
- **Sinov.** `TRIAL_DAYS` kun bepul, `PAYWALL=1` bo'lsa undan keyin to'lov talab qilinadi.

## 8. Rollar va boshqaruv

- **O'quvchi.** Ilova (`/app`), obuna va to'lov.
- **Support.** `SUPPORT_EMAILS` orqali beriladi, limiti cheksiz. Support paneli (`/admin`) quyidagilarni beradi:
  - statistika;
  - foydalanuvchilar: bloklash, o'chirish, bugungi limitni tiklash;
  - miya va ovozni tanlash;
  - har bir juftlik uchun tannarx va limitlar jadvali.
- **Huquqiy sahifalar.** `/oferta` (ommaviy oferta) va `/maxfiylik` (maxfiylik siyosati), UZ va RU tillarida.

## 9. Nega foydali

**O'quvchi uchun:**
- O'z tilida va o'z darajasida tushuntiradi.
- Istalgan payt ishlaydi, sabr qiladi, "tushunmadim" deyishdan uyaltirmaydi.
- Ovoz bilan gaplashish yozishdan tez va tabiiyroq.
- Tayyor javob bermaydi, tushunishga o'rgatadi. Quiz bilan bilim mustahkamlanadi.

**Ota-ona uchun:** repetitordan bir necha baravar arzon va bolaning qiziqishiga mos.

**Biznes uchun:** har tarif zararsiz hisoblangan. Miya va ovoz xizmatlarini koddan o'zgartirmasdan almashtirish mumkin, bu narx o'zgarsa moslashuvchanlik beradi.

## 10. Qat'iy qoidalar (AI uchun muhim)

- **Aniqlik birinchi o'rinda.** Bilmasa, "aniq bilmayman" deydi va hech qachon to'qimaydi.
- **Til tozaligi.** Javob ovoz bilan o'qiladi, shuning uchun inglizcha yoki ruscha so'z aralashmaydi. Formulalar so'z bilan aytiladi.
- **Bolalar xavfsizligi.** So'kinish, haqorat, 18+ yo'q. Siyosat va dinda neytral qoladi. Xarakter ohangi hech qachon shaxsga qaratilmaydi.
- **Uy vazifasi.** Tayyor javob bermaydi, yo'l ko'rsatadi.
- **Qisqa, lekin to'liq.** Savolning hamma qismiga javob beradi. Kirish gaplari, maqtov va bo'sh yakun yo'q: ular o'quvchining vaqtini va limitini yeydi.
- **Maxfiylik.** API kalitlar faqat serverning `.env` faylida turadi. Suhbatlar saqlanmaydi.

## 11. Kod tuzilmasi

```
prompts/              Jigarning xatti-harakati: system-prompt.md, persona-*.md, style-*.md, lang-ru.md, mode-language.md
server/core/          jigar.js (prompt yig'ish, LLM chaqiruvi), gemini-llm.js, parse.js, pronunciation.js, levels.js
server/voice/         TTS/STT: elevenlabs.js, fishaudio.js, gemini-tts.js, azure*.js, local-pronunciation.js
server/usage/         plan-pricing.js (narxlar, konstruktor — brauzerga ham), tariffs.js (tannarx, teng foyda), store.js (kunlik sarf)
server/payments/      PayGate integratsiyasi va to'lovlar bazasi
server/auth/          ro'yxatdan o'tish, sessiya, profil
server/admin/         support paneli API
server/db/            SQLite va migratsiyalar
web/landing/          bosh sahifa (yo'nalishlar, narxlar, konstruktor, FAQ)
web/auth/             kirish va 4 qadamli ro'yxatdan o'tish
web/app/              asosiy ilova: suhbat, ovoz, robot-personaj, to'lov oynasi
web/admin/            support paneli
web/legal/            oferta va maxfiylik siyosati
pronounce/            lokal talaffuz servisi (Python, wav2vec2)
extension/            Chrome kengaytmasi (npm run build:extension)
test/                 node:test testlari (npm test)
```

## 12. Holat va keyingi qadamlar

- **Tayyor:**
  - ovozli suhbat (UZ/RU), 6 yo'nalish, xarakterlar;
  - til o'rganish va talaffuz bahosi;
  - tariflar va konstruktor, PayGate to'lovi;
  - support paneli, huquqiy sahifalar, Chrome kengaytmasi.
- **Ishga chiqarishdan oldin:**
  - HTTPS bilan serverga joylash, `PUBLIC_URL` ni sozlash;
  - haqiqiy pul bilan to'lov sinovi, keyin `PAYWALL=1`;
  - ofertadagi rekvizitlarni to'ldirish va yuristga ko'rsatish.
- **Keyin:**
  - real foydalanish statistikasi asosida limitlarni sozlash;
  - ma'lumotlar bazasini zaxiralash va xatolar haqida ogohlantirish;
  - ota-onaga hisobot, referal tizimi.
