// EcoSystem sozlamalari (egasi ilovadan o'zgartiradi): miya, ovoz xizmati, javob chuqurligi, faol rejim, kunlik xulosa.
// Bazadagi `settings` jadvalida saqlanadi; berilmagan qiymat — .env (ECO_LLM, ECO_TTS, AKA_EFFORT) dagi standart.
import { ValidationError } from "./core/errors.js";
import { ACCESS_LEVELS, UNLIMITED_MS, effectiveLevel } from "./agent/access.js";

// haiku — standart; sonnet — kuchliroq; opus — ro'yxatda, hozircha ishlatilmaydi (qimmat).
export const LLM_CHOICES = ["haiku", "sonnet", "opus", "gemini", "openai"];
export const TTS_CHOICES = ["gemini", "elevenlabs", "fishaudio", "openai"];
export const EFFORT_CHOICES = ["low", "medium", "high"];
export const SWITCH_CHOICES = ["on", "off"];

// proactive — Jigar ekranga o'zi qarab, kerak bo'lsa birinchi gapiradi; briefs — ertalabki va kechki xulosa.
// access — ruxsat darajasi (agent/access.js); monitor — batareya, disk, protsessor kuzatuvi.
const FIELDS = {
  llm: LLM_CHOICES, tts: TTS_CHOICES, effort: EFFORT_CHOICES, proactive: SWITCH_CHOICES, briefs: SWITCH_CHOICES,
  access: ACCESS_LEVELS, monitor: SWITCH_CHOICES,
};
const pick = (value, list, fallback) => (list.includes(String(value ?? "").trim()) ? String(value).trim() : fallback);

/**
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {Record<string, string | undefined>} env
 */
export function createEcoSettings(db, env = {}, { now = Date.now } = {}) {
  const defaults = {
    llm: pick(env.ECO_LLM, LLM_CHOICES, "haiku"),
    tts: pick(env.ECO_TTS, TTS_CHOICES, "gemini"),
    effort: pick(env.AKA_EFFORT, EFFORT_CHOICES, "medium"),
    proactive: pick(env.ECO_PROACTIVE, SWITCH_CHOICES, "on"),
    briefs: pick(env.ECO_BRIEFS, SWITCH_CHOICES, "on"),
    access: pick(env.ECO_ACCESS, ACCESS_LEVELS.filter((l) => l !== "unlimited"), "safe"),
    monitor: pick(env.ECO_MONITOR, SWITCH_CHOICES, "on"),
  };
  const q = {
    get: db.prepare("SELECT value FROM settings WHERE key = ?"),
    set: db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"),
  };
  const read = (field) => pick(q.get.get(`eco_${field}`)?.value, FIELDS[field], defaults[field]);

  return {
    /** Joriy tanlov. access — amaldagi daraja (cheksiz rejim muddati o'tgan bo'lsa — full). */
    all() {
      const values = Object.fromEntries(Object.keys(FIELDS).map((field) => [field, read(field)]));
      const until = Number(q.get.get("eco_access_until")?.value) || 0;
      return { ...values, access: effectiveLevel(values.access, until, now()), accessUntil: values.access === "unlimited" ? until : null };
    },
    /** Qisman yangilash; noto'g'ri qiymat — ValidationError. Qaytaradi: yangi holat. */
    update(patch) {
      const entries = Object.entries(patch ?? {}).filter(([k]) => k in FIELDS);
      if (!entries.length) throw new ValidationError("O'zgartiriladigan sozlama yo'q");
      for (const [key, value] of entries) {
        if (!FIELDS[key].includes(value)) throw new ValidationError(`${key}: ${FIELDS[key].join(" | ")} bo'lishi kerak`);
      }
      for (const [key, value] of entries) q.set.run(`eco_${key}`, value);
      // Cheksiz rejim — muddatli (1 soat). Parol tekshiruvi — chaqiruvchida (app.js).
      if (patch.access === "unlimited") q.set.run("eco_access_until", String(now() + UNLIMITED_MS));
      return this.all();
    },
  };
}
