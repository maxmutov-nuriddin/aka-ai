// Kengaytma rejimi: sahifa matni joriy tabdan olinadi, server manzili sozlamalardan.
const DEFAULT_API = "http://localhost:3000";

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function runInTab(tabId, func) {
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, func });
  return res?.result;
}

function readPage() {
  const pick = document.querySelector("article, main, [role=main]");
  const root = pick && pick.innerText.trim().length > 500 ? pick : document.body;
  return {
    title: document.title,
    url: location.href,
    text: root ? root.innerText : "",
    selection: String(getSelection() || ""),
  };
}

function readSelection() {
  return String(getSelection() || "");
}

// Skrinshot: Figma, rasm, diagramma, canvas kabi matnsiz sahifalarni Jigar ko'rishi uchun.
// Claude uchun tavsiya etilgan eng katta o'lcham — 1568 px; JPEG ~200–400 KB.
const SHOT_MAX_SIDE = 1568;
const SHOT_QUALITY = 0.75;

async function shrinkImage(dataUrl) {
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const scale = Math.min(1, SHOT_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: SHOT_QUALITY });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Ochiq tabning ko'rinib turgan qismi. Olib bo'lmasa (chrome:// sahifalar va h.k.) — "" (matn bilan davom etadi). */
async function captureTab(windowId) {
  try {
    return await shrinkImage(await chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 90 }));
  } catch (err) {
    console.warn("[jigar] skrinshot olinmadi:", err?.message || err);
    return "";
  }
}

window.JIGAR_HOST = {
  mode: "extension",
  apiBase: DEFAULT_API,
  async getPage() {
    const tab = await activeTab();
    if (!tab?.id) throw new Error("Faol tab topilmadi.");
    const image = await captureTab(tab.windowId);
    try {
      return { ...(await runInTab(tab.id, readPage)), image };
    } catch {
      // chrome:// yoki do'kon sahifalarida skript ishlamaydi
      return { title: tab.title || "", url: tab.url || "", text: "", selection: "", image };
    }
  },
  async getSelection() {
    const tab = await activeTab();
    if (!tab?.id) return "";
    try {
      return await runInTab(tab.id, readSelection);
    } catch {
      return "";
    }
  },
  // Yon panel mikrofon ruxsatini so'ray olmaydi — sozlamalar sahifasida bir marta ruxsat beriladi.
  requestMicPermission() {
    chrome.runtime.openOptionsPage();
  },
  onPageChange(cb) {
    let lastUrl = null;
    const check = async () => {
      const tab = await activeTab().catch(() => null);
      const url = tab?.url || null;
      if (lastUrl !== null && url !== lastUrl) cb();
      lastUrl = url;
    };
    check();
    chrome.tabs.onActivated.addListener(check);
    chrome.tabs.onUpdated.addListener((_id, info) => {
      if (info.url) check();
    });
  },
};

// ---------- Hisob: kengaytma Bearer token bilan ishlaydi (sozlamalar sahifasida kiriladi) ----------
let authToken = "";

window.JIGAR_HOST.authHeaders = () => (authToken ? { Authorization: `Bearer ${authToken}` } : {});

/** Sessiya yo'q yoki tugagan — tokenni o'chirib, kirish uchun sozlamalarni ochamiz. */
window.JIGAR_HOST.onUnauthorized = () => {
  authToken = "";
  chrome.storage.local.remove(["token", "user"]);
  chrome.runtime.openOptionsPage();
};
window.JIGAR_HOST.logout = () => window.JIGAR_HOST.onUnauthorized();

const tokenLoaded = chrome.storage.local.get({ token: "" }).then(({ token }) => {
  authToken = token;
});
// Sozlamalarda kirilsa yoki chiqilsa — yon panel yangi holat bilan qayta yuklanadi.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.token) return;
  authToken = changes.token.newValue || "";
  if (authToken) window.location.reload();
});

// Server manzilini sozlamalardan o'qiymiz (app.js so'rov yuborishdan oldin tayyor bo'ladi).
const apiLoaded = chrome.storage.sync.get({ apiBase: DEFAULT_API }).then(({ apiBase }) => {
  window.JIGAR_HOST.apiBase = String(apiBase || DEFAULT_API).replace(/\/+$/, "");
});
// Ilova birinchi so'rovdan oldin shuni kutadi — token va manzil o'qilmasdan so'rov ketmasin.
window.JIGAR_HOST.ready = Promise.all([tokenLoaded, apiLoaded]);
