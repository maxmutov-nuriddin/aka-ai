// Konstruktor tarifi: o'quvchi yo'nalishlarni tanlaydi, kunlik daqiqa yoki oylik summani beradi — ikkinchisi o'zi
// hisoblanadi. Narx formulasi server bilan bitta (/shared/plan-pricing.js): tayyor tarifni yig'sa — narx bir xil.
// Ishlatadi: landing (Narxlar bo'limi) va ilovaning to'lov oynasi (web/app/billing.js).
// "Suhbatga tayyorgarlik" tanlansa — PAKET rejimi: oylik emas, bir martalik hajm (30..300 daqiqa) va muddat.
import {
  PACKAGES, PACKAGE_MAX_MINUTES, PACKAGE_MIN_MINUTES, PACKAGE_STEP, PLAN_MAX_MINUTES, PLAN_MIN_MINUTES, TARIFFS,
  effectiveMinutes, minutesForBudget, packageDays, packageFor, packageMinutesForBudget, packagePrice, planPrice, recommendedMinutes,
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
    names: { study: "Maktab darslari", exam: "Imtihon (DTM)", olympiad: "Olimpiada", university: "Universitet", language: "Til o'rganish", curious: "Qiziqish", interview: "Suhbatga tayyorgarlik" },
    pkgMinutes: "Paket hajmi (bir martalik)",
    pkgUnit: "daqiqa · {d} kun amal qiladi",
    pkgBudget: "yoki summani yozing:",
    pkgPrice: "so'm / paket",
    pkgSame: "Bu tayyor «{name}» paketi bilan bir xil.",
    pkgNote: "Oylik obuna emas: daqiqalar muddat ichida istalgan kuni ishlatiladi.",
    pkgNames: { start: "Start", pro: "Pro" },
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
    names: { study: "Школьные уроки", exam: "Экзамены (ДТМ)", olympiad: "Олимпиада", university: "Университет", language: "Изучение языка", curious: "Интерес", interview: "Собеседование" },
    pkgMinutes: "Объём пакета (разово)",
    pkgUnit: "мин · действует {d} дн.",
    pkgBudget: "или впишите сумму:",
    pkgPrice: "сум / пакет",
    pkgSame: "Это то же самое, что готовый пакет «{name}».",
    pkgNote: "Не подписка: минуты тратятся в любой день в пределах срока.",
    pkgNames: { start: "Старт", pro: "Про" },
  },
};
const PACKAGE_GOAL = "interview"; // paket yo'nalishi — boshqalar bilan birga tanlanmaydi
const GOAL_KEYS = [...Object.keys(TARIFFS), PACKAGE_GOAL];
const fmt = new Intl.NumberFormat("ru-RU");

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * @param {HTMLElement} root
 * @param {{ lang?: "uz" | "ru", initial?: { goals: string[], minutes: number }, minutesPerSom?: number,
 *           onChange?: (plan: { goals: string[], minutes: number }, price: number) => void }} options
 *   minutesPerSom — /api/tariffs dan: ko'rsatiladigan kunlik daqiqa joriy miya + ovoz juftligida (tarif kartasi bilan
 *   bir xil). Berilmaguncha — rejaning asosiy daqiqasi ko'rinadi.
 */
