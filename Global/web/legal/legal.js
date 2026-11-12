// Huquqiy sahifalar (oferta, maxfiylik): til (UZ/RU, sayt bilan umumiy sozlama) va rekvizitlar.
// REKVIZITLAR — shu yerda to'ldiriladi; bo'sh maydon sahifada sariq "to'ldiring" belgisi bilan ko'rinadi.

export const OPERATOR = {
  name: "", // F.I.Sh. yoki tashkilot nomi (masalan, "YaTT Maxmutov Nuriddin")
  stir: "", // STIR (INN)
  address: "", // yuridik manzil
  phone: "", // telefon
  email: "", // murojaat uchun email
  telegram: "", // Telegram (ixtiyoriy)
};

const PREFS_KEY = "jigar.prefs";
const PLACEHOLDER = { uz: "to'ldiring", ru: "заполните" };

function readLang() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}").lang === "ru" ? "ru" : "uz";
  } catch {
    return "uz";
  }
}

function saveLang(lang) {
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...prefs, lang }));
  } catch {
    /* saqlab bo'lmasa — faqat shu sahifada */
  }
}

function apply(lang) {
  document.documentElement.lang = lang;
  for (const block of document.querySelectorAll("[data-lang-block]")) block.hidden = block.dataset.langBlock !== lang;
  for (const btn of document.querySelectorAll(".lang [data-lang]")) btn.setAttribute("aria-pressed", String(btn.dataset.lang === lang));
  document.title = document.querySelector(`[data-lang-block="${lang}"] h1`)?.textContent ?? document.title;
  // Rekvizitlar: to'ldirilmagani — ko'zga tashlanadigan belgi (ishga tushirishdan oldin to'ldirish uchun).
  for (const node of document.querySelectorAll("[data-op]")) {
    const value = OPERATOR[node.dataset.op];
    node.textContent = value || `[${PLACEHOLDER[lang]}: ${node.dataset.op}]`;
    node.classList.toggle("is-missing", !value);
  }
}

let lang = readLang();
for (const btn of document.querySelectorAll(".lang [data-lang]")) {
  btn.addEventListener("click", () => {
    lang = btn.dataset.lang;
    saveLang(lang);
    apply(lang);
  });
}
apply(lang);
