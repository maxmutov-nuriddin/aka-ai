import { test } from "node:test";
import assert from "node:assert/strict";
import { createOmniVoice, OMNIVOICE_STYLES, OMNIVOICE_VOICES, toOmniVoiceSpeech } from "../../server/voice/omnivoice.js";
import { createVoiceServices } from "../../server/app.js";

function fakeFetch(audio = "WAVDATA", { ok = true, status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return { ok, status, text: async () => "xato", arrayBuffer: async () => new TextEncoder().encode(audio).buffer };
  };
  return { fetchImpl, calls };
}

const ENV = { OMNIVOICE_URL: "http://127.0.0.1:8770/" };

test("OmniVoice: Jigar teglari OmniVoice teglariga, noma'lumlari olib tashlanadi", () => {
  assert.equal(toOmniVoiceSpeech("[laughs] Salom! [curious] Qani  [sighs] ko'ramiz"), "[laughter] Salom! Qani [sigh] ko'ramiz");
});

test("OmniVoice: xarakter va yosh bo'yicha ovoz, til va WAV qaytaradi", async () => {
  const { fetchImpl, calls } = fakeFetch();
  const tts = createOmniVoice({ env: ENV, fetchImpl });
  assert.equal(tts.configured, true);
  assert.equal(tts.contentType, "audio/wav");
  const audio = await tts.synthesize("[laughs] Salom", { persona: "jahldor", level: "student", lang: "uz" });
  assert.equal(audio.toString(), "WAVDATA");
  const { url, body } = calls[0];
  assert.equal(url, "http://127.0.0.1:8770/tts");
  assert.deepEqual(body, {
    text: "[laughter] Salom",
    lang: "uz",
    voice: "jahldor-katta",
    instruct: OMNIVOICE_VOICES.jahldor.katta,
    sample: OMNIVOICE_STYLES.jahldor.sample,
    speed: OMNIVOICE_STYLES.jahldor.speed,
  });
});

test("OmniVoice: xarakter berilmasa — neytral-yosh; noma'lum til — avtomatik (null)", async () => {
  const { fetchImpl, calls } = fakeFetch();
  await createOmniVoice({ env: ENV, fetchImpl }).synthesize("Привет", { lang: "auto" });
  assert.equal(calls[0].body.voice, "neytral-yosh");
  assert.equal(calls[0].body.lang, null);
});

test("OmniVoice: bo'sh yoki faqat tegli matn — ValidationError, so'rov yuborilmaydi", async () => {
  const { fetchImpl, calls } = fakeFetch();
  const tts = createOmniVoice({ env: ENV, fetchImpl });
  await assert.rejects(tts.synthesize("[laughs]"), /bo'sh/);
  await assert.rejects(tts.synthesize("a".repeat(3001)), /3000/);
  assert.equal(calls.length, 0);
});

test("OmniVoice: server xatosi va sozlanmaganlik — Error (app ElevenLabs'ga o'tadi)", async () => {
  const { fetchImpl } = fakeFetch("", { ok: false, status: 500 });
  await assert.rejects(createOmniVoice({ env: ENV, fetchImpl }).synthesize("Salom"), /OmniVoice 500/);
  const off = createOmniVoice({ env: {} });
  assert.equal(off.configured, false);
  await assert.rejects(off.synthesize("Salom"), /OMNIVOICE_URL/);
  assert.equal(createOmniVoice({ env: { OMNIVOICE_URL: "ftp://x" } }).configured, false);
});

test("createVoiceServices: OmniVoice — OMNIVOICE_URL bo'lsa sozlangan", () => {
  assert.equal(createVoiceServices({}).providers.omnivoice.configured, false);
  assert.equal(createVoiceServices(ENV).providers.omnivoice.configured, true);
});

test("OmniVoice: har xarakterda ovoz tavsifi, namuna gap va sur'at bor; romantik — eng sekin", () => {
  for (const persona of Object.keys(OMNIVOICE_VOICES)) {
    assert.ok(OMNIVOICE_STYLES[persona].sample.length > 20, persona);
    assert.ok(OMNIVOICE_STYLES[persona].speed > 0.6 && OMNIVOICE_STYLES[persona].speed <= 1, persona);
  }
  const slowest = Math.min(...Object.values(OMNIVOICE_STYLES).map((s) => s.speed));
  assert.equal(OMNIVOICE_STYLES.romantik.speed, slowest);
});
