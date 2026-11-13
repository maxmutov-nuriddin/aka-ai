# Jigar ekotizimi — to'liq reja (Jarvis darajasi)

Maqsad: Jigar Temir odamning Jarvis'i kabi ishlasin.
- Ovoz bilan chaqiriladi (Siri orqali ham).
- Istalgan qurilmadan istalgan qurilmani boshqaradi: kompyuter, telefon, televizor, uy.
- O'zi xabar oladi, o'zi kuzatadi, o'zi yordam beradi.

**Ish tartibi:**
- Egasi "yozib qo'y" desa — g'oya shu faylga qo'shiladi, kod yozilmaydi.
- "Boshla" desa — reja bo'yicha bajariladi.
- Holat belgilari: ✅ qilingan · 🔜 navbatda · 💡 g'oya (hali rejaga kiritilmagan).

---

## Arxitektura
- **Server (EcoSystem)** — markaz. Jigar (Claude) buyruqni tushunadi va asbob (tool) chaqiradi. Hub buyruqni kerakli qurilmaga yuboradi.
- **Qurilma agentlari** serverga long-poll orqali ulanadi. Har biri o'z id'si, nomi va turi bilan:
  - desktop (macOS va Windows) — ✅;
  - Android agent — 🔜.
- **Chaqirish (kirish nuqtalari):**
  - Jigar ilovasi (veb, desktop, mobil) — ✅;
  - **Siri** (Mac va iPhone) — 🔜;
  - desktop'da internetsiz "Hey Jigar" — 🔜.
- **Xavfsizlik:**
  - qaytarib bo'lmaydigan ishlar faqat "Ha" bilan;
  - fayllar uy papkasi ichida, maxfiy fayllar yopiq;
  - xavfli buyruqlar rad etiladi;
  - lokal tarmoq qurilmalari faqat lokal manzillar orqali (SSRF himoyasi).

---

## ✅ Qilingan (2026-11-13)

