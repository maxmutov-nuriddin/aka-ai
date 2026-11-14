// Agent HTTP: Siri (/api/voice) kalit bilan, kalitlar, jurnal yuklab olish, cheksiz daraja — parol bilan, TO'XTA.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAkaResponse } from "../../server/core/parse.js";
import { startServer, TEST_USER } from "./helpers.js";
import { speechText } from "../../server/agent/routes.js";

function voiceJigar(seen = []) {
  return {
    async chat(args) {
      seen.push(args);
      const text = `[TUSHUNTIRISH]\n[smiles] **Tayyor**, ovoz ${args.history.length} xabar.`;
      return { text, parsed: parseAkaResponse(text), userContent: args.history.at(-1).content };
    },
  };
}

test("Siri: kalitsiz 401; kalit bilan qisqa nutq; suhbat davom etadi; o'chirilgan kalit ishlamaydi", async () => {
  const seen = [];
  const s = await startServer({ jigar: voiceJigar(seen), ttsProviders: {}, stt: { configured: false } });
  try {
    const anon = await fetch(`${s.base}/api/voice`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer jgr_yoq" }, body: JSON.stringify({ text: "salom" }) });
    assert.equal(anon.status, 401);
    const { token, id } = await (await s.post("/api/tokens", { name: "iPhone" })).json();
    assert.match(token, /^jgr_/);
    const ask = (text) => fetch(`${s.base}/api/voice`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ text }) });
    const first = await (await ask("YouTube'ni och")).json();
    assert.equal(first.speech, "Tayyor, ovoz 1 xabar.");
    const second = await (await ask("ovozini pasaytir")).json();
    assert.equal(second.speech, "Tayyor, ovoz 3 xabar.", "oldingi savol esda");
    assert.equal(seen[0].llm, "haiku", "Siri ham sozlamadagi miya bilan (standart Haiku)");
    assert.match(seen[0].nowNote, /Siri orqali/);
    assert.ok(seen[0].toolbox.definitions.some((t) => t.name === "journal"));
    const list = await (await s.raw("/api/tokens")).json();
    assert.equal(list.tokens[0].name, "iPhone");
    assert.ok(list.tokens[0].lastUsed);
    assert.equal(JSON.stringify(list).includes(token), false, "kalit qayta ko'rsatilmaydi");
    await s.raw(`/api/tokens/${id}`, { method: "DELETE" });
    assert.equal((await ask("salom")).status, 401);
  } finally {
    s.close();
  }
});

test("sozlamalar: cheksiz daraja — faqat to'g'ri parol bilan; TO'XTA — xavfsizga; jurnal yuklab olinadi", async () => {
  const s = await startServer({ jigar: voiceJigar(), ttsProviders: {}, stt: { configured: false } });
  try {
    const put = (body) => s.raw("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await put({ access: "unlimited", password: "yomon-parol" })).status, 403);
    const ok = await (await put({ access: "unlimited", password: TEST_USER.password })).json();
    assert.equal(ok.access, "unlimited");
    assert.equal((await (await put({ access: "wide" })).json()).access, "wide");
    const stop = await (await s.post("/api/stop", {})).json();
    assert.equal(stop.ok, true);
    assert.equal((await (await s.raw("/api/settings")).json()).access, "safe");
    const md = await s.raw("/api/journal/actions");
    assert.match(md.headers.get("content-disposition"), /HARAKATLAR\.md/);
    assert.match(await md.text(), /Ruxsat darajasi: unlimited/);
    assert.equal((await s.raw("/api/journal/boshqa")).status, 404);
    assert.equal((await s.post("/api/watches/999/cancel", {})).status, 404);
  } finally {
    s.close();
  }
});

test("speechText: teglar va markdown olib tashlanadi", () => {
  assert.equal(speechText("[smiles] **Salom**, `kod` #bor"), "Salom, kod bor");
});

test("telefon agenti: kalit bilan poll qiladi (cookie'siz); kalitsiz — 401; ro'yxatda turi phone", async () => {
  const s = await startServer({ jigar: voiceJigar(), ttsProviders: {}, stt: { configured: false } });
  try {
    const { token } = await (await s.post("/api/tokens", { name: "Android", scope: "device" })).json();
    const siri = await (await s.post("/api/tokens", { name: "Siri" })).json();
    const poll = (auth) => fetch(`${s.base}/api/devices/poll`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
      body: JSON.stringify({ id: "android-1234", name: "Pixel", platform: "android", kind: "phone" }),
    });
    assert.equal((await poll("jgr_yolgon")).status, 401);
    assert.equal((await poll(siri.token)).status, 401, "Siri kaliti qurilma sifatida ulana olmaydi");
    const asSiri = await fetch(`${s.base}/api/voice`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ text: "x" }) });
    assert.equal(asSiri.status, 401, "qurilma kaliti Siri sifatida ishlamaydi");
    const pending = poll(token);
    let devices = [];
    for (let i = 0; i < 50 && !devices.length; i++) {
      devices = (await (await s.raw("/api/devices")).json()).devices;
      if (!devices.length) await new Promise((r) => setTimeout(r, 10));
    }
    assert.deepEqual(devices, [{ id: "android-1234", name: "Pixel", platform: "android", kind: "phone" }]);
    assert.equal((await fetch(`${s.base}/api/settings`, { headers: { Authorization: `Bearer ${token}` } })).status, 401, "kalit faqat agent va Siri uchun");
    s.app.hub.poll(1, { id: "android-1234", name: "Pixel", kind: "phone" }); // kutib turgan poll'ni yopadi
    await pending;
  } finally {
    s.close();
  }
});

