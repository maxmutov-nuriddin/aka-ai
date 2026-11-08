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
// ElevenLabs ~2.5x qimmat — tanlansa, kunlik daqiqa 40% ga tushadi (xarajat chegarasi o'zgarmaydi).
const PROVIDER_FACTOR = { elevenlabs: 0.4, fishaudio: 1, gemini: 1 };

/** Yo'nalish tarifi. Maqsad tanlanmagan — maktab darslari; noma'lum/eski — qiziqish. */
export function tariffFor(goal) {
  const key = goal == null || goal === "" ? DEFAULT_GOAL : TARIFFS[goal] ? goal : LEGACY_GOAL;
  return { goal: key, ...TARIFFS[key] };
}

/** Kunlik daqiqa limiti — tanlangan ovoz xizmatiga qarab. */
export function dailyMinutes(goal, provider) {
  return Math.round(tariffFor(goal).minutes * (PROVIDER_FACTOR[provider] ?? 1) * 10) / 10;
}

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