Qolganlari (kod yozilgan, lekin yig'ilmagan yoki sinalmagan):
- 5 — Android agent: Java kodi tayyor (`AgentService`, `PhoneActions`, `JigarAgentPlugin`), lekin `.apk` yig'ilmagan (Android SDK yo'q, diskda joy kam). Android Studio'da: `cd EcoSystem && npm run build:android`.
- 4 — desktop'da "Hey Jigar" internetsiz emas, server orqali (ElevenLabs Scribe, faqat qisqa gap bo'laklari). Haqiqiy mikrofon bilan sinalmagan.
- Windows'da ekran matni (UI Automation) — yozilgan, Windows'da sinalmagan.
| Bo'lim | Imkoniyat |
|---|---|
| Kompyuter | ekran, oynalar, fayllar, ochish, buyruq va fayl yozish (ruxsat bilan) |
| Ko'p qurilma | har kompyuter o'z nomi/id'si bilan; "Ofisdagi kompyuterda..." — o'sha qurilmaga |
| Ovoz va media | tizim ovozi (%, ±10, o'chirish), Spotify/Music play/pause/keyingi/oldingi |
| Ilovalar | ro'yxat, ochish, oldinga chiqarish, yashirish, yopish, hammasini yashirish, hammasini yopish (ruxsat bilan) |
| YouTube | Jigar pleeri: qidirish, ochish (vaqtdan), aniq vaqtga o'tish, ±N s, YouTube ovozi alohida, pauza, to'liq ekran |
| Televizor | tarmoqdan topish (SSDP), TV'da YouTube (DIAL), TV ovozi (UPnP). Topilgan: "ТВ в гостиной" (TV'da video yoqish va ovozni o'zgartirish sinab ko'rilmagan) |
| Tizim | qulflash, ekranni o'chirish, batareya, ma'lumot |
| O'z tashabbusi | ekranga o'zi qarab maslahat, ertalabki reja, kechki xulosa |
| Telefon | telefondan kompyuterni boshqarish; Android ekranini ulashish (plagin yozilgan, yig'ib sinab ko'rilmagan) |
| Yuklab olish | `/download` sahifasi, `.dmg` yig'iladi, Windows uchun CI, iPhone uchun PWA |
| Siri (1) | `/api/voice` + shaxsiy kalitlar (Sozlamalar), 10 daqiqalik suhbat davomi, ruxsat — ilovadagi karta; `/download` da Shortcuts yo'riqnomasi. iPhone/Mac'da haqiqiy Siri bilan sinab ko'rilmagan |
| Ssenariylar (2) | `scenario` asbobi: saqlash, ishga tushirish, har kuni HH:MM da (fonda; ruxsat — karta orqali) |
| Monitoring (3) | 2 daqiqada: batareya ≤ 15%, disk < 10 GB, protsessor > 90% (3 marta) — bir marta aytadi |
| Ekran matni (6) | `pc_screen_text` — Mac Accessibility (suratsiz); Electron ilovalarda matn kam — surat bilan to'ldiriladi. Windows — keyin |
| Kuzatuv (7) | `watch`: jarayon tugadi/bo'sh qoldi, ekran o'zgarmadi, ekranda yozuv, fayl, vaqt → xabar, qulf, uxlatish, o'chirish, qayta yoqish, hammasini yopish, ssenariy. Xavflisi — "Ha" + 60 s ogohlantirish (bekor qilish tugmasi) |
| Dasturlash (8) | `projects` (nom → papka), `pc_dev`: VS Code'da ochish, Claude Code fonda yoki Terminal'da, natija logi (`~/Jigar/claude-runs`) |
| Xabarlar (9) | `pc_message`: Mac Messages — kontakt qidirish, iMessage/SMS yuborish (har safar "Ha") |
| To'liq ruxsat (10) | darajalar: xavfsiz / keng / to'liq / cheksiz (1 soat, parol bilan); TO'XTA (asbob, tugma, `/api/stop`); begona matndagi buyruqlarga amal qilinmaydi |
| Telefon (5) | `phone` asbobi: ovoz, musiqa, ilovalar, YouTube, havola, SMS (ruxsat bilan), qo'ng'iroq oynasi, kontaktlar, batareya, fonar, "telefonim qayerda". Agent kalit bilan ulanadi; ilova ichida o'zi yoqiladi. `.apk` yig'ilmagan |
| Server manzili | desktop: birinchi ochilishda oyna + tray'da o'zgartirish; telefon: ichki sahifa, server ochilmasa ham shu sahifa |
| Jurnal (11) | `~/Jigar/QILOLMAGAN-ISHLAR.md`, `XATOLAR.md`, `HARAKATLAR.md`; `journal` asbobi; Sozlamalardan yuklab olish |

---

## ✅ 1. Siri orqali chaqirish (Mac va iPhone)
"Hey Siri, Jigar" → Siri gapingizni eshitadi → Jigar bajaradi → javobni Siri ovoz chiqarib aytadi.