test("Siri darajasi: sozlama 'to'liq' yoki 'cheksiz' bo'lsa ham Siri 'keng'dan oshmaydi; ilovada — o'zgarmaydi", async () => {
  const { capLevel } = await import("../../server/agent/routes.js");
  assert.deepEqual(["safe", "wide", "full", "unlimited"].map((l) => capLevel(l)), ["safe", "wide", "wide", "wide"]);
  const seen = [];
  const s = await startServer({ jigar: voiceJigar(seen), ttsProviders: {}, stt: { configured: false } });
  try {
    const put = (body) => s.raw("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await put({ access: "full" });
    const { token } = await (await s.post("/api/tokens", { name: "Siri" })).json();
    await fetch(`${s.base}/api/voice`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ text: "salom" }) });
    assert.equal(seen[0].toolbox !== undefined, true);
    const access = await (await s.raw("/api/settings")).json();
    assert.equal(access.access, "full", "ilovadagi daraja o'zgarmadi");
  } finally {
    s.close();
  }
});

test("xavfsizlik sarlavhalari; production'da HSTS; zaif parol faqat production'da rad etiladi", async () => {
  const dev = await startServer({ jigar: voiceJigar(), ttsProviders: {}, stt: { configured: false } }, { login: false });
  try {
    const res = await fetch(`${dev.base}/api/health`);
    assert.equal(res.headers.get("x-frame-options"), "DENY");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("strict-transport-security"), null, "HSTS — faqat production");
    const weak = await fetch(`${dev.base}/api/auth/setup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "12345678" }) });
    assert.equal(weak.status, 201, "lokal ishda 12345678 ruxsat");
  } finally {
    dev.close();
  }
  const prod = await startServer({ jigar: voiceJigar(), ttsProviders: {}, stt: { configured: false }, env: { NODE_ENV: "production", TRUST_PROXY: "1" } }, { login: false });
  try {
    assert.match((await fetch(`${prod.base}/api/health`)).headers.get("strict-transport-security"), /max-age=31536000/);
    const post = (password) => fetch(`${prod.base}/api/auth/setup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    const weak = await post("12345678");
    assert.equal(weak.status, 400);
    assert.equal((await weak.json()).code, "weak_password");
    assert.equal((await post("kuchli-parol-2026")).status, 201);
  } finally {
    prod.close();
  }
});

test("ilova xatosi (POST /api/journal/client): XATOLAR.md ga yoziladi; 'where'siz — 400; kirmagan — 401", async () => {
  const s = await startServer({ jigar: voiceJigar(), ttsProviders: {}, stt: { configured: false } });
  try {
    const ok = await s.post("/api/journal/client", {
      where: "Hey Jigar", name: "NotAllowedError", message: "NotAllowedError: Permission denied by system",
      audioInputs: 2, device: "desktop ilova, Windows NT 10.0",
    });
    assert.equal(ok.status, 200);
    assert.equal((await s.post("/api/journal/client", { name: "x" })).status, 400);
    const md = await (await s.raw("/api/journal/errors")).text();
    assert.match(md, /Ilova: Hey Jigar — NotAllowedError/);
    assert.match(md, /Permission denied by system/);
    assert.match(md, /Windows NT 10\.0/);
    const anon = await fetch(`${s.base}/api/journal/client`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ where: "x" }) });
    assert.equal(anon.status, 401);
  } finally {
    s.close();
  }
});

test("/api/chat: oddiy buyruq AI'siz javob beradi (model: tezkor); boshqa gap — AI'ga o'tadi", async () => {
  const seen = [];
  const s = await startServer({ jigar: voiceJigar(seen), ttsProviders: {}, stt: { configured: false } });
  try {
    const quick = await (await s.post("/api/chat", { history: [{ role: "user", content: "Jigar, soat necha" }], voice: true })).json();
    assert.equal(quick.model, "tezkor");
    assert.match(quick.parsed.tushuntirish, /Hozir \d\d:\d\d\./);
    assert.equal(quick.parsed.savol, "Jigar, soat necha"); // ovozli xabar: [SAVOL] ham qaytadi
    assert.deepEqual(quick.usage, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    assert.equal(seen.length, 0, "AI chaqirilmagan");
    const slow = await (await s.post("/api/chat", { history: [{ role: "user", content: "Bugun ob-havo qanday bo'ladi" }] })).json();
    assert.notEqual(slow.model, "tezkor");
    assert.equal(seen.length, 1, "murakkab gap AI'ga ketdi");
    // Qurilma ulanmagan: "ovozni 40 qil" asbobsiz bajarilmaydi — AI tushuntiradi
    await s.post("/api/chat", { history: [{ role: "user", content: "ovozni 40 qil" }] });
    assert.equal(seen.length, 2);
  } finally {
    s.close();
  }
});
