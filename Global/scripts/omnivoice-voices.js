// OmniVoice xarakter ovozlari — Gemini TTS'dan bir marta yozib olinadi (GEMINI_API_KEY kerak, ~10 so'rov).
// Har xarakter x yosh: Gemini o'sha xarakter ovozi va ohangida namuna gapni o'qiydi -> omnivoice/voices/<xarakter>-<yosh>.wav
// (+ .txt — gap matni). OmniVoice keyin shu ovozni klonlaydi: jonli javoblarda Gemini'ga pul to'lanmaydi.
// Ishga tushirish: npm run omnivoice:voices   (keyin OmniVoice serverini qayta ishga tushiring)
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGeminiTts } from "../server/voice/gemini-tts.js";
import { OMNIVOICE_STYLES, OMNIVOICE_VOICES } from "../server/voice/omnivoice.js";

const voicesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "omnivoice", "voices");
// Yosh guruhi -> shu guruhdagi bitta sinf (Gemini ovozi sinfdan tanlanadi).
const LEVEL_OF_BAND = { yosh: "8-9", katta: "student" };

async function main() {
  const gemini = createGeminiTts({ env: process.env });
  if (!gemini.configured) throw new Error("GEMINI_API_KEY .env da yo'q");
  mkdirSync(voicesDir, { recursive: true });
  for (const persona of Object.keys(OMNIVOICE_VOICES)) {
    const { sample } = OMNIVOICE_STYLES[persona];
    for (const [band, level] of Object.entries(LEVEL_OF_BAND)) {
      const audio = await gemini.synthesize(sample, { persona, level });
      const name = `${persona}-${band}`;
      writeFileSync(path.join(voicesDir, `${name}.wav`), audio);
      writeFileSync(path.join(voicesDir, `${name}.txt`), sample);
      console.log(`tayyor: ${name}.wav (${Math.round(audio.length / 1024)} KB)`);
    }
  }
  console.log("Endi OmniVoice serverini qayta ishga tushiring: npm run omnivoice");
}

main().catch((err) => {
  console.error(`Xato: ${err.message}`);
  process.exit(1);
});
