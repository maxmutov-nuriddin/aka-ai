// Tariflar va konstruktor narxi — sof hisob, tannarx yo'q. Brauzerga ham beriladi (/shared/plan-pricing.js):
// landing va ilovadagi konstruktor narxni server bilan aynan bir xil hisoblaydi.
// Tariflar: o'quvchi ro'yxatdan o'tishda tanlagan yo'nalish (profile.goal) — narx va kunlik daqiqa limiti.
// Daqiqa = Jigarning ovozli gapirishi (~900 belgi = 1 daqiqa) + har savol 0.5 daqiqa (Claude xarajati).
// Limitlar Fish Drama 3 narxida hisoblangan (≈550 so'm/daqiqa): to'liq ishlatilsa ham ~17% foyda qoladi.
export const TARIFFS = {
  curious: { price: 199_000, minutes: 10 }, // Qiziqish, umumiy bilim
  study: { price: 249_000, minutes: 12 }, // Maktab darslari
  exam: { price: 299_000, minutes: 15 }, // Imtihonga tayyorgarlik (DTM)
  olympiad: { price: 399_000, minutes: 20 }, // Olimpiada
  university: { price: 399_000, minutes: 20 }, // Universitet yoki kurs
  // Til o'rganish (gapirish): o'quvchi ham, Jigar ham ko'p gapiradi — daqiqa xarajati ~1.5x, shuning uchun limit kamroq.
  language: { price: 299_000, minutes: 12 },
};
// Suhbatga tayyorgarlik (ish, OTM, grant suhbati, ommaviy chiqish) — oylik emas, bir martalik PAKET:
// daqiqa balansi va amal qilish muddati. Faol paketga yangisi qo'shilsa — daqiqa yig'iladi, muddat qisqarmaydi.
// Narx qiymatga qarab (natija uchun): to'liq ishlatilsa ham ~45-55% foyda (Claude + Gemini TTS, xarajat x1.25).
export const PACKAGES = {
  start: { minutes: 60, days: 14, price: 59_000 },
  pro: { minutes: 150, days: 30, price: 129_000 },
};

// Paket konstruktori: hajm 30..300 daqiqa (10 qadam). Narx va muddat Start va Pro nuqtalari orqali chiziqli —
// 60 daqiqa yig'ilsa aynan Start, 150 — aynan Pro (narx tayyor paket bilan bir xil bo'lsin).
export const PACKAGE_MIN_MINUTES = 30;
export const PACKAGE_MAX_MINUTES = 300;
export const PACKAGE_STEP = 10;
const PACKAGE_PRICE_STEP = 1000;
const CUSTOM_PREFIX = "custom:";
const lineThrough = (field) => (minutes) => {
  const { start, pro } = PACKAGES;
  return start[field] + ((minutes - start.minutes) * (pro[field] - start[field])) / (pro.minutes - start.minutes);
};
const priceLine = lineThrough("price");
const daysLine = lineThrough("days");

/** Paket narxi hajmga qarab (1000 so'mga yaxlitlangan). */
export const packagePrice = (minutes) => Math.round(priceLine(minutes) / PACKAGE_PRICE_STEP) * PACKAGE_PRICE_STEP;
/** Paket muddati (kun) hajmga qarab. */
export const packageDays = (minutes) => Math.round(daysLine(minutes));

/** Summaga sig'adigan eng katta hajm (10 daqiqa qadam, 30..300). */
export function packageMinutesForBudget(budget) {
  const { start, pro } = PACKAGES;
  const exact = start.minutes + ((Number(budget) - start.price) * (pro.minutes - start.minutes)) / (pro.price - start.price);
  const stepped = Math.floor(exact / PACKAGE_STEP + 1e-9) * PACKAGE_STEP;
  return Math.min(PACKAGE_MAX_MINUTES, Math.max(PACKAGE_MIN_MINUTES, stepped));
}

/** Konstruktor hajmi to'g'rimi: butun, 30..300, 10 ga karrali. */
const validPackageMinutes = (m) => Number.isInteger(m) && m >= PACKAGE_MIN_MINUTES && m <= PACKAGE_MAX_MINUTES && m % PACKAGE_STEP === 0;

/**
 * Paket: tayyor ("start", "pro") yoki konstruktor ("custom:90"). Konstruktor tayyor paket hajmini bersa — o'sha paket.
 * Noma'lum yoki noto'g'ri — null.
 */
