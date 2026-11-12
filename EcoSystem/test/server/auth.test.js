import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../../server/db/database.js";
import { createAuthStore, validateRegistration, normalizeEmail } from "../../server/auth/store.js";
import { hashPassword, verifyPassword } from "../../server/auth/passwords.js";
import { ValidationError } from "../../server/core/errors.js";
import { startServer, TEST_USER } from "./helpers.js";

const fakeJigar = { async chat() { return { text: "ok", parsed: {} }; }, async summary() { return { text: "x" }; } };
const fakeVoice = { configured: false, async synthesize() {}, async transcribe() {} };
const appOptions = { jigar: fakeJigar, tts: fakeVoice, stt: fakeVoice, env: {} };

const json = (body) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("parol: xeshlanadi va faqat to'g'ri parol mos keladi", async () => {
  const hash = await hashPassword("maxfiy-parol");
  assert.match(hash, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await verifyPassword("maxfiy-parol", hash), true);
  assert.equal(await verifyPassword("boshqa-parol", hash), false);
  assert.equal(await verifyPassword("x", "buzilgan"), false);
});

test("validateRegistration: ism, email, parolni tekshiradi va tozalaydi", () => {
  assert.deepEqual(validateRegistration({ name: "  Ali   Valiyev ", email: " ALI@Mail.UZ ", password: "12345678" }), {
    name: "Ali Valiyev",
    email: "ali@mail.uz",
    password: "12345678",
  });
  assert.throws(() => validateRegistration({ name: "A", email: "a@b.uz", password: "12345678" }), ValidationError);
  assert.throws(() => validateRegistration({ name: "Ali", email: "yomon email", password: "12345678" }), ValidationError);
  assert.throws(() => validateRegistration({ name: "Ali", email: "ali@domen", password: "12345678" }), ValidationError);
  assert.throws(() => validateRegistration({ name: "Ali", email: "a@b.uz", password: "1234" }), ValidationError);
});

test("normalizeEmail: @ yo'q — @gmail.com qo'shiladi, gmail xatolari tuzatiladi, boshqa domen tegilmaydi", () => {
  assert.equal(normalizeEmail(" MvNuriddin "), "mvnuriddin@gmail.com");
  assert.equal(normalizeEmail("ali.valiyev"), "ali.valiyev@gmail.com");
  assert.equal(normalizeEmail("ali@gmail.ocm"), "ali@gmail.com");
  assert.equal(normalizeEmail("ali@gmial.com"), "ali@gmail.com");
  assert.equal(normalizeEmail("ali@gmail.co"), "ali@gmail.com");
  assert.equal(normalizeEmail("ali@mail.uz"), "ali@mail.uz");
  assert.equal(normalizeEmail("ali@gmail.com"), "ali@gmail.com");
  assert.equal(normalizeEmail("ali vali"), "ali vali"); // email emas — o'zgarmaydi, keyin validatsiya rad etadi
  assert.equal(validateRegistration({ name: "Ali", email: "ali", password: "12345678" }).email, "ali@gmail.com");
});

test("store: sessiya muddati o'tsa foydalanuvchi topilmaydi, token bazada xom saqlanmaydi", async () => {
  const db = openDatabase(":memory:");
  let clock = new Date("2026-01-01T00:00:00Z");
  const store = createAuthStore(db, { now: () => clock });
  const user = await store.createUser(TEST_USER);
  const token = store.createSession(user.id, "web");
  assert.deepEqual(store.userForToken(token), user);
  assert.equal(db.prepare("SELECT count(*) AS n FROM sessions WHERE token_hash = ?").get(token).n, 0);
  clock = new Date("2027-01-02T00:00:00Z"); // SESSION_DAYS (365) dan keyin
  assert.equal(store.userForToken(token), null);
  store.deleteExpiredSessions();
  assert.equal(db.prepare("SELECT count(*) AS n FROM sessions").get().n, 0);
});

const post = (base, path, body, headers = {}) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const cookieOf = (res) => res.headers.get("set-cookie").split(";")[0];

test("setup: birinchi marta parol qo'yiladi (ism ixtiyoriy), ikkinchi marta — 409; sessiya 1 yil", async () => {
  const s = await startServer(appOptions, { login: false });
  try {
    assert.deepEqual((await (await fetch(`${s.base}/api/auth/status`)).json()).setup, false);
    assert.equal((await post(s.base, "/api/auth/setup", { password: "qisqa" })).status, 400);
    const res = await post(s.base, "/api/auth/setup", { password: "parol-12345" });
    assert.equal(res.status, 201);
    assert.equal((await res.json()).user.name, "Egasi");
    assert.match(res.headers.get("set-cookie"), /Max-Age=31536000/);
    assert.equal((await post(s.base, "/api/auth/setup", { password: "boshqa-parol" })).status, 409);
    assert.equal((await (await fetch(`${s.base}/api/auth/status`)).json()).setup, true);
    assert.equal((await post(s.base, "/api/auth/register", { ...TEST_USER })).status, 404); // ro'yxatdan o'tish yo'q
  } finally {
    s.close();
  }
});

