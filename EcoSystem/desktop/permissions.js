// Mikrofon/kamera ruxsati: ilova ruxsatni O'ZI so'raydi (birinchi marta oyna chiqadi), javobni eslab qoladi;
// Windows/macOS ilovani to'sib qo'ygan bo'lsa — ogohlantirib, tizim sozlamalarini bitta tugma bilan ochadi.
// Chaqiruvchi: main.js. Saqlash: userData/config.json → permissions.media ("granted" | "denied").
const { app, dialog, shell, systemPreferences } = require("electron");
const { mediaDecision, osBlocked, MIC_SETTINGS_URL, mediaLabel } = require("./permission-policy.js");

/**
 * @param {{ isOwnPage: (url: string) => boolean, getConfig: () => Record<string, any>,
 *           setConfigField: (key: string, value: unknown) => void, getWindow: () => Electron.BrowserWindow | null }} deps
 */
function createPermissions({ isOwnPage, getConfig, setConfigField, getWindow }) {
  const stored = () => getConfig().permissions?.media;
  const save = (value) => setConfigField("permissions", { ...(getConfig().permissions ?? {}), media: value });
  let asking = null; // bir vaqtda kelgan bir nechta so'rov — bitta oyna

  /** Birinchi so'rov: ilovaning o'z oynasi (odam tasdiqlaydi). Javob saqlanadi. */
  function askUser(label) {
    asking ??= dialog
      .showMessageBox(getWindow() ?? undefined, {
        type: "question",
        title: "Jigar — ruxsat",
        message: `Jigar ${label}dan foydalanmoqchi.`,
        detail: "\"Hey Jigar\" va ovozli savollar uchun kerak. Bu tanlov saqlanadi; keyin tray menyusidagi \"Ruxsatni qayta so'rash\" bilan o'zgartirsa bo'ladi.",
        buttons: ["Ruxsat berish", "Rad etish"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      })
      .then(({ response }) => {
        const granted = response === 0;
        save(granted ? "granted" : "denied");
        return granted;
      })
      .finally(() => {
        asking = null;
      });
    return asking;
  }

  /** session.setPermissionRequestHandler uchun. */
  function handler(wc, permission, callback, details) {
    if (!isOwnPage(wc.getURL())) return callback(false);
    if (permission === "notifications") return callback(true);
    if (permission !== "media") return callback(false);
    const decision = mediaDecision(stored());
    if (decision === "allow") return callback(true);
    if (decision === "deny") return callback(false);
    askUser(mediaLabel(details?.mediaTypes)).then(callback, () => callback(false));
  }

  /** Windows/macOS ilovani mikrofondan to'sganmi — ogohlantirish va sozlamalarni ochish tugmasi. */
  async function checkOsAccess() {
    if (!["win32", "darwin"].includes(process.platform)) return;
    const status = systemPreferences.getMediaAccessStatus("microphone");
    if (!osBlocked(status)) return;
    const { response } = await dialog.showMessageBox(getWindow() ?? undefined, {
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
    });
    if (response === 0) shell.openExternal(MIC_SETTINGS_URL[process.platform]);
  }

  /** Tray menyusi: saqlangan javobni o'chirib, sahifani yangilaydi — keyingi so'rovda oyna yana chiqadi. */
  function reset() {
    save(undefined);
    getWindow()?.webContents.reload();
  }

  return { handler, checkOsAccess, reset };
}

module.exports = { createPermissions };
