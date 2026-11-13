#!/usr/bin/env bash
# Serverdagi kunlik zaxiralarni (baza: /data/backups, oxirgi 7 kun) Mac'ga ko'chiradi — server diski buzilsa ham
# ma'lumot yo'qolmasin. Haftada bir marta ishga tushiring:
#   bash EcoSystem/deploy/backup-pull.sh root@<server-ip>
# Zaxira ~/Jigar-zaxira/<sana>/ ga tushadi, faqat siz o'qiy olasiz (chmod 700).
set -euo pipefail

TARGET="${1:?Server manzilini bering: bash deploy/backup-pull.sh root@1.2.3.4}"
APP_DIR="${APP_DIR:-/opt/jigar}"
DEST="${DEST:-$HOME/Jigar-zaxira}/$(date +%Y-%m-%d)"

mkdir -p "$DEST"
chmod 700 "$(dirname "$DEST")" "$DEST"
ssh "$TARGET" "cd $APP_DIR && docker compose exec -T jigar tar -C /data -cf - backups journal" | tar -C "$DEST" -xf -
chmod -R go-rwx "$DEST"
echo "Zaxira: $DEST"
ls -la "$DEST/backups" | tail -3
