// Jigar EcoSystem — desktop ilova (Windows .exe, macOS .app). Electron oynasi EcoSystem serverini ochadi.
// Server manzili: ECO_URL → saqlangan → shu kompyuterdagi (localhost:3100) → birinchi ochilishda so'raladi (server-url.js).
// Tugmalar: Cmd/Ctrl+Shift+J — Jigarni ochadi va tinglashni boshlaydi (istalgan ilovada turganingizda).
// Jigarning qo'li: bridge.js serverga ulanadi, tools.js buyruqlarni bajaradi (ekran, fayl, ilova; buyruq va yozish — ruxsat bilan).
const { app, BrowserWindow, Tray, Menu, globalShortcut, session, nativeImage, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { startBridge } = require("./bridge.js");
const { runTool, setMaxAccess } = require("./tools.js");
const { resolveServerUrl, askServerUrl } = require("./server-url.js");

let ECO_URL = null; // app.whenReady'da aniqlanadi
const SHORTCUT = "CommandOrControl+Shift+J";
let win = null;
let tray = null;

/** Sahifa shu server (aynan shu origin)mi. */
function isOwnPage(url) {
  try {
    return new URL(url).origin === new URL(ECO_URL).origin;
  } catch {
    return false;
  }
}

/** Faqat http(s) havolalar tashqi brauzerda ochiladi (file:, javascript: va boshqalar — yo'q). */
function openExternal(url) {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
}

/** Shu kompyuterdagi eng yuqori ruxsat darajasi: ECO_MAX_ACCESS → config.json (maxAccess) → "full". */
function readMaxAccess() {
  if (process.env.ECO_MAX_ACCESS) return process.env.ECO_MAX_ACCESS;
  try {
    return JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), "config.json"), "utf8")).maxAccess;
  } catch {
    return undefined;
  }
}

/** Shu kompyuterning doimiy id'si (userData/device.json) — server qurilmalarni ajratadi. */
function deviceId() {
  const file = path.join(app.getPath("userData"), "device.json");
  try {
    const { id } = JSON.parse(fs.readFileSync(file, "utf8"));
    if (/^[A-Za-z0-9_-]{8,64}$/.test(id)) return id;
  } catch {
    /* birinchi ishga tushish */
  }
  const id = randomUUID();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ id }));
  return id;
}

function createWindow(id) {
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    title: "Jigar",
    backgroundColor: "#0b0e22",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  // Server chat qaysi kompyuterdan yozilganini biladi ("shu kompyuterda" — aytilmasa ham shu yerda bajariladi).
  win.webContents.setUserAgent(`${win.webContents.getUserAgent()} JigarDesktop/${id}`);
  win.loadURL(`${ECO_URL}/app/`);
  // Yopish tugmasi — ilova yopilmaydi, fonda qoladi (tray'dan qayta ochiladi).
  win.on("close", (event) => {
    if (app.isQuitting) return;
    event.preventDefault();
    win.hide();
  });
}

/** Jigarni oldinga chiqaradi va mikrofon tugmasini bosadi (tinglash boshlanadi). */
function summon() {
  if (!win) return;
  win.show();
  win.focus();
  win.webContents.executeJavaScript('document.getElementById("mic")?.click()').catch(() => {});
}

/** Server manzilini o'zgartirish (tray menyusi): yangi manzil saqlanadi va ilova qayta ishga tushadi. */
async function changeServer() {
  const url = await askServerUrl(ECO_URL ?? "");
  if (!url) return;
  app.relaunch();
  app.isQuitting = true;
  app.quit();
}

app.whenReady().then(async () => {
  ECO_URL = await resolveServerUrl();
  if (!ECO_URL) {
    app.quit(); // egasi manzil oynasini yopdi
    return;
  }
  setMaxAccess(readMaxAccess());
  // Mikrofon va kamera — faqat o'z serverimiz sahifasi uchun ruxsat (manzil to'liq solishtiriladi:
  // "localhost:3100.boshqa.com" kabi manzillar mos kelmaydi).
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    callback(isOwnPage(wc.getURL()) && ["media", "notifications"].includes(permission));
  });
  app.on("web-contents-created", (_event, contents) => {
    // Jigar oynasi faqat o'z serveridan chiqib ketmasin; tashqi havolalar — oddiy brauzerda.
    contents.on("will-navigate", (event, url) => {
      if (isOwnPage(url) || url.startsWith("file:")) return;
      event.preventDefault();
      openExternal(url);
    });
    contents.setWindowOpenHandler(({ url }) => {
      openExternal(url);
      return { action: "deny" };
    });
  });
  const id = deviceId();
  createWindow(id);
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, "icon.png")).resize({ width: 18, height: 18 }));
  tray.setToolTip("Jigar");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Jigarni ochish (Cmd/Ctrl+Shift+J)", click: summon },
    { label: "Server manzilini o'zgartirish…", click: changeServer },
    { type: "separator" },
    { label: "Chiqish", click: () => { app.isQuitting = true; app.quit(); } },
  ]));
  tray.on("click", summon);
  globalShortcut.register(SHORTCUT, summon);
  // Kompyuter Jigarga ulanadi: telefondan yoki shu oynadan aytilgan ishni shu yerda bajaradi.
  startBridge({ baseUrl: ECO_URL, deviceId: id, runTool: (command) => runTool(command, { getWindow: () => win }) });
});

// Oynalar yopilsa ham ilova tray'da yashaydi (server manzili oynasi yopilgach ham — Windows'da standart bo'yicha chiqib ketardi).
app.on("window-all-closed", () => {});
app.on("activate", () => win?.show());
app.on("will-quit", () => globalShortcut.unregisterAll());