test("login: faqat parol; noto'g'ri — 401; logout sessiyani o'chiradi; parolni o'zgartirish", async () => {
  const s = await startServer(appOptions, { login: false });
  try {
    await post(s.base, "/api/auth/setup", { password: "parol-12345", name: "Nuriddin" });
    assert.equal((await post(s.base, "/api/auth/login", { password: "noto'g'ri-parol" })).status, 401);
    const ok = await post(s.base, "/api/auth/login", { password: "parol-12345" });
    assert.equal(ok.status, 200);
    const cookie = { Cookie: cookieOf(ok) };
    const changed = await fetch(`${s.base}/api/auth/password`, { method: "PUT", headers: { "Content-Type": "application/json", ...cookie }, body: JSON.stringify({ password: "yangi-parol-1" }) });
    assert.equal(changed.status, 200);
    assert.equal((await post(s.base, "/api/auth/login", { password: "parol-12345" })).status, 401);
    assert.equal((await post(s.base, "/api/auth/login", { password: "yangi-parol-1" })).status, 200);
    await post(s.base, "/api/auth/logout", {}, cookie);
    assert.equal((await fetch(`${s.base}/api/auth/me`, { headers: cookie })).status, 401);
  } finally {
    s.close();
  }
});

test("lokal parolsiz kirish: faqat ECO_LOCAL_NOAUTH=1, localhost va proksisiz; production'da — yo'q", async () => {
  const local = await startServer({ ...appOptions, env: { ECO_LOCAL_NOAUTH: "1" } }, { login: false });
  try {
    const me = await fetch(`${local.base}/api/auth/me`);
    assert.equal(me.status, 200); // egasi avtomatik yaratildi
    assert.equal((await (await fetch(`${local.base}/api/auth/status`)).json()).local, true);
    assert.equal((await fetch(`${local.base}/api/auth/me`, { headers: { "X-Forwarded-For": "1.2.3.4" } })).status, 401);
  } finally {
    local.close();
  }
  const prod = await startServer({ ...appOptions, env: { ECO_LOCAL_NOAUTH: "1", NODE_ENV: "production" } }, { login: false });
  try {
    assert.equal((await fetch(`${prod.base}/api/auth/me`)).status, 401);
  } finally {
    prod.close();
  }
  const off = await startServer(appOptions, { login: false });
  try {
    assert.equal((await fetch(`${off.base}/api/auth/me`)).status, 401);
  } finally {
    off.close();
  }
});

test("profil, ism va til: egasi o'zgartiradi; noto'g'ri — 400; kirmagan — 401", async () => {
  const s = await startServer(appOptions, { login: false });
  try {
    const res = await post(s.base, "/api/auth/setup", { password: "parol-12345", profile: { lang: "uz", persona: "mehribon" } });
    const cookie = { Cookie: cookieOf(res) };
    const put = (path, body, headers = cookie) =>
      fetch(`${s.base}${path}`, { method: "PUT", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
    const profile = await put("/api/auth/profile", { profile: { persona: "jahldor", length: "qisqa" } });
    assert.deepEqual((await profile.json()).user.profile, { persona: "jahldor", length: "qisqa" });
    assert.equal((await put("/api/auth/profile", { profile: { length: "99" } })).status, 400);
    assert.equal((await (await put("/api/auth/name", { name: "Nuriddin" })).json()).user.name, "Nuriddin");
    assert.equal((await (await put("/api/auth/lang", { lang: "ru" })).json()).user.profile.lang, "ru");
    assert.equal((await put("/api/auth/profile", { profile: {} }, {})).status, 401);
  } finally {
    s.close();
  }
});

test("login: urinishlar cheklangan (parol tanlashdan himoya)", async () => {
  const s = await startServer({ ...appOptions, env: { ECO_AUTH_RATE_MAX: "3" } }, { login: false });
  try {
    let last;
    for (let i = 0; i < 4; i++) last = await post(s.base, "/api/auth/login", { password: "12345678" });
    assert.equal(last.status, 429);
  } finally {
    s.close();
  }
});
