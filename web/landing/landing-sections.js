// Landing bo'limlari: yo'nalishlar, xarakterlar (jonli robot bilan), narxlar (/api/tariffs), savol-javob.
// Hammasi DOM orqali quriladi (textContent) — tashqi matn HTML sifatida qo'yilmaydi.
import { createAvatar } from "/shared/avatar.js";
import { FACE_COLORS, faceSvg } from "/shared/faces.js";
import { GOAL_COLORS, iconSvg } from "/shared/icons.js";
import { DICT, DIRECTIONS, FAQ, PERSONAS, TARIFF_FEATURES } from "./landing-content.js";
import { createPlanBuilder } from "/shared/plan-builder.js";

const PLAN_KEY = "jigar.plan"; // konstruktorda yig'ilgan reja — ilovadagi to'lov oynasi shundan boshlaydi

const $ = (id) => document.getElementById(id);
const t = (lang, key) => DICT[lang][key] ?? DICT.uz[key] ?? key;
const priceFmt = new Intl.NumberFormat("ru-RU");

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** Yo'nalish ikonkasi — brend SVG (web/shared/icons.js), yo'nalish rangida. */
function goalIcon(goal) {
  const icon = el("span", "dir-icon");
  icon.style.color = GOAL_COLORS[goal];
  icon.innerHTML = iconSvg(goal, 26); // statik SVG
  return icon;
}

// ---------- Yo'nalishlar ----------
export function renderDirections(lang) {
  const cards = DIRECTIONS.map(({ goal, isNew, ...text }) => {
    const [title, desc] = text[lang];
    const card = el("article", `dir-card${isNew ? " is-new" : ""}`);
    card.dataset.goal = goal;
    if (isNew) card.append(el("span", "dir-new", t(lang, "dir.new")));
    card.append(goalIcon(goal), el("h3", null, title), el("p", null, desc));
    return card;
  });
  $("directionsGrid").replaceChildren(...cards);
}

// ---------- Xarakterlar ----------
let personaAvatar = null;
let activePersona = "mehribon";
let personaTimer = 0;

function speakPersona(lang) {
  const persona = PERSONAS.find((p) => p.id === activePersona);
  const line = persona[lang][2];
  personaAvatar.setPersona(persona.id);
  personaAvatar.setEmotion(persona.emotion);
  personaAvatar.setState("speaking");
  personaAvatar.setLevel(null);
  const bubble = $("personaBubble");
  bubble.style.setProperty("--face", FACE_COLORS[persona.id]);
  let i = 0;
  clearTimeout(personaTimer);
  const type = () => {
    i += 1;
    bubble.textContent = line.slice(0, i);
    if (i < line.length) personaTimer = setTimeout(type, 28);
    else personaAvatar.setState("idle");
  };
  type();
}

export function renderPersonas(lang) {
  personaAvatar ??= createAvatar($("personaAvatar"));
  const cards = PERSONAS.map((p) => {
    const [name, hint] = p[lang];
    const btn = el("button", "per-card");
    btn.type = "button";
    btn.style.setProperty("--face", FACE_COLORS[p.id]);
    btn.setAttribute("aria-pressed", String(p.id === activePersona));
    const face = el("span", "per-face");
    face.innerHTML = faceSvg(p.id); // statik SVG (web/shared/faces.js)
    btn.append(face, el("strong", null, name), el("small", null, hint));
    if (p.adult) btn.append(el("span", "per-adult", t(lang, "per.adult")));
    btn.addEventListener("click", () => {
      activePersona = p.id;
      for (const b of $("personaGrid").children) b.setAttribute("aria-pressed", String(b === btn));
      speakPersona(lang);
    });
    return btn;
  });
  $("personaGrid").replaceChildren(...cards);
  speakPersona(lang);
}

// ---------- Narxlar ----------
/** Tarifda nimalar bor (✓) va yo'q (✗) — tarif adashtirilmasin. */
function featureList(goal, lang) {
  const list = el("ul", "price-features");
  for (const item of TARIFF_FEATURES[goal]?.[lang] ?? []) {
    const included = item.startsWith("+");
    const li = el("li", included ? "is-yes" : "is-no", item.slice(1));
    li.setAttribute("aria-label", `${included ? "✓" : "✗"} ${item.slice(1)}`);
    list.append(li);
  }
  return list;
}
let tariffsPromise = null;
const loadTariffs = () => {
  tariffsPromise ??= fetch("/api/tariffs").then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
  return tariffsPromise;
};

export async function renderPricing(lang) {
  const grid = $("pricingGrid");
  try {
    const { tariffs } = await loadTariffs();
    const byGoal = new Map(tariffs.map((x) => [x.goal, x]));
    const cards = DIRECTIONS.filter((d) => byGoal.has(d.goal)).map(({ goal, isNew, ...text }) => {
      const tariff = byGoal.get(goal);
      const card = el("article", `price-card${goal === "study" ? " is-popular" : ""}`);
      card.dataset.goal = goal;
      const head = el("div", "price-head");
      head.append(goalIcon(goal), el("h3", null, text[lang][0]));
      const amount = el("p", "price-amount");
      amount.append(el("strong", null, priceFmt.format(tariff.price)), el("span", null, ` ${t(lang, "price.month")}`));
      const cta = el("a", "btn btn-quiet price-cta", t(lang, "price.cta"));
      cta.href = "/login?mode=register";
      card.append(head, amount, el("p", "price-daily", t(lang, "price.daily").replace("{n}", tariff.minutes)), featureList(goal, lang), cta);
      return card;
    });
    grid.replaceChildren(...cards);
  } catch {
    tariffsPromise = null; // keyingi safar qayta urinadi
    grid.replaceChildren(el("p", "price-error", t(lang, "price.error")));
  }
}

// ---------- Konstruktor ----------
let builder = null;
export function renderBuilder(lang) {
  if (builder) return builder.setLang(lang);
  builder = createPlanBuilder($("planBuilder"), {
    lang,
    onChange: (plan) => {
      try {
        localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
      } catch {
        /* saqlab bo'lmasa — to'lov oynasida qayta tanlanadi */
      }
    },
  });
}

// ---------- Savol-javob ----------
export function renderFaq(lang) {
  const items = FAQ[lang].map(([q, a], i) => {
    const item = el("details", "faq-item");
    if (i === 0) item.open = true;
    item.append(el("summary", null, q), el("p", null, a));
    return item;
  });
  $("faqList").replaceChildren(...items);
}
