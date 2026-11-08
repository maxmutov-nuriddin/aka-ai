// Konstruktor tarifi: o'quvchi yo'nalishlarni tanlaydi, kunlik daqiqa yoki oylik summani beradi — ikkinchisi o'zi
// hisoblanadi. Narx formulasi server bilan bitta (/shared/plan-pricing.js): tayyor tarifni yig'sa — narx bir xil.
// Ishlatadi: landing (Narxlar bo'limi) va ilovaning to'lov oynasi (web/app/billing.js).
import {
  PLAN_MAX_MINUTES, PLAN_MIN_MINUTES, TARIFFS, minutesForBudget, planPrice, recommendedMinutes,
} from "./plan-pricing.js"; // serverda /shared/plan-pricing.js, kengaytmada — shared/ ichiga nusxalanadi
import { GOAL_COLORS, iconSvg } from "./icons.js";

const TEXT = {
  uz: {
    goals: "Nimalar kerak? (bir nechtasini tanlash mumkin)",
    minutes: "Kunlik suhbat vaqti",
    perDay: "daqiqa / kun",
    budget: "yoki oylik summani yozing:",
    price: "so'm / oy",
    recommend: "Tavsiya: {n} daqiqa",
    useRecommend: "Tavsiyani olish",
    same: "Bu tayyor «{name}» tarifi bilan bir xil.",
    voice: "Talaffuz bahosi kiradi (Til o'rganish).",
    names: { study: "Maktab darslari", exam: "Imtihon (DTM)", olympiad: "Olimpiada", university: "Universitet", language: "Til o'rganish", curious: "Qiziqish" },
  },
  ru: {
    goals: "Что нужно? (можно выбрать несколько)",
    minutes: "Время разговора в день",
    perDay: "мин / день",
    budget: "или впишите сумму в месяц:",
    price: "сум / мес",
    recommend: "Рекомендуем: {n} мин",
    useRecommend: "Взять рекомендацию",
    same: "Это то же самое, что готовый тариф «{name}».",
    voice: "Входит оценка произношения (Изучение языка).",
    names: { study: "Школьные уроки", exam: "Экзамены (ДТМ)", olympiad: "Олимпиада", university: "Университет", language: "Изучение языка", curious: "Интерес" },
  },
};
const GOAL_KEYS = Object.keys(TARIFFS);
const fmt = new Intl.NumberFormat("ru-RU");

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * @param {HTMLElement} root
 * @param {{ lang?: "uz" | "ru", initial?: { goals: string[], minutes: number },
 *           onChange?: (plan: { goals: string[], minutes: number }, price: number) => void }} options
 */
export function createPlanBuilder(root, { lang = "uz", initial, onChange } = {}) {
  let goals = initial?.goals?.length ? GOAL_KEYS.filter((g) => initial.goals.includes(g)) : ["study"];
  let minutes = initial?.minutes ?? recommendedMinutes(goals);
  let L = TEXT[lang] ?? TEXT.uz;

  const goalsLabel = el("p", "pb-label");
  const chips = el("div", "pb-goals");
  const minutesLabel = el("p", "pb-label");
  const minutesOut = el("strong", "pb-minutes");
  const recommend = el("button", "pb-recommend");
  recommend.type = "button";
  const slider = Object.assign(el("input", "pb-slider"), { type: "range", min: PLAN_MIN_MINUTES, max: PLAN_MAX_MINUTES, step: 1 });
  const budgetText = el("span");
  const budget = Object.assign(el("input", "pb-budget"), { type: "number", inputMode: "numeric", min: 0, step: 1000 });
  const budgetLabel = el("label", "pb-budget-label");
  budgetLabel.append(budgetText, budget);
  const priceOut = el("strong", "pb-price");
  const priceUnit = el("span", "pb-price-unit");
  const note = el("p", "pb-note");

  const minutesRow = el("div", "pb-row");
  minutesRow.append(minutesOut, recommend);
  const priceRow = el("div", "pb-price-row");
  priceRow.append(priceOut, priceUnit);
  root.classList.add("plan-builder");
  root.replaceChildren(goalsLabel, chips, minutesLabel, minutesRow, slider, budgetLabel, priceRow, note);

  function toggleGoal(goal) {
    const next = goals.includes(goal) ? goals.filter((g) => g !== goal) : [...goals, goal];
    if (!next.length) return; // kamida bitta yo'nalish
    goals = GOAL_KEYS.filter((g) => next.includes(g));
    minutes = recommendedMinutes(goals); // yo'nalish o'zgarsa — tavsiya etilgan vaqt
    render();
  }

  function renderChips() {
    chips.replaceChildren(...GOAL_KEYS.map((goal) => {
      const chip = el("button", "pb-goal");
      chip.type = "button";
      chip.setAttribute("aria-pressed", String(goals.includes(goal)));
      chip.style.setProperty("--gc", GOAL_COLORS[goal]);
      const icon = el("span", "pb-goal-icon");
      icon.innerHTML = iconSvg(goal, 18); // statik SVG
      chip.append(icon, el("span", null, L.names[goal]));
      chip.addEventListener("click", () => toggleGoal(goal));
      return chip;
    }));
  }

  function render() {
    renderChips();
    goalsLabel.textContent = L.goals;
    minutesLabel.textContent = L.minutes;
    budgetText.textContent = L.budget;
    slider.value = String(minutes);
    minutesOut.textContent = `${minutes} ${L.perDay}`;
    const rec = recommendedMinutes(goals);
    recommend.textContent = minutes === rec ? L.recommend.replace("{n}", rec) : `${L.useRecommend} (${rec})`;
    recommend.disabled = minutes === rec;
    const price = planPrice(goals, minutes);
    if (document.activeElement !== budget) budget.value = String(price);
    priceOut.textContent = fmt.format(price);
    priceUnit.textContent = ` ${L.price}`;
    const notes = [];
    if (goals.length === 1 && TARIFFS[goals[0]].minutes === minutes) notes.push(L.same.replace("{name}", L.names[goals[0]]));
    if (goals.includes("language")) notes.push(L.voice);
    note.textContent = notes.join(" ");
    note.hidden = !notes.length;
    onChange?.({ goals: [...goals], minutes }, price);
  }

  slider.addEventListener("input", () => {
    minutes = Number(slider.value);
    render();
  });
  budget.addEventListener("change", () => {
    minutes = minutesForBudget(goals, Number(budget.value) || 0);
    budget.blur();
    render();
  });
  recommend.addEventListener("click", () => {
    minutes = recommendedMinutes(goals);
    render();
  });

  render();
  return {
    getPlan: () => ({ goals: [...goals], minutes }),
    setLang(next) {
      L = TEXT[next] ?? TEXT.uz;
      render();
    },
  };
}
