#!/usr/bin/env bash
# Mac'dan serverga FAQAT Jigar EcoSystem'ni yuklaydi (Global, kalitlar, lokal baza va node_modules — yo'q).
#   bash EcoSystem/deploy/upload.sh root@<server-ip>
# Keyin serverda: cd /opt/jigar && docker compose up -d --build
set -euo pipefail

TARGET="${1:?Server manzilini bering: bash deploy/upload.sh root@1.2.3.4}"
APP_DIR="${APP_DIR:-/opt/jigar}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)" # EcoSystem papkasi

cd "$ROOT"
# Kerakli fayllargina (Dockerfile shularni ishlatadi). .env, data/, node_modules, desktop ilova kodi — yuborilmaydi.
rsync -az --delete --human-readable --progress \
  --include='/package.json' --include='/package-lock.json' \
  --include='/Dockerfile' --include='/docker-compose.yml' --include='/DEPLOY.md' \
  --include='/deploy/***' \
  --include='/server/***' --include='/web/***' --include='/prompts/***' \
  --include='/desktop/' --include='/desktop/package.json' --include='/desktop/youtube-search.js' \
  --include='/downloads/' --include='/downloads/Jigar-mac.dmg' --include='/downloads/Jigar-win.zip' \
  --include='/downloads/Jigar-win.exe' --include='/downloads/Jigar-android.apk' \
  --exclude='.env*' --exclude='*' \
  ./ "$TARGET:$APP_DIR/"

echo
echo "Yuklandi: $TARGET:$APP_DIR"
echo "Serverda: cd $APP_DIR && docker compose up -d --build"
