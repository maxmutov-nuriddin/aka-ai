import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer, TEST_USER } from "./helpers.js";
import { todayInTashkent } from "../../server/usage/store.js";
import { TARIFFS, tariffFor } from "../../server/usage/tariffs.js";

const voice = (tag) => ({ configured: true, async synthesize() { return Buffer.from(tag); } });
const fakeJigar = { async chat() { return { text: "ok", parsed: {} }; }, async summary() { return { text: "x" }; } };
const options = () => ({
  jigar: fakeJigar,
  ttsProviders: { elevenlabs: voice("E"), fishaudio: voice("F") },
  stt: voice("S"),
  env: { SUPPORT_EMAILS: "boss@x.uz" },
});
const json = (body, cookie) => ({ method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
const chatBody = { history: [{ role: "user", content: "Salom" }] };

async function register(s, email, profile) {
  return (await fetch(`${s.base}/api/auth/register`, json({ ...TEST_USER, email, profile }))).headers.get("set-cookie").split(";")[0];
}

test("todayInTashkent: kun Toshkent vaqti (UTC+5) bo'yicha almashadi", () => {
  assert.equal(todayInTashkent(new Date("2026-11-08T18:59:00Z")), "2026-11-08");
  assert.equal(todayInTashkent(new Date("2026-11-08T19:00:00Z")), "2026-11-09");
});

test("tariflar: 6 yo'nalish, narx va kunlik daqiqa; eski/noma'lum maqsad — qiziqish", () => {
  assert.deepEqual(Object.keys(TARIFFS), ["curious", "study", "exam", "olympiad", "university", "language"]);
  assert.deepEqual(tariffFor("exam"), { goal: "exam", price: 299000, minutes: 15 });
  assert.deepEqual(tariffFor("language"), { goal: "language", price: 299000, minutes: 12 });
  assert.equal(tariffFor("it").goal, "curious");
  assert.equal(tariffFor(undefined).goal, "study");
});

test("daqiqa limiti: maqsad tarifiga qarab; ovoz va savollar hisoblanadi; tugasa 429", async () => {
  const s = await startServer(options(), { login: false });
  try {
    const user = await register(s, "u@x.uz", { goal: "curious" }); // 10 daqiqa (Fish), ElevenLabs — 4
    const usage = async () => (await fetch(`${s.base}/api/usage`, { headers: { Cookie: user } })).json();
    let u = await usage();
    assert.equal(u.limitMinutes, 4); // standart ovoz — ElevenLabs (x0.4)
    assert.equal(u.tariff.price, 199000);

    assert.equal((await fetch(`${s.base}/api/chat`, json(chatBody, user))).status, 200); // +0.5
    await fetch(`${s.base}/api/tts`, json({ text: "a".repeat(1800) }, user)); // +2 daqiqa ovoz
    u = await usage();
    assert.equal(u.usedMinutes, 2.5);
    await fetch(`${s.base}/api/tts`, json({ text: "a".repeat(1350) }, user)); // +1.5 → 4.0
    const blocked = await fetch(`${s.base}/api/chat`, json(chatBody, user));
    assert.equal(blocked.status, 429);
    assert.equal((await blocked.json()).code, "daily_limit");
  } finally {
    s.close();
  }
});

test("daqiqa limiti: Fish tanlansa to'liq daqiqa; support — cheksiz; xato so'rov hisoblanmaydi", async () => {
  const s = await startServer(options(), { login: false });
  try {
    const boss = await register(s, "boss@x.uz");
    const user = await register(s, "u@x.uz", { goal: "olympiad" });
    await fetch(`${s.base}/api/admin/settings`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: boss }, body: JSON.stringify({ ttsProvider: "fishaudio" }) });
    const u = await (await fetch(`${s.base}/api/usage`, { headers: { Cookie: user } })).json();
    assert.equal(u.limitMinutes, 20);
    const b = await (await fetch(`${s.base}/api/usage`, { headers: { Cookie: boss } })).json();
    assert.equal(b.limitMinutes, null);
  } finally {
    s.close();
  }
  const failing = { async chat() { throw new Error("down"); }, async summary() { return { text: "x" }; } };
  const s2 = await startServer({ ...options(), jigar: failing });
  try {
    await s2.post("/api/chat", chatBody);
    assert.equal((await (await s2.raw("/api/usage")).json()).usedMinutes, 0);
  } finally {
    s2.close();
  }
});

test("/api/tariffs: ochiq (kirishsiz) — narx va joriy ovoz xizmatidagi kunlik daqiqa", async () => {
  const s = await startServer(options(), { login: false });
  try {
    const res = await fetch(`${s.base}/api/tariffs`);
    assert.equal(res.status, 200);
    const { tariffs, provider } = await res.json();
    assert.equal(tariffs.length, 6);
    const exam = tariffs.find((t) => t.goal === "exam");
    assert.equal(exam.price, 299000);
    assert.equal(exam.minutes, provider === "elevenlabs" ? 6 : 15);
  } finally {
    s.close();
  }
});
