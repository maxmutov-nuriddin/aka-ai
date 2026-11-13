// Jigar EcoSystem — desktop ilova (Windows .exe, macOS .app). Electron oynasi EcoSystem serverini ochadi.
// Server manzili: ECO_URL → saqlangan → shu kompyuterdagi (localhost:3100) → birinchi ochilishda so'raladi (server-url.js).
// Tugmalar: Cmd/Ctrl+Shift+J — Jigarni ochadi va tinglashni boshlaydi (istalgan ilovada turganingizda).
// Jigarning qo'li: bridge.js serverga ulanadi, tools.js buyruqlarni bajaradi (ekran, fayl, ilova; buyruq va yozish — ruxsat bilan).
const { app, BrowserWindow, Tray, Menu, globalShortcut, session, nativeImage, shell, systemPreferences, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { startBridge } = require("./bridge.js");
const { runTool, setMaxAccess } = require("./tools.js");
const { resolveServerUrl, askServerUrl } = require("./server-url.js");
const { createPermissions } = require("./permissions.js");

let permissions = null; // app.whenReady'da yaratiladi

let ECO_URL = null; // app.whenReady'da aniqlanadi
const SHORTCUT = "CommandOrControl+Shift+J";
let win = null;
let tray = null;
// Kompyuter yonganda o'zi ishga tushadi va fonda (oynasiz) eshitib turadi.
function openedAtLogin() {
  try {
    return Boolean(app.getLoginItemSettings().wasOpenedAtLogin);
  } catch {
    return false;
  }
}
const STARTED_HIDDEN = process.argv.includes("--hidden") || openedAtLogin();
// Tray belgisi holatga qarab: macOS'da menyu paneliga mos oq-qora "template" robot (tizim rangini o'zi oladi):
// tinch — oddiy ko'zlar, tinglayapti/o'ylayapti — katta ko'zlar, gapiryapti — ochiq og'iz. Windows'da — rangli belgi.
const TRAY_IMAGES = { idle: "tray", listening: "tray-listen", transcribing: "tray-listen", thinking: "tray-listen", speaking: "tray-speak" };
function trayImage(state = "idle") {
  if (process.platform !== "darwin") {
    return nativeImage.createFromPath(path.join(__dirname, "icon.png")).resize({ width: 16, height: 16 });
  }
  const image = nativeImage.createFromPath(path.join(__dirname, `${TRAY_IMAGES[state] ?? "tray"}Template.png`));
  image.setTemplateImage(true);
  return image;
}
const TRAY_HINTS = { idle: "Jigar — \"Hey Jigar\" deng", listening: "Jigar tinglayapti", transcribing: "Jigar tinglayapti",
  thinking: "Jigar o'ylayapti", speaking: "Jigar gapiryapti" };

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
  return process.env.ECO_MAX_ACCESS || readConfig().maxAccess;
}

const configPath = () => path.join(app.getPath("userData"), "config.json");

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch {
    return {};
  }
}

/** config.json ga bitta maydon yozadi (boshqa maydonlar — server manzili, ruxsat — saqlanadi). */
function writeConfigField(key, value) {
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify({ ...readConfig(), [key]: value }, null, 2));
  } catch (err) {
    console.error("[config] saqlanmadi:", err.message);
  }
}

/** Kompyuter yonganda Jigar o'zi (oynasiz, fonda) ishga tushadi. Standart — yoqiq; tray'dan o'chiriladi. */
const autoStartOn = () => readConfig().autoStart !== false;

function applyAutoStart(on) {
  if (!app.isPackaged) return; // "npm start" (dasturlash) paytida tizimga yozilmaydi
  app.setLoginItemSettings({ openAtLogin: on, openAsHidden: true, args: ["--hidden"] });
}

