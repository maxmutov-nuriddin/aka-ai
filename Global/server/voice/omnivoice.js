// OmniVoice — o'z serverimizdagi ovoz (omnivoice/server.py, ochiq model k2-fsa/OmniVoice). API to'lovi yo'q —
// xarajat faqat server (GPU). Support panelida tanlanadi (settings: tts_provider = "omnivoice").
// OMNIVOICE_URL bo'lmasa — o'chiq; server ishlamasa — o'sha so'rov ElevenLabs'ga o'tadi (app.js speakWith).
import { ValidationError } from "../core/errors.js";

const REQUEST_TIMEOUT_MS = 60_000; // CPU/MPS da birinchi so'rov (ovoz namunasi yaratish) sekinroq
const MAX_TTS_CHARS = 3000;
const LANGS = new Set(["uz", "ru"]);

// Yosh guruhi (boshqa ovoz xizmatlari bilan bir xil): 5–9-sinf — yosh, 10–11 va talaba — katta.
const BAND_BY_LEVEL = { "5-7": "yosh", "8-9": "yosh", "10-11": "katta", student: "katta" };
const bandOf = (level) => BAND_BY_LEVEL[level] ?? "yosh";

// Xarakter x yosh -> ovoz tavsifi (OmniVoice "instruct": faqat jins, yosh, ovoz balandligi — his-tuyg'u so'zlari yo'q).
// Boshqa xizmatlar bilan bir mantiq: romantik katta — ayol ovozi. Server har ovozni bir marta yaratib, keshlaydi.
export const OMNIVOICE_VOICES = {
  neytral: { yosh: "male, young adult, moderate pitch", katta: "male, middle-aged, low pitch" },
  mehribon: { yosh: "male, young adult, high pitch", katta: "male, young adult, moderate pitch" },
  kinoyali: { yosh: "male, teenager, moderate pitch", katta: "male, young adult, low pitch" },
  jahldor: { yosh: "male, young adult, low pitch", katta: "male, middle-aged, very low pitch" },
  romantik: { yosh: "male, young adult, low pitch", katta: "female, young adult, moderate pitch" },
  moslashuvchan: { yosh: "male, young adult, moderate pitch", katta: "male, young adult, moderate pitch" },
};

// Xarakter ohangi: OmniVoice his-tuyg'uni tavsifdan emas, namunadan oladi. Ovoz shu gapni o'qib yaratiladi va
// keyingi hamma javobda o'sha ohangni (iliq, kinoyali, jahldor, ...) davom ettiradi.
// speed: 1 — model sur'ati (o'zbekchada tez chiqadi), < 1 — sekinroq va tiniqroq.
export const OMNIVOICE_STYLES = {
  neytral: {
    speed: 0.9,
    sample: "Salom! Keling, bu mavzuni birga ko'rib chiqamiz. Avval asosiy fikrni tushunib olamiz, keyin bitta misol bilan mustahkamlaymiz.",
  },
  mehribon: {
    speed: 0.88,
    sample: "Voy, juda zo'r savol berding! Xavotir olma, hammasi joyida. Sekin-sekin, birga tushunib olamiz, sen albatta uddalaysan.",
  },
  kinoyali: {
    speed: 0.95,
    sample: "Qiziq savol-ku! Xo'p, mayli, bu safar ham tushuntirib beraman. Lekin keyingi safar o'zing topasan, kelishdikmi?",
  },
  jahldor: {
    speed: 0.97,
    sample: "Yana shu savolmi?! Diqqat bilan eshit! Men buni faqat bir marta tushuntiraman, keyin o'zing takrorlaysan!",
  },
  moslashuvchan: {
    speed: 0.92,
    sample: "Salom! Qanday kayfiyatdasiz? Xohlasangiz, qisqa va lo'nda, xohlasangiz, batafsil gaplashamiz — o'zingizga qanday qulay bo'lsa.",
  },
  romantik: {
    speed: 0.82,
    sample: "Salom, jigarim... Seni ko'rganimdan juda xursandman. Keling, shoshilmasdan, sokin ohangda birga gaplashamiz.",
  },
};

// Jigarning ovoz teglari -> OmniVoice teglari; qolganlari olib tashlanadi.
const TAGS = { laughs: "[laughter]", chuckles: "[laughter]", sighs: "[sigh]" };

/** [laughs] -> [laughter]; noma'lum teg — olib tashlanadi; ortiqcha bo'shliq tozalanadi. */
export function toOmniVoiceSpeech(text) {
  return String(text ?? "")
    .replace(/\[([a-z ]+)\]/gi, (_, tag) => TAGS[tag.trim().toLowerCase()] ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Teglardan tashqari gapiriladigan matn bormi (faqat teg bo'lsa — bo'sh). */
const hasWords = (spoken) => spoken.replace(/\[[a-z-]+\]/g, "").trim().length > 0;

/**
 * @param {{ env?: Record<string, string | undefined>, fetchImpl?: typeof fetch }} [options]
 */
export function createOmniVoice({ env = process.env, fetchImpl = fetch } = {}) {
  const base = env.OMNIVOICE_URL?.trim().replace(/\/+$/, "");
  const configured = Boolean(base && /^https?:\/\//.test(base));

  async function synthesize(text, { lang, persona, level } = {}) {
    const spoken = toOmniVoiceSpeech(text);
    if (!hasWords(spoken)) throw new ValidationError("text bo'sh bo'lmasligi kerak");
    if (spoken.length > MAX_TTS_CHARS) throw new ValidationError(`text ${MAX_TTS_CHARS} belgidan oshmasin`);
    if (!configured) throw new Error("OmniVoice sozlanmagan (OMNIVOICE_URL)");
    const who = OMNIVOICE_VOICES[persona] ? persona : "neytral";
    const band = bandOf(level);
    const res = await fetchImpl(`${base}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: spoken,
        lang: LANGS.has(lang) ? lang : null, // null — til avtomatik (til o'rganishda aralash nutq)
        voice: `${who}-${band}`,
        instruct: OMNIVOICE_VOICES[who][band],
        sample: OMNIVOICE_STYLES[who].sample,
        speed: OMNIVOICE_STYLES[who].speed,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`OmniVoice ${res.status}: ${detail.slice(0, 200)}`);
    }
    const audio = Buffer.from(await res.arrayBuffer());
    if (!audio.length) throw new Error("OmniVoice: audio yo'q");
    return audio;
  }

  return { configured, contentType: "audio/wav", synthesize };
}
