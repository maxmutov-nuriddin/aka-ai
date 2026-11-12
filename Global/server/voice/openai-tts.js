// OpenAI TTS — muqobil ovoz xizmati. Support panelida tanlanadi (settings: tts_provider = "openai").
// Speech API (POST /v1/audio/speech): matn + ovoz + ohang ko'rsatmasi (instructions); javob — MP3.
// DIQQAT: OpenAI bu modellarni (gpt-4o-mini-tts, tts-1) 2027-01-06 da o'chiradi; o'rniga Realtime API
// (gpt-realtime-2.1-mini). Ko'chirish shu fayl ichida qilinadi — tashqi interfeys (synthesize) o'zgarmaydi.
// O'zbek tili OpenAI'ning rasmiy ro'yxatida yo'q — sifatini eshitib tekshirish kerak.
import { ValidationError } from "../core/errors.js";
import { speechStyleFor } from "./persona-styles.js";

const API_URL = "https://api.openai.com/v1/audio/speech";
const DEFAULT_MODEL = "gpt-4o-mini-tts";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_TTS_CHARS = 4000; // API chegarasi — 4096 belgi

// Yosh guruhi (boshqa ovoz xizmatlari bilan bir xil): 5–9-sinf — yosh, 10–11 va talaba — katta.
const BAND_BY_LEVEL = { "5-7": "yosh", "8-9": "yosh", "10-11": "katta", student: "katta" };
const bandOf = (level) => BAND_BY_LEVEL[level] ?? "yosh";

// Xarakter x yosh -> OpenAI ovozi (boshqa xizmatlar bilan bir mantiq: romantik katta — ayol ovozi).
export const OPENAI_VOICES = {
  neytral: { yosh: "cedar", katta: "onyx" },
  mehribon: { yosh: "echo", katta: "cedar" },
  kinoyali: { yosh: "verse", katta: "ballad" },
  jahldor: { yosh: "ash", katta: "onyx" },
  romantik: { yosh: "cedar", katta: "marin" },
  moslashuvchan: { yosh: "alloy", katta: "cedar" },
};

// Ohang — xarakter va yoshga mos (instructions): server/voice/persona-styles.js.

const LANGUAGE = {
  uz: "Speak Uzbek (Latin script) with natural native Uzbek pronunciation, not an English accent.",
  ru: "Speak Russian with natural native Russian pronunciation.",
};

/** Jigarning ovoz teglari ([laughs] kabi) OpenAI'da yo'q — olib tashlanadi, ohang instructions bilan beriladi. */
export function toOpenAiSpeech(text) {
  return String(text ?? "")
    .replace(/\[[a-z ]+\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {{ env?: Record<string, string | undefined>, fetchImpl?: typeof fetch }} [options]
 */
export function createOpenAiTts({ env = process.env, fetchImpl = fetch } = {}) {
  const key = env.OPENAI_API_KEY?.trim();
  const model = env.OPENAI_TTS_MODEL?.trim() || DEFAULT_MODEL;

  async function synthesize(text, { lang, persona, level } = {}) {
    const spoken = toOpenAiSpeech(text);
    if (!spoken) throw new ValidationError("text bo'sh bo'lmasligi kerak");
    if (spoken.length > MAX_TTS_CHARS) throw new ValidationError(`text ${MAX_TTS_CHARS} belgidan oshmasin`);
    if (!key) throw new Error("OpenAI TTS sozlanmagan (OPENAI_API_KEY)");
    const who = OPENAI_VOICES[persona] ? persona : "neytral";
    const res = await fetchImpl(API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: spoken,
        voice: OPENAI_VOICES[who][bandOf(level)],
        instructions: `${LANGUAGE[lang] ?? LANGUAGE.uz} Tone: ${speechStyleFor(who, level)}`,
        response_format: "mp3",
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`OpenAI TTS ${res.status}: ${detail.slice(0, 200)}`);
    }
    const audio = Buffer.from(await res.arrayBuffer());
    if (!audio.length) throw new Error("OpenAI TTS: audio yo'q");
    return audio;
  }

  return { configured: Boolean(key), model, contentType: "audio/mpeg", synthesize };
}
