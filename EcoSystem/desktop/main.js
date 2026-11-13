// Jigar EcoSystem — desktop ilova (Windows .exe, macOS .app). Electron oynasi EcoSystem serverini ochadi.
// Server manzili: ECO_URL → saqlangan → shu kompyuterdagi (localhost:3100) → birinchi ochilishda so'raladi (server-url.js).
// Tugmalar: Cmd/Ctrl+Shift+J — Jigarni ochadi va tinglashni boshlaydi (istalgan ilovada turganingizda).
// Jigarning qo'li: bridge.js serverga ulanadi, tools.js buyruqlarni bajaradi (ekran, fayl, ilova; buyruq va yozish — ruxsat bilan).
const { app, BrowserWindow, Tray, Menu, globalShortcut, session, nativeImage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { startBridge } = require("./bridge.js");
const { runTool } = require("./tools.js");
const { resolveServerUrl, askServerUrl } = require("./server-url.js");

let ECO_URL = null; // app.whenReady'da aniqlanadi
const SHORTCUT = "CommandOrControl+Shift+J";
let win = null;
let tray = null;

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
  // Mikrofon va kamera — faqat o'z serverimiz sahifasi uchun ruxsat.
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    const own = wc.getURL().startsWith(ECO_URL);
    callback(own && ["media", "notifications"].includes(permission));
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
