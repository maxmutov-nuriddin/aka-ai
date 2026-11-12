// Ro'yxatdan o'tishdan oldingi savollar: Jigar o'quvchiga moslashishi uchun javoblarni yig'adi.
// Birinchi savol — til: qolgan savollar, sahifa va Jigarning ovozi shu tilda bo'ladi.
// Javoblar shu brauzerda (localStorage) saqlanadi; ro'yxatdan o'tish formasi shundan keyin ochiladi.

import { fitLevel, levelsForGoal } from "/shared/levels.js"; // yo'nalish -> mos sinflar (server bilan bitta qoida)
import { FACE_COLORS, faceSvg } from "/shared/faces.js"; // xarakter yuzlari (landing bilan umumiy)
import { GOAL_COLORS, iconSvg } from "/shared/icons.js"; // brend ikonkalari (emoji o'rniga)

export const PROFILE_KEY = "jigar.profile";
const PREFS_KEY = "jigar.prefs"; // landing va ilova bilan umumiy (til shu yerda)
const ADVANCE_MS = 220; // tanlangan variant ko'rinib turishi uchun qisqa pauza

export const QUESTIONS = [
  {
    id: "lang",
    title: "Qaysi tilda gaplashamiz?",
    hint: "Jigar shu tilda gapiradi va tushuntiradi.",
    bubble: "Salom! Avval tilni tanla",
    ru: { title: "На каком языке говорим?", hint: "Джигар будет говорить и объяснять на этом языке.", bubble: "Привет! Сначала выбери язык" },
    options: [
      { value: "uz", icon: "UZ", label: "O'zbekcha", hint: "Jigar o'zbekcha gapiradi" },
      { value: "ru", icon: "RU", label: "Русский", hint: "Джигар говорит по-русски" },
    ],
  },
  {
    id: "goal",
    title: "Jigar senga nima uchun kerak?",
    hint: "Tushuntirish va misollarni shunga moslayman.",
    bubble: "Zo'r! Endi tanishib olaylik",
    ru: { title: "Зачем тебе Джигар?", hint: "Подстрою объяснения и примеры под цель.", bubble: "Отлично! Теперь познакомимся" },
    options: [
      { value: "study", icon: "study", label: "Maktab darslari", hint: "Darslar, uy vazifasi, yangi mavzular", ru: ["Школьные уроки", "Уроки, домашка, новые темы"] },
      { value: "exam", icon: "exam", label: "Imtihonga tayyorgarlik (DTM)", hint: "DTM, test, nazorat ishlari", ru: ["Подготовка к экзаменам (ДТМ)", "ДТМ, тесты, контрольные"] },
      { value: "olympiad", icon: "olympiad", label: "Olimpiada", hint: "Murakkab masalalar, chuqur bilim", ru: ["Олимпиада", "Сложные задачи, глубокие знания"] },
      { value: "university", icon: "university", label: "Universitet yoki kurs", hint: "Ma'ruza, seminar, kurs ishi", ru: ["Университет или курсы", "Лекции, семинары, курсовые"] },
      // Til o'rganish: o'zbekcha tanlagan — rus tilini, ruscha tanlagan — o'zbek tilini o'rganadi (server/core/jigar.js).
      { value: "language", icon: "language", label: "Rus tilini o'rganish", hint: "Erkin gapirish, so'zlar, talaffuz, rolli o'yin", ru: ["Изучение узбекского языка", "Разговор, слова, произношение, ролевые игры"] },
      // Suhbatga tayyorgarlik — oylik emas, paket (server/usage/plan-pricing.js: PACKAGES).
      { value: "interview", icon: "interview", label: "Suhbatga tayyorgarlik", hint: "Ish, OTM yoki grant suhbati — paket bilan", ru: ["Подготовка к собеседованию", "Работа, вуз или грант — разовый пакет"] },
      { value: "curious", icon: "curious", label: "Qiziqish, umumiy bilim", hint: "Qiziqarli faktlar va dunyoqarash (darslarsiz)", ru: ["Интерес, общие знания", "Интересные факты и кругозор (без уроков)"] },
    ],
  },
  {
    id: "length",
    title: "Qanday tushuntirishni yoqtirasan?",
    hint: "Javoblarim uzunligi shunga mos bo'ladi.",
    bubble: "Ko'p gapiraymi yoki lo'nda?",
    ru: { title: "Как тебе объяснять?", hint: "Длина ответов будет под тебя.", bubble: "Подробно или коротко?" },
    options: [
      { value: "qisqa", icon: "qisqa", label: "Qisqa", hint: "2–3 gap, asosiysi", ru: ["Коротко", "2–3 предложения, главное"] },
      { value: "odatiy", icon: "odatiy", label: "O'rtacha", hint: "Misol bilan, ortiqchasiz", ru: ["Средне", "С примером, без лишнего"] },
      { value: "batafsil", icon: "batafsil", label: "Batafsil", hint: "Qadamma-qadam, chuqur", ru: ["Подробно", "Шаг за шагом, глубоко"] },
    ],
  },
  {
    id: "persona",
    title: "Men qanday xarakterda gapiray?",
    hint: "Ovozim va gapirish uslubim shunga mos bo'ladi.",
    bubble: "Xarakterimni o'zing tanla",
    ru: { title: "Каким мне быть?", hint: "Голос и манера речи будут под этот характер.", bubble: "Выбери мой характер" },
    options: [
      { value: "neytral", face: "neytral", label: "Neytral", hint: "Xotirjam va lo'nda", ru: ["Нейтральный", "Спокойно и по делу"] },
      { value: "mehribon", face: "mehribon", label: "Mehribon", hint: "Har doim qo'llab-quvvatlaydi", ru: ["Добрый", "Всегда поддержит"] },
      { value: "kinoyali", face: "kinoyali", label: "Kinoyali", hint: "Kesatadi, lekin o'rinli", ru: ["Ироничный", "Подколет, но по делу"] },
      { value: "jahldor", face: "jahldor", label: "Jahldor", hint: "Qattiqqo'l, xatoni kechirmaydi", ru: ["Строгий", "Ошибок не прощает"] },
      { value: "romantik", face: "romantik", label: "Romantik", hint: "Iltifot qiladi, maqtaydi", ru: ["Романтик", "Делает комплименты, хвалит"] },
      { value: "moslashuvchan", face: "moslashuvchan", label: "Moslashuvchan", hint: "Senga moslashadi: ohanging va kayfiyatingga", ru: ["Гибкий", "Подстраивается под твой тон и настроение"] },
    ],
  },
  {
    // Darajani to'g'ridan-to'g'ri so'ramaymiz (tushunarsiz) — sinf aniq javob beradi va shundan daraja chiqadi.
    id: "level",
    title: "Nechanchi sinfda o'qiysan?",
    hint: "Tushuntirishlarimni yoshingga moslayman.",
    bubble: "Oxirgi savol!",
    ru: { title: "В каком ты классе?", hint: "Подстрою объяснения под твой возраст.", bubble: "Последний вопрос!" },
    options: [
      { value: "5-7", icon: "5-7", label: "5–7-sinf", hint: "Eng oddiy so'zlar va misollar bilan", ru: ["5–7 класс", "Самыми простыми словами"] },
      { value: "8-9", icon: "8-9", label: "8–9-sinf", hint: "Asoslarini bilaman", ru: ["8–9 класс", "Основы знаю"] },
      { value: "10-11", icon: "10-11", label: "10–11-sinf yoki litsey", hint: "Chuqurroq tushuntirsang ham bo'ladi", ru: ["10–11 класс или лицей", "Можно глубже"] },
      {
        value: "student", icon: "student", label: "Talaba yoki kattaman", hint: "Ilmiy atamalar bilan ham tushunaman", ru: ["Студент или старше", "Пойму и научные термины"],
        // Imtihon yo'nalishida bu — maktabni bitirib, DTMga tayyorlanayotgan abituriyent.
        byGoal: { exam: { label: "Maktabni bitirganman", hint: "Abituriyent, DTMga tayyorlanyapman", ru: ["Окончил(а) школу", "Абитуриент, готовлюсь к ДТМ"] } },
      },
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

/** Javoblarga qarab ko'rsatiladigan savollar: sinf bitta bo'lsa (universitet) — savol so'ralmaydi. */
function stepsFor(answers) {
  return QUESTIONS.filter((q) => q.id !== "level" || levelsForGoal(answers.goal).length > 1);
}

/** Savol variantlari: sinf — tanlangan yo'nalishga mos (maktab darsida "talaba" yo'q va h.k.). */
function optionsFor(question, answers) {
  if (question.id !== "level") return question.options;
  const allowed = levelsForGoal(answers.goal);
  return question.options
    .filter((o) => allowed.includes(o.value))
    .map((o) => (o.byGoal?.[answers.goal] ? { ...o, ...o.byGoal[answers.goal] } : o));
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

function progressBar(step, total) {
  const bar = el("div", "ob-progress");
  bar.style.gridTemplateColumns = `repeat(${total}, 1fr)`;
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-valuemin", "1");
  bar.setAttribute("aria-valuemax", String(total));
  bar.setAttribute("aria-valuenow", String(step + 1));
  for (let i = 0; i < total; i++) bar.append(el("span", i <= step ? "is-done" : ""));
  return bar;
}

function faceIcon(name) {
  const wrap = el("span", "ob-choice-icon is-face");
  wrap.style.setProperty("--face", FACE_COLORS[name]);
  wrap.innerHTML = faceSvg(name);
  return wrap;
}

function optionIcon(option) {
  if (option.face) return faceIcon(option.face);
  // Til kodi (UZ/RU) — emoji emas, yozuv: bayroq emojilari hamma tizimda chiqmaydi.
  if (/^[A-Z]{2}$/.test(option.icon)) return el("span", "ob-choice-icon is-code", option.icon);
  const wrap = el("span", "ob-choice-icon is-svg");
  wrap.style.color = GOAL_COLORS[option.value] ?? "var(--accent-2)";
  wrap.innerHTML = iconSvg(option.icon); // statik SVG (web/shared/icons.js)
  return wrap;
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
    // Yo'nalish almashsa, avvalgi sinf unga mos kelmasligi mumkin — qayta so'raymiz.
    if (question.id === "goal" && answers.level && !levelsForGoal(value).includes(answers.level)) delete answers.level;
    container.querySelectorAll(".ob-choice").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    onAnswer?.(question.id, value);
    onPick?.();
    setTimeout(() => {
      locked = false;
      if (step < stepsFor(answers).length - 1) {
        step += 1;
        show();
      } else {
        const level = fitLevel(answers.goal, answers.level); // universitet — avtomatik "talaba"
        onDone({ ...answers, ...(level ? { level } : {}) });
      }
    }, ADVANCE_MS);
  }

  function show() {
    const lang = currentLang();
    const steps = stepsFor(answers);
    const question = steps[step];
    const choices = optionsFor(question, answers);
    const top = el("div", "ob-top");
    const back = el("button", "btn btn-quiet btn-sm ob-back", UI[lang].back);
    back.type = "button";
    back.hidden = step === 0;
    back.addEventListener("click", () => {
      step -= 1;
      show();
    });
    top.append(back, el("span", "ob-count", `${step + 1} / ${steps.length}`));

    // Ko'p variantli savollar ixcham ikki ustunli to'rda (joy yetsa) ko'rsatiladi.
    const options = el("div", choices.length > 4 ? "ob-options is-many" : "ob-options");
    for (const option of choices) {
      const selected = answers[question.id] === option.value;
      options.append(optionCard(option, lang, selected, (btn) => pick(question, option.value, btn)));
    }

    const body = el("div", "ob-step");
    body.append(
      el("h2", "ob-title", questionText(question, "title", lang)),
      el("p", "ob-hint", questionText(question, "hint", lang)),
      options,
    );
    container.replaceChildren(top, progressBar(step, steps.length), body);
    onStep?.(question);
  }

  show();
}
