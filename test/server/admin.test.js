import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer, TEST_USER } from "./helpers.js";

const voice = (tag) => ({ configured: true, async synthesize() { return Buffer.from(tag); } });
const fakeJigar = { async chat() { return { text: "ok", parsed: {} }; }, async summary() { return { text: "x" }; } };
const options = { jigar: fakeJigar, ttsProviders: { elevenlabs: voice("E"), fishaudio: voice("F") }, stt: voice("S"), env: { SUPPORT_EMAILS: "boss@x.uz" } };
const req = (s, method, path, cookie, body) =>
  fetch(`${s.base}${path}`, { method, redirect: "manual", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: body && JSON.stringify(body) });
const login = async (s, email, password = TEST_USER.password) => req(s, "POST", "/api/auth/login", null, { email, password });
async function register(s, email, profile) {
  return (await req(s, "POST", "/api/auth/register", null, { ...TEST_USER, email, profile })).headers.get("set-cookie").split(";")[0];
}

test("admin panel: faqat support — oddiy foydalanuvchiga 403, /admin sahifasi /app/ ga yo'naltiradi", async () => {
  const s = await startServer(options, { login: false });
  try {
    const user = await register(s, "u@x.uz", { goal: "study" });
    const boss = await register(s, "boss@x.uz");
    assert.equal((await req(s, "GET", "/api/admin/users", user)).status, 403);
    assert.equal((await req(s, "GET", "/admin", user)).headers.get("location"), "/app/");
    assert.equal((await req(s, "GET", "/admin", boss)).status, 200);
  } finally {
    s.close();
  }
});

test("admin panel: ro'yxat, ko'rsatkichlar, tahrirlash, bugungi limitni tiklash", async () => {
  const s = await startServer(options, { login: false });
  try {
    const user = await register(s, "u@x.uz", { goal: "study", persona: "mehribon", level: "8-9" });
    const boss = await register(s, "boss@x.uz");
    await req(s, "POST", "/api/chat", user, { history: [{ role: "user", content: "x" }] }); // +0.5 daqiqa

    const { users } = await (await req(s, "GET", "/api/admin/users", boss)).json();
    const u = users.find((x) => x.email === "u@x.uz");
    assert.equal(u.profile.goal, "study");
    assert.equal(u.usedMinutes, 0.5);
    assert.equal(u.tariff.price, 249000);
    assert.equal(u.blocked, false);
    assert.ok(u.createdAt);
    assert.match(u.lastActiveDay, /^\d{4}-\d{2}-\d{2}$/);

    const stats = await (await req(s, "GET", "/api/admin/stats", boss)).json();
    assert.equal(stats.users, 2);
    assert.equal(stats.activeToday, 1);
    assert.equal(stats.minutesToday, 0.5);
    assert.ok(stats.costTodaySom > 0);
    assert.equal(stats.days.length, 30);
    assert.equal(stats.tariffs.length, 6);
    assert.equal(stats.costPerMinuteSom, 1400); // standart: Claude + ElevenLabs
    assert.equal(stats.llmProvider, "claude");

    const put = await req(s, "PUT", `/api/admin/users/${u.id}`, boss, { profile: { goal: "exam", persona: "jahldor", level: "10-11" } });
    assert.equal((await put.json()).user.profile.goal, "exam");
    assert.equal((await req(s, "PUT", `/api/admin/users/${u.id}`, boss, { profile: { goal: "yovuz" } })).status, 400);

    assert.equal((await req(s, "POST", `/api/admin/users/${u.id}/reset-usage`, boss)).status, 200);
    const after = (await (await req(s, "GET", "/api/admin/users", boss)).json()).users.find((x) => x.id === u.id);
    assert.equal(after.usedMinutes, 0);
  } finally {
    s.close();
  }
});

test("admin panel: bloklash (sessiya yopiladi, kira olmaydi), blokdan chiqarish, o'chirish; o'zini — yo'q", async () => {
  const s = await startServer(options, { login: false });
  try {
    const user = await register(s, "u@x.uz");
    const boss = await register(s, "boss@x.uz");
    const users = (await (await req(s, "GET", "/api/admin/users", boss)).json()).users;
    const u = users.find((x) => x.email === "u@x.uz");
    const me = users.find((x) => x.email === "boss@x.uz");

    assert.equal((await req(s, "PUT", `/api/admin/users/${u.id}`, boss, { blocked: true })).status, 200);
    assert.equal((await req(s, "GET", "/api/auth/me", user)).status, 401);
    const denied = await login(s, "u@x.uz");
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).code, "blocked");

    await req(s, "PUT", `/api/admin/users/${u.id}`, boss, { blocked: false });
    assert.equal((await login(s, "u@x.uz")).status, 200);

    assert.equal((await req(s, "PUT", `/api/admin/users/${me.id}`, boss, { blocked: true })).status, 400);
    assert.equal((await req(s, "DELETE", `/api/admin/users/${me.id}`, boss)).status, 400);
    assert.equal((await req(s, "DELETE", `/api/admin/users/${u.id}`, boss)).status, 200);
    assert.equal((await (await req(s, "GET", "/api/admin/users", boss)).json()).users.length, 1);
    assert.equal((await req(s, "DELETE", `/api/admin/users/999`, boss)).status, 404);
  } finally {
    s.close();
  }
});
