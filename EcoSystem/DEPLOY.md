# Jigar EcoSystem — serverga joylash

Maqsad: Jigar internetda, **HTTPS** bilan ishlasin (mikrofon, Siri va uydan tashqarida telefon uchun shart).

## 0. Nima kerak
- Linux server (VPS, 1 GB RAM yetadi), Docker va Docker Compose.
- Domen (masalan `jigar.sizning-domen.uz`), A-yozuvi server IP'siga qaratilgan; 80 va 443 portlar ochiq.
- Anthropic API kaliti. **Konsolda oylik limit qo'ying** (Settings → Limits): fon ishlari cheksiz so'rov yuborishi mumkin.

> Serverga **hech qachon** lokal `.env` ni ko'chirmang: unda `ECO_LOCAL_NOAUTH=1` (parolsiz kirish). Server production'da bunday sozlama bilan umuman ishga tushmaydi.

## 1. Fayllarni olish
```bash
git clone https://github.com/maxmutov-nuriddin/aka-ai.git
cd aka-ai && git checkout jigar-2-split
cd EcoSystem
```

## 2. Sozlash
```bash
cp deploy/.env.production.example .env.production
nano .env.production        # ANTHROPIC_API_KEY va boshqa kalitlarni yozing
export DOMAIN=jigar.sizning-domen.uz
```
Majburiy qiymatlar `.env.production` da tayyor: `NODE_ENV=production`, `ECO_LOCAL_NOAUTH=0`, `TRUST_PROXY=1`.

## 3. Ishga tushirish
```bash
docker compose up -d --build
docker compose logs -f jigar    # "Jigar EcoSystem ishga tushdi" chiqishi kerak
```
Caddy HTTPS sertifikatini (Let's Encrypt) o'zi oladi. `https://<domen>/` ni oching.

## 4. Birinchi kirish
1. Sahifa parol qo'yishni so'raydi. **Uzun va noyob parol** tanlang (`12345678` kabi parollar rad etiladi).
2. Sozlamalar → "Jarvis" bo'limida:
   - **Faol rejim** — o'chiq qoldiring, ekran suratlari tashqariga chiqmasin (kerak bo'lsa keyin yoqasiz);
   - **Ruxsat darajasi** — "Xavfsiz" yoki "Keng" (kundalik ish uchun).

## 5. Ilovalarni ulash
- **Mac / Windows:** `/download` sahifasidan yuklang. Birinchi ochilganda server manzilini so'raydi → `https://<domen>`. Keyin parolni kiriting.
- **Android:** `.apk` ni yuklab o'rnating (yig'ilgach), ilova manzilni so'raydi.
- **iPhone:** Safari → `https://<domen>/app/` → Ulashish → Bosh ekranga qo'shish.
- **Siri:** Sozlamalar → "Siri uchun kalit" → `/download` sahifasidagi yo'riqnoma. Siri kaliti eng ko'pi bilan "keng" darajada ishlaydi.
- Yuklab olinadigan ilovalar: `.dmg`, `.zip`, `.apk` fayllarni serverdagi `EcoSystem/downloads/` papkasiga qo'ying.

## 6. Doimiy ish
| Nima | Qanday |
|---|---|
| Yangilash | `git pull && docker compose up -d --build` |
| Zaxira | Baza har kuni `/data/backups/` ga nusxalanadi (oxirgi 7 kun). Boshqa joyga ko'chirib turing: `docker compose cp jigar:/data/backups ./zaxira` |
| Loglar | `docker compose logs --tail=100 jigar` |
| Jurnal fayllari | `/data/journal/*.md` (qilolmagan ishlar, xatolar, harakatlar) |
| To'xtatish | `docker compose down` (ma'lumot saqlanadi) |

## 7. Tekshiruv ro'yxati (joylagandan keyin)
- [ ] `https://<domen>/` ochiladi, brauzerda qulf belgisi bor.
- [ ] **Maxfiy oynada** ochganda parol so'raydi (parolsiz kirmaydi).
- [ ] `curl -I https://<domen>/api/health` javobida `Strict-Transport-Security` bor.
- [ ] Mikrofon ishlaydi (HTTPS bo'lgani uchun).
- [ ] Desktop ilova server manzilini qabul qilib ulandi: Sozlamalar → "Miya va ovoz" da qurilma nomi ko'rinadi.
- [ ] Anthropic konsolida oylik limit qo'yilgan.
- [ ] Zaxira fayli paydo bo'lgan: `docker compose exec jigar ls /data/backups`.

## Xavfsizlik qoidalari
- Siri va qurilma kalitlari alohida; Siri kaliti qurilma bo'lib ulana olmaydi. Kalit sirib ketsa — Sozlamalardan o'chiring.
- Desktop ilova server buyrug'idan qat'i nazar, o'zida "to'liq" darajadan yuqoriga chiqmaydi (`ECO_MAX_ACCESS=safe|wide|full` bilan pasaytirish mumkin).
- "To'liq" va "cheksiz" darajada Jigar ekran va veb-sahifadan o'qigan ko'rsatmaga aldanishi mumkin. Kundalik ishda "Xavfsiz" yoki "Keng" turing.
