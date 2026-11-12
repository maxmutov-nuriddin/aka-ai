// EcoSystem serveri: faqat egasi, doim yordamchi rejimi, o'quvchi (tarif/to'lov/admin) yo'llari yo'q.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createVoiceServices, parseOwnerEmails } from "../../server/app.js";
import { parseAkaResponse } from "../../server/core/parse.js";
import { startServer, TEST_USER } from "./helpers.js";

const REPLY = "[TUSHUNTIRISH]\nXo'p.\n\n[XOTIRA]\n- Ismi Nuriddin\n\n[ESLATMA]\n[{\"vaqt\":\"2099-01-01T10:00:00+05:00\",\"matn\":\"uzoq\"}]";

function spyJigar(seen = []) {
  return {
    async chat(args) {
      seen.push(args);
      args.onDelta?.("[TUSHUNTIRISH]\n");
      args.onDelta?.("Xo'p.");
      return { text: REPLY, parsed: parseAkaResponse(REPLY), userContent: "x" };
    },
  };
}

const tts = (tag, { fail = false } = {}) => ({
  configured: true,
  calls: [],
  async synthesize(text, options) {
    this.calls.push(options);
    if (fail) throw new Error(`${tag} ishlamadi`);
    return Buffer.from(tag);
  },
});
const stt = { configured: true, async transcribe(_audio, _type, { lang }) { return `eshitildi:${lang}`; } };

test("sahifalar va umumiy fayllar; o'quvchi yo'llari (tarif, to'lov, admin, landing) yo'q", async () => {
  const s = await startServer({ jigar: spyJigar(), ttsProviders: { gemini: tts("G") }, stt }, { login: false });
  try {
    assert.equal((await (await fetch(`${s.base}/api/health`)).json()).ok, true);
    for (const p of ["/app/app.js", "/app/assistant.js", "/app/wake.js", "/shared/parse.js", "/vendor/mermaid.min.js"]) {
      assert.equal((await fetch(s.base + p)).status, 200, p);
    }
    const root = await fetch(`${s.base}/`, { redirect: "manual" });
    assert.equal(root.headers.get("location"), "/login");
    for (const p of ["/api/tariffs", "/api/usage", "/api/admin/settings", "/admin", "/oferta"]) {
      assert.equal((await fetch(s.base + p, { redirect: "manual" })).status, 404, p);
    }
    assert.equal((await fetch(`${s.base}/api/chat`, { method: "POST" })).status, 401);
    assert.equal((await fetch(`${s.base}/api/assistant`)).status, 401);
  } finally {
    s.close();
  }
});

