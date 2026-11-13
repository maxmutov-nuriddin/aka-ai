// Sozlamalar sahifasi navigatsiyasi: chapda bo'limlar ro'yxati, o'ngda faqat tanlangan bo'lim
// (kompyuterda — macOS "System Settings" kabi; telefonda — bo'limlar tepada, gorizontal).
// Bo'lim — `.settings-card[data-nav]` (index.html va eco-settings.js). Yashirin kartochka (masalan, faqat egasi
// uchun) ro'yxatga kirmaydi. Kartochkalar kech qo'shilsa (eco-settings serverdan keladi) — ro'yxat o'zi yangilanadi.

const TAB_KEY = "jigar.settingsTab";

// Oddiy chiziqli belgilar (24×24, stroke) — ilovadagi boshqa belgilar bilan bir uslubda.
const ICONS = {
  general: "M4 6h16M4 12h16M4 18h16M8 4v4M16 10v4M10 16v4",
  brain: "M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 0V5a1 1 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 0",
  jarvis: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  security: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  apps: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  account: "M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
};

function readTab() {
  try {
    return localStorage.getItem(TAB_KEY);
  } catch {
    return null;
  }
}

function saveTab(key) {
  try {
    localStorage.setItem(TAB_KEY, key);
  } catch {
    /* saqlab bo'lmasa — keyingi safar birinchi bo'lim */
  }
}

function icon(key) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "ic");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", ICONS[key] ?? ICONS.general);
  svg.append(path);
  return svg;
}

/** Ro'yxatdagi qisqa nom: sarlavhaning ":" gacha qismi ("Jarvis: o'zi kuzatish..." → "Jarvis"). */
const shortTitle = (card) => (card.querySelector("h3")?.textContent ?? card.dataset.nav).split(":")[0].trim();

/**
 * @param {HTMLElement} grid bo'limlar (kartochkalar) turgan joy
 * @param {HTMLElement} nav chapdagi ro'yxat
 * @returns {{ refresh: () => void }}
 */
export function setupSettingsNav(grid, nav) {
  let active = readTab();

  const sections = () => [...grid.querySelectorAll(".settings-card[data-nav]")].filter((card) => !card.hidden);

  function show(key) {
    active = key;
    for (const card of grid.querySelectorAll(".settings-card[data-nav]")) {
      card.classList.toggle("is-active", card.dataset.nav === key);
    }
    for (const btn of nav.querySelectorAll("button")) {
      btn.setAttribute("aria-current", btn.dataset.nav === key ? "page" : "false");
    }
  }

  function refresh() {
    const list = sections();
    nav.replaceChildren(...list.map((card) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.nav = card.dataset.nav;
      const label = document.createElement("span");
      label.textContent = shortTitle(card);
      btn.append(icon(card.dataset.nav), label);
      btn.addEventListener("click", () => {
        saveTab(card.dataset.nav);
        show(card.dataset.nav);
        grid.closest(".settings-page")?.scrollTo?.({ top: 0 });
      });
      return btn;
    }));
    const keys = list.map((card) => card.dataset.nav);
    show(keys.includes(active) ? active : keys[0]);
  }

  // Kartochkalar kech keladi yoki ko'rinishi o'zgaradi (kirish, til) — ro'yxat yangilanadi (bir kadrda bir marta).
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      refresh();
    });
  }).observe(grid, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });

  refresh();
  /** Bo'limni ochish (masalan, eski /download havolasi → "apps"). */
  function select(key) {
    refresh();
    if (sections().some((card) => card.dataset.nav === key)) {
      saveTab(key);
      show(key);
    }
  }
  return { refresh, select };
}
