// Jigar EcoSystem — desktop ilova (Windows .exe, macOS .app). Electron oynasi EcoSystem serverini ochadi.
// Server manzili: ECO_URL (standart http://localhost:3100). Internetdagi server bo'lsa — https://... manzil.
// Tugmalar: Cmd/Ctrl+Shift+J — Jigarni ochadi va tinglashni boshlaydi (istalgan ilovada turganingizda).
const { app, BrowserWindow, Tray, Menu, globalShortcut, session, nativeImage } = require("electron");
const path = require("node:path");

const ECO_URL = process.env.ECO_URL || "http://localhost:3100";
const SHORTCUT = "CommandOrControl+Shift+J";
let win = null;
let tray = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    title: "Jigar",
    backgroundColor: "#0b0e22",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
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

app.whenReady().then(() => {
  // Mikrofon va kamera — faqat o'z serverimiz sahifasi uchun ruxsat.
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    const own = wc.getURL().startsWith(ECO_URL);
    callback(own && ["media", "notifications"].includes(permission));
  });
  createWindow();
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, "icon.png")).resize({ width: 18, height: 18 }));
  tray.setToolTip("Jigar");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Jigarni ochish (Cmd/Ctrl+Shift+J)", click: summon },
    { type: "separator" },
    { label: "Chiqish", click: () => { app.isQuitting = true; app.quit(); } },
  ]));
  tray.on("click", summon);
  globalShortcut.register(SHORTCUT, summon);
});

app.on("activate", () => win?.show());
app.on("will-quit", () => globalShortcut.unregisterAll());
