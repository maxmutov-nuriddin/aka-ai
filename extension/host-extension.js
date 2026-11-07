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

window.AKA_HOST = {
  mode: "extension",
  apiBase: DEFAULT_API,
  async getPage() {
    const tab = await activeTab();
    if (!tab?.id) throw new Error("Faol tab topilmadi.");
    try {
      return await runInTab(tab.id, readPage);
    } catch {
      // chrome:// yoki do'kon sahifalarida skript ishlamaydi
      return { title: tab.title || "", url: tab.url || "", text: "", selection: "" };
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

// Server manzilini sozlamalardan o'qiymiz (app.js so'rov yuborishdan oldin tayyor bo'ladi).
chrome.storage.sync.get({ apiBase: DEFAULT_API }).then(({ apiBase }) => {
  window.AKA_HOST.apiBase = String(apiBase || DEFAULT_API).replace(/\/+$/, "");
});
