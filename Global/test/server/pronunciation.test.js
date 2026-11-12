import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fromScribeWords, fromAzureResult, normalizePronunciation, pronunciationNote, withPronunciation,
} from "../../server/core/pronunciation.js";
import { createAzurePronunciation } from "../../server/voice/azure-pronunciation.js";

const SCRIBE_WORDS = [
  { text: "Я", type: "word", logprob: -0.01 },
  { text: " ", type: "spacing", logprob: -0.2 },
  { text: "хожу", type: "word", logprob: -1.6 },
  { text: "в", type: "word", logprob: -0.02 },
  { text: "-", type: "word", logprob: -0.1 },
  { text: "школу.", type: "word", logprob: -0.9 },
];

const AZURE_RESPONSE = {
  RecognitionStatus: "Success",
  NBest: [{
    PronScore: 71.4, AccuracyScore: 68, FluencyScore: 80.2,
    Words: [
      { Word: "я", AccuracyScore: 98, ErrorType: "None", Phonemes: [{ Phoneme: "j", AccuracyScore: 99 }] },
      { Word: "хожу", AccuracyScore: 41, ErrorType: "Mispronunciation", Phonemes: [{ Phoneme: "x", AccuracyScore: 22 }, { Phoneme: "o", AccuracyScore: 90 }, { Phoneme: "zh", AccuracyScore: 35 }] },
      { Word: "школу", AccuracyScore: 74, ErrorType: "None", Phonemes: [] },
    ],
  }],
};

test("Scribe: so'z ishonchi (logprob) 0-100 bahoga aylanadi, bo'shliq va tinish belgisi olib tashlanadi", () => {
  const p = fromScribeWords(SCRIBE_WORDS);
  assert.equal(p.source, "scribe");
  assert.deepEqual(p.words.map((w) => w.word), ["Я", "хожу", "в", "школу"]);
  assert.equal(p.words[1].score, 20); // exp(-1.6) ≈ 0.20
  assert.equal(p.words[3].score, 41); // exp(-0.9) ≈ 0.41
  assert.equal(fromScribeWords([]), null);
});

test("Azure: umumiy, ravonlik, so'z va sust tovushlar ajratiladi", () => {
  const p = fromAzureResult(AZURE_RESPONSE);
  assert.equal(p.source, "azure");
  assert.equal(p.overall, 71);
  assert.equal(p.fluency, 80);
  assert.deepEqual(p.words[1], { word: "хожу", score: 41, error: "Mispronunciation", weak: ["x", "zh"] });
  assert.equal(fromAzureResult({ RecognitionStatus: "NoMatch" }), null);
});

test("normalizePronunciation: mijozdan kelgan ma'lumot tozalanadi va cheklanadi", () => {
  assert.equal(normalizePronunciation(null), null);
  assert.equal(normalizePronunciation("x"), null);
  const p = normalizePronunciation({
    source: "hack", overall: 500,
    words: Array.from({ length: 50 }, (_, i) => ({ word: `w${i}`.repeat(30), score: -5, weak: ["a", 1, "b"] })),
  });
  assert.equal(p.source, "scribe");
  assert.equal(p.overall, 100);
  assert.equal(p.words.length, 40);
  assert.equal(p.words[0].score, 0);
  assert.ok(p.words[0].word.length <= 40);
  assert.deepEqual(p.words[0].weak, ["a", "b"]);
});

test("pronunciationNote: Azure — baho va sust so'zlar; Scribe — taxminiy ishora; yaxshi bo'lsa — maqtov", () => {
  const azure = pronunciationNote(fromAzureResult(AZURE_RESPONSE));
  assert.match(azure, /TALAFFUZ TAHLILI/);
  assert.match(azure, /umumiy 71\/100/);
  assert.match(azure, /"хожу" 41\/100.*x, zh/);
  assert.doesNotMatch(azure, /"я"/);
  const scribe = pronunciationNote(fromScribeWords(SCRIBE_WORDS));
  assert.match(scribe, /taxminiy/i);
  assert.match(scribe, /"хожу"/);
  assert.doesNotMatch(scribe, /"школу"/); // 41 — Scribe chegarasidan (35) yuqori
  assert.match(pronunciationNote({ source: "azure", overall: 93, fluency: 90, words: [{ word: "да", score: 95 }] }), /yaxshi/);
  assert.equal(pronunciationNote(null), "");
});

