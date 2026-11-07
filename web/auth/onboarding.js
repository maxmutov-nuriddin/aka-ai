// Ro'yxatdan o'tishdan oldingi savollar: Jigar o'quvchiga moslashishi uchun javoblarni yig'adi.
// Birinchi savol — til: qolgan savollar, sahifa va Jigarning ovozi shu tilda bo'ladi.
// Javoblar shu brauzerda (localStorage) saqlanadi; ro'yxatdan o'tish formasi shundan keyin ochiladi.

export const PROFILE_KEY = "jigar.profile";
const PREFS_KEY = "jigar.prefs"; // landing va ilova bilan umumiy (til shu yerda)
const ADVANCE_MS = 220; // tanlangan variant ko'rinib turishi uchun qisqa pauza

export const QUESTIONS = [
  {
    id: "lang",
    title: "Qaysi tilda gaplashamiz?",
    hint: "Jigar shu tilda gapiradi va tushuntiradi.",
    bubble: "Salom! Avval tilni tanla 👋",
    ru: { title: "На каком языке говорим?", hint: "Джигар будет говорить и объяснять на этом языке.", bubble: "Привет! Сначала выбери язык 👋" },
    options: [
      { value: "uz", icon: "UZ", label: "O'zbekcha", hint: "Jigar o'zbekcha gapiradi" },
      { value: "ru", icon: "RU", label: "Русский", hint: "Джигар говорит по-русски" },
    ],
  },
  {
    id: "goal",
    title: "Jigar senga nima uchun kerak?",
    hint: "Shunga qarab misollarni tanlayman.",
    bubble: "Zo'r! Endi tanishib olaylik 😊",
    ru: { title: "Зачем тебе Джигар?", hint: "Подберу примеры под твою цель.", bubble: "Отлично! Теперь познакомимся 😊" },
    options: [
      { value: "study", icon: "📚", label: "Maktab darslari", hint: "Uy vazifasi va yangi mavzular", ru: ["Школьные уроки", "Домашка и новые темы"] },
      { value: "exam", icon: "🎯", label: "Imtihonga tayyorgarlik", hint: "DTM, test, nazorat ishlari", ru: ["Подготовка к экзаменам", "ДТМ, тесты, контрольные"] },
      { value: "olympiad", icon: "🏆", label: "Olimpiada", hint: "Murakkab masalalar, chuqur bilim", ru: ["Олимпиада", "Сложные задачи, глубокие знания"] },
      { value: "university", icon: "🎓", label: "Universitet yoki kurs", hint: "Ma'ruza, seminar, referat", ru: ["Университет или курсы", "Лекции, семинары, рефераты"] },
      { value: "language", icon: "🌍", label: "Chet tili", hint: "Ingliz, rus va boshqa tillar", ru: ["Иностранный язык", "Английский, узбекский и другие"] },
      { value: "it", icon: "💻", label: "Dasturlash va IT", hint: "Kod, algoritm, kompyuter", ru: ["Программирование и IT", "Код, алгоритмы, компьютер"] },
      { value: "curious", icon: "💡", label: "Shunchaki qiziqish", hint: "Dunyoni tushunish uchun", ru: ["Просто интересно", "Чтобы понимать мир"] },
    ],
  },
  {
    id: "length",
    title: "Qanday tushuntirishni yoqtirasan?",
    hint: "Javoblarim uzunligi shunga mos bo'ladi.",
    bubble: "Ko'p gapiraymi yoki lo'nda? 🤔",
    ru: { title: "Как тебе объяснять?", hint: "Длина ответов будет под тебя.", bubble: "Подробно или коротко? 🤔" },
    options: [
      { value: "qisqa", icon: "⚡", label: "Qisqa", hint: "2–3 gap, asosiysi", ru: ["Коротко", "2–3 предложения, главное"] },
      { value: "odatiy", icon: "💬", label: "O'rtacha", hint: "Misol bilan, ortiqchasiz", ru: ["Средне", "С примером, без лишнего"] },
      { value: "batafsil", icon: "📖", label: "Batafsil", hint: "Qadamma-qadam, chuqur", ru: ["Подробно", "Шаг за шагом, глубоко"] },
    ],
  },
  {
    id: "persona",
    title: "Men qanday xarakterda gapiray?",
    hint: "Ovozim va gapirish uslubim shunga mos bo'ladi.",
    bubble: "Xarakterimni o'zing tanla 😎",
    ru: { title: "Каким мне быть?", hint: "Голос и манера речи будут под этот характер.", bubble: "Выбери мой характер 😎" },
    options: [
      { value: "neytral", face: "neytral", label: "Neytral", hint: "Xotirjam va lo'nda", ru: ["Нейтральный", "Спокойно и по делу"] },
      { value: "mehribon", face: "mehribon", label: "Mehribon", hint: "Har doim qo'llab-quvvatlaydi", ru: ["Добрый", "Всегда поддержит"] },
      { value: "kinoyali", face: "kinoyali", label: "Kinoyali", hint: "Kesatadi, lekin o'rinli", ru: ["Ироничный", "Подколет, но по делу"] },
      { value: "jahldor", face: "jahldor", label: "Jahldor", hint: "Qattiqqo'l, xatoni kechirmaydi", ru: ["Строгий", "Ошибок не прощает"] },
      { value: "romantik", face: "romantik", label: "Romantik", hint: "Iltifot qiladi, maqtaydi", ru: ["Романтик", "Делает комплименты, хвалит"] },
    ],
  },
  {
    // Darajani to'g'ridan-to'g'ri so'ramaymiz (tushunarsiz) — sinf aniq javob beradi va shundan daraja chiqadi.
    id: "level",
    title: "Nechanchi sinfda o'qiysan?",
    hint: "Tushuntirishlarimni yoshingga moslayman.",
    bubble: "Oxirgi savol! 🚀",
    ru: { title: "В каком ты классе?", hint: "Подстрою объяснения под твой возраст.", bubble: "Последний вопрос! 🚀" },
    options: [
      { value: "5-7", icon: "🌱", label: "5–7-sinf", hint: "Eng oddiy so'zlar va misollar bilan", ru: ["5–7 класс", "Самыми простыми словами"] },
      { value: "8-9", icon: "🌿", label: "8–9-sinf", hint: "Asoslarini bilaman", ru: ["8–9 класс", "Основы знаю"] },
      { value: "10-11", icon: "🌳", label: "10–11-sinf yoki litsey", hint: "Chuqurroq tushuntirsang ham bo'ladi", ru: ["10–11 класс или лицей", "Можно глубже"] },
      { value: "student", icon: "🎓", label: "Talaba yoki kattaman", hint: "Ilmiy atamalar bilan ham tushunaman", ru: ["Студент или старше", "Пойму и научные термины"] },
    ],
  },
];

