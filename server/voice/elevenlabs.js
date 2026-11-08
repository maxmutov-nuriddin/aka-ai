// ElevenLabs: o'zbekcha ovoz (eleven_v3, ovoz teglari bilan) va nutqni matnga aylantirish (scribe_v2).
// Kalit faqat serverda turadi.
import { ValidationError, TtsNotConfiguredError } from "../core/errors.js";

const API_BASE = "https://api.elevenlabs.io/v1";
// eleven_v4_turbo: o'zbekchani rasman qo'llaydi, tez (~1 s) va [laughs] kabi teglarni tushunadi.
const DEFAULT_MODEL = "eleven_v4_turbo";
// eleven_v3 language_code "uz" ni rad etadi (tilni o'zi aniqlaydi) — kod faqat v4 modellarga yuboriladi.
const LANGUAGE_CODE_MODEL_RE = /^eleven_v4/;
const STT_MODEL = "scribe_v2";
const LANGUAGES = new Set(["uz", "ru"]);
// Jonliroq va aniqroq: stability past — ohang erkinroq, style — his-tuyg'u kuchliroq, speaker boost — tiniqroq.
const VOICE_SETTINGS = { stability: 0.3, similarity_boost: 0.8, style: 0.6, use_speaker_boost: true };
// Xarakter ohangi (ro'yxatdan o'tishda tanlanadi). stability past — hissiyotli, style yuqori — ifodali,
// speed: ElevenLabs 0.7..1.2 oralig'ini qabul qiladi.
const PERSONA_VOICE = {
  neytral: { stability: 0.45, style: 0.35, speed: 1.0 }, // xotirjam, tekis
  mehribon: { stability: 0.5, style: 0.45, speed: 0.94 }, // iliq, shoshilmasdan
  kinoyali: { stability: 0.28, style: 0.7, speed: 1.04 }, // o'ynoqi, ifodali
  jahldor: { stability: 0.22, style: 0.85, speed: 1.1 }, // keskin, tez, kuchli
  romantik: { stability: 0.38, style: 0.65, speed: 0.9 }, // yumshoq, sekin, hissiyotli
};

// Har xarakterning o'z ovozi (ElevenLabs Voice Library) — o'quvchining yoshiga qarab ikki guruh:
//   yosh  (5–9-sinf): yosh kattalarning jonli, tiniq ovozi (bola ovozi emas — "detskiy" bo'lmasin);
//   katta (10–11-sinf, talaba): salmoqliroq, o'rta yoshli ovoz.
// Barchasining o'zbekcha talaffuzi Scribe bilan tekshirilgan. Xarakter tanlanmagan bo'lsa — .env dagi asosiy ovoz.
// .env: ELEVENLABS_VOICE_ID_<XARAKTER> — ikkala guruhga, ELEVENLABS_VOICE_ID_<XARAKTER>_<YOSH|KATTA> — bittasiga.
const PERSONA_VOICE_IDS = {
  neytral: { yosh: "rwtcHtZgYU6HN2zLNBlf", katta: "cfWx14ZbaEUT4BjIA5tH" }, // Sarhad Siz / Mirjalol
  mehribon: { yosh: "GChwNsPvTsqD6tAAORVU", katta: "RaNVfTYq3HYeFPLng6XN" }, // Shohjahon / Mirzaev
  kinoyali: { yosh: "tQBN3grEhnGrrqn0n2Rw", katta: "loY1uopAz31XyhAEhNSa" }, // Samariddin Siroj / Valf (ingliz, kesatuvchi)
  jahldor: { yosh: "GcnlXfqDudh5dSQpZVll", katta: "agoC45V78njTIxYzwmSb" }, // Mirzabek / Davronbek
  romantik: { yosh: "cWMhk6QNJcc3Wl95qwmf", katta: "2phQmOHtyk7rkOtxvxKO" }, // Nazlı (turk) / Guzel (rus) — o'zbekcha ayol ovozi yo'q
};
const AGE_BANDS = ["yosh", "katta"];
const BAND_BY_LEVEL = { "5-7": "yosh", "8-9": "yosh", "10-11": "katta", student: "katta" };
// Sinf noma'lum bo'lsa — asosiy auditoriya (maktab o'quvchilari) uchun yosh ovoz.
const bandOf = (level) => BAND_BY_LEVEL[level] ?? "yosh";

/** Xarakterga mos ovoz sozlamasi. Xarakter berilmasa yoki noma'lum bo'lsa — standart. */
export function voiceSettingsFor(persona) {
  return { ...VOICE_SETTINGS, ...(PERSONA_VOICE[persona] ?? {}) };
}
const OUTPUT_FORMAT = "mp3_44100_128";
// "Will" — bepul tayyor ovozlar ichida o'zbekchani eng toza talaffuz qiladigani (Scribe uni o'zbekcha deb taniydi,
// "Adam" esa turkcha deb). Yaxshisini Voice Library'dan tanlab, ELEVENLABS_VOICE_ID ga yozing.
const DEFAULT_VOICE_ID = "bIHbv24MWmeRgasZH58o";
const REQUEST_TIMEOUT_MS = 30_000;