**Qanday ishlaydi:** Apple **Shortcuts** (Qisqa buyruqlar) ilovasida "Jigar" nomli buyruq bo'ladi. Siri shortcut'ni nomi bilan ishga tushiradi:
1. "Matnni diktovka qilish" (Dictate Text) — gapingiz matnga aylanadi (o'zbek yoki rus).
2. "URL mazmunini olish" — `POST https://<server>/api/voice` ga `{ "text": "..." }` yuboriladi. Sarlavhada shaxsiy kalit bo'ladi: `Authorization: Bearer <token>`.
3. "Matnni gapirish" (Speak Text) — Jigar javobini Siri ovozi bilan o'qiydi. Yoki Jigar'ning o'z ovozi (audio javob) ijro etiladi.

**Serverda:**
- `POST /api/voice`: bitta savol → asboblar bajariladi → **qisqa, ovozga mos javob** (1-2 gap, bo'limlarsiz). Kompyuter, TV, YouTube va boshqa asboblar ishlaydi.
- Ruxsat talab qiladigan ishlar (buyruq, fayl yozish, hammasini yopish): Siri "Ha" deya olmaydi. Jigar "Ilovada tasdiqlang" deydi va tasdiq kartasi desktop yoki telefon ilovasida chiqadi.
- Suhbat davomi: oxirgi 10 daqiqadagi Siri savollari bitta suhbat hisoblanadi ("ovozini yana pasaytir" — nima haqida ekanini Jigar biladi).
- **Shaxsiy kalit (token):** Sozlamalarda "Siri uchun kalit yaratish" tugmasi. Kalit bir marta ko'rsatiladi, istalgan payt o'chiriladi va faqat `/api/voice` ga kiradi.

**Tayyor shortcut:**
- `/download` sahifasida "Siri uchun Jigar" kartasi: iCloud havolasi yoki `.shortcut` fayl va 3 qadamli yo'riqnoma (kalitni qo'yish).
- Mac'da ham xuddi shu shortcut ishlaydi (macOS Shortcuts, "Hey Siri" yoki menyu qatoridan).

**Shart:** iPhone uydan tashqarida ham Jigar'ga yetishi uchun server HTTPS manzilga chiqarilishi kerak (Tailscale yoki Cloudflare Tunnel, bepul). Uy Wi-Fi'da LAN manzil ham ishlaydi, lekin Shortcuts HTTP'ni faqat ogohlantirish bilan qabul qiladi.

**Cheklov:** Siri o'zbek tilini to'liq tanimasligi mumkin. Diktovka tili shortcut'da tanlanadi (o'zbek, rus yoki ingliz). Jigar xato eshitilgan so'zni ma'nosiga qarab tushunadi (buni hozir ham qiladi).

---

## ✅ 2. Ssenariylar
- Bir so'z bilan bir nechta ish. Masalan:
  - "Ishni boshlayman" — VS Code, Telegram, musiqa ochiladi, ovoz 30% bo'ladi, kunlik reja aytiladi.
  - "Uxlayman" — ilovalar yopiladi, TV o'chadi, ertangi eslatmalar aytiladi.
  - "Kino" — oynalar yashiriladi, TV'da YouTube ochiladi, ovoz sozlanadi.
- Ssenariy oddiy tilda yoziladi ("ishni boshlayman desam: ...") va xotirada saqlanadi. Jigar uni asboblar ketma-ketligiga aylantiradi.
- Vaqt bo'yicha: "har kuni 08:00 da ishni boshlash ssenariysini ishga tushir".

