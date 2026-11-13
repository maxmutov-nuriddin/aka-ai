#!/usr/bin/env bash
# Yangi/o'zgargan sayt fayllarini (deploy/crm-proxy/sites/*.caddy) CRM'ning Caddy'siga QO'SHADI — CRM to'xtamaydi
# (Caddy "reload": uzilishsiz). Avval alohida konteynerda tekshiradi; xato bo'lsa hech narsa o'zgarmaydi; reload'dan
# keyin CRM 200 bermasa — eski fayllarni qaytaradi. Serverda, root:
#   bash /opt/jigar/deploy/crm-proxy/add-site.sh
# (apply.sh bir marta ishlagan bo'lishi kerak: proxy-extra/ mavjud.)
set -euo pipefail

CRM=/opt/fortis-team-crm
SRC=/opt/jigar/deploy/crm-proxy/sites
CRM_WEB=fortis-team-crm-web-1
EXTRA="$CRM/proxy-extra/sites"
BACKUP="$(mktemp -d)"

crm_code() { curl -s -m 8 -o /dev/null -w '%{http_code}' "https://$(grep -E '^SITE_ADDRESS=' "$CRM/.env" | cut -d= -f2)/" || true; }
reload() { docker exec "$CRM_WEB" caddy reload --config /etc/caddy/Caddyfile.root --adapter caddyfile; }

[[ -d "$EXTRA" ]] || { echo "proxy-extra/sites yo'q — avval apply.sh ni ishga tushiring."; exit 1; }
[[ "$(crm_code)" == "200" ]] || { echo "CRM hozir 200 bermayapti — boshlamayman."; exit 1; }

echo "== Hozirgi fayllar zaxiraga olinmoqda: $BACKUP"
cp -a "$EXTRA/." "$BACKUP/"
cp "$SRC"/*.caddy "$EXTRA/"

restore() {
  echo "== QAYTARILMOQDA"
  rm -f "$EXTRA"/*.caddy
  cp -a "$BACKUP/." "$EXTRA/"
  reload || true
  echo "CRM sayti: $(crm_code)"
}

echo "== Caddy sozlamasini tekshirish (alohida konteynerda)"
IMG="$(docker inspect -f '{{.Image}}' "$CRM_WEB")"
SITE="$(grep -E '^SITE_ADDRESS=' "$CRM/.env" | cut -d= -f2)"
if ! docker run --rm -e "SITE_ADDRESS=$SITE" \
  -v "$CRM/proxy-extra/Caddyfile.root:/etc/caddy/Caddyfile.root:ro" -v "$EXTRA:/etc/caddy/extra:ro" \
  "$IMG" caddy validate --config /etc/caddy/Caddyfile.root --adapter caddyfile; then
  restore
  exit 3
fi

echo "== Reload (uzilishsiz)"
if ! reload; then restore; exit 3; fi
sleep 3
if [[ "$(crm_code)" != "200" ]]; then echo "CRM javob bermadi!"; restore; exit 3; fi
echo "CRM sayti: 200 — tayyor. Qo'shilgan fayllar: $(ls "$EXTRA" | tr '\n' ' ')"
