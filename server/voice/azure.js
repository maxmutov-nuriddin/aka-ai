// O'zbekcha nutq sintezi (Azure Speech, neural ovoz). Kalit faqat serverda turadi.
import { ValidationError, TtsNotConfiguredError } from "../core/errors.js";
import { stripAudioTags } from "../core/parse.js";

export { TtsNotConfiguredError };

export const MAX_TTS_CHARS = 1000;
const DEFAULT_VOICE = "uz-UZ-SardorNeural";
const DEFAULT_VOICE_RU = "ru-RU-DmitryNeural";
const DEFAULT_RATE = "-5%"; // biroz sekinroq — o'quvchi aniq eshitsin
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const REQUEST_TIMEOUT_MS = 15_000;

const VOICE_RE = /^[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural$/;
const REGION_RE = /^[a-z0-9-]+$/;
const RATE_RE = /^[+-]?\d{1,2}%$/;


const APOSTROPHES = "'`’‘ʼʻ´";
const OG_RE = new RegExp(`([oOgG])[${APOSTROPHES}]`, "g");
// oʻ/gʻ dagi ʻ ga tegmaymiz — faqat qolgan tutuq belgilarini ʼ ga aylantiramiz.
const TUTUQ_RE = new RegExp(`(\\p{L})[${APOSTROPHES.replace("ʻ", "")}](?=\\p{L})`, "gu");
const EMOJI_RE = /[\p{Extended_Pictographic}️‍]/gu;

/**
 * O'zbek lotinini ovoz modeli to'g'ri o'qiydigan ko'rinishga keltiradi:
 * o'/g' → oʻ/gʻ, tutuq belgisi → ʼ, emoji olib tashlanadi.
 * @param {string} text
 * @returns {string}
 */
export function normalizeUzbekForTts(text) {
  return String(text)
    .replace(OG_RE, "$1ʻ")
    .replace(TUTUQ_RE, "$1ʼ")
    .replace(EMOJI_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeXml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * @param {string} text
 * @param {string} voice
 * @param {string} [rate]
 * @returns {string}
 */
export function buildSsml(text, voice, rate = "0%", xmlLang = "uz-UZ") {
  return (
    `<speak version="1.0" xml:lang="${xmlLang}">` +
    `<voice name="${voice}"><prosody rate="${rate}">${escapeXml(text)}</prosody></voice>` +
    `</speak>`
  );
}

function validateText(text) {
  if (typeof text !== "string") throw new ValidationError("text matn bo'lishi kerak");
  const trimmed = text.trim();
  if (!trimmed) throw new ValidationError("text bo'sh bo'lmasligi kerak");
  if (trimmed.length > MAX_TTS_CHARS) throw new ValidationError(`text ${MAX_TTS_CHARS} belgidan oshmasin`);
  return trimmed;
}

function readConfig(env) {
  const key = env.AZURE_SPEECH_KEY?.trim();
  const region = env.AZURE_SPEECH_REGION?.trim();
  const voice = env.AKA_TTS_VOICE?.trim() || DEFAULT_VOICE;
  const voiceRu = env.AKA_TTS_VOICE_RU?.trim() || DEFAULT_VOICE_RU;
  const rate = env.AKA_TTS_RATE?.trim() || DEFAULT_RATE;
  if (!key || !region || !REGION_RE.test(region)) return null;
  return {
    key,
    url: `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    voice: VOICE_RE.test(voice) ? voice : DEFAULT_VOICE,
    voiceRu: VOICE_RE.test(voiceRu) ? voiceRu : DEFAULT_VOICE_RU,
    rate: RATE_RE.test(rate) ? rate : DEFAULT_RATE,
  };
}

/**
 * @param {{ env?: Record<string, string | undefined>, fetchImpl?: typeof fetch }} [options]
 */
export function createTts({ env = process.env, fetchImpl = fetch } = {}) {
  const config = readConfig(env);

  async function synthesize(text, { lang } = {}) {
    const russian = lang === "ru";
    // Azure [laughs] kabi teglarni tushunmaydi — ularni o'qib yubormasin.
    const plain = stripAudioTags(validateText(text));
    const clean = russian ? plain.trim() : normalizeUzbekForTts(plain);
    if (!config) throw new TtsNotConfiguredError("AZURE_SPEECH_KEY yoki AZURE_SPEECH_REGION o'rnatilmagan");
    if (!clean) throw new ValidationError("text bo'sh bo'lmasligi kerak");

    const res = await fetchImpl(config.url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": config.key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": OUTPUT_FORMAT,
        "User-Agent": "aka-ai",
      },
      body: russian ? buildSsml(clean, config.voiceRu, config.rate, "ru-RU") : buildSsml(clean, config.voice, config.rate),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Azure TTS ${res.status}: ${detail.slice(0, 200)}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  return { configured: Boolean(config), synthesize };
}
