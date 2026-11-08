// Tannarx va kunlik limit (faqat server). Narxlar va konstruktor — plan-pricing.js (brauzer bilan umumiy).
import { TARIFFS, tariffFor } from "./plan-pricing.js";

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

// ---------- Teng xarajat qoidasi ----------
// Tarif daqiqalari Claude + Fish narxida (550 so'm/daq) belgilangan. Boshqa juftlikda o'quvchiga xuddi shu pulga
// mos daqiqa beriladi: arzon juftlik — ko'proq, qimmati — kamroq. Foyda foizi hamma juftlikda bir xil qoladi.
const BASE_LLM = "claude";
const BASE_TTS = "fishaudio";

/** Asosiy daqiqani juftlik narxiga moslaydi (teng xarajat): arzon juftlik — ko'proq, qimmati — kamroq. */
function scaleMinutes(baseMinutes, tts, llm = BASE_LLM) {
  const ratio = costPerMinute(BASE_LLM, BASE_TTS) / costPerMinute(llm, tts);
  return Math.round(baseMinutes * ratio * 10) / 10;
}

/** Kunlik daqiqa limiti — tarif, ovoz va miya juftligiga qarab (0.1 aniqlikda). Miya berilmasa — Claude. */
export function dailyMinutes(goal, tts, llm = BASE_LLM) {
  return scaleMinutes(tariffFor(goal).minutes, tts, llm);
}

/** Reja (konstruktor yoki tayyor tarif) bo'yicha kunlik daqiqa limiti. */
export function planDailyMinutes(plan, tts, llm = BASE_LLM) {
  return scaleMinutes(plan.minutes, tts, llm);
}

/** Barcha juftliklar: [{ key: "claude+fishaudio", llm, tts }] (panel jadvali uchun). */
export function comboKeys() {
  return Object.keys(LLM_COST_SOM).flatMap((llm) => Object.keys(TTS_COST_SOM).map((tts) => ({ key: `${llm}+${tts}`, llm, tts })));
}

