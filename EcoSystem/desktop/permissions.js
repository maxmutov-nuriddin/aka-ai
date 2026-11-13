// Mikrofon/kamera ruxsati: ilova ruxsatni O'ZI so'raydi (oyna chiqadi), "Ruxsat berish" ni abadiy eslab qoladi;
// "Rad etish" — faqat shu seans uchun (ko'rinmay yopilgan oyna ruxsatni abadiy o'chirib qo'ymasin).
// Mikrofon tugmasi bosilganda ruxsat yo'q bo'lsa — sahifa requestExplicit() ni chaqiradi va oyna qayta chiqadi.
// Windows/macOS ilovani to'sib qo'ygan bo'lsa — ogohlantirib, tizim sozlamalarini bitta tugma bilan ochadi.
// Chaqiruvchi: main.js. Saqlash: userData/config.json → permissions.media ("granted").
const { dialog, shell, systemPreferences } = require("electron");
const { mediaDecision, osBlocked, MIC_SETTINGS_URL, mediaLabel } = require("./permission-policy.js");

/**
 * @param {{ isOwnPage: (url: string) => boolean, getConfig: () => Record<string, any>,
 *           setConfigField: (key: string, value: unknown) => void, getWindow: () => Electron.BrowserWindow | null }} deps
 */
function createPermissions({ isOwnPage, getConfig, setConfigField, getWindow }) {
  const stored = () => getConfig().permissions?.media;
  const save = (value) => setConfigField("permissions", { ...(getConfig().permissions ?? {}), media: value });
  let sessionDenied = false; // shu seansda "Rad etish" bosilgan (abadiy saqlanmaydi)
  let asking = null; // bir vaqtda kelgan bir nechta so'rov — bitta oyna

  /** Oyna ko'rinadigan bo'lsa — unga bog'langan; yashirin bo'lsa — alohida (ko'rinadigan) oyna sifatida. */
  function visibleParent() {
    const win = getWindow();
    return win && win.isVisible() && !win.isMinimized() ? win : null;
  }

  /** Ruxsat oynasi. "Ruxsat berish" — saqlanadi; boshqa javob (shu jumladan oyna yopilishi) — faqat shu seans. */
  function askUser(label) {
    asking ??= (async () => {
      const options = {
        type: "question",
        title: "Jigar — ruxsat",
        message: `Jigar ${label}dan foydalanmoqchi.`,
        detail: "\"Hey Jigar\" va ovozli savollar uchun kerak. \"Ruxsat berish\" eslab qolinadi.",
        buttons: ["Ruxsat berish", "Rad etish"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      };
      const parent = visibleParent();
      const { response } = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options);
      const granted = response === 0;
      if (granted) {
        save("granted");
        sessionDenied = false;
      } else {
        sessionDenied = true;
      }
      return granted;
    })().finally(() => {
      asking = null;
    });
    return asking;
  }

  /** session.setPermissionRequestHandler uchun. */
  function handler(wc, permission, callback, details) {
    const url = details?.requestingUrl || wc.getURL();
    if (!isOwnPage(url)) return callback(false);
    if (permission === "notifications") return callback(true);
    if (permission !== "media") return callback(false);
    const decision = mediaDecision(stored(), sessionDenied);
    if (decision === "allow") return callback(true);
    if (decision === "deny") return callback(false);
    askUser(mediaLabel(details?.mediaTypes)).then(callback, () => callback(false));
  }

  /** Mikrofon tugmasi bosildi, ruxsat yo'q: seansdagi "rad"ni unutib, oynani qayta ko'rsatadi. true — ruxsat berildi. */
  function requestExplicit() {
    if (stored() === "granted") return Promise.resolve(true);
    sessionDenied = false;
    const win = getWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
    return askUser("mikrofon");
  }

  /** Jurnal uchun ichki holat (sabab aniq bo'lsin): saqlangan javob, seansdagi rad, manzil o'zimizmi. */
  function info(url) {
    return { stored: stored() ?? "yo'q", sessionDenied, ownPage: isOwnPage(url) };
  }

  /** Windows/macOS ilovani mikrofondan to'sganmi — ogohlantirish va sozlamalarni ochish tugmasi. */
  async function checkOsAccess() {
    if (!["win32", "darwin"].includes(process.platform)) return;
    const status = systemPreferences.getMediaAccessStatus("microphone");
    if (!osBlocked(status)) return;
    const options = {
      type: "warning",
      title: "Jigar — mikrofon yopiq",
      message: process.platform === "win32" ? "Windows Jigar'ga mikrofonni bloklagan." : "macOS Jigar'ga mikrofonni bloklagan.",
      detail: process.platform === "win32"
        ? "Sozlamalar ochiladi: \"Let desktop apps access your microphone\" ni yoqing, so'ng Jigar'ni qayta oching."
        : "Sozlamalar ochiladi: Microphone ro'yxatida Jigar'ni yoqing, so'ng Jigar'ni qayta oching.",
      buttons: ["Sozlamalarni ochish", "Keyinroq"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    };
    const parent = visibleParent();
    const { response } = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options);
    if (response === 0) shell.openExternal(MIC_SETTINGS_URL[process.platform]);
  }

  /** Tray menyusi: saqlangan javobni o'chirib, sahifani yangilaydi — keyingi so'rovda oyna yana chiqadi. */
  function reset() {
    save(undefined);
    sessionDenied = false;
    getWindow()?.webContents.reload();
  }

  return { handler, requestExplicit, info, checkOsAccess, reset };
}

module.exports = { createPermissions };
