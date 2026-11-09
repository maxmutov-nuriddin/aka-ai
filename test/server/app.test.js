import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { createVoiceServices } from "../../server/app.js";
import { ValidationError } from "../../server/core/jigar.js";
import { TtsNotConfiguredError } from "../../server/voice/azure.js";
import { startServer } from "./helpers.js";

const jigar = {
  async chat({ history, mode }) {
    if (mode === "beparvo") return { text: "BEPARVO", parsed: { tushuntirish: "BEPARVO" } };
    if (history?.[0]?.content === "boom") throw new Anthropic.APIConnectionError({ message: "down" });
    if (!Array.isArray(history)) throw new ValidationError("history bo'sh bo'lmasligi kerak");
    return { text: "[TUSHUNTIRISH]\nok", parsed: { tushuntirish: "ok" } };
  },
  async summary() {
    return { text: "Xulosa", refused: false };
  },
};

const tts = {
  configured: true,
  async synthesize(text) {
    if (text === "nokey") throw new TtsNotConfiguredError("sozlanmagan");
    if (text === "azure-down") throw new Error("Azure TTS 500");
    if (typeof text !== "string" || !text.trim()) throw new ValidationError("text bo'sh");
    return Buffer.from([9, 8, 7]);
  },
};

const stt = {
  configured: true,
  async transcribe(audio, mimeType) {
    if (!Buffer.isBuffer(audio) || audio.length === 0) throw new ValidationError("Ovoz yozuvi bo'sh");
    if (audio[0] === 0xff) throw new TtsNotConfiguredError("sozlanmagan");
    return `matn:${audio.length}:${mimeType}`;
  },
};

let srv;
before(async () => {
  srv = await startServer({ jigar, tts, stt, env: { AKA_RATE_MAX: "5", AKA_ALLOWED_ORIGINS: "chrome-extension://*" } });
});
after(() => srv.close());

/** Bir martalik server: env sozlamasi boshqacha bo'lgan testlar uchun. */
async function withServer(options, fn) {
  const s = await startServer({ jigar, tts, stt, env: {}, ...options });
  try {
    await fn(s);
  } finally {
    s.close();
  }
}

test("health va umumiy fayllar ochiq", async () => {
  assert.equal((await (await srv.raw("/api/health")).json()).ok, true);
  for (const p of ["/app/app.js", "/shared/parse.js", "/shared/avatar.js", "/app/styles.css", "/vendor/mermaid.min.js"]) {
    assert.equal((await fetch(srv.base + p)).status, 200, p);
  }
});

test("sahifalar: landing va kirish ochiq, /app/ faqat kirganlarga", async () => {
  assert.equal((await fetch(srv.base + "/")).status, 200);
  assert.equal((await fetch(srv.base + "/login")).status, 200);
  const guest = await fetch(srv.base + "/app/", { redirect: "manual" });
  assert.equal(guest.status, 302);
  assert.equal(guest.headers.get("location"), "/login?next=%2Fapp%2F");
  assert.equal((await srv.raw("/app/")).status, 200);
  // index.html'ni to'g'ridan-to'g'ri so'rab ham chetlab o'tib bo'lmaydi
  assert.equal((await fetch(srv.base + "/app/index.html", { redirect: "manual" })).status, 302);
});

test("huquqiy sahifalar: oferta va maxfiylik hammaga ochiq, UZ va RU matni bilan", async () => {
  for (const [path, uz, ru] of [["/oferta", "Ommaviy oferta", "Публичная оферта"], ["/maxfiylik", "Maxfiylik siyosati", "Политика конфиденциальности"]]) {
    const res = await fetch(srv.base + path);
    assert.equal(res.status, 200, path);
    const html = await res.text();
    assert.ok(html.includes(uz) && html.includes(ru), path);
  }
});

test("API kirmaganlarga yopiq: 401", async () => {
  for (const p of ["/api/chat", "/api/summary", "/api/tts"]) {
    const r = await fetch(srv.base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(r.status, 401, p);
    assert.equal((await r.json()).code, "auth_required");
  }
});

test("chat: muvaffaqiyatli javob", async () => {
  const r = await srv.post("/api/chat", { history: [{ role: "user", content: "hi" }] });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).parsed.tushuntirish, "ok");
});

test("chat: validatsiya xatosi 400, aloqa xatosi 503", async () => {
  assert.equal((await srv.post("/api/chat", {})).status, 400);
  const r = await srv.post("/api/chat", { history: [{ role: "user", content: "boom" }] });
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /aloqa uzildi/);
});

test("buzilgan JSON 400 qaytaradi", async () => {
  const r = await srv.raw("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  assert.equal(r.status, 400);
});

test("CORS: kengaytmaga ruxsat (Authorization bilan), boshqa saytga yo'q", async () => {
  const ok = await fetch(srv.base + "/api/chat", { method: "OPTIONS", headers: { Origin: "chrome-extension://abc" } });
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get("access-control-allow-origin"), "chrome-extension://abc");
  assert.match(ok.headers.get("access-control-allow-headers"), /Authorization/);
  assert.match(ok.headers.get("access-control-allow-methods"), /PUT/); // support sozlamalari kengaytmadan ham
  const bad = await fetch(srv.base + "/api/chat", { method: "OPTIONS", headers: { Origin: "https://evil.example" } });
  assert.equal(bad.headers.get("access-control-allow-origin"), null);
});

