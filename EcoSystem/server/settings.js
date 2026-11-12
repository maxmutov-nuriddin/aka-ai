// EcoSystem sozlamalari (egasi ilovadan o'zgartiradi): miya, ovoz xizmati, javob chuqurligi.
// Bazadagi `settings` jadvalida saqlanadi; berilmagan qiymat — .env (ECO_LLM, ECO_TTS, AKA_EFFORT) dagi standart.
import { ValidationError } from "./core/errors.js";

export const LLM_CHOICES = ["claude", "haiku", "gemini", "openai"];
export const TTS_CHOICES = ["gemini", "elevenlabs", "fishaudio", "openai"];
export const EFFORT_CHOICES = ["low", "medium", "high"];

const FIELDS = { llm: LLM_CHOICES, tts: TTS_CHOICES, effort: EFFORT_CHOICES };
const pick = (value, list, fallback) => (list.includes(String(value ?? "").trim()) ? String(value).trim() : fallback);

/**
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {Record<string, string | undefined>} env
 */
export function createEcoSettings(db, env = {}) {
  const defaults = {
    llm: pick(env.ECO_LLM, LLM_CHOICES, "claude"),
    tts: pick(env.ECO_TTS, TTS_CHOICES, "gemini"),
    effort: pick(env.AKA_EFFORT, EFFORT_CHOICES, "medium"),
  };
  const q = {
    get: db.prepare("SELECT value FROM settings WHERE key = ?"),
    set: db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"),
  };
  const read = (field) => pick(q.get.get(`eco_${field}`)?.value, FIELDS[field], defaults[field]);

  return {
    /** Joriy tanlov: { llm, tts, effort }. */
    all: () => ({ llm: read("llm"), tts: read("tts"), effort: read("effort") }),
    /** Qisman yangilash; noto'g'ri qiymat — ValidationError. Qaytaradi: yangi holat. */
    update(patch) {
      const entries = Object.entries(patch ?? {}).filter(([k]) => k in FIELDS);
      if (!entries.length) throw new ValidationError("O'zgartiriladigan sozlama yo'q");
      for (const [key, value] of entries) {
        if (!FIELDS[key].includes(value)) throw new ValidationError(`${key}: ${FIELDS[key].join(" | ")} bo'lishi kerak`);
      }
      for (const [key, value] of entries) q.set.run(`eco_${key}`, value);
      return this.all();
    },
  };
}
