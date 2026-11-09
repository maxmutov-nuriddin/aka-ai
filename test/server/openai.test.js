import { test } from "node:test";
import assert from "node:assert/strict";
import { createOpenAiLlm, openAiText, toOpenAiInput } from "../../server/core/openai-llm.js";
import { createOpenAiTts, OPENAI_VOICES, toOpenAiSpeech } from "../../server/voice/openai-tts.js";
import { createJigar, getConfig } from "../../server/core/jigar.js";

function fakeFetch(response, { ok = true, status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return {
      ok,
      status,
      json: async () => response,
      text: async () => "xato",
      arrayBuffer: async () => new TextEncoder().encode(String(response)).buffer,
    };
  };
  return { fetchImpl, calls };
}
const ENV = { OPENAI_API_KEY: "sk-test" };
const ANSWER = {
  output: [
    { type: "reasoning", summary: [] },
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "[TUSHUNTIRISH]\nSalom" }] },
  ],
};

test("OpenAI input: rollar, rasm data URL bo'lib, kesh belgilari tashlanadi", () => {
  const input = toOpenAiInput([
    { role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "AAA" } }, { type: "text", text: "sahifa", cache_control: { type: "ephemeral" } }] },
    { role: "assistant", content: "javob" },
  ]);
  assert.deepEqual(input[0], {
    role: "user",
    content: [{ type: "input_image", image_url: "data:image/png;base64,AAA" }, { type: "input_text", text: "sahifa" }],
  });
  assert.deepEqual(input[1], { role: "assistant", content: "javob" });
  assert.equal(openAiText(ANSWER), "[TUSHUNTIRISH]\nSalom");
});

test("OpenAI LLM: Responses API, Bearer kalit, store: false, tizim prompti instructions'da", async () => {
  const { fetchImpl, calls } = fakeFetch(ANSWER);
  const llm = createOpenAiLlm({ env: ENV, fetchImpl });
  assert.equal(llm.configured, true);
  const out = await llm.generate({ system: "SYS", messages: [{ role: "user", content: "x" }], maxTokens: 900 });
  assert.equal(out.text, "[TUSHUNTIRISH]\nSalom");
  const { url, init, body } = calls[0];
  assert.equal(url, "https://api.openai.com/v1/responses");
  assert.equal(init.headers.Authorization, "Bearer sk-test");
  assert.equal(body.model, "gpt-6.1-sol");
  assert.equal(body.instructions, "SYS");
  assert.equal(body.store, false);
  assert.equal(body.max_output_tokens, 900);
  assert.equal(createOpenAiLlm({ env: { ...ENV, OPENAI_MODEL: "gpt-6-luna" }, fetchImpl }).model, "gpt-6-luna");
  assert.equal(createOpenAiLlm({ env: {} }).configured, false);
  await assert.rejects(
    createOpenAiLlm({ env: ENV, fetchImpl: fakeFetch({}, { ok: false, status: 429 }).fetchImpl }).generate({ system: "", messages: [], maxTokens: 1 }),
    /OpenAI 429/,
  );
});

test("Jigar: llm=openai — OpenAI javob beradi; xato bersa — Claude'ga o'tadi", async () => {
  const claudeCalls = [];
  const client = { messages: { create: async (p) => { claudeCalls.push(p); return { content: [{ type: "text", text: "claude" }], stop_reason: "end_turn", model: "claude", usage: null }; } } };
  const config = { ...getConfig({}), fallbacks: false };
  const ok = createJigar({ client, config, openai: { configured: true, generate: async () => ({ text: "openai javob", model: "gpt-6.1-sol" }) } });
  const r1 = await ok.chat({ history: [{ role: "user", content: "x" }], llm: "openai" });
  assert.equal(r1.text, "openai javob");
  assert.equal(r1.model, "gpt-6.1-sol");
  assert.equal(claudeCalls.length, 0);
  const broken = createJigar({ client, config, openai: { configured: true, generate: async () => { throw new Error("OpenAI 500"); } } });
  assert.equal((await broken.chat({ history: [{ role: "user", content: "x" }], llm: "openai" })).text, "claude");
});

test("OpenAI TTS: teglar olinadi, xarakter ovozi va ohang ko'rsatmasi, til, MP3 qaytadi", async () => {
  assert.equal(toOpenAiSpeech("[laughs] Salom! [curious] Qani  ko'ramiz"), "Salom! Qani ko'ramiz");
  const { fetchImpl, calls } = fakeFetch("MP3DATA");
  const tts = createOpenAiTts({ env: ENV, fetchImpl });
  assert.equal(tts.configured, true);
  assert.equal(tts.contentType, "audio/mpeg");
  const audio = await tts.synthesize("[laughs] Salom", { persona: "jahldor", level: "student", lang: "uz" });
  assert.equal(audio.toString(), "MP3DATA");
  const { url, init, body } = calls[0];
  assert.equal(url, "https://api.openai.com/v1/audio/speech");
  assert.equal(init.headers.Authorization, "Bearer sk-test");
  assert.equal(body.model, "gpt-4o-mini-tts");
  assert.equal(body.voice, OPENAI_VOICES.jahldor.katta);
  assert.equal(body.input, "Salom");
  assert.equal(body.response_format, "mp3");
  assert.match(body.instructions, /Uzbek/);
  assert.match(body.instructions, /impatient/);
  await tts.synthesize("Привет", { lang: "ru" });
  assert.match(calls[1].body.instructions, /Russian/);
  assert.equal(calls[1].body.voice, OPENAI_VOICES.neytral.yosh); // xarakter va sinf berilmasa
  await assert.rejects(tts.synthesize("[laughs]"), /bo'sh/);
  assert.equal(createOpenAiTts({ env: {} }).configured, false);
});
