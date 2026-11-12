// Gemini TTS (Google) — muqobil ovoz xizmati. Support panelida tanlanadi (settings: tts_provider = "gemini").
// Interactions API: matn + uslub (speech_metadata.style) + ovoz nomi; javob — WAV (24 kHz, mono, 16-bit).
// Til avtomatik aniqlanadi (o'zbekcha — "Northern Uzbek", ruscha).
import { ValidationError } from "../core/errors.js";
import { speechStyleFor } from "./persona-styles.js";

const API_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const API_REVISION = "2026-05-20";
const DEFAULT_MODEL = "gemini-3.8-flash-tts";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_TTS_CHARS = 3000;

// Yosh guruhi (ElevenLabs va Fish bilan bir xil): 5–9-sinf — yosh, 10–11 va talaba — katta.
const BAND_BY_LEVEL = { "5-7": "yosh", "8-9": "yosh", "10-11": "katta", student: "katta" };
const bandOf = (level) => BAND_BY_LEVEL[level] ?? "yosh";

// Xarakter x yosh -> Gemini tayyor ovozi (Fish/ElevenLabs bilan bir mantiq: romantik katta — ayol ovozi).
export const GEMINI_VOICES = {
  neytral: { yosh: "Iapetus", katta: "Charon" }, // tiniq / bilimdon
  mehribon: { yosh: "Achird", katta: "Umbriel" }, // do'stona / xotirjam
  kinoyali: { yosh: "Puck", katta: "Algieba" }, // quvnoq / silliq
  jahldor: { yosh: "Fenrir", katta: "Algenib" }, // hayajonli / xirildoq
  romantik: { yosh: "Zubenelgenubi", katta: "Sulafat" }, // samimiy / iliq
  moslashuvchan: { yosh: "Sadachbia", katta: "Sadaltager" }, // jonli / bilimdon
};

// Ohang — xarakter va yoshga mos (speech_metadata.style): server/voice/persona-styles.js.

// Jigarning ovoz teglari -> Gemini ichki teglari; qolganlari olib tashlanadi.
const TAGS = { laughs: "<laugh>", chuckles: "<laugh>", sighs: "<sigh>" };

/** [laughs] -> <laugh>; noma'lum teg — olib tashlanadi; ortiqcha bo'shliq tozalanadi. */
export function toGeminiSpeech(text) {
  return String(text ?? "")
    .replace(/\[([a-z ]+)\]/gi, (_, tag) => TAGS[tag.trim().toLowerCase()] ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Javobdan WAV: steps[].content[] dagi audio (base64). */
function audioFrom(data) {
  for (const step of [...(data?.steps ?? [])].reverse()) {
    const part = (step?.content ?? []).find((c) => typeof c?.data === "string");
    if (part) return Buffer.from(part.data, "base64");
  }
  if (typeof data?.output_audio?.data === "string") return Buffer.from(data.output_audio.data, "base64");
  return null;
}

/**
 * @param {{ env?: Record<string, string | undefined>, fetchImpl?: typeof fetch }} [options]
 */
export function createGeminiTts({ env = process.env, fetchImpl = fetch } = {}) {
  const key = env.GEMINI_API_KEY?.trim();
  const model = env.GEMINI_TTS_MODEL?.trim() || DEFAULT_MODEL;

  async function synthesize(text, { persona, level } = {}) {
    const spoken = toGeminiSpeech(text);
    if (!spoken) throw new ValidationError("text bo'sh bo'lmasligi kerak");
    if (spoken.length > MAX_TTS_CHARS) throw new ValidationError(`text ${MAX_TTS_CHARS} belgidan oshmasin`);
    if (!key) throw new Error("Gemini TTS sozlanmagan (GEMINI_API_KEY)");
    const who = GEMINI_VOICES[persona] ? persona : "neytral";
    const res = await fetchImpl(API_URL, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json", "Api-Revision": API_REVISION },
      body: JSON.stringify({
        model,
        store: false,
        input: [{
          type: "user_input",
          content: [{ type: "text", text: spoken, annotations: [{ type: "speech_metadata", style: speechStyleFor(who, level) }] }],
        }],
        response_format: { type: "audio" },
        generation_config: { speech_config: [{ voice: GEMINI_VOICES[who][bandOf(level)] }] },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Gemini TTS ${res.status}: ${detail.slice(0, 200)}`);
    }
    const audio = audioFrom(await res.json());
    if (!audio?.length) throw new Error("Gemini TTS: audio yo'q");
    return audio;
  }

  // contentType: brauzerga WAV sifatida beriladi (/api/tts Content-Type shundan olinadi).
  return { configured: Boolean(key), model, contentType: "audio/wav", synthesize };
}
