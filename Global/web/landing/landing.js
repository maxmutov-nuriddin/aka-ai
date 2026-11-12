// Landing: til (UZ/RU, ilova bilan umumiy sozlama), jonli robot — gapiradi, sichqoncha ortidan qaraydi,
// kayfiyat tugmalariga javob beradi. Matnlar: landing-content.js; bo'limlar: landing-sections.js.
import { createAvatar } from "/shared/avatar.js";
import { moodSvg } from "/shared/faces.js";
import { DICT, LINES } from "./landing-content.js";
import { renderBuilder, renderDirections, renderFaq, renderPersonas, renderPricing } from "./landing-sections.js";

const PREFS_KEY = "jigar.prefs"; // ilova bilan bir xil — tanlangan til /app/ da ham saqlanadi
const TYPE_MS = 34;
const PAUSE_MS = 2300;

function readPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
  } catch {
    return {};
  }
}

function savePrefs(patch) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...patch }));
  } catch {
    /* saqlab bo'lmasa — faqat shu sahifada amal qiladi */
  }
}

let lang = readPrefs().lang === "ru" ? "ru" : "uz";

function applyLang() {
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll("[data-l]")) {
    const value = DICT[lang][el.dataset.l];
    if (value) el.textContent = value;
  }
  for (const btn of document.querySelectorAll(".lang [data-lang]")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.lang === lang));
  }
  renderDirections(lang);
  renderPersonas(lang);
  renderPricing(lang);
  renderBuilder(lang);
  renderFaq(lang);
}

for (const btn of document.querySelectorAll(".lang [data-lang]")) {
  btn.addEventListener("click", () => {
    lang = btn.dataset.lang;
    savePrefs({ lang });
    applyLang();
    restartTalk();
  });
}

// ---------- Robot ----------
const avatar = createAvatar(document.getElementById("heroAvatar"));
const bubbleText = document.getElementById("bubbleText");
const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
let talkTimer = 0;
let lineIndex = 0;
let pinnedEmotion = null; // kayfiyat tugmasi bosilsa, bir muddat shu turadi

function say({ text, emotion }) {
  clearTimeout(talkTimer);
  avatar.setEmotion(pinnedEmotion ?? emotion);
  if (calm) {
    bubbleText.textContent = text;
    talkTimer = setTimeout(nextLine, PAUSE_MS * 2);
    return;
  }
  avatar.setState("speaking");
  avatar.setLevel(null); // ovoz yo'q — og'iz o'zi qimirlaydi
  let i = 0;
  const type = () => {
    i += 1;
    bubbleText.textContent = text.slice(0, i);
    if (i < text.length) {
      talkTimer = setTimeout(type, TYPE_MS);
      return;
    }
    avatar.setState("idle");
    talkTimer = setTimeout(nextLine, PAUSE_MS);
  };
  type();
}

function nextLine() {
  const lines = LINES[lang];
  say(lines[lineIndex % lines.length]);
  lineIndex += 1;
}

function restartTalk() {
  lineIndex = 0;
  nextLine();
}

// Sichqoncha ortidan qaraydi.
const heroEl = document.getElementById("heroAvatar");
window.addEventListener("pointermove", (e) => {
  const box = heroEl.getBoundingClientRect();
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height * 0.35;
  avatar.lookAt((e.clientX - cx) / (window.innerWidth / 2), (e.clientY - cy) / (window.innerHeight / 2));
});
window.addEventListener("pointerleave", () => avatar.lookAt(null));

// Kayfiyat stikerlari (emoji o'rniga brend uslubidagi yuzlar).
for (const node of document.querySelectorAll("[data-mood]")) node.innerHTML = moodSvg(node.dataset.mood);
for (const btn of document.querySelectorAll(".moods [data-emotion]")) btn.innerHTML = moodSvg(btn.dataset.emotion);

// Kayfiyat tugmalari: robot darrov shu kayfiyatga o'tadi.
for (const btn of document.querySelectorAll(".moods [data-emotion]")) {
  btn.addEventListener("click", () => {
    const same = pinnedEmotion === btn.dataset.emotion;
    pinnedEmotion = same ? null : btn.dataset.emotion;
    for (const b of document.querySelectorAll(".moods [data-emotion]")) {
      b.setAttribute("aria-pressed", String(b === btn && !same));
    }
    avatar.setEmotion(pinnedEmotion);
  });
}

document.getElementById("year").textContent = String(new Date().getFullYear());
applyLang();
nextLine();