test("withPronunciation: o'quvchi xabariga talaffuz izohi qo'shiladi", () => {
  assert.equal(withPronunciation("Я хожу", null), "Я хожу");
  assert.match(withPronunciation("Я хожу", fromAzureResult(AZURE_RESPONSE)), /^Я хожу\n\n\(TALAFFUZ TAHLILI/);
});

test("Azure talaffuz: ru-RU, WAV, Pronunciation-Assessment sarlavhasi (tanilgan matn — namuna)", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => AZURE_RESPONSE, text: async () => "" };
  };
  const azure = createAzurePronunciation({ env: { AZURE_SPEECH_KEY: "k", AZURE_SPEECH_REGION: "westeurope" }, fetchImpl });
  assert.equal(azure.configured, true);
  const p = await azure.assess(Buffer.from([1, 2, 3]), { referenceText: "Я хожу в школу", locale: "ru-RU" });
  assert.equal(p.overall, 71);
  const { url, init } = calls[0];
  assert.match(url, /^https:\/\/westeurope\.stt\.speech\.microsoft\.com\/speech\/recognition\/conversation\/cognitiveservices\/v1\?language=ru-RU&format=detailed$/);
  assert.equal(init.headers["Ocp-Apim-Subscription-Key"], "k");
  assert.match(init.headers["Content-Type"], /^audio\/wav/);
  const config = JSON.parse(Buffer.from(init.headers["Pronunciation-Assessment"], "base64").toString("utf8"));
  assert.equal(config.ReferenceText, "Я хожу в школу");
  assert.equal(config.Granularity, "Phoneme");
  assert.equal(createAzurePronunciation({ env: {} }).configured, false);
});

// ---------- /api/stt va /api/chat (til o'rganish) ----------
import { startServer, TEST_USER } from "./helpers.js";

