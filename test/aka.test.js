import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMessages, buildSummaryMessage, createAka, normalizeHistory, normalizePage, LIMITS, SYSTEM_PROMPT, ValidationError,
} from "../server/aka.js";

function fakeClient(response) {
  const calls = [];
  const create = async (params) => {
    calls.push(params);
    return typeof response === "function" ? response(params) : response;
  };
  return { calls, client: { messages: { create }, beta: { messages: { create } } } };
}

const okResponse = (text) => ({
  model: "claude-opus-5-5",
  stop_reason: "end_turn",
  content: [{ type: "thinking", thinking: "" }, { type: "text", text }],
  usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 100 },
});

const config = { model: "claude-opus-5-5", effort: "medium", maxTokens: 16000, fallbacks: true };

test("tizim prompti fayldan to'liq o'qiladi", () => {
  assert.match(SYSTEM_PROMPT, /^Sen "Aka" nomli o'quv yordamchisan/);
  assert.match(SYSTEM_PROMPT, /XULOSA_SO'ROVI/);
});

test("normalizePage: uzun sahifani kesadi va belgilaydi", () => {
  const p = normalizePage({ title: "T", text: "a".repeat(LIMITS.pageChars + 10) });
  assert.equal(p.text.length, LIMITS.pageChars);
  assert.equal(p.truncated, true);
  assert.equal(normalizePage({ title: " ", text: "" }), null);
  assert.equal(normalizePage(undefined), null);
});

test("normalizeHistory: navbat va oxirgi xabarni tekshiradi", () => {
  assert.throws(() => normalizeHistory([]), ValidationError);
  assert.throws(() => normalizeHistory([{ role: "assistant", content: "x" }]), ValidationError);
  assert.throws(() => normalizeHistory([{ role: "user", content: "a" }, { role: "assistant", content: "b" }]), ValidationError);
  assert.throws(() => normalizeHistory([{ role: "user", content: "a" }, { role: "assistant", content: "b" }, { role: "user", content: "" }]), ValidationError);
  assert.throws(() => normalizeHistory([{ role: "user", content: "x".repeat(LIMITS.messageChars + 1) }]), ValidationError);
  assert.deepEqual(normalizeHistory([{ role: "user", content: "" }]), [{ role: "user", content: "" }]);
});

test("buildMessages: sahifa birinchi xabarda, tanlov oxirgisida", () => {
  const page = normalizePage({ title: "Kasrlar", url: "https://x.uz", text: "1/2 — yarim" });
  const history = [
    { role: "user", content: "" },
    { role: "assistant", content: "javob" },
    { role: "user", content: "Nega?" },
  ];
  const msgs = buildMessages({ page, history, selection: "1/2" });
  assert.match(msgs[0].content, /^<sahifa>\nSarlavha: Kasrlar\nManzil: https:\/\/x\.uz\nMatn:\n1\/2 — yarim\n<\/sahifa>\n\nShu sahifani tushuntirib ber\.$/);
  assert.equal(msgs[1].content, "javob");
  assert.match(msgs[2].content, /shu qismni tanladi:\n"""\n1\/2\n"""\n\nNega\?$/);
  // asl tarix o'zgarmaydi
  assert.equal(history[0].content, "");
});

test("buildMessages: birinchi xabar har safar bir xil (kesh uchun)", () => {
  const page = normalizePage({ title: "A", text: "matn" });
  const h1 = [{ role: "user", content: "Savol" }];
  const h2 = [...h1, { role: "assistant", content: "J" }, { role: "user", content: "Yana" }];
  assert.equal(buildMessages({ page, history: h1 })[0].content, buildMessages({ page, history: h2 })[0].content);
});

test("buildMessages: kesilgan sahifa haqida modelga aytadi", () => {
  const page = normalizePage({ text: "b".repeat(LIMITS.pageChars + 1) });
  assert.match(buildMessages({ page, history: [{ role: "user", content: "x" }] })[0].content, /faqat uning boshlang'ich qismi/);
});

test("buildSummaryMessage: XULOSA_SO'ROVI bilan boshlanadi va quiz natijasini yozadi", () => {
  const msg = buildSummaryMessage({
    pageTitle: "Fotosintez",
    items: [
      { savol: "", javob: "Tushuntirish", quiz: { savol: "Nima kerak?", togri: "B", tanlangan: "C" } },
      { savol: "Nega yashil?", javob: "Xlorofill", quiz: { savol: "Rang?", togri: "A", tanlangan: "A" } },
      { savol: "Yana", javob: "J", quiz: { savol: "Q?", togri: "D", tanlangan: "" } },
    ],
  });
  assert.ok(msg.startsWith("XULOSA_SO'ROVI\nSahifa: Fotosintez"));
  assert.match(msg, /1\. Savol: \(sahifani tushuntirish\)/);
  assert.match(msg, /O'quvchi tanladi: C \| To'g'ri javob: B \| Natija: XATO/);
  assert.match(msg, /Natija: TO'G'RI/);
  assert.match(msg, /Natija: javob bermadi/);
  assert.throws(() => buildSummaryMessage({ items: [] }), ValidationError);
});

test("chat: to'g'ri parametrlar bilan Claude'ni chaqiradi va javobni ajratadi", async () => {
  const { client, calls } = fakeClient(okResponse("[TUSHUNTIRISH]\nSalom\n\n[ESDA QOLSIN]\nEsla\n\n[VIZUAL]\nyo'q\n\n[QUIZ]\n{}"));
  const aka = createAka({ client, config });
  const r = await aka.chat({ page: { title: "T", text: "matn" }, history: [{ role: "user", content: "" }] });
  const p = calls[0];
  assert.equal(p.model, "claude-opus-5-5");
  assert.equal(p.system, SYSTEM_PROMPT);
  assert.deepEqual(p.cache_control, { type: "ephemeral" });
  assert.deepEqual(p.output_config, { effort: "medium" });
  assert.deepEqual(p.betas, ["server-side-fallback-2026-07-01"]);
  assert.equal(p.fallbacks, "default");
  assert.equal(p.thinking, undefined);
  assert.equal(r.text, "[TUSHUNTIRISH]\nSalom\n\n[ESDA QOLSIN]\nEsla\n\n[VIZUAL]\nyo'q\n\n[QUIZ]\n{}");
  assert.equal(r.parsed.tushuntirish, "Salom");
  assert.equal(r.parsed.quiz, null);
  assert.equal(r.usage.cacheWrite, 100);
  assert.equal(r.refused, false);
});

test("chat: fallbacks o'chirilsa oddiy messages.create ishlatiladi", async () => {
  const calls = { beta: 0, plain: 0 };
  const client = {
    messages: { create: async () => { calls.plain++; return okResponse("ok"); } },
    beta: { messages: { create: async () => { calls.beta++; return okResponse("ok"); } } },
  };
  await createAka({ client, config: { ...config, fallbacks: false } }).chat({ history: [{ role: "user", content: "Salom" }] });
  assert.deepEqual(calls, { beta: 0, plain: 1 });
});

test("chat: refusal bo'lsa yumshoq rad javobi qaytadi", async () => {
  const { client } = fakeClient({ ...okResponse("qisman"), stop_reason: "refusal" });
  const r = await createAka({ client, config }).chat({ history: [{ role: "user", content: "x" }] });
  assert.equal(r.refused, true);
  assert.match(r.text, /darsga qaytamiz/);
});

test("summary: bitta user xabari yuboradi", async () => {
  const { client, calls } = fakeClient(okResponse("Zo'r dars bo'ldi."));
  const r = await createAka({ client, config }).summary({ pageTitle: "", items: [{ savol: "a", javob: "b" }] });
  assert.equal(calls[0].messages.length, 1);
  assert.ok(calls[0].messages[0].content.startsWith("XULOSA_SO'ROVI"));
  assert.equal(r.text, "Zo'r dars bo'ldi.");
});
