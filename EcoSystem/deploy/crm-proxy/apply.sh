#!/usr/bin/env bash
# Jigar'ni CRM'ning Caddy'si orqali internetga ochadi (serverda, root). CRM kodi/bazasi o'zgarmaydi.
#   bash /opt/jigar/deploy/crm-proxy/apply.sh
# Tartib: DNS tekshiruvi → CRM zaxirasi → fayllar → Caddy sozlamasini TEKSHIRISH → faqat CRM'ning "web" konteynerini
# qayta yaratish → CRM ishlayaptimi tekshirish (ishlamasa — avtomatik QAYTARADI) → Jigar HTTPS tekshiruvi.
set -euo pipefail

CRM=/opt/fortis-team-crm
SRC=/opt/jigar/deploy/crm-proxy
DOMAIN="${DOMAIN:-ecosystem.myjigar.uz}"
SERVER_IP="${SERVER_IP:-169.58.115.116}"
CRM_WEB=fortis-team-crm-web-1

say() { printf '\n== %s\n' "$*"; }
crm_code() { curl -s -m 8 -o /dev/null -w '%{http_code}' "https://$(grep -E '^SITE_ADDRESS=' "$CRM/.env" | cut -d= -f2)/" || true; }

rollback() {
  say "QAYTARILMOQDA: CRM avvalgi holatga"
  cd "$CRM"
  rm -f docker-compose.override.yml
  rm -rf proxy-extra
  docker compose up -d web
  sleep 5
  echo "CRM sayti: $(crm_code)"
}

cd "$CRM"
say "0. Shartlar"
[[ ! -e docker-compose.override.yml ]] || { echo "docker-compose.override.yml allaqachon bor — to'xtadim (qo'lda tekshiring)."; exit 1; }
docker network inspect jigar-edge >/dev/null
[[ "$(docker inspect -f '{{.State.Health.Status}}' jigar-jigar-1)" == "healthy" ]] || { echo "Jigar sog'lom emas."; exit 1; }
[[ "$(crm_code)" == "200" ]] || { echo "CRM hozir 200 bermayapti — boshlamayman."; exit 1; }
for r in 1.1.1.1 8.8.8.8; do
  ip="$(dig +short A "$DOMAIN" @"$r" | tail -1)"
  [[ "$ip" == "$SERVER_IP" ]] || { echo "DNS tayyor emas ($r: '${ip:-bosh}'). Sertifikat olinmaydi — to'xtadim."; exit 2; }
done
echo "DNS: $DOMAIN -> $SERVER_IP (ikkala umumiy DNS'da)"

say "1. CRM zaxirasi"
./deploy/backup.sh

say "2. Fayllar"
mkdir -p proxy-extra/sites
cp "$SRC/Caddyfile.root" proxy-extra/Caddyfile.root
cp "$SRC/sites/jigar.caddy" proxy-extra/sites/jigar.caddy

say "3. Caddy sozlamasini tekshirish (alohida konteynerda, CRM'ga tegmasdan)"
IMG="$(docker inspect -f '{{.Image}}' "$CRM_WEB")"
SITE="$(grep -E '^SITE_ADDRESS=' .env | cut -d= -f2)"
docker run --rm -e "SITE_ADDRESS=$SITE" \
  -v "$PWD/proxy-extra/Caddyfile.root:/etc/caddy/Caddyfile.root:ro" -v "$PWD/proxy-extra/sites:/etc/caddy/extra:ro" \
  "$IMG" caddy validate --config /etc/caddy/Caddyfile.root --adapter caddyfile
cp "$SRC/docker-compose.override.yml" docker-compose.override.yml
docker compose config -q

say "4. CRM 'web' konteynerini qayta yaratish (baza va backend tegilmaydi)"
if ! docker compose up -d web; then rollback; exit 3; fi

say "5. CRM tekshiruvi"
ok=0
for _ in $(seq 1 20); do
  if [[ "$(crm_code)" == "200" ]]; then ok=1; break; fi
  sleep 3
done
if [[ $ok -ne 1 ]]; then echo "CRM javob bermadi!"; rollback; exit 3; fi
echo "CRM sayti: 200"
docker ps --format '{{.Names}} {{.Status}}' | grep fortis

say "6. Jigar HTTPS (sertifikat olinishi 1-2 daqiqa)"
for _ in $(seq 1 40); do
  code="$(curl -s -m 8 -o /dev/null -w '%{http_code}' "https://$DOMAIN/api/health" || true)"
  if [[ "$code" == "200" ]]; then echo "https://$DOMAIN/api/health: 200"; exit 0; fi
  sleep 5
done
echo "Jigar HTTPS hali javob bermadi (CRM esa ishlayapti). Loglar: docker logs --tail 40 $CRM_WEB"
exit 4
