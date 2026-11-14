// Ilovalarni yuklab olish (YUKLAB-OLISH-REJA.md):
//   GET /download            — eski havola: Sozlamalar → "Jigar ilovalari" bo'limiga yo'naltiradi (alohida sahifa yo'q)
//   GET /api/downloads       — qaysi fayllar bor: hajmi, SHA-256, versiya + telefon uchun manzil (phoneUrl) va QR
//   GET /downloads/:file     — faylning o'zi (faqat ro'yxatdagi nomlar; boshqa yo'l — 404)
// Fayllar: EcoSystem/downloads/ (npm run build:mac | build:win | build:android yig'adi), git'ga kirmaydi.
import express from "express";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import path from "node:path";
import QRCode from "qrcode";

/** Platforma → fayl nomlari (birinchi mavjudi beriladi). Faqat shular (path traversal yo'q).
 *  Windows: .exe — o'rnatuvchi (CI'da yig'iladi), .zip — o'rnatishsiz Jigar.exe (Mac'da yig'iladi: npm run build:win-zip). */
export const DOWNLOAD_FILES = { mac: ["Jigar-mac.dmg"], windows: ["Jigar-win.exe", "Jigar-win.zip"], android: ["Jigar-android.apk"] };
const ALLOWED = new Set(Object.values(DOWNLOAD_FILES).flat());

/** Shu kompyuterning Wi-Fi'dagi birinchi IPv4 manzili (telefon QR orqali kiradi) yoki null. */
export function lanAddress() {
  return Object.values(networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal)?.address ?? null;
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file).on("data", (d) => hash.update(d)).on("end", () => resolve(hash.digest("hex"))).on("error", reject);
  });
}

export const APPS_SETTINGS_PATH = "/app/?settings=apps";
const LOCAL_HOST_RE = /^(localhost|127\.|\[?::1\]?)/i;

/**
 * Telefon QR orqali ochadigan manzil: server internetda (domen) — shu domen; uyda (localhost) — Wi-Fi'dagi IP.
 * @returns {string | null}
 */
export function phoneUrlFor({ protocol, host }, lanIp) {
  const value = String(host ?? "");
  if (value && !LOCAL_HOST_RE.test(value)) return `${protocol}://${value}${APPS_SETTINGS_PATH}`;
  if (!lanIp) return null;
  const port = value.split(":")[1] || "";
  return `http://${lanIp}${port ? `:${port}` : ""}${APPS_SETTINGS_PATH}`;
}

/**
 * @param {{ dir: string, version: string, limiter: import("express").RequestHandler,
 *           lan?: () => string | null }} options
 */
export function createDownloadsRouter({ dir, version, limiter, lan = lanAddress }) {
  const router = express.Router();
  const hashes = new Map(); // fayl nomi → { key (hajm+vaqt), sha } — katta faylni har safar qayta hisoblamaslik

  /** downloads/versions.json: { "Jigar-win.exe": "2.1.0", ... } — deploy/publish-builds.mjs yozadi; yo'q bo'lsa {}. */
  async function readVersions() {
    try {
      return JSON.parse(await readFile(path.join(dir, "versions.json"), "utf8"));
    } catch {
      return {};
    }
  }

  async function describe(platform, names, versions) {
    let name = names[0];
    let info = null;
    for (const candidate of names) {
      info = await stat(path.join(dir, candidate)).catch(() => null);
      name = candidate;
      if (info?.isFile()) break;
    }
    if (!info?.isFile()) return { platform, name: names[0], ready: false };
    const key = `${info.size}:${info.mtimeMs}`;
    if (hashes.get(name)?.key !== key) hashes.set(name, { key, sha: await sha256(path.join(dir, name)) });
    return { platform, name, ready: true, version: versions[name] ?? null, size: info.size, sha256: hashes.get(name).sha, url: `/downloads/${name}` };
  }

  router.get("/download", (_req, res) => res.redirect(302, APPS_SETTINGS_PATH));

  router.get("/api/downloads", async (req, res) => {
    try {
      const versions = await readVersions();
      const files = await Promise.all(Object.entries(DOWNLOAD_FILES).map(([p, n]) => describe(p, n, versions)));
      const phoneUrl = phoneUrlFor({ protocol: req.protocol, host: req.get("host") }, lan());
      const qr = phoneUrl ? await QRCode.toString(phoneUrl, { type: "svg", margin: 1 }) : null;
      res.json({ version, files, phoneUrl, qr });
    } catch (err) {
      console.error("[/api/downloads]", err);
      res.status(500).json({ error: "Ro'yxatni olib bo'lmadi." });
    }
  });

  router.get("/downloads/:file", limiter, async (req, res) => {
    const name = req.params.file;
    if (!ALLOWED.has(name)) return res.status(404).json({ error: "Bunday fayl yo'q." });
    const file = path.join(dir, name);
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) return res.status(404).json({ error: "Fayl hali tayyor emas." });
    res.download(file, name);
  });

  return router;
}
