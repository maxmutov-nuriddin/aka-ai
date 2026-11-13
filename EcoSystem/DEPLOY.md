# Jigar EcoSystem — serverga joylash

Maqsad: Jigar internetda, **HTTPS** bilan ishlasin (mikrofon, Siri va uydan tashqarida telefon uchun shart).

## 0. Nima kerak
- Server: **4 CPU / 8 GB RAM / 100 GB disk** (Ubuntu 22.04/24.04 yoki Debian 12). Jigar 2 CPU va 2 GB bilan cheklangan (Claude bulutda ishlaydi) — qolgani zaxirada.
- **Domen** (masalan `jigar.sizning-domen.uz`), A-yozuvi server IP'siga qaratilgan. HTTPS (va mikrofon) domensiz ishlamaydi.
- Anthropic API kaliti. **Konsolda oylik limit qo'ying** (Settings → Limits): fon ishlari cheksiz so'rov yuborishi mumkin.
- Serverga faqat **EcoSystem** yuklanadi (Global, lokal `.env`, lokal baza — yo'q).

> Serverga **hech qachon** lokal `.env` ni ko'chirmang: unda `ECO_LOCAL_NOAUTH=1` (parolsiz kirish). Server production'da bunday sozlama bilan umuman ishga tushmaydi.

## 1. Serverni tayyorlash (bir marta)
Mac'da SSH kalitini serverga qo'ying (parol bilan kirish keyin o'chiriladi):
```bash
ssh-copy-id root@<server-ip>
scp EcoSystem/deploy/setup-server.sh root@<server-ip>:/root/
ssh root@<server-ip> "bash /root/setup-server.sh"
```
Skript: tizim yangilanadi va xavfsizlik yangilanishlari avtomatik bo'ladi; faervol — faqat SSH, 80, 443; fail2ban;
SSH — faqat kalit bilan; Docker; `/opt/jigar` papkasi.

## 2. Yuklash va sozlash
Mac'da (faqat EcoSystem fayllari yuboriladi):
```bash
bash EcoSystem/deploy/upload.sh root@<server-ip>
```
Serverda:
```bash
cd /opt/jigar
cp deploy/.env.production.example .env.production
chmod 600 .env.production   # kalitlarni faqat root o'qiy oladi
nano .env.production        # ANTHROPIC_API_KEY va boshqa kalitlarni yozing
echo "DOMAIN=jigar.sizning-domen.uz" > .env   # docker compose shu domenga HTTPS oladi
```

## 3. Ishga tushirish
```bash
docker compose up -d --build
docker compose logs -f jigar    # "Jigar EcoSystem ishga tushdi" chiqishi kerak
```
Caddy HTTPS sertifikatini (Let's Encrypt) o'zi oladi. `https://<domen>/` ni oching.

## 3b. Serverda boshqa loyiha bo'lsa (CRM bilan bir serverda) — 80/443 band
Bunday serverda Jigar'ning o'z Caddy'si ishlamaydi (portlar band). Jigar boshqa loyihaning Caddy'si orqali ochiladi,
u loyihaning kodiga tegilmaydi:
```bash
docker network create jigar-edge          # bir marta
cd /opt/jigar
docker compose -f docker-compose.yml -f deploy/shared-proxy.compose.yml up -d --build jigar
SKIP_DNS_CHECK=1 bash deploy/crm-proxy/apply.sh   # DNS tayyor bo'lsa SKIP_DNS_CHECK kerak emas
```
`apply.sh` tartibi: CRM zaxirasi → yangi Caddy sozlamasini alohida konteynerda tekshirish → faqat CRM'ning `web`
konteynerini qayta yaratish (bir necha soniya) → CRM tekshiruvi (ishlamasa o'zi avvalgi holatga qaytaradi).
Jigar sayti manzili `deploy/crm-proxy/sites/jigar.caddy` da (domenni shu yerda o'zgartiring).
Yangilash: `bash deploy/upload.sh root@<ip>`, keyin `up -d --build jigar` (yuqoridagi birinchi buyruq).
**Parol:** Jigar ochilishidan OLDIN egasi parolini o'zingiz qo'ying (birinchi kirgan qo'yadi): ichki tarmoqda
`/api/auth/setup` ga `{"password":"..."}` yuboring (`jigar-edge` tarmog'idagi vaqtinchalik curl konteyneridan).

## 4. Birinchi kirish
1. Sahifa parol qo'yishni so'raydi. **Uzun va noyob parol** tanlang (`12345678` kabi parollar rad etiladi).
2. Sozlamalar → "Jarvis" bo'limida:
   - **Faol rejim** — o'chiq qoldiring, ekran suratlari tashqariga chiqmasin (kerak bo'lsa keyin yoqasiz);
   - **Ruxsat darajasi** — "Xavfsiz" yoki "Keng" (kundalik ish uchun).

## 5. Ilovalarni ulash
- **Mac / Windows:** Sozlamalar → "Jigar ilovalari" bo'limidan yuklang (telefon uchun QR ham shu yerda). Birinchi ochilganda server manzilini so'raydi → `https://<domen>`. Keyin parolni kiriting.
- **Android:** `.apk` ni yuklab o'rnating (yig'ilgach), ilova manzilni so'raydi.
- **iPhone:** Safari → `https://<domen>/app/` → Ulashish → Bosh ekranga qo'shish.
- **Siri:** Sozlamalar → Xavfsizlik → "Siri uchun kalit"; yo'riqnoma — "Jigar ilovalari" bo'limida. Siri kaliti eng ko'pi bilan "keng" darajada ishlaydi.
- Yuklab olinadigan ilovalar: `.dmg`, `.zip`, `.apk` — Mac'dagi `EcoSystem/downloads/` da bo'lsa, `upload.sh` ularni ham yuboradi.

## 6. Doimiy ish
| Nima | Qanday |
|---|---|
| Yangilash | Mac'da `bash EcoSystem/deploy/upload.sh root@<ip>`, serverda `cd /opt/jigar && docker compose up -d --build` |
| Zaxira | Baza har kuni `/data/backups/` ga nusxalanadi (oxirgi 7 kun). Haftada bir Mac'ga ko'chiring: `bash EcoSystem/deploy/backup-pull.sh root@<ip>` |
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
- [ ] Faervol: `ufw status` — faqat OpenSSH, 80, 443. Tashqaridan `http://<ip>:3100` OCHILMAYDI.
- [ ] SSH parol bilan kirmaydi: `ssh -o PubkeyAuthentication=no root@<ip>` rad etiladi.
- [ ] `.env.production` huquqi: `ls -l .env.production` → `-rw-------`.

## Xavfsizlik qoidalari
- Siri va qurilma kalitlari alohida; Siri kaliti qurilma bo'lib ulana olmaydi. Kalit sirib ketsa — Sozlamalardan o'chiring.
- Desktop ilova server buyrug'idan qat'i nazar, o'zida "to'liq" darajadan yuqoriga chiqmaydi (`ECO_MAX_ACCESS=safe|wide|full` bilan pasaytirish mumkin).
- "To'liq" va "cheksiz" darajada Jigar ekran va veb-sahifadan o'qigan ko'rsatmaga aldanishi mumkin. Kundalik ishda "Xavfsiz" yoki "Keng" turing.