export const MAX_TTS_CHARS = 1000;
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const VOICE_ID_RE = /^[A-Za-z0-9]{6,40}$/;

// O'zbekcha talaffuzni buzmaydigan teglar (sinab ko'rilgan). [angry], [frustrated], [shouting], [annoyed] kabilar
// so'zlarni buzadi va inglizcha urg'u beradi — ular ovozga yuborilmaydi (robot yuzi uchun brauzerda qoladi).
const SAFE_VOICE_TAGS = new Set(["laughs", "chuckles", "sighs", "curious", "excited", "whispers"]);
const TAG_RE = /[ \t]*\[([a-z]+(?:[ ,'-]+[a-z]+){0,4})\][ \t]*/g;

const langOf = (lang) => (LANGUAGES.has(lang) ? lang : "uz");
export const AUTO_LANG = "auto"; // til o'rganish rejimi: o'zbekcha va ruscha aralash nutq

/**
 * ElevenLabs belgi vaqtlaridan so'z boshlanish vaqtlarini chiqaradi. [laughs] kabi teglar so'z hisoblanmaydi —
 * natija brauzerdagi (teglarsiz) yozuvning so'zlariga birma-bir mos keladi.
 * @param {{ characters?: string[], character_start_times_seconds?: number[] } | null | undefined} alignment
 * @returns {number[]}
 */
export function wordStartsFromAlignment(alignment) {
  const chars = alignment?.characters ?? [];
  const times = alignment?.character_start_times_seconds ?? [];
  const starts = [];
  let inTag = false;
  let inWord = false;
  chars.forEach((ch, i) => {
    if (ch === "[") inTag = true;
    if (inTag) {
      if (ch === "]") inTag = false;
      inWord = false;
      return;
    }
    if (/\s/.test(ch)) {
      inWord = false;
      return;
    }
    if (!inWord) starts.push(Number(times[i]) || 0);
    inWord = true;
  });
  return starts;
}

/** Faqat xavfsiz ovoz teglarini qoldiradi. */
export function keepSafeVoiceTags(text) {
  return String(text ?? "")
    .replace(TAG_RE, (whole, tag) => (SAFE_VOICE_TAGS.has(tag) ? whole : " "))
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
const MODEL_RE = /^[a-z0-9_]{3,40}$/;

function readConfig(env) {
  const key = env.ELEVENLABS_API_KEY?.trim();
  if (!key) return null;
  const voiceId = env.ELEVENLABS_VOICE_ID?.trim();
  const model = env.ELEVENLABS_MODEL?.trim();
  const envVoice = (name) => {
    const value = env[name]?.trim();
    return value && VOICE_ID_RE.test(value) ? value : null;
  };
  // { persona: { yosh: id, katta: id } } — .env dagi qiymat (guruhga xos, keyin umumiy) standartdan ustun.
  const personaVoices = Object.fromEntries(
    Object.entries(PERSONA_VOICE_IDS).map(([persona, defaults]) => {
      const base = `ELEVENLABS_VOICE_ID_${persona.toUpperCase()}`;
      const bands = AGE_BANDS.map((band) => [band, envVoice(`${base}_${band.toUpperCase()}`) ?? envVoice(base) ?? defaults[band]]);
      return [persona, Object.fromEntries(bands)];
    }),
  );
  return {
    key,
    voiceId: voiceId && VOICE_ID_RE.test(voiceId) ? voiceId : DEFAULT_VOICE_ID,
    personaVoices,
    model: model && MODEL_RE.test(model) ? model : DEFAULT_MODEL,
  };
}

function validateText(text) {
  if (typeof text !== "string" || !text.trim()) throw new ValidationError("text bo'sh bo'lmasligi kerak");
  const trimmed = text.trim();
  if (trimmed.length > MAX_TTS_CHARS) throw new ValidationError(`text ${MAX_TTS_CHARS} belgidan oshmasin`);
  return trimmed;
}

function validateAudio(audio, mimeType) {
  if (!Buffer.isBuffer(audio) || audio.length === 0) throw new ValidationError("Ovoz yozuvi bo'sh");
  if (audio.length > MAX_AUDIO_BYTES) throw new ValidationError("Ovoz yozuvi juda uzun");
  if (!/^audio\//.test(String(mimeType))) throw new ValidationError("Faqat audio fayl qabul qilinadi");
}

async function failWith(label, res) {
  const detail = await res.text().catch(() => "");
  throw new Error(`${label} ${res.status}: ${detail.slice(0, 200)}`);
}

/**
 * @param {{ env?: Record<string, string | undefined>, fetchImpl?: typeof fetch }} [options]
 */
export function createElevenLabs({ env = process.env, fetchImpl = fetch } = {}) {
  const config = readConfig(env);

  function requireConfig() {
    if (!config) throw new TtsNotConfiguredError("ELEVENLABS_API_KEY o'rnatilmagan");
    return config;
  }

  /** Xarakter va yoshga mos ovoz; xarakter yo'q yoki noma'lum bo'lsa — asosiy ovoz. */
  function voiceFor(persona, level) {
    const { voiceId, personaVoices } = requireConfig();
    return personaVoices[persona]?.[bandOf(level)] ?? voiceId;
  }

  function prepareBody(text, lang, persona) {
    const clean = keepSafeVoiceTags(validateText(text));
    const { model } = requireConfig();
    if (!clean) throw new ValidationError("text bo'sh bo'lmasligi kerak");
    return JSON.stringify({
      text: clean,
      model_id: model,
      voice_settings: voiceSettingsFor(persona),
      // "auto" (til o'rganish: ikki til aralash) — model tilni o'zi aniqlaydi.
      ...(LANGUAGE_CODE_MODEL_RE.test(model) && lang !== AUTO_LANG ? { language_code: langOf(lang) } : {}),
    });
  }

  /**
   * TTS so'rovi. Xarakter ovozi ishlamasa (o'chirilgan, ruxsat yo'q va h.k.) — bir marta asosiy ovoz bilan
   * qayta urinadi: o'quvchi jim qolmasin. Asosiy ovoz ham ishlamasa — xato.
   */
  async function postTts(text, { lang, persona, level, timed }) {
    const body = prepareBody(text, lang, persona);
    const { key, voiceId: baseVoice } = requireConfig();
    const personaVoice = voiceFor(persona, level);
    const voices = personaVoice === baseVoice ? [baseVoice] : [personaVoice, baseVoice];
    const suffix = timed ? "/with-timestamps" : "";
    const headers = { "xi-api-key": key, "Content-Type": "application/json", ...(timed ? {} : { Accept: "audio/mpeg" }) };
    let res;
    for (const voiceId of voices) {
      res = await fetchImpl(`${API_BASE}/text-to-speech/${voiceId}${suffix}?output_format=${OUTPUT_FORMAT}`, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.ok) return res;
      if (voiceId !== baseVoice) console.warn(`[elevenlabs] ${persona} ovozi ishlamadi (${res.status}) — asosiy ovozga o'tildi`);
    }
    return failWith("ElevenLabs TTS", res);
  }

  /** Matnni ovozga aylantiradi. Xavfsiz teglar ([laughs] va b.) modelga o'zgarishsiz boradi. */
  async function synthesize(text, { lang, persona, level } = {}) {
    const res = await postTts(text, { lang, persona, level, timed: false });
    return Buffer.from(await res.arrayBuffer());
  }

  /** Ovoz + har so'z boshlanish vaqti (yozuv va robot yuzi ovozga aniq mos tushishi uchun). */
  async function synthesizeTimed(text, { lang, persona, level } = {}) {
    const res = await postTts(text, { lang, persona, level, timed: true });
    const data = await res.json();
    if (typeof data?.audio_base64 !== "string") throw new Error("ElevenLabs TTS: audio yo'q");
    return { audio: Buffer.from(data.audio_base64, "base64"), wordStarts: wordStartsFromAlignment(data.alignment) };
  }

  /** O'quvchining ovoz yozuvini matnga aylantiradi. */
  async function transcribe(audio, mimeType, options = {}) {
    return (await transcribeDetailed(audio, mimeType, options)).text;
  }

  /** Matn + so'zlar (har biri logprob bilan — talaffuz ishorasi uchun) + aniqlangan til ("rus", "uzb"). */
  async function transcribeDetailed(audio, mimeType, { lang } = {}) {
    const { key } = requireConfig();
    validateAudio(audio, mimeType);
    const form = new FormData();
    form.append("model_id", STT_MODEL);
    if (lang !== AUTO_LANG) form.append("language_code", langOf(lang));
    form.append("tag_audio_events", "false");
    const ext = /wav/.test(mimeType) ? "wav" : /mp4|m4a/.test(mimeType) ? "m4a" : /ogg/.test(mimeType) ? "ogg" : "webm";
    form.append("file", new Blob([audio], { type: mimeType }), `speech.${ext}`);

    const res = await fetchImpl(`${API_BASE}/speech-to-text`, {
      method: "POST",
      headers: { "xi-api-key": key },
      body: form,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) await failWith("ElevenLabs STT", res);
    const data = await res.json();
    return {
      text: typeof data?.text === "string" ? data.text.trim() : "",
      words: Array.isArray(data?.words) ? data.words : [],
      languageCode: typeof data?.language_code === "string" ? data.language_code : "",
    };
  }

  return { configured: Boolean(config), voiceFor, synthesize, synthesizeTimed, transcribe, transcribeDetailed };
}
