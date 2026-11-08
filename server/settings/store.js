// Umumiy sozlamalar (repository): support o'zgartiradi, hamma foydalanuvchiga ta'sir qiladi.
import { ValidationError } from "../core/errors.js";
import { FISH_MODELS } from "../voice/fishaudio.js";

// Ovoz xizmati: ElevenLabs (so'z vaqtlari bilan), Fish Audio (o'zbekchada eng aniq) yoki Gemini TTS (eng arzon).
export const TTS_PROVIDERS = ["elevenlabs", "fishaudio", "gemini"];
// Jigarning "miyasi": Claude (asosiy) yoki Gemini (arzonroq). Gemini xato bersa — Claude'ga o'tadi.
export const LLM_PROVIDERS = ["claude", "gemini"];
const DEFAULT_LLM_PROVIDER = "claude";
const DEFAULT_TTS_PROVIDER = "elevenlabs";
// Fish modeli: Drama 3 — o'zbekchada yagona aniq model (2026-11 sinovi).
const DEFAULT_FISH_MODEL = "drama-3";

/**
 * @param {import("node:sqlite").DatabaseSync} db
 */
export function createSettingsStore(db) {
  const q = {
    get: db.prepare("SELECT value FROM settings WHERE key = ?"),
    set: db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"),
  };

  function ttsProvider() {
    const value = q.get.get("tts_provider")?.value;
    return TTS_PROVIDERS.includes(value) ? value : DEFAULT_TTS_PROVIDER;
  }

  function setTtsProvider(provider) {
    if (!TTS_PROVIDERS.includes(provider)) throw new ValidationError(`ttsProvider: ${TTS_PROVIDERS.join(" | ")} bo'lishi kerak`);
    q.set.run("tts_provider", provider);
    return provider;
  }

  function fishModel() {
    const value = q.get.get("fish_model")?.value;
    return FISH_MODELS.includes(value) ? value : DEFAULT_FISH_MODEL;
  }

  function setFishModel(model) {
    if (!FISH_MODELS.includes(model)) throw new ValidationError(`fishModel: ${FISH_MODELS.join(" | ")} bo'lishi kerak`);
    q.set.run("fish_model", model);
    return model;
  }

  function llmProvider() {
    const value = q.get.get("llm_provider")?.value;
    return LLM_PROVIDERS.includes(value) ? value : DEFAULT_LLM_PROVIDER;
  }

  function setLlmProvider(provider) {
    if (!LLM_PROVIDERS.includes(provider)) throw new ValidationError(`llmProvider: ${LLM_PROVIDERS.join(" | ")} bo'lishi kerak`);
    q.set.run("llm_provider", provider);
    return provider;
  }

  return { ttsProvider, setTtsProvider, fishModel, setFishModel, llmProvider, setLlmProvider };
}