test("ro'yxatdan o'tish: faqat ECO_OWNER_EMAILS dagi email", async () => {
  const s = await startServer({ jigar: spyJigar(), ttsProviders: { gemini: tts("G") }, stt, env: { ECO_OWNER_EMAILS: `X@Y.uz, ${TEST_USER.email}` } }, { login: false });
  try {
    const post = (body) => fetch(`${s.base}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await post({ ...TEST_USER, email: "begona@x.uz" })).status, 403);
    assert.equal((await post(TEST_USER)).status, 201);
  } finally {
    s.close();
  }
  assert.deepEqual([...parseOwnerEmails(" A@b.uz , ,c@d.uz")], ["a@b.uz", "c@d.uz"]);
});

test("/api/chat: doim yordamchi rejimi — xotira, hozirgi vaqt; javobdagi xotira saqlanadi; oqim (NDJSON)", async () => {
  const seen = [];
  const s = await startServer({ jigar: spyJigar(seen), ttsProviders: { gemini: tts("G") }, stt });
  try {
    const first = await (await s.post("/api/chat", { history: [{ role: "user", content: "Eslab qol" }] })).json();
    assert.deepEqual(first.assistant.remembered, ["Ismi Nuriddin"]);
    assert.equal(first.assistant.reminders.length, 0); // 2099 — 1 yildan uzoq
    assert.equal(seen[0].userName, TEST_USER.name);
    assert.match(seen[0].nowNote, /^Hozir: /);
    await s.post("/api/chat", { history: [{ role: "user", content: "x" }] });
    assert.deepEqual(seen[1].memories, ["Ismi Nuriddin"]); // keyingi so'rovda xotira promptga boradi
    const res = await s.post("/api/chat", { history: [{ role: "user", content: "x" }], stream: true });
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    assert.deepEqual(lines.slice(0, 2).map((l) => l.type), ["delta", "delta"]);
    assert.equal(lines.at(-1).type, "done");
    assert.equal((await (await s.raw("/api/assistant")).json()).memories[0].text, "Ismi Nuriddin");
  } finally {
    s.close();
  }
});

test("/api/tts: ECO_TTS tanlovi, ovoz doim katta yoshli; xato bo'lsa zaxira xizmat", async () => {
  const gemini = tts("G", { fail: true });
  const eleven = tts("E");
  const s = await startServer({ jigar: spyJigar(), ttsProviders: { gemini, elevenlabs: eleven }, stt, env: { ECO_TTS: "gemini" } });
  try {
    const res = await s.post("/api/tts", { text: "Salom", level: "5-7", persona: "mehribon" });
    assert.equal(Buffer.from(await res.arrayBuffer()).toString(), "E"); // Gemini yiqildi — ElevenLabs
    assert.equal(gemini.calls[0].level, "student");
    assert.equal(gemini.calls[0].persona, "mehribon");
    const heard = await (await s.raw("/api/stt?lang=ru", { method: "POST", headers: { "Content-Type": "audio/webm" }, body: Buffer.from([1, 2]) })).json();
    assert.equal(heard.text, "eshitildi:ru");
  } finally {
    s.close();
  }
});

test("voice-config: ECO_STT bayroqlari; createVoiceServices — to'rt xizmat", async () => {
  const s = await startServer({ jigar: spyJigar(), ttsProviders: { gemini: tts("G") }, stt, env: { ECO_STT: "chrome" } }, { login: false });
  try {
    const cfg = await (await fetch(`${s.base}/api/voice-config`)).json();
    assert.equal(cfg.doubleCheck, false);
    assert.equal(cfg.preferServerStt, false);
  } finally {
    s.close();
  }
  assert.deepEqual(Object.keys(createVoiceServices({}).providers).sort(), ["elevenlabs", "fishaudio", "gemini", "openai"]);
});

test("rate limit: 429", async () => {
  const s = await startServer({ jigar: spyJigar(), ttsProviders: { gemini: tts("G") }, stt, env: { ECO_RATE_MAX: "2" } });
  try {
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await s.post("/api/chat", { history: [{ role: "user", content: "x" }] })).status);
    assert.deepEqual(codes, [200, 200, 429]);
  } finally {
    s.close();
  }
});

test("/api/settings: miya, ovoz, chuqurlik — saqlanadi va chatga o'tadi; noto'g'ri — 400; kirmagan — 401", async () => {
  const seen = [];
  const gemini = tts("G");
  const eleven = tts("E");
  const s = await startServer({ jigar: spyJigar(seen), ttsProviders: { gemini, elevenlabs: eleven }, stt, env: { ECO_LLM: "claude", ECO_TTS: "gemini" } });
  try {
    const put = (body) => s.raw("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const first = await (await s.raw("/api/settings")).json();
    assert.equal(first.llm, "claude");
    assert.equal(first.ready.tts.fishaudio, false); // kaliti yo'q
    const next = await (await put({ llm: "haiku", tts: "elevenlabs", effort: "high" })).json();
    assert.deepEqual([next.llm, next.tts, next.effort], ["haiku", "elevenlabs", "high"]);
    assert.equal((await put({ llm: "gpt-9" })).status, 400);
    await s.post("/api/chat", { history: [{ role: "user", content: "x" }] });
    assert.equal(seen[0].llm, "haiku");
    assert.equal(seen[0].effort, "high");
    const audio = await s.post("/api/tts", { text: "Salom" });
    assert.equal(Buffer.from(await audio.arrayBuffer()).toString(), "E"); // tanlangan ovoz — ElevenLabs
  } finally {
    s.close();
  }
  const anon = await startServer({ jigar: spyJigar(), ttsProviders: { gemini: tts("G") }, stt }, { login: false });
  try {
    assert.equal((await fetch(`${anon.base}/api/settings`)).status, 401);
  } finally {
    anon.close();
  }
});
