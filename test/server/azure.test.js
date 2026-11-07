import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeUzbekForTts, buildSsml, createTts, TtsNotConfiguredError, MAX_TTS_CHARS } from "../../server/voice/azure.js";
import { ValidationError } from "../../server/core/jigar.js";

const ENV = { AZURE_SPEECH_KEY: "test-key", AZURE_SPEECH_REGION: "westeurope" };

function fakeFetch(response = { ok: true, status: 200, body: new Uint8Array([1, 2, 3]) }) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: response.ok,
      status: response.status,
      arrayBuffer: async () => response.body.buffer,
      text: async () => "azure error",
    };
  };
  return { fetchImpl, calls };
}

test("normalizeUzbekForTts o' va g' ni to'g'ri o'zbek belgisiga aylantiradi", () => {
  assert.equal(normalizeUzbekForTts("o'simlik g'isht"), "oʻsimlik gʻisht");
  assert.equal(normalizeUzbekForTts("O`zbek G’alaba"), "Oʻzbek Gʻalaba");
  assert.equal(normalizeUzbekForTts("ma'no san'at"), "maʼno sanʼat");
});

test("normalizeUzbekForTts emoji va ortiqcha bo'shliqni olib tashlaydi", () => {
  assert.equal(normalizeUzbekForTts("Zo'r 🌱  ish ☀️!"), "Zoʻr ish !");
});

test("buildSsml matnni XML uchun xavfsiz qiladi va ovozni qo'yadi", () => {
  const ssml = buildSsml("a < b & \"c\"", "uz-UZ-SardorNeural");
  assert.match(ssml, /xml:lang="uz-UZ"/);
  assert.match(ssml, /<voice name="uz-UZ-SardorNeural">/);
  assert.match(ssml, /a &lt; b &amp; &quot;c&quot;/);
  assert.doesNotMatch(ssml, /a < b/);
});

test("createTts Azure'ga to'g'ri so'rov yuboradi va audio qaytaradi", async () => {
  const { fetchImpl, calls } = fakeFetch();
  const tts = createTts({ env: ENV, fetchImpl });
  assert.equal(tts.configured, true);

  const audio = await tts.synthesize("Salom, jigar!");

  assert.deepEqual([...audio], [1, 2, 3]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["Ocp-Apim-Subscription-Key"], "test-key");
  assert.equal(calls[0].init.headers["Content-Type"], "application/ssml+xml");
  assert.match(calls[0].init.headers["X-Microsoft-OutputFormat"], /mp3/);
  assert.match(calls[0].init.body, /uz-UZ-SardorNeural/);
  assert.match(calls[0].init.body, /Salom, jigar!/);
});

test("createTts ovozni AKA_TTS_VOICE bilan almashtirish mumkin", async () => {
  const { fetchImpl, calls } = fakeFetch();
  const tts = createTts({ env: { ...ENV, AKA_TTS_VOICE: "uz-UZ-MadinaNeural" }, fetchImpl });
  await tts.synthesize("Salom");
  assert.match(calls[0].init.body, /uz-UZ-MadinaNeural/);
});

test("createTts kalit bo'lmasa TtsNotConfiguredError beradi", async () => {
  const tts = createTts({ env: {}, fetchImpl: fakeFetch().fetchImpl });
  assert.equal(tts.configured, false);
  await assert.rejects(tts.synthesize("Salom"), TtsNotConfiguredError);
});

test("createTts noto'g'ri matnni rad etadi", async () => {
  const tts = createTts({ env: ENV, fetchImpl: fakeFetch().fetchImpl });
  await assert.rejects(tts.synthesize(""), ValidationError);
  await assert.rejects(tts.synthesize("   "), ValidationError);
  await assert.rejects(tts.synthesize(42), ValidationError);
  await assert.rejects(tts.synthesize("a".repeat(MAX_TTS_CHARS + 1)), ValidationError);
});

test("createTts Azure xatosida status bilan xato beradi", async () => {
  const { fetchImpl } = fakeFetch({ ok: false, status: 401, body: new Uint8Array() });
  const tts = createTts({ env: ENV, fetchImpl });
  await assert.rejects(tts.synthesize("Salom"), /Azure TTS 401/);
});

test("Azure ovoz teglarini o'qimaydi", async () => {
  const { fetchImpl, calls } = fakeFetch();
  await createTts({ env: ENV, fetchImpl }).synthesize("[laughs] Salom, jigar!");
  assert.doesNotMatch(calls[0].init.body, /laughs/);
  assert.match(calls[0].init.body, /Salom, jigar!/);
});