const UI = {
  uz: { back: "← Orqaga" },
  ru: { back: "← Назад" },
};

/** Joriy til — jigar.prefs dan (birinchi savolda tanlanadi). */
export function currentLang() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}").lang === "ru" ? "ru" : "uz";
  } catch {
    return "uz";
  }
}

export function saveLang(lang) {
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...prefs, lang }));
  } catch {
    // Saqlab bo'lmasa ham davom etamiz — til shu sahifa uchun qo'llanadi.
  }
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveProfile(profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // Saqlab bo'lmasa (maxfiy rejim) ham ro'yxatdan o'tish davom etadi.
  }
}

/** Savol matni joriy tilda. */
export function questionText(question, key, lang = currentLang()) {
  return (lang === "ru" && question.ru?.[key]) || question[key];
}

function optionText(option, lang) {
  if (lang === "ru" && option.ru) return { label: option.ru[0], hint: option.ru[1] };
  return { label: option.label, hint: option.hint };
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function progressBar(step) {
  const bar = el("div", "ob-progress");
  bar.style.gridTemplateColumns = `repeat(${QUESTIONS.length}, 1fr)`;
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-valuemin", "1");
  bar.setAttribute("aria-valuemax", String(QUESTIONS.length));
  bar.setAttribute("aria-valuenow", String(step + 1));
  QUESTIONS.forEach((_, i) => bar.append(el("span", i <= step ? "is-done" : "")));
  return bar;
}

// Xarakter yuzlari: Jigarning ekran-yuzi uslubida (qorong'i ekran, rangli hoshiya, yonib turgan ko'z va og'iz).
// Statik SVG — foydalanuvchi ma'lumoti aralashmaydi.
const FACE_COLORS = {
  neytral: "#2ee6c8", // Jigarning asl ko'z rangi
  mehribon: "#4da3ff",
  kinoyali: "#b46bff",
  jahldor: "#ff8a3d",
  romantik: "#ff5fa2",
};
const HEART = (x) => `<path d="M${x} 24.5 l-5.6 -5.4 a3.3 3.3 0 0 1 5.6 -4.3 a3.3 3.3 0 0 1 5.6 4.3 z" fill="currentColor"/>`;
const FACE_FEATURES = {
  neytral: `<circle cx="22" cy="18" r="3.6" fill="currentColor"/><circle cx="42" cy="18" r="3.6" fill="currentColor"/>
    <path d="M27 27.5 h10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`,
  mehribon: `<path d="M17 20 q5 -7 10 0 M37 20 q5 -7 10 0" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <path d="M25.5 25.5 q6.5 6 13 0" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`,
  kinoyali: `<path d="M17 18.5 h10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <circle cx="42" cy="18" r="3.8" fill="currentColor"/>
    <path d="M27 28.5 q6 0 11 -4.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`,
  jahldor: `<path d="M16 12.5 l10 4.5 M48 12.5 l-10 4.5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <circle cx="22" cy="21" r="3.2" fill="currentColor"/><circle cx="42" cy="21" r="3.2" fill="currentColor"/>
    <path d="M26 30 q6 -4.5 12 0" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`,
  romantik: `${HEART(22)}${HEART(42)}
    <path d="M28 28 q4 3.5 8 0" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="13" cy="26" rx="3" ry="1.8" fill="currentColor" opacity="0.45"/>
    <ellipse cx="51" cy="26" rx="3" ry="1.8" fill="currentColor" opacity="0.45"/>`,
};

function faceIcon(name) {
  const wrap = el("span", "ob-choice-icon is-face");
  wrap.style.setProperty("--face", FACE_COLORS[name]);
  wrap.innerHTML = `<svg viewBox="0 0 64 40" aria-hidden="true">
    <rect x="2" y="2" width="60" height="36" rx="18" fill="#0b0e22" stroke="currentColor" stroke-width="3"/>
    ${FACE_FEATURES[name]}</svg>`;
  return wrap;
}

function optionIcon(option) {
  if (option.face) return faceIcon(option.face);
  // Til kodi (UZ/RU) — emoji emas, yozuv: bayroq emojilari hamma tizimda chiqmaydi.
  const isCode = /^[A-Z]{2}$/.test(option.icon);
  return el("span", isCode ? "ob-choice-icon is-code" : "ob-choice-icon", option.icon);
}

function optionCard(option, lang, selected, onPick) {
  const btn = el("button", "ob-choice");
  btn.type = "button";
  btn.setAttribute("aria-pressed", String(selected));
  const { label, hint } = optionText(option, lang);
  const text = el("span", "ob-choice-text");
  text.append(el("span", "ob-choice-label", label), el("span", "ob-choice-hint", hint));
  btn.append(optionIcon(option), text, el("span", "ob-choice-check"));
  btn.addEventListener("click", () => onPick(btn));
  return btn;
}

/**
 * Savollarni ketma-ket ko'rsatadi.
 * @param {HTMLElement} container
 * @param {{
 *   onStep?: (q: typeof QUESTIONS[number]) => void,
 *   onAnswer?: (id: string, value: string) => void,
 *   onPick?: () => void,
 *   onDone: (p: Record<string, string>) => void,
 * }} handlers
 */
export function renderOnboarding(container, { onStep, onAnswer, onPick, onDone }) {
  const answers = {};
  let step = 0;
  let locked = false;

  function pick(question, value, btn) {
    if (locked) return;
    locked = true;
    answers[question.id] = value;
    container.querySelectorAll(".ob-choice").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    onAnswer?.(question.id, value);
    onPick?.();
    setTimeout(() => {
      locked = false;
      if (step < QUESTIONS.length - 1) {
        step += 1;
        show();
      } else {
        onDone({ ...answers });
      }
    }, ADVANCE_MS);
  }

  function show() {
    const lang = currentLang();
    const question = QUESTIONS[step];
    const top = el("div", "ob-top");
    const back = el("button", "btn btn-quiet btn-sm ob-back", UI[lang].back);
    back.type = "button";
    back.hidden = step === 0;
    back.addEventListener("click", () => {
      step -= 1;
      show();
    });
    top.append(back, el("span", "ob-count", `${step + 1} / ${QUESTIONS.length}`));

    // Ko'p variantli savollar ixcham ikki ustunli to'rda (joy yetsa) ko'rsatiladi.
    const options = el("div", question.options.length > 4 ? "ob-options is-many" : "ob-options");
    for (const option of question.options) {
      const selected = answers[question.id] === option.value;
      options.append(optionCard(option, lang, selected, (btn) => pick(question, option.value, btn)));
    }

    const body = el("div", "ob-step");
    body.append(
      el("h2", "ob-title", questionText(question, "title", lang)),
      el("p", "ob-hint", questionText(question, "hint", lang)),
      options,
    );
    container.replaceChildren(top, progressBar(step), body);
    onStep?.(question);
  }

  show();
}