const voiceStub = { configured: true, async synthesize() { return Buffer.from("A"); } };
function sttStub(languageCode) {
  return {
    configured: true,
    async transcribe() { return "oddiy"; },
    async transcribeDetailed() { return { text: "Я хожу в школу", languageCode, words: SCRIBE_WORDS }; },
  };
}
async function learner(s, lang = "uz") {
  const res = await fetch(`${s.base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...TEST_USER, email: "learner@x.uz", client: "extension", profile: { lang, goal: "language" } }),
  });
  return (await res.json()).token;
}
const sttCall = (s, token, type) =>
  fetch(`${s.base}/api/stt?lang=uz`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": type }, body: Buffer.from([1, 2, 3]) });

test("/api/stt til o'rganishda: rus tili + Azure + WAV — Azure bahosi; webm — Scribe ishorasi", async () => {
  const azure = { configured: true, async assess(_wav, { referenceText }) { return { ...fromAzureResult(AZURE_RESPONSE), ref: referenceText }; } };
  const s = await startServer({ jigar: {}, tts: voiceStub, stt: sttStub("rus"), pronunciation: azure }, { login: false });
  try {
    const token = await learner(s);
    const wav = await (await sttCall(s, token, "audio/wav")).json();
    assert.equal(wav.text, "Я хожу в школу");
    assert.equal(wav.pronunciation.source, "azure");
    assert.equal(wav.pronunciation.ref, "Я хожу в школу");
    const webm = await (await sttCall(s, token, "audio/webm")).json();
    assert.equal(webm.pronunciation.source, "scribe");
  } finally {
    s.close();
  }
});

test("/api/stt til o'rganishda: o'quvchi ona tilida gapirsa — baho yo'q; oddiy yo'nalishda — faqat matn", async () => {
  const s = await startServer({ jigar: {}, tts: voiceStub, stt: sttStub("uzb"), pronunciation: { configured: false } });
  try {
    const token = await learner(s);
    assert.equal((await (await sttCall(s, token, "audio/wav")).json()).pronunciation, null);
    const plain = await (await s.raw("/api/stt?lang=uz", { method: "POST", headers: { "Content-Type": "audio/webm" }, body: Buffer.from([1]) })).json();
    assert.deepEqual(plain, { text: "oddiy" });
  } finally {
    s.close();
  }
});

test("/api/chat: talaffuz tahlili o'quvchi xabariga izoh bo'lib Jigarga boradi", async () => {
  let seen = null;
  const jigar = { async chat(args) { seen = args; return { text: "ok", parsed: {}, userContent: "x" }; } };
  const s = await startServer({ jigar, tts: voiceStub, stt: sttStub("rus") });
  try {
    await s.post("/api/chat", { history: [{ role: "user", content: "Я хожу" }], pronunciation: fromAzureResult(AZURE_RESPONSE) });
    assert.equal(seen.pronunciation.source, "azure");
  } finally {
    s.close();
  }
});

// ---------- O'z serverimizdagi model (pronounce/server.py) ----------
import { createLocalPronunciation } from "../../server/voice/local-pronunciation.js";

const LOCAL_RESULT = { source: "local", overall: 78, fluency: null, words: [{ word: "хожу", score: 54, weak: ["x", "ʌ"] }, { word: "день", score: 93, weak: [] }] };

test("lokal talaffuz: ru va uz; URL, til va namuna matn so'rovda; natija tozalanadi", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => LOCAL_RESULT, text: async () => "" };
  };
  const local = createLocalPronunciation({ env: { PRONOUNCE_URL: "http://127.0.0.1:8765/" }, fetchImpl });
  assert.equal(local.configured, true);
  assert.equal(local.supports("uz"), true);
  assert.equal(local.supports("en"), false);
  const p = await local.assess(Buffer.from([1]), { referenceText: "Я хожу", lang: "ru" });
  assert.equal(p.source, "local");
  assert.equal(p.words[0].score, 54);
  assert.equal(calls[0].url, "http://127.0.0.1:8765/assess?lang=ru&text=%D0%AF%20%D1%85%D0%BE%D0%B6%D1%83");
  assert.equal(calls[0].init.headers["Content-Type"], "audio/wav");
  assert.equal(createLocalPronunciation({ env: {} }).configured, false);
});

test("pronunciationNote: lokal model — sust so'z va tovushlar, ravonliksiz", () => {
  const note = pronunciationNote(LOCAL_RESULT);
  assert.match(note, /TALAFFUZ TAHLILI \(tovush modeli, taxminiy\)/);
  assert.match(note, /qat'iy aytma/);
  assert.match(note, /umumiy 78\/100/);
  assert.match(note, /"хожу" 54\/100 \(sust tovushlar: x, ʌ\)/);
  assert.doesNotMatch(note, /ravonlik/);
  assert.doesNotMatch(note, /"день"/);
});

test("/api/stt: o'zbek tilini o'rganuvchi (rus o'quvchi) — lokal model baholaydi, Azure (faqat ru) chetda qoladi", async () => {
  const local = { configured: true, supports: (l) => l === "uz" || l === "ru", async assess(_w, { lang }) { return { ...LOCAL_RESULT, lang }; } };
  const azure = { configured: true, supports: (l) => l === "ru", async assess() { throw new Error("chaqirilmasligi kerak"); } };
  const stt = { configured: true, async transcribe() { return ""; }, async transcribeDetailed() { return { text: "Men maktabga boraman", languageCode: "uzb", words: [] }; } };
  const s = await startServer({ jigar: {}, tts: voiceStub, stt, pronunciation: [local, azure] }, { login: false });
  try {
    const token = await learner(s, "ru");
    const res = await (await sttCall(s, token, "audio/wav")).json();
    assert.equal(res.pronunciation.source, "local");
    assert.equal(res.pronunciation.lang, "uz");
  } finally {
    s.close();
  }
});

test("/api/stt: Scribe o'zbekchani boshqa til deb aniqlasa ham (\"dan\") — lotin yozuvi bo'yicha o'zbekcha baholanadi", async () => {
  const local = { configured: true, supports: () => true, async assess() { return LOCAL_RESULT; } };
  const stt = { configured: true, async transcribe() { return ""; }, async transcribeDetailed() { return { text: "Men maktabga boraman", languageCode: "dan", words: [] }; } };
  const s = await startServer({ jigar: {}, tts: voiceStub, stt, pronunciation: [local] }, { login: false });
  try {
    const token = await learner(s, "ru");
    assert.equal((await (await sttCall(s, token, "audio/wav")).json()).pronunciation.source, "local");
  } finally {
    s.close();
  }
});