export function createPlanBuilder(root, { lang = "uz", initial, onChange, minutesPerSom = null } = {}) {
  let rate = minutesPerSom;
  let goals = initial?.goals?.length ? GOAL_KEYS.filter((g) => initial.goals.includes(g)) : ["study"];
  if (goals.includes(PACKAGE_GOAL)) goals = [PACKAGE_GOAL];
  const isPackage = () => goals[0] === PACKAGE_GOAL;
  const recommended = () => (isPackage() ? PACKAGES.start.minutes : recommendedMinutes(goals));
  let minutes = initial?.minutes ?? recommended();
  if (isPackage() && !packageFor(`custom:${minutes}`)) minutes = recommended(); // paketga mos bo'lmagan hajm
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
    // Paket va oylik yo'nalishlar aralashmaydi: biri tanlansa — ikkinchisi o'chadi.
    const switching = (goal === PACKAGE_GOAL) !== isPackage();
    const next = switching ? [goal] : goals.includes(goal) ? goals.filter((g) => g !== goal) : [...goals, goal];
    if (!next.length) return; // kamida bitta yo'nalish
    goals = GOAL_KEYS.filter((g) => next.includes(g));
    minutes = recommended(); // yo'nalish o'zgarsa — tavsiya etilgan vaqt
    render();
  }

  /** O'quvchi haqiqatda oladigan kunlik daqiqa (rate bo'lsa) yoki rejaning asosiy daqiqasi. */
  function shownMinutes(base) {
    return rate ? effectiveMinutes(planPrice(goals, base), goals, rate) : base;
  }

  /** Narx, birlik va eslatmalar — oylik reja yoki paket. */
  function priceInfo() {
    if (isPackage()) {
      const ready = packageFor(`custom:${minutes}`);
      const notes = [L.pkgNote];
      if (ready && !ready.key.startsWith("custom")) notes.unshift(L.pkgSame.replace("{name}", L.pkgNames[ready.key]));
      return { price: packagePrice(minutes), unit: L.pkgPrice, minutesText: `${minutes} ${L.pkgUnit.replace("{d}", packageDays(minutes))}`, notes };
    }
    const notes = [];
    if (goals.length === 1 && TARIFFS[goals[0]].minutes === minutes) notes.push(L.same.replace("{name}", L.names[goals[0]]));
    if (goals.includes("language")) notes.push(L.voice);
    const price = planPrice(goals, minutes);
    return { price, unit: L.price, minutesText: `${shownMinutes(minutes)} ${L.perDay}`, notes };
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
    minutesLabel.textContent = isPackage() ? L.pkgMinutes : L.minutes;
    budgetText.textContent = isPackage() ? L.pkgBudget : L.budget;
    Object.assign(slider, isPackage()
      ? { min: PACKAGE_MIN_MINUTES, max: PACKAGE_MAX_MINUTES, step: PACKAGE_STEP }
      : { min: PLAN_MIN_MINUTES, max: PLAN_MAX_MINUTES, step: 1 });
    slider.value = String(minutes);
    const { price, unit, minutesText, notes } = priceInfo();
    minutesOut.textContent = minutesText;
    const rec = recommended();
    const recShown = isPackage() ? rec : shownMinutes(rec);
    recommend.textContent = minutes === rec ? L.recommend.replace("{n}", recShown) : `${L.useRecommend} (${recShown})`;
    recommend.disabled = minutes === rec;
    if (document.activeElement !== budget) budget.value = String(price);
    priceOut.textContent = fmt.format(price);
    priceUnit.textContent = ` ${unit}`;
    note.textContent = notes.join(" ");
    note.hidden = !notes.length;
    onChange?.({ goals: [...goals], minutes }, price);
  }

  slider.addEventListener("input", () => {
    minutes = Number(slider.value);
    render();
  });
  budget.addEventListener("change", () => {
    const sum = Number(budget.value) || 0;
    minutes = isPackage() ? packageMinutesForBudget(sum) : minutesForBudget(goals, sum);
    budget.blur();
    render();
  });
  recommend.addEventListener("click", () => {
    minutes = recommended();
    render();
  });

  render();
  return {
    getPlan: () => ({ goals: [...goals], minutes }),
    /** To'lov so'rovi tanasi: oylik reja yoki paket (POST /api/payments). */
    getPurchase: () => (isPackage() ? { package: `custom:${minutes}` } : { plan: { goals: [...goals], minutes } }),
    setLang(next) {
      L = TEXT[next] ?? TEXT.uz;
      render();
    },
    /** Joriy miya + ovoz juftligining koeffitsiyenti (/api/tariffs → minutesPerSom). */
    setRate(next) {
      rate = Number(next) > 0 ? Number(next) : null;
      render();
    },
  };
}
