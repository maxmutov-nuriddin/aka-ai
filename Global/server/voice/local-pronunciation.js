// O'z serverimizdagi talaffuz bahosi (pronounce/server.py: wav2vec2 + espeak-ng). Rus va o'zbek tili, Azure'siz.
// PRONOUNCE_URL bo'lmasa — o'chiq; xizmat ishlamasa — chaqiruvchi Azure yoki Scribe ishorasiga o'tadi.
import { normalizePronunciation } from "../core/pronunciation.js";

const REQUEST_TIMEOUT_MS = 20_000;
const LANGS = new Set(["ru", "uz"]);

/**
 * @param {{ env?: Record<string, string | undefined>, fetchImpl?: typeof fetch }} [options]
 */
export function createLocalPronunciation({ env = process.env, fetchImpl = fetch } = {}) {
  const base = env.PRONOUNCE_URL?.trim().replace(/\/+$/, "");
  const configured = Boolean(base && /^https?:\/\//.test(base));

  /**
   * @param {Buffer} wav 16 kHz mono PCM WAV
   * @param {{ referenceText: string, lang: "ru" | "uz" }} options
   */
  async function assess(wav, { referenceText, lang }) {
    if (!configured) throw new Error("Lokal talaffuz xizmati sozlanmagan (PRONOUNCE_URL)");
    const query = `lang=${encodeURIComponent(lang)}&text=${encodeURIComponent(String(referenceText ?? ""))}`;
    const res = await fetchImpl(`${base}/assess?${query}`, {
      method: "POST",
      headers: { "Content-Type": "audio/wav" },
      body: wav,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Lokal talaffuz ${res.status}: ${detail.slice(0, 200)}`);
    }
    return normalizePronunciation({ ...(await res.json()), source: "local" });
  }

  return { configured, supports: (lang) => LANGS.has(lang), assess };
}
