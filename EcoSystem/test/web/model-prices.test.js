// Sozlamalardagi model narxlari: ro'yxatdagi qisqa narx va oylik hisob.
import { test } from "node:test";
import assert from "node:assert/strict";
import { usd, priceTag, monthlyLlm, monthlyTts, LLM_PRICES, TTS_PRICES } from "../../web/app/model-prices.js";

test("usd: ortiqcha nollarsiz va kattalikka mos", () => {
  assert.equal(usd(0.1), "$0.1");
  assert.equal(usd(0.027), "$0.027");
  assert.equal(usd(2), "$2");
  assert.equal(usd(45.4), "$45");
  assert.equal(usd(0.002), "$0.002");
});

test("priceTag: miya — kirish / chiqish, ovoz — daqiqasiga; noma'lum — bo'sh", () => {
  assert.equal(priceTag("llm", "haiku"), " · $0.1 / $0.5");
  assert.equal(priceTag("llm", "sonnet"), " · $2 / $10");
  assert.equal(priceTag("tts", "openai"), " · ~$0.015/daq");
  assert.equal(priceTag("llm", "yo'q"), "");
  assert.equal(priceTag("effort", "low"), "");
});

test("har bir sozlama tanlovi (haiku, sonnet, opus, gemini, openai; 4 ovoz) narxga ega; Haiku — eng arzon", () => {
  for (const key of ["haiku", "sonnet", "opus", "gemini", "openai"]) assert.ok(LLM_PRICES[key], key);
  for (const key of ["gemini", "elevenlabs", "fishaudio", "openai"]) assert.ok(TTS_PRICES[key], key);
  const cheapest = Object.keys(LLM_PRICES).sort((a, b) => monthlyLlm(a) - monthlyLlm(b))[0];
  assert.equal(cheapest, "haiku");
  assert.ok(Math.abs(monthlyLlm("haiku") - 6) < 0.01); // 100 javob x 30 kun x $0.002
  assert.ok(Math.abs(monthlyTts("openai") - 11.25) < 0.01); // 25 daq x 30 kun x $0.015
});