export function packageFor(key) {
  if (Object.hasOwn(PACKAGES, key ?? "")) return { key, ...PACKAGES[key] };
  if (typeof key !== "string" || !key.startsWith(CUSTOM_PREFIX)) return null;
  const raw = key.slice(CUSTOM_PREFIX.length);
  const minutes = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!validPackageMinutes(minutes)) return null;
  const ready = Object.entries(PACKAGES).find(([, p]) => p.minutes === minutes);
  if (ready) return { key: ready[0], ...ready[1] };
  return { key, minutes, days: packageDays(minutes), price: packagePrice(minutes) };
}

const DEFAULT_GOAL = "study";
const LEGACY_GOAL = "curious"; // olib tashlangan yo'nalish (IT) — eng arzon tarifga

/** Yo'nalish tarifi. Maqsad tanlanmagan — maktab darslari; noma'lum/eski — qiziqish. */
export function tariffFor(goal) {
  const key = goal == null || goal === "" ? DEFAULT_GOAL : TARIFFS[goal] ? goal : LEGACY_GOAL;
  return { goal: key, ...TARIFFS[key] };
}


// ---------- Konstruktor (o'quvchi o'zi yig'adigan tarif) ----------
// Narx sarfga qarab: faqat kunlik daqiqa hisoblanadi. 1 daqiqa narxi — tanlangan yo'nalishlarning tayyor tarifidan
// (narx / daqiqa), bir nechta bo'lsa — eng qimmati (masalan, Til o'rganish: talaffuz xarajati). Shu sabab tayyor
// tarifni konstruktorda yig'sa, narx aynan bir xil chiqadi.
export const PLAN_MIN_MINUTES = 5;
export const PLAN_MAX_MINUTES = 30;
const PRICE_STEP = 1000; // so'm — narx shu qadamga yaxlitlanadi
const EXTRA_GOAL_MINUTES = 3; // tavsiya: har qo'shimcha yo'nalishga +3 daqiqa
const GOAL_ORDER = Object.keys(TARIFFS);

/** Kunlik 1 daqiqa uchun oylik narx (so'm): tanlangan yo'nalishlarning eng qimmati. */
function planRate(goals) {
  return Math.max(...goals.map((g) => TARIFFS[g].price / TARIFFS[g].minutes));
}

/** Oylik narx: kunlik daqiqa x daqiqa narxi (1000 so'mga yaxlitlangan). */
export function planPrice(goals, minutes) {
  return Math.round((planRate(goals) * minutes) / PRICE_STEP) * PRICE_STEP;
}

/** Summaga mos kunlik daqiqa (butun, 5..30). */
export function minutesForBudget(goals, budget) {
  const minutes = Math.floor(Number(budget) / planRate(goals) + 1e-9);
  return Math.min(PLAN_MAX_MINUTES, Math.max(PLAN_MIN_MINUTES, minutes));
}

/** Tavsiya etilgan kunlik daqiqa: eng katta yo'nalish daqiqasi + har qo'shimcha yo'nalishga 3. */
export function recommendedMinutes(goals) {
  const base = Math.max(...goals.map((g) => TARIFFS[g].minutes));
  return Math.min(PLAN_MAX_MINUTES, base + EXTRA_GOAL_MINUTES * (goals.length - 1));
}

/** Rejani tekshiradi: ma'lum yo'nalishlar (takrorsiz, tartibda) va 5..30 butun daqiqa. Noto'g'ri — null. */
export function normalizePlan(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.goals)) return null;
  const goals = GOAL_ORDER.filter((g) => input.goals.includes(g));
  const minutes = Number(input.minutes);
  const unknown = input.goals.some((g) => !TARIFFS[g]);
  if (!goals.length || unknown || !Number.isInteger(minutes) || minutes < PLAN_MIN_MINUTES || minutes > PLAN_MAX_MINUTES) return null;
  return { goals, minutes };
}

/** Tayyor tarif reja ko'rinishida. */
export function standardPlan(goal) {
  const t = tariffFor(goal);
  return { goals: [t.goal], minutes: t.minutes };
}

/** O'quvchining tarifi: to'langan reja bo'lsa — o'sha, aks holda yo'nalishining tayyor tarifi. */
export function tariffOf(profileGoal, plan) {
  const p = normalizePlan(plan) ?? standardPlan(profileGoal);
  const standard = p.goals.length === 1 && TARIFFS[p.goals[0]].minutes === p.minutes;
  return { goal: p.goals[0], goals: p.goals, price: planPrice(p.goals, p.minutes), minutes: p.minutes, custom: !standard };
}