/** Fonda ishlaganda Dock'da ko'rinmaydi (macOS) — faqat tray belgisi; oyna ochilsa Dock'ga qaytadi. */
function syncDock(visible) {
  if (process.platform !== "darwin" || !app.dock) return;
  if (visible) app.dock.show().catch?.(() => {});
  else app.dock.hide();
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
    show: !STARTED_HIDDEN,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "app-preload.js"),
      // Oyna yashirin bo'lsa ham "Hey Jigar" tinglash taymerlari sekinlashmasin (aks holda ism eshitilmaydi).
      backgroundThrottling: false,
      // Fonda javob ovozi foydalanuvchi bosmasdan ham ijro etilsin.
      autoplayPolicy: "no-user-gesture-required",
    },
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
  // Sahifa yashirin/ko'rinishini biladi — yashirinda avatar to'xtaydi (fonda tejamkor).
  const tellVisibility = (visible) => () => win.webContents.send("jigar:visibility", visible);
  win.on("hide", tellVisibility(false));
  win.on("minimize", tellVisibility(false));
  win.on("show", tellVisibility(true));
  win.on("restore", tellVisibility(true));
  win.on("hide", () => syncDock(false));
  win.on("show", () => syncDock(true));
  win.webContents.on("did-finish-load", () => win.webContents.send("jigar:visibility", win.isVisible()));
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
  // Mikrofon ruxsati — ilova ochilganda bir marta (macOS so'rovi); keyin sahifa qayta-qayta so'ramaydi.
  if (process.platform === "darwin" && systemPreferences.getMediaAccessStatus("microphone") === "not-determined") {
    await systemPreferences.askForMediaAccess("microphone").catch(() => false);
  }
  // Mikrofon va kamera — faqat o'z serverimiz sahifasi uchun ruxsat (manzil to'liq solishtiriladi:
  // "localhost:3100.boshqa.com" kabi manzillar mos kelmaydi).
  // Ilova ruxsatni o'zi so'raydi (birinchi marta oyna), javobni eslab qoladi (permissions.js).
  permissions = createPermissions({ isOwnPage, getConfig: readConfig, setConfigField: writeConfigField, getWindow: () => win });
  session.defaultSession.setPermissionRequestHandler(permissions.handler);
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
  applyAutoStart(autoStartOn());
  createWindow(id);
  if (STARTED_HIDDEN) syncDock(false);
  else permissions.checkOsAccess(); // Windows/macOS mikrofonni to'sgan bo'lsa — ogohlantirish va sozlamalar tugmasi
  tray = new Tray(trayImage("idle"));
  tray.setToolTip(TRAY_HINTS.idle);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Jigarni ochish (Cmd/Ctrl+Shift+J)", click: summon },
    { label: "Server manzilini o'zgartirish…", click: changeServer },
    {
      label: "Kompyuter yonganda ishga tushsin",
      type: "checkbox",
      checked: autoStartOn(),
      click: (item) => {
        writeConfigField("autoStart", item.checked);
        applyAutoStart(item.checked);
      },
    },
    { label: "Mikrofon/kamera ruxsatini qayta so'rash", click: () => permissions.reset() },
    { type: "separator" },
    { label: "Chiqish", click: () => { app.isQuitting = true; app.quit(); } },
  ]));
  tray.on("click", summon);
  globalShortcut.register(SHORTCUT, summon);
  // Kompyuter Jigarga ulanadi: telefondan yoki shu oynadan aytilgan ishni shu yerda bajaradi.
  startBridge({ baseUrl: ECO_URL, deviceId: id, runTool: (command) => runTool(command, { getWindow: () => win }) });
});

// Bitta nusxa: ikkinchi marta ochilsa — mavjud Jigar ko'rinadi (ikki "quloq" bir-biriga xalaqit bermasin).
if (!app.requestSingleInstanceLock()) {
  app.isQuitting = true;
  app.quit();
} else {
  app.on("second-instance", () => summon());
}

// Oynalar yopilsa ham ilova tray'da yashaydi (server manzili oynasi yopilgach ham — Windows'da standart bo'yicha chiqib ketardi).
app.on("window-all-closed", () => {});
// Dock → "Quit", Cmd+Q, tizimdan chiqish — haqiqiy chiqish: oyna "yashirinish" o'rniga yopilsin.
app.on("before-quit", () => {
  app.isQuitting = true;
});
// Mikrofon: sahifa ruxsatni qayta so'raydi (tugma bosilganda) va ichki holatni oladi (jurnal uchun). Faqat Jigar oynasidan.
ipcMain.handle("jigar:request-mic", (event) => (win && event.sender === win.webContents && permissions ? permissions.requestExplicit() : false));
ipcMain.handle("jigar:mic-info", (event) =>
  (win && event.sender === win.webContents && permissions ? permissions.info(event.sender.getURL()) : null));

// Jigar holati — tray'da (oyna ochilmaydi): 👂 tinglayapti, 💭 o'ylayapti, 🗣 gapiryapti.
ipcMain.on("jigar:status", (event, state) => {
  if (!tray || !win || event.sender !== win.webContents || !(state in TRAY_IMAGES)) return;
  if (process.platform === "darwin") tray.setImage(trayImage(state));
  tray.setToolTip(TRAY_HINTS[state]);
});
app.on("activate", () => win?.show());
app.on("will-quit", () => globalShortcut.unregisterAll());
