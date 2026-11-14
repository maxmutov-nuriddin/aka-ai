// Versiyalangan statik fayllar: /app/ sahifasidagi kod fayllariga ?v=<versiya> qo'shiladi va ular 1 yil keshlanadi —
// o'zgarmasa brauzer ularni umuman so'ramaydi (takroriy ochilish tezlashadi; 25 ta "tekshirish" so'rovi yo'qoladi).
// Fayl o'zgarsa versiya o'zgaradi va brauzer yangisini oladi. Chaqiruvchi: server/app.js.
// ES modullar: ichki "./voice.js" kabi importlar sahifadagi import map orqali ?v bilan so'raladi.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".git"]);
const CODE_FILE_RE = /\.(?:js|mjs|css)$/;

/** Papkadagi kod fayllarining (nom + mazmun) qisqa SHA-1 belgisi: biror fayl o'zgarsa — boshqa versiya. */
export function buildId(dirs, extraFiles = []) {
  const hash = createHash("sha1");
  const visit = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      if (SKIP_DIRS.has(name)) continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) visit(full);
      else if (CODE_FILE_RE.test(name)) hash.update(full).update(readFileSync(full));
    }
  };
  for (const dir of dirs) visit(dir);
  for (const file of extraFiles) hash.update(file).update(readFileSync(file));
  return hash.digest("hex").slice(0, 10);
}

const withVersion = (url, id) => (url.includes("?") ? url : `${url}?v=${id}`);

/**
 * HTML'dagi mahalliy modul/uslub/skript manzillariga ?v=id qo'shadi va ichki importlar uchun import map yozadi.
 * modulepreload ro'yxati (index.html) importlarning to'liq ro'yxati sifatida ishlatiladi (test/web/preload.test.js tekshiradi).
 */
export function versionHtml(html, id) {
  const preloaded = [...html.matchAll(/<link rel="modulepreload" href="(\/[^"?]+)">/g)].map((m) => m[1]);
  const imports = Object.fromEntries(preloaded.map((url) => [url, withVersion(url, id)]));
  const importMap = `<script type="importmap">${JSON.stringify({ imports })}</script>`;
  const out = html
    .replace(/(<link rel="modulepreload" href=")(\/[^"?]+)(">)/g, (_m, a, url, b) => `${a}${withVersion(url, id)}${b}`)
    .replace(/(<link rel="stylesheet" href=")((?:\/|\.\.?\/)?[^"?:]+\.css)(")/g, (_m, a, url, b) => `${a}${withVersion(url, id)}${b}`)
    .replace(/(<script type="module" src=")([^"?:]+\.js)(")/g, (_m, a, url, b) => `${a}${withVersion(url, id)}${b}`)
    .replace(/(<script src=")([^"?:]+\.js)(")/g, (_m, a, url, b) => `${a}${withVersion(url, id)}${b}`);
  // Import map modullardan OLDIN bo'lishi shart (birinchi modulepreload/skriptdan avval).
  const firstModule = out.search(/<link rel="modulepreload"|<script type="module"/);
  return firstModule < 0 ? out : `${out.slice(0, firstModule)}${importMap}\n  ${out.slice(firstModule)}`;
}

/** ?v=... bilan so'ralgan kod fayllari — o'zgarmas (1 yil kesh). Express middleware. */
export function immutableVersioned(req, res, next) {
  if (typeof req.query.v === "string" && CODE_FILE_RE.test(req.path)) res.set("Cache-Control", "public, max-age=31536000, immutable");
  next();
}
