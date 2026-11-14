// Server manzili (desktop): ECO_URL → saqlangan (userData/config.json) → ilova ichiga yozilgan manzil (package.json:
// jigar.serverUrl — javob bersa) → shu kompyuterdagi server (localhost:3100) → birinchi ochilishda oyna (setup.html) — egasi manzilni kiritadi, ulanish tekshirilib saqlanadi.
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const LOCAL_URL = "http://localhost:3100";
const HEALTH_TIMEOUT_MS = 4000;
const configFile = () => path.join(app.getPath("userData"), "config.json");

/** Manzilni tekshiradi va tozalaydi: faqat http(s), oxiridagi "/" va yo'l olib tashlanadi. Noto'g'ri — null. */
function normalizeServerUrl(input) {
  try {
    const url = new URL(String(input ?? "").trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Server javob beradimi (/api/health). */
async function reachable(url) {
  try {
    const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    return res.ok && (await res.json()).ok === true;
  } catch {
    return false;
  }
}

function readSaved() {
  try {
    return normalizeServerUrl(JSON.parse(fs.readFileSync(configFile(), "utf8")).serverUrl);
  } catch {
    return null;
  }
}

function save(url) {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  let current = {};
  try {
    current = JSON.parse(fs.readFileSync(configFile(), "utf8"));
  } catch {
    /* birinchi saqlash */
  }
  // Boshqa sozlamalar (autoStart, maxAccess) saqlanib qoladi — faqat manzil yangilanadi.
  fs.writeFileSync(configFile(), JSON.stringify({ ...current, serverUrl: url }, null, 2));
}

/** Manzil kiritish oynasi; saqlangach — manzil bilan resolve. */
function askServerUrl(current = "") {
  return new Promise((resolve) => {
    const setup = new BrowserWindow({
      width: 480, height: 420, resizable: false, title: "Jigar — server", backgroundColor: "#0b0e22",
      webPreferences: { preload: path.join(__dirname, "setup-preload.js"), contextIsolation: true, sandbox: true },
    });
    const onSave = async (_event, input) => {
      const url = normalizeServerUrl(input);
      if (!url) return { ok: false, error: "Manzil http:// yoki https:// bilan boshlansin." };
      if (!(await reachable(url))) return { ok: false, error: "Server javob bermadi. Manzil to'g'rimi, server yoqilganmi?" };
      save(url);
      ipcMain.removeHandler("jigar:save-server");
      setup.close();
      resolve(url);
      return { ok: true };
    };
    ipcMain.removeHandler("jigar:save-server");
    ipcMain.handle("jigar:save-server", onSave);
    setup.loadFile(path.join(__dirname, "setup.html"), { query: { current } });
    setup.on("closed", () => resolve(null));
  });
}

/**
 * Server boshqa manzilga yo'naltirsa (http → https, o'sha xost) — yakuniy manzil ishlatiladi: sahifa, ruxsatlar va
 * qurilma ko'prigi bitta manzilda bo'lsin. Boshqa xostga yo'naltirish qabul qilinmaydi.
 */
async function canonical(url) {
  try {
    const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    const final = new URL(res.url);
    if (res.ok && final.hostname === new URL(url).hostname) return final.origin;
  } catch {
    /* server hozir javob bermayapti — kiritilgan manzil qoladi */
  }
  return url;
}

/** package.json "jigar": serverUrls (tartib bilan) + eski serverUrl; noto'g'ri va takrorlar tashlanadi. */
function presetUrls(config = {}) {
  const list = [...(Array.isArray(config?.serverUrls) ? config.serverUrls : []), config?.serverUrl];
  return [...new Set(list.map((u) => normalizeServerUrl(u)).filter(Boolean))];
}

/** Ishlatiladigan manzil. Hech biri bo'lmasa va egasi oynani yopsa — null. */
async function resolveServerUrl() {
  const fromEnv = normalizeServerUrl(process.env.ECO_URL);
  if (fromEnv) return canonical(fromEnv);
  const saved = readSaved();
  if (saved) return canonical(saved);
  // Tayyor manzil (masalan, serverdagi Jigar): saqlanmaydi — server vaqtincha o'chiq bo'lsa, keyingi pog'onaga o'tadi.
  // Bir nechta tayyor manzil: domen (DNS hali ishlamasa) → zaxira manzil (sslip) — mahalliy eski serverga tushib qolmasin.
  for (const preset of presetUrls(require("./package.json").jigar)) {
    if (await reachable(preset)) return preset;
  }
  if (await reachable(LOCAL_URL)) return LOCAL_URL;
  return askServerUrl();
}

module.exports = { resolveServerUrl, askServerUrl, normalizeServerUrl, readSaved, presetUrls };
