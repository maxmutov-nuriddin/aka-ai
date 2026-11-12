// Tannarx va kunlik limit (faqat server). Narxlar va konstruktor — plan-pricing.js (brauzer bilan umumiy).
import { TARIFFS, effectiveMinutes, planPrice, tariffFor } from "./plan-pricing.js"; // packageFor va boshqalar — pastdagi re-export orqali

export * from "./plan-pricing.js";

// Taxminiy xarajat (so'm / daqiqa) = miya (LLM) + ovoz (TTS). Support paneli va narxlar hisobi uchun.
// "1 daqiqa" ~ bitta savol-javob: ~8k token kirish, ~1k chiqish, Jigar ~30 soniya gapiradi; 1 $ ~ 12 800 so'm.
// Claude Sonnet 5.5: $2 / $10 (kesh $0.20). Gemini 3.8 Flash: $1.50 / $7.50, 3.8 Flash TTS: $18 / 1M audio token
// (2027-01-01 dan narxlar; 2026 oxirigacha ularning yarmi). Fish va ElevenLabs — Claude bilan jamidan ajratilgan.
// OpenAI gpt-6.1-sol: $2 / $10 (kesh $0.10) — standart OPENAI_MODEL. Arzonroq model (gpt-6-luna) qo'yilsa ham limit
// shu narxda qoladi (foyda faqat ortadi); qimmatrog'i (gpt-6-astra) qo'yilsa — bu qiymatni oshiring.
// OpenAI gpt-4o-mini-tts: ~$0.015 / audio daqiqa (30 soniya ≈ 96 so'm); 2027-01-06 da o'chiriladi.
// OmniVoice — o'z serverimiz (API to'lovi yo'q): GPU ijarasi ~$0.4/soat (RTX 4090 sinfi, ~5 100 so'm), ~25% band
// bo'lganda soatiga ~300 audio daqiqa -> ~17 so'm / audio daqiqa; 30 soniya + zaxira = 20 so'm. Foydalanuvchi kam bo'lsa
// server bo'sh turgani ham pul — bu qiymat faqat yuklama yetarli bo'lganda to'g'ri.
// Claude Haiku 5.5: $0.10 / $0.50 (yangi tokenizator ~30% ko'p token sanaydi) — ~13 so'm; o'ylash tokenlari uchun
// zaxira bilan 25 so'm.
export const LLM_COST_SOM = { claude: 195, haiku: 25, gemini: 250, openai: 187 };
export const TTS_COST_SOM = { fishaudio: 355, elevenlabs: 1205, gemini: 173, openai: 96, omnivoice: 20 };

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

/**
 * 1 so'm to'lovga kunlik necha daqiqa: (1 - foyda) / (daqiqa narxi x 30). Brauzerga /api/tariffs orqali beriladi —
 * tannarxning o'zi emas, faqat narxni daqiqaga aylantirish koeffitsiyenti.
 */
export function minutesPerSom(llm, tts) {
  return (1 - PROFIT_MARGIN) / (costPerMinute(llm, tts) * DAYS_PER_MONTH);
}

/** Oylik to'lovga mos kunlik daqiqa (yo'nalish koeffitsiyenti bilan). Pastga yaxlitlanadi — foyda kamaymaydi. */
function minutesForPayment(price, goals, tts, llm) {
  return effectiveMinutes(price, goals, minutesPerSom(llm, tts));
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

