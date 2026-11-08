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
