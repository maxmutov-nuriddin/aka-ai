import { test } from "node:test";
import assert from "node:assert/strict";
import { createGeminiLlm, geminiText, toGeminiInput } from "../../server/core/gemini-llm.js";
import { createGeminiTts, GEMINI_VOICES, toGeminiSpeech } from "../../server/voice/gemini-tts.js";
import { createJigar, getConfig } from "../../server/core/jigar.js";

function fakeFetch(json, { ok = true, status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return { ok, status, json: async () => json, text: async () => "xato" };
  };
  return { fetchImpl, calls };
}
const ENV = { GEMINI_API_KEY: "g-test" };
const ANSWER = { steps: [{ type: "thought", content: [] }, { type: "model_output", content: [{ type: "text", text: "[TUSHUNTIRISH]\nSalom" }] }] };

test("Gemini input: rollar qadam turiga, rasm base64 bo'lib, kesh belgilari tashlanadi", () => {
  const input = toGeminiInput([
    { role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "AAA" } }, { type: "text", text: "sahifa", cache_control: { type: "ephemeral" } }] },
    { role: "assistant", content: "javob" },
  ]);
  assert.deepEqual(input[0], { type: "user_input", content: [{ type: "image", data: "AAA", mime_type: "image/png" }, { type: "text", text: "sahifa" }] });
  assert.deepEqual(input[1], { type: "model_output", content: [{ type: "text", text: "javob" }] });
  assert.equal(geminiText(ANSWER), "[TUSHUNTIRISH]\nSalom");
});

test("Gemini LLM: Interactions API, kalit sarlavhada, store: false, tizim prompti", async () => {
  const { fetchImpl, calls } = fakeFetch(ANSWER);
  const gemini = createGeminiLlm({ env: ENV, fetchImpl });
  assert.equal(gemini.configured, true);
  const out = await gemini.generate({ system: "SYS", messages: [{ role: "user", content: "x" }], maxTokens: 900 });
  assert.equal(out.text, "[TUSHUNTIRISH]\nSalom");
  const { url, init, body } = calls[0];
  assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/interactions");
  assert.equal(init.headers["x-goog-api-key"], "g-test");
  assert.equal(body.model, "gemini-3.8-flash");
  assert.equal(body.system_instruction, "SYS");
  assert.equal(body.store, false);
  assert.equal(body.generation_config.max_output_tokens, 900);
  assert.equal(createGeminiLlm({ env: {} }).configured, false);
  await assert.rejects(createGeminiLlm({ env: ENV, fetchImpl: fakeFetch({}, { ok: false, status: 429 }).fetchImpl }).generate({ system: "", messages: [], maxTokens: 1 }), /Gemini 429/);
});

test("Jigar: llm=gemini — Gemini javob beradi; Gemini xato bersa — Claude'ga o'tadi", async () => {
  const claudeCalls = [];
  const client = { messages: { create: async (p) => { claudeCalls.push(p); return { content: [{ type: "text", text: "claude" }], stop_reason: "end_turn", model: "claude", usage: null }; } } };
  const config = { ...getConfig({}), fallbacks: false };
  const ok = createJigar({ client, config, gemini: { configured: true, generate: async () => ({ text: "gemini javob", model: "gemini-3.8-flash" }) } });
  const r1 = await ok.chat({ history: [{ role: "user", content: "x" }], llm: "gemini" });
  assert.equal(r1.text, "gemini javob");
  assert.equal(r1.model, "gemini-3.8-flash");
  assert.equal(claudeCalls.length, 0);
  const broken = createJigar({ client, config, gemini: { configured: true, generate: async () => { throw new Error("Gemini 500"); } } });
  assert.equal((await broken.chat({ history: [{ role: "user", content: "x" }], llm: "gemini" })).text, "claude");
  assert.equal((await ok.chat({ history: [{ role: "user", content: "x" }] })).text, "claude"); // standart — Claude
});

test("Gemini TTS: teglar Gemini'nikiga, xarakter ovozi va uslubi, WAV qaytadi", async () => {
  assert.equal(toGeminiSpeech("[laughs] Salom! [curious] Qani [sighs] ko'ramiz"), "<laugh> Salom! Qani <sigh> ko'ramiz");
  const wav = Buffer.from("RIFFwav").toString("base64");
  const { fetchImpl, calls } = fakeFetch({ steps: [{ type: "model_output", content: [{ type: "audio", data: wav, mime_type: "audio/wav" }] }] });
  const tts = createGeminiTts({ env: ENV, fetchImpl });
  assert.equal(tts.contentType, "audio/wav");
  const audio = await tts.synthesize("[laughs] Salom", { persona: "jahldor", level: "student" });
  assert.equal(audio.toString(), "RIFFwav");
  const { body } = calls[0];
  assert.equal(body.model, "gemini-3.8-flash-tts");
  assert.equal(body.generation_config.speech_config[0].voice, GEMINI_VOICES.jahldor.katta);
  assert.equal(body.input[0].content[0].text, "<laugh> Salom");
  assert.match(body.input[0].content[0].annotations[0].style, /impatient/i);
  assert.equal(body.response_format.type, "audio");
});

test("speechStyleFor: har xarakter va yosh guruhiga alohida ohang; noma'lumi — neytral yosh", async () => {
  const { speechStyleFor } = await import("../../server/voice/persona-styles.js");
  const all = ["neytral", "mehribon", "kinoyali", "jahldor", "romantik"].flatMap((p) => [speechStyleFor(p, "8-9"), speechStyleFor(p, "student")]);
  assert.equal(new Set(all).size, 10); // 5 xarakter x 2 yosh — takrorlanmaydi
  for (const style of all) assert.match(style, /real person/); // jonli suhbat ohangi hammasida
  assert.match(speechStyleFor("jahldor", "student"), /drill sergeant/);
  assert.equal(speechStyleFor("yo'q", null), speechStyleFor("neytral", "5-7"));
});
