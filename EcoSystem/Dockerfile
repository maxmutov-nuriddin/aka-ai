# Jigar EcoSystem serveri. node:sqlite — Node 22.5+ (bu yerda 24).
FROM node:24-slim
ENV NODE_ENV=production \
    ECO_DOCKER=1 \
    PORT=3100 \
    HOST=0.0.0.0 \
    ECO_DB_FILE=/data/eco.db \
    ECO_JOURNAL_DIR=/data/journal \
    ECO_DOWNLOADS_DIR=/app/downloads
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY web ./web
COPY prompts ./prompts
# desktop/package.json — faqat versiya raqami uchun (yuklab olish sahifasi); youtube-search.js — telefon uchun qidiruv
COPY desktop/package.json ./desktop/package.json
COPY desktop/youtube-search.js ./desktop/youtube-search.js
RUN mkdir -p /data downloads && chown -R node:node /data /app/downloads
USER node
VOLUME ["/data"]
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3100/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
