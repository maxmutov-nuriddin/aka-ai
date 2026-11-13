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

/** Ishlatiladigan manzil. Hech biri bo'lmasa va egasi oynani yopsa — null. */
async function resolveServerUrl() {
  const fromEnv = normalizeServerUrl(process.env.ECO_URL);
  if (fromEnv) return fromEnv;
  const saved = readSaved();
  if (saved) return saved;
  // Tayyor manzil (masalan, serverdagi Jigar): saqlanmaydi — server vaqtincha o'chiq bo'lsa, keyingi pog'onaga o'tadi.
  const preset = normalizeServerUrl(require("./package.json").jigar?.serverUrl);
  if (preset && (await reachable(preset))) return preset;
  if (await reachable(LOCAL_URL)) return LOCAL_URL;
  return askServerUrl();
}

module.exports = { resolveServerUrl, askServerUrl, normalizeServerUrl, readSaved };
