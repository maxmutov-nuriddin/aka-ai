// Sahifani yuklash — "xato"ning yolg'on signalidan himoya (Electron'siz, testlanadi). Chaqiruvchi: youtube.js.
// YouTube sahifani yuklash paytida o'zi qayta yo'naltiradi (masalan, "&themeRefresh=1" qo'shadi) — Electron buni
// ERR_ABORTED (-3) xato deb qaytaradi, lekin sahifa aslida ochilgan. Bunday xato — muvaffaqiyat. Boshqa vaqtinchalik
// xato (ERR_FAILED va h.k.) — bir marta qayta urinadi; baribir bo'lmasa-yu sahifa kerakli xostda turgan bo'lsa — davom etadi.

const ABORTED = -3;

/**
 * @param {{ loadURL: (url: string) => Promise<void>, getURL: () => string }} page
 * @param {string} url
 * @param {{ host: string, sleep?: (ms: number) => Promise<void>, retryMs?: number }} options
 */
async function loadTolerant(page, url, { host, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), retryMs = 800 }) {
  const onHost = () => {
    try {
      return new URL(page.getURL()).hostname.endsWith(host);
    } catch {
      return false;
    }
  };
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.loadURL(url);
      return;
    } catch (err) {
      lastError = err;
      if (err?.errno === ABORTED || err?.code === "ERR_ABORTED") return; // qayta yo'naltirish — sahifa ochilgan
      if (attempt === 0) await sleep(retryMs);
    }
  }
  if (onHost()) return;
  throw lastError;
}

module.exports = { loadTolerant };