test("rate limit 429 qaytaradi", async () => {
  let last;
  for (let i = 0; i < 6; i++) last = await srv.post("/api/summary", { items: [{ savol: "a" }] });
  assert.equal(last.status, 429);
});

test("tts: audio qaytaradi", async () => {
  const r = await srv.post("/api/tts", { text: "Salom, jigar" });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "audio/mpeg");
  assert.deepEqual([...new Uint8Array(await r.arrayBuffer())], [9, 8, 7]);
});

test("tts: bo'sh matn 400, sozlanmagan 503, Azure xatosi 502", async () => {
  assert.equal((await srv.post("/api/tts", { text: "" })).status, 400);
  const nokey = await srv.post("/api/tts", { text: "nokey" });
  assert.equal(nokey.status, 503);
  assert.match((await nokey.json()).error, /sozlanmagan/);
  assert.equal((await srv.post("/api/tts", { text: "azure-down" })).status, 502);
});

test("voice-config: qaysi ovoz xizmatlari yoqilganini aytadi", async () => {
  const r = await srv.raw("/api/voice-config");
  assert.deepEqual(await r.json(), { tts: true, stt: true, preferServerStt: false, doubleCheck: true });
});

test("voice-config: AKA_STT=elevenlabs server tanishini afzal qiladi", () =>
  withServer({ env: { AKA_STT: "elevenlabs" } }, async (s) => {
    assert.equal((await (await s.raw("/api/voice-config")).json()).preferServerStt, true);
  }));

test("voice-config: AKA_STT=chrome ikkinchi tekshiruvni o'chiradi", () =>
  withServer({ env: { AKA_STT: "chrome" } }, async (s) => {
    assert.equal((await (await s.raw("/api/voice-config")).json()).doubleCheck, false);
  }));

test("stt: audio yozuvni matnga aylantiradi", async () => {
  const r = await srv.raw("/api/stt", {
    method: "POST",
    headers: { "Content-Type": "audio/webm;codecs=opus" },
    body: new Uint8Array([1, 2, 3, 4]),
  });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { text: "matn:4:audio/webm;codecs=opus" });
});

test("stt: bo'sh yozuv 400, sozlanmagan 503", async () => {
  const empty = await srv.raw("/api/stt", { method: "POST", headers: { "Content-Type": "audio/webm" }, body: new Uint8Array() });
  assert.equal(empty.status, 400);
  const nokey = await srv.raw("/api/stt", { method: "POST", headers: { "Content-Type": "audio/webm" }, body: new Uint8Array([0xff]) });
  assert.equal(nokey.status, 503);
});

test("POST /api/chat rejimni Jigarga uzatadi", () =>
  withServer({}, async (s) => {
    const res = await s.post("/api/chat", { history: [{ role: "user", content: "x" }], mode: "beparvo" });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).text, "BEPARVO");
  }));

test("POST /api/tts so'z vaqtlarini X-Word-Starts sarlavhasida qaytaradi", () => {
  const timed = {
    configured: true,
    async synthesizeTimed(_text, { lang }) {
      return { audio: Buffer.from([1, 2]), wordStarts: lang === "ru" ? [0, 0.456] : [] };
    },
  };
  return withServer({ tts: timed }, async (s) => {
    const ok = await s.post("/api/tts", { text: "Привет", lang: "ru" });
    assert.equal(ok.headers.get("x-word-starts"), "0.00,0.46");
    assert.equal((await s.post("/api/tts", { text: "x", lang: "de" })).status, 400);
  });
});

test("createVoiceServices: AKA_TTS=azure bo'lsa ElevenLabs o'rniga Azure o'qiydi", () => {
  const keys = { ELEVENLABS_API_KEY: "sk_x", AZURE_SPEECH_KEY: "k", AZURE_SPEECH_REGION: "westeurope" };
  const eleven = createVoiceServices(keys);
  const azure = createVoiceServices({ ...keys, AKA_TTS: "azure" });
  assert.notEqual(eleven.providers.elevenlabs, azure.providers.elevenlabs);
  assert.equal(typeof azure.providers.elevenlabs.synthesize, "function");
  assert.equal(eleven.providers.elevenlabs, eleven.stt); // standart: ElevenLabs ikkalasini ham qiladi
  assert.notEqual(azure.providers.elevenlabs, azure.stt);
});

test("createVoiceServices: Azure kaliti bo'lmasa AKA_TTS=azure e'tiborsiz qoladi", () => {
  const s = createVoiceServices({ ELEVENLABS_API_KEY: "sk_x", AKA_TTS: "azure" });
  assert.equal(s.providers.elevenlabs, s.stt);
});

test("createVoiceServices: Fish Audio — FISH_API_KEY bo'lsa sozlangan", () => {
  assert.equal(createVoiceServices({}).providers.fishaudio.configured, false);
  assert.equal(createVoiceServices({ FISH_API_KEY: "f" }).providers.fishaudio.configured, true);
});
