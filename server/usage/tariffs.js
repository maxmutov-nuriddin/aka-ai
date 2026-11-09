// Tannarx va kunlik limit (faqat server). Narxlar va konstruktor — plan-pricing.js (brauzer bilan umumiy).
import { TARIFFS, planPrice, tariffFor } from "./plan-pricing.js";

export * from "./plan-pricing.js";

// Taxminiy xarajat (so'm / daqiqa) = miya (LLM) + ovoz (TTS). Support paneli va narxlar hisobi uchun.
// "1 daqiqa" ~ bitta savol-javob: ~8k token kirish, ~1k chiqish, Jigar ~30 soniya gapiradi; 1 $ ~ 12 800 so'm.
// Claude Sonnet 5.5: $2 / $10 (kesh $0.20). Gemini 3.8 Flash: $1.50 / $7.50, 3.8 Flash TTS: $18 / 1M audio token
// (2027-01-01 dan narxlar; 2026 oxirigacha ularning yarmi). Fish va ElevenLabs — Claude bilan jamidan ajratilgan.
export const LLM_COST_SOM = { claude: 195, gemini: 250 };
export const TTS_COST_SOM = { fishaudio: 355, elevenlabs: 1205, gemini: 173 };

/** Joriy tanlov (miya + ovoz) bo'yicha 1 daqiqa narxi (so'm). */
export function costPerMinute(llm, tts) {
  return (LLM_COST_SOM[llm] ?? LLM_COST_SOM.claude) + (TTS_COST_SOM[tts] ?? TTS_COST_SOM.fishaudio);
}

// ---------- Teng foyda qoidasi ----------
// Kunlik limit to'lovdan hisoblanadi: o'quvchi har kuni limitni oxirigacha ishlatsa ham, har tarifda, har konstruktor
// rejasida va har miya + ovoz juftligida foyda bir xil — PROFIT_MARGIN. Arzon juftlik — ko'proq daqiqa, qimmati — kamroq.
const BASE_LLM = "claude";
const PROFIT_MARGIN = 0.17; // to'lovning 17% i foyda (soliq, server va to'lov xizmati shundan chiqadi)
const DAYS_PER_MONTH = 30;
// Yo'nalishning qo'shimcha xarajati: Til o'rganishda o'quvchi ham ko'p gapiradi (nutqni tanish, talaffuz bahosi).
const GOAL_COST_FACTOR = { language: 1.25 };

const costFactor = (goals) => Math.max(1, ...goals.map((g) => GOAL_COST_FACTOR[g] ?? 1));

/** Oylik to'lovga mos kunlik daqiqa: (to'lov - foyda) / (daqiqa narxi x 30). Pastga yaxlitlanadi — foyda kamaymaydi. */
function minutesForPayment(price, goals, tts, llm) {
  const spend = price * (1 - PROFIT_MARGIN);
  const monthlyCostPerDailyMinute = costPerMinute(llm, tts) * costFactor(goals) * DAYS_PER_MONTH;
  return Math.floor((spend / monthlyCostPerDailyMinute) * 10 + 1e-9) / 10;
}

/** Kunlik daqiqa limiti — tarif narxi, ovoz va miya juftligiga qarab (0.1 aniqlikda). Miya berilmasa — Claude. */
export function dailyMinutes(goal, tts, llm = BASE_LLM) {
  const tariff = tariffFor(goal);
  return minutesForPayment(tariff.price, [tariff.goal], tts, llm);
}

/** Reja (konstruktor yoki tayyor tarif) bo'yicha kunlik daqiqa limiti — reja narxidan. */
export function planDailyMinutes(plan, tts, llm = BASE_LLM) {
  return minutesForPayment(planPrice(plan.goals, plan.minutes), plan.goals, tts, llm);
}

/** Barcha juftliklar: [{ key: "claude+fishaudio", llm, tts }] (panel jadvali uchun). */
export function comboKeys() {
  return Object.keys(LLM_COST_SOM).flatMap((llm) => Object.keys(TTS_COST_SOM).map((tts) => ({ key: `${llm}+${tts}`, llm, tts })));
}

