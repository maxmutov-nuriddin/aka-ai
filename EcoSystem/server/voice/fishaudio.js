// Fish Audio TTS (https://docs.fish.audio): ElevenLabs'ga arzonroq muqobil (~$15 / 1 mln bayt).
// Support sozlamalardan qaysi xizmat ishlatilishini tanlaydi (server/settings/store.js).
// Cheklov: so'z vaqtlari (timestamps) qaytarilmaydi — yozuv ovozga taxminiy moslanadi.
import { ValidationError } from "../core/jigar.js";
import { TtsNotConfiguredError } from "./azure.js";

const API_URL = "https://api.fish.audio/v1/tts";
const DEFAULT_MODEL = "drama-3";
// Support sozlamalardan tanlaydi (settings: fish_model). 2026-11 sinovi (o'zbekcha, 10 ovoz, Scribe bilan):
//   drama-3       — 10/10 so'zma-so'z to'g'ri, ~1.8 s, [laughs] kabi ko'rsatmalarni tushunadi (pullik);
//   s2.1-pro-free — bepul, lekin so'zlarni buzadi va o'zidan qo'shadi, 5–7 s (faqat sinov uchun).
// s2.1-pro va s2-pro o'zbekchada beqaror — ro'yxatdan olib tashlangan.
export const FISH_MODELS = ["s2.1-pro-free", "drama-3"];
const DIRECTABLE_MODELS = new Set(["drama-3"]); // ko'rsatma teglarini tushunadi — olib tashlanmaydi
const MAX_TTS_CHARS = 3000;
const REQUEST_TIMEOUT_MS = 30_000;
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const TAG_RE = /\[[a-z]+(?:[ ,'-]+[a-z]+){0,4}\]/g; // [laughs] kabi teglarni Fish tushunmaydi — o'qib yubormasin

// Xarakter ohangi: speed 0.5..2, temperature 0..1 (yuqori — ifodaliroq).
// O'zbekchada temperature 0.6+ bo'lsa Fish so'zlarni buzadi va o'zidan qo'shadi (2026-11 sinovi) — past ushlaymiz.
const PROSODY = {
  neytral: { speed: 1.0, temperature: 0.3 },
  mehribon: { speed: 0.94, temperature: 0.35 },
  kinoyali: { speed: 1.04, temperature: 0.45 },
  jahldor: { speed: 1.12, temperature: 0.5 },
  romantik: { speed: 0.9, temperature: 0.4 },
  moslashuvchan: { speed: 1.0, temperature: 0.42 },
};
const DEFAULT_PROSODY = { speed: 1.0, temperature: 0.3 };
// Yosh guruhi (ElevenLabs bilan bir xil): 5–9-sinf — yosh, 10–11 va talaba — katta; noma'lum — yosh.
const BAND_BY_LEVEL = { "5-7": "yosh", "8-9": "yosh", "10-11": "katta", student: "katta" };
const bandOf = (level) => BAND_BY_LEVEL[level] ?? "yosh";

// Standart o'zbekcha ovozlar (Fish Voice Library) — Drama 3 da talaffuzi Scribe bilan tekshirilgan (10/10).
// .env: FISH_VOICE_ID_<XARAKTER>[_YOSH|_KATTA] bilan almashtirsa bo'ladi.
const PERSONA_VOICE_IDS = {
  neytral: { yosh: "0725e335143c43bd8650b7d858c3badb", katta: "fef226d2978a42d5b542e7577134f7b2" }, // Anvarjon / O'zbek Erkak Ovozi
  mehribon: { yosh: "d9492b055c7a4f8da39e8afdefd947d7", katta: "b71eaf9b51e1477b91705eb71520d33e" }, // Xotirjam Erkak / Friendly Uzbek Narrator
  kinoyali: { yosh: "3d4d02e438f14fb292a49c954a8587c9", katta: "485beb5315784d629517504dccee9c9c" }, // Yosh O'zbek Erkak / Enerjik O'zbek
  jahldor: { yosh: "d69f7160c8f44fd99cb5f52b0a358a2f", katta: "44ad146afad04e4e99a7b98b8f97106f" }, // Dinamik O'zbek / Confident Uzbek
  romantik: { yosh: "ebe8b1e774544b36a842c30761a67dc5", katta: "d2ae3a2e45b9428f98957f902b23c825" }, // Uzbel / Jonli O'zbek (ayol)
  moslashuvchan: { yosh: "0725e335143c43bd8650b7d858c3badb", katta: "fef226d2978a42d5b542e7577134f7b2" }, // neytral ovozlari
};

/** Xarakterga mos tezlik va ifodalilik. Noma'lum — standart. */
export function fishProsodyFor(persona) {
  return PROSODY[persona] ?? DEFAULT_PROSODY;
}

function readConfig(env) {
  const key = env.FISH_API_KEY?.trim();
  if (!key) return null;
  const id = (name) => {
    const value = env[name]?.trim();
    return value && ID_RE.test(value) ? value : null;
  };
  const model = env.FISH_MODEL?.trim();
  // Xarakter × yosh guruhi (ElevenLabs bilan bir xil tuzilma): FISH_VOICE_ID_<XARAKTER>_<YOSH|KATTA>,
  // guruh ovozi bo'lmasa — FISH_VOICE_ID_<XARAKTER>, u ham bo'lmasa — FISH_VOICE_ID.
  const personaVoices = Object.fromEntries(
    Object.entries(PERSONA_VOICE_IDS).map(([p, defaults]) => {
      const base = `FISH_VOICE_ID_${p.toUpperCase()}`;
      return [p, { yosh: id(`${base}_YOSH`) ?? id(base) ?? defaults.yosh, katta: id(`${base}_KATTA`) ?? id(base) ?? defaults.katta }];
    }),
  );
  return {
    key,
    voiceId: id("FISH_VOICE_ID"), // bo'sh bo'lsa — Fish standart ovozi
    personaVoices,
    model: FISH_MODELS.includes(model) ? model : DEFAULT_MODEL,
  };
}

const squeeze = (s) => s.replace(/[ \t]{2,}/g, " ").trim();

/** Matnni tekshiradi. keepTags — Drama 3 uchun ([laughs] kabi teglar ovoz ko'rsatmasi bo'ladi). */
function cleanText(text, keepTags) {
  if (typeof text !== "string") throw new ValidationError("text bo'sh bo'lmasligi kerak");
  const spoken = squeeze(text.replace(TAG_RE, " "));
  if (!spoken) throw new ValidationError("text bo'sh bo'lmasligi kerak");
  const clean = keepTags ? squeeze(text) : spoken;
  if (clean.length > MAX_TTS_CHARS) throw new ValidationError(`text ${MAX_TTS_CHARS} belgidan oshmasin`);
  return clean;
}

/**
 * @param {{ env?: Record<string, string | undefined>, fetchImpl?: typeof fetch }} [options]
 */
export function createFishAudio({ env = process.env, fetchImpl = fetch } = {}) {
  const config = readConfig(env);

  /** Matnni ovozga aylantiradi (mp3). */
  async function synthesize(text, { lang, persona, level, model } = {}) {
    if (!config) throw new TtsNotConfiguredError("FISH_API_KEY o'rnatilmagan");
    const useModel = FISH_MODELS.includes(model) ? model : config.model; // support tanlovi, aks holda .env
    const clean = cleanText(text, DIRECTABLE_MODELS.has(useModel));
    const reference = config.personaVoices[persona]?.[bandOf(level)] ?? config.voiceId;
    const { speed, temperature } = fishProsodyFor(persona);
    const res = await fetchImpl(API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json", model: useModel },
      body: JSON.stringify({
        text: clean,
        ...(reference ? { reference_id: reference } : {}),
        format: "mp3",
        mp3_bitrate: 128,
        latency: "balanced",
        temperature,
        prosody: { speed },
        ...(lang === "auto" ? {} : { language: lang === "ru" ? "ru" : "uz" }), // "auto" — til o'rganish (aralash nutq)
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Fish Audio TTS ${res.status}: ${detail.slice(0, 200)}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  return { configured: Boolean(config), synthesize };
}
