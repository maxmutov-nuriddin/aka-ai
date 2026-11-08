// Azure Speech — Pronunciation Assessment (REST, qisqa audio). Rus tili (ru-RU) uchun; o'zbek tili Azure'da yo'q.
// Namuna matn — Scribe tanigan matn: Azure har so'z va tovushni shunga solishtirib baholaydi.
import { fromAzureResult } from "../core/pronunciation.js";

const REQUEST_TIMEOUT_MS = 15_000;
const REGION_RE = /^[a-z0-9-]+$/;
const LOCALES = { ru: "ru-RU" }; // Azure Pronunciation Assessment o'zbek tilini qo'llamaydi

/**
 * @param {{ env?: Record<string, string | undefined>, fetchImpl?: typeof fetch }} [options]
 */
export function createAzurePronunciation({ env = process.env, fetchImpl = fetch } = {}) {
  const key = env.AZURE_SPEECH_KEY?.trim();
  const region = env.AZURE_SPEECH_REGION?.trim();
  const configured = Boolean(key && region && REGION_RE.test(region));

  /**
   * @param {Buffer} wav 16 kHz mono PCM WAV
   * @param {{ referenceText: string, locale?: string }} options
   */
  async function assess(wav, { referenceText, lang = "ru", locale = LOCALES[lang] ?? "ru-RU" }) {
    if (!configured) throw new Error("Azure talaffuz bahosi sozlanmagan");
    const config = {
      ReferenceText: String(referenceText ?? ""),
      GradingSystem: "HundredMark",
      Granularity: "Phoneme",
      Dimension: "Comprehensive",
      EnableMiscue: false,
    };
    const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${locale}&format=detailed`;
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
        Accept: "application/json",
        "Pronunciation-Assessment": Buffer.from(JSON.stringify(config), "utf8").toString("base64"),
      },
      body: wav,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Azure talaffuz ${res.status}: ${detail.slice(0, 200)}`);
    }
    return fromAzureResult(await res.json());
  }

  return { configured, supports: (lang) => Boolean(LOCALES[lang]), assess };
}