## ✅ 3. O'zi kuzatish — monitoring
- Desktop agent har daqiqada tekshiradi: batareya (< 15%, zaryadlanmayapti), disk (< 10 GB bo'sh), internet (uzildi yoki tiklandi), protsessor (uzoq vaqt 90%+), xotira.
- Muammo bo'lsa — Jigar o'zi aytadi (nudge + ovoz), bir xil ogohlantirish takrorlanmaydi.
- Sozlamalarda yoqiladi yoki o'chiriladi va chegaralari o'zgartiriladi.

## ✅ 4. Desktop'da "Hey Jigar" (server orqali; internetsiz model — 🔜)
- Electron ilovada fonda mikrofon. openWakeWord yoki Porcupine (lokal model) "Jigar" so'zini taniydi, internetsiz va kam quvvat bilan.
- Eshitgach — Jigar oynasi ochiladi va savol tinglanadi (hozirgi `Cmd/Ctrl+Shift+J` kabi).
- Mikrofon belgisi doim yonib turadi (macOS talabi), lekin yonib-o'chmaydi.

## ✅ 5. Android agent (kod tayyor, `.apk` yig'ilmagan)
- Native foreground service serverga long-poll qiladi (ilova yopiq bo'lsa ham). Bildirishnomada "Jigar ulangan" deb turadi.
- Amallar:
  - ovoz (`AudioManager`), media tugmalari;
  - ilova ochish va ro'yxat;
  - YouTube (`vnd.youtube:<id>?t=<s>`), fonar, batareya;
  - qo'ng'iroq yoki SMS oynasini ochish (ruxsat bilan).
- Boshqa ilovalar ichidagi tugmalarni bosish — Accessibility xizmati orqali (ixtiyoriy).
- iPhone: tashqaridan boshqarib bo'lmaydi; u faqat Siri orqali boshqaruvchi bo'ladi.

## ✅ 6. Ekrandagi matnni o'qish (Mac; Windows — yozilgan, sinalmagan)
- macOS Accessibility API (Windows'da UI Automation) — ekrandagi oyna matni o'qiladi. Surat va Screen Recording ruxsati kerak emas.
- "Ekranimga qara" — avval matn o'qiladi, rasm kerak bo'lsa (grafik, dizayn) — surat olinadi.

---

## ✅ 7. Kuzatuv: ish tugagach amal ("qarab tur, tugasa o'chir")
Misol: VS Code'da AI kod yozyapti. Siz: "Jigar, shu tugagach kompyuterni o'chir" yoki "qarab tur, tugasa menga ayt".

**Qanday ishlaydi:**
- Yangi asbob `pc_watch`: shart + tugagach amal. Vazifa serverda saqlanadi (server qayta ishga tushsa ham qoladi) va desktop agent har 15-30 soniyada tekshiradi.
- **Shart turlari:**
  - jarayon tugadi (buyruq, `claude`, `npm`, build) — jarayon nomi yoki PID bo'yicha;
  - jarayon "bo'sh qoldi" (protsessor N daqiqa < 5%) — AI yozishni to'xtatdi;
  - ekran o'zgarmay qoldi (N daqiqa bir xil) yoki ekranda "Done / tugadi / xato" matni chiqdi (arzon Haiku bilan tekshiriladi);
  - fayl paydo bo'ldi yoki o'zgardi (masalan `build/` yoki `.apk`);
  - vaqt: "soat 23:00 da".
- **Amal turlari:** menga ayt (ovoz + nudge), kompyuterni uxlat yoki o'chir, ekranni qulfla, ilovalarni yop, boshqa asbobni ishga tushir (ssenariy).
- **Xavfsizlik:** o'chirish yoki uxlatish uchun "Ha" **vazifa qo'yilganda** so'raladi, bajarilishda emas. Bajarilishdan 60 soniya oldin ogohlantirish chiqadi va u bekor qilinadi ("Bekor qil" tugmasi yoki "to'xta" deyish). Vazifaning muddati bor (standart 6 soat), shundan keyin o'zi o'chadi.
- Yangi asbob `pc_power`: sleep, shutdown, restart (faqat ruxsat bilan; hozir `shutdown` buyrug'i xavfsizlik siyosatida bloklangan, shuning uchun alohida asbob orqali).
- Ro'yxat va bekor qilish: "qanday kuzatuvlar bor?", "kuzatuvni to'xtat".

## ✅ 8. Dasturlash yordamchisi: loyiha + VS Code + Claude Code
Misol: "Mac'da jigar loyihasini ochib, VS Code'dagi Claude'ga shu promptni ber". "IDEA.md ni ko'r, nimani qilishimiz mumkin?".

- **Loyihalar ro'yxati:** nom → papka ("jigar" → `~/Projects/aka-ai`). Xotiraga saqlanadi, Jigar o'zi so'raydi va eslab qoladi.
- **Asboblar:**
  - `dev_open` — loyihani VS Code'da ochish (`code <papka>`);
  - `dev_read` — loyiha hujjatlarini o'qish (README, IDEA.md, rejalar): mavjud `pc_read_file` bilan, Jigar o'qib maslahat beradi;
  - `dev_claude` — shu papkada Claude Code'ga prompt berish: ko'rinadigan terminalda (Terminal yoki VS Code terminali) `claude "<prompt>"` yoki `claude -p`.
- **Natijani aytish:** Claude Code tugagach Jigar chiqishni o'qiydi va qisqa ayt ("5 ta fayl o'zgardi, testlar o'tdi"). 7-band bilan birga ishlaydi.
- **Xavfsizlik:** Claude Code kompyuterda buyruq bajara oladi. Shuning uchun `dev_claude` har safar "Ha" bilan, tasdiq kartasida to'liq prompt va papka ko'rsatiladi. Faqat ro'yxatdagi loyihalarda ishlaydi.

## ✅ 9. Xabarlar: SMS, iMessage, qo'ng'iroq (Mac; Android — 5-band bilan)
Misol: "Telefonimdan Alisherga 'kechikaman' deb SMS yubor".

- **Android agent (5-band) orqali:** `SmsManager` bilan yuborish (ruxsat va tasdiq bilan), kontaktlardan ismni topish, qo'ng'iroq oynasini ochish.
- **Mac:** iMessage'ni AppleScript (Messages) orqali yuborish.
- **iPhone:** to'g'ridan-to'g'ri yuborib bo'lmaydi (Apple). Siri Shortcuts'dagi "Xabar yuborish" amali orqali ishlaydi va yuborishdan oldin so'raydi.
- **Xavfsizlik:** har bir xabar yuborishdan oldin matn va qabul qiluvchi "Ha" bilan tasdiqlanadi.
- Kontaktlar nomlari bir nechta bo'lsa — Jigar so'raydi ("qaysi Alisher?").

**Chaqirish:** telefon yoki Mac'dan "Hey Jigar" (4-band) yoki "Hey Siri, Jigar" (1-band) deyilsa, shu 7-9 bandlardagi ishlar bir xil ishlaydi. Bu qatlam alohida kod talab qilmaydi: asboblar tayyor bo'lgach, ovoz orqali ham boshqariladi.

---

## ✅ 10. To'liq ruxsat — Claude'ga to'liq dostup kabi (egasi tanlaydi)
Maqsad: Jigar "bu mumkin emas" deb to'xtamasin; egasi xohlasa, kompyuterda Claude Code'dagi "to'liq dostup" kabi ishlasin.

**Hozir:** faqat uy papkasi, maxfiy fayllar yopiq, xavfli buyruqlar rad, har buyruqqa "Ha" (`desktop/policy.js`).

**To'rt daraja** (Sozlamalarda "Ruxsat darajasi"; standart — 1):
1. **Xavfsiz** (hozirgi): uy papkasi, buyruq va yozish uchun "Ha".
2. **Keng:** butun disk o'qiladi (maxfiy kalit va parol fayllaridan tashqari), istalgan joyga yoziladi; buyruq va yozish uchun "Ha" saqlanadi.
3. **To'liq:** cheklov yo'q, tizim fayllari ham; "Ha" faqat **qaytarib bo'lmaydigan** ishlar uchun: o'chirish (`rm`), formatlash, o'chirib-yoqish, xabar yoki pul yuborish, ommaviy yopish. Qolgan hamma ish so'ramasdan bajariladi.
4. **Cheksiz (1 soat):** hech qanday "Ha" yo'q. Muddatli: qo'lda yoqiladi, 1 soatdan keyin o'zi 3-darajaga qaytadi, har safar yoqishda parol so'raladi.

**Himoya (har darajada):**
- Har bir harakat `HARAKATLAR.md` jurnaliga yoziladi (qachon, qaysi qurilma, nima, natija): nima bo'lganini doim ko'rish mumkin.
- Ekrandan yoki veb-sahifadan o'qilgan matnga ko'ra buyruq berilmaydi (prompt injection: begona matn Jigar'ni aldab buyruq bajartirmasin). Jigar faqat egasining o'z gapiga ishonadi.
- Server internetga chiqarilganda 3-4 darajalar faqat egasi kirgan qurilmadan yoqiladi; Siri orqali faqat 1-2.
- Favqulodda "TO'XTA": shu so'z yoki tugma bilan hamma ishlayotgan vazifa to'xtaydi va daraja 1 ga tushadi.

**Tavsiya:** 3-daraja kundalik uchun, 4 ni faqat aniq katta ish uchun ("tunda hamma narsani tartibga sol").

## ✅ 11. Bilmasa yoki qilolmasa — yozib boradi ("qilolmagan ishlar" jurnali)
Maqsad: Jigar bilmagan yoki qilolmagan narsani to'qimaydi, ochiq tan oladi va **papkadagi md faylga yozib qo'yadi**. Egasi "qilolmagan ishlaringni ber" desa — beradi.

**Qayerda:** `~/Jigar/` papkasi (yoki Sozlamalarda tanlangan joy). Fayllar:
- `QILOLMAGAN-ISHLAR.md` — nima so'ralgan, nega qilolmadi, nima kerak (kalit, ruxsat, qurilma, yangi imkoniyat), qachon.
- `XATOLAR.md` — asbob xatolari: nima bo'ldi, xato matni, qurilma.
- `HARAKATLAR.md` — bajarilgan ishlar jurnali (10-band).

**Yozuv shakli:**
```
## 2026-11-14 10:32 — TV'ni yoqish
- So'rov: "televizorni yoq"
- Natija: qilolmadi
- Sabab: TV o'chiq, tarmoq orqali yoqib bo'lmaydi (Wake-on-LAN yo'q)
- Kerak: TV'da "tarmoq orqali yoqish"ni yoqish yoki Wake-on-LAN sozlamasi
- Holat: ochiq
```

**Qanday yoziladi:**
- Yangi asbob `log_gap` (so'rov, sabab, nima kerak): Jigar o'zi chaqiradi, qachon "bilmayman", "qilolmayman" desa.
- Asbob xatolari (ruxsat yo'q, qurilma ulanmagan, noma'lum amal) avtomatik `XATOLAR.md` ga tushadi.
- Server bazasida ham saqlanadi (`gaps` jadvali): qurilma o'chiq bo'lsa ham yo'qolmaydi; md fayl desktop agent orqali yoziladi.

**Qanday olinadi:**
- "Qilolmagan ishlaringni ber" / "nimalarni qilolmading?" — Jigar ochiq (hal bo'lmagan) yozuvlarni qisqa aytadi va faylni beradi ([FAYL] yuklab olish yoki Mac'da Finder'da ochadi).
- "Shuni hal qil" — o'sha yozuv bo'yicha yo'lini taklif qiladi yoki ishni davom ettiradi; hal bo'lgach holat "yopildi" bo'ladi.
- Har hafta (yoki egasi so'raganda) xulosa: nechta ochiq, eng ko'p takrorlanadigan sabab nima. Bu keyingi imkoniyatlarni tanlashga yordam beradi.

---

## 💡 G'oyalar (egasi "yozib qo'y" deganlari va takliflar)
- Aqlli uy: Home Assistant integratsiyasi — chiroq, konditsioner, rozetka, kamera, Chromecast (uyda Home Assistant bo'lsa).
- Google Calendar va Gmail — uchrashuvdan oldin eslatish, muhim xatlarni qisqa aytish.
- TV: yoqish va o'chirish (Wake-on-LAN, Samsung/LG API), kanal almashtirish, kompyuter ekranini TV'ga chiqarish.
- Telefon topish: "telefonim qayerda?" — telefonda baland ovoz chalinadi (Android agentdan keyin).

<!-- Yangi g'oyalar shu ro'yxatga qo'shiladi ("yozib qo'y"). -->
