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
    assert.ok(ok.accessUntil > Date.now());
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
    const { token } = await (await s.post("/api/tokens", { name: "Android" })).json();
    const poll = (auth) => fetch(`${s.base}/api/devices/poll`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
      body: JSON.stringify({ id: "android-1234", name: "Pixel", platform: "android", kind: "phone" }),
    });
    assert.equal((await poll("jgr_yolgon")).status, 401);
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
