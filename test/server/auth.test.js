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

test("login: @gmail.com siz yozilsa ham kiradi", async () => {
  const s = await startServer(appOptions, { login: false });
  try {
    await fetch(`${s.base}/api/auth/register`, json({ ...TEST_USER, email: "nuriddin" }));
    const res = await fetch(`${s.base}/api/auth/login`, json({ email: "Nuriddin@gmail.ocm", password: TEST_USER.password }));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).user.email, "nuriddin@gmail.com");
  } finally {
    s.close();
  }
});

test("store: sessiya muddati o'tsa foydalanuvchi topilmaydi, token bazada xom saqlanmaydi", async () => {
  const db = openDatabase(":memory:");
  let clock = new Date("2026-01-01T00:00:00Z");
  const store = createAuthStore(db, { now: () => clock });
  const user = await store.createUser(TEST_USER);
  const token = store.createSession(user.id, "web");
  assert.deepEqual(store.userForToken(token), user);
  assert.equal(db.prepare("SELECT count(*) AS n FROM sessions WHERE token_hash = ?").get(token).n, 0);
  clock = new Date("2026-03-01T00:00:00Z");
  assert.equal(store.userForToken(token), null);
  store.deleteExpiredSessions();
  assert.equal(db.prepare("SELECT count(*) AS n FROM sessions").get().n, 0);
});

test("register: veb — httpOnly cookie, kengaytma — token", async () => {
  const s = await startServer(appOptions, { login: false });
  try {
    const web = await fetch(`${s.base}/api/auth/register`, json(TEST_USER));
    assert.equal(web.status, 201);
    const cookie = web.headers.get("set-cookie");
    assert.match(cookie, /^jigar_session=[\w-]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000/);
    assert.deepEqual((await web.json()).user, { id: 1, name: TEST_USER.name, email: TEST_USER.email });

    const me = await fetch(`${s.base}/api/auth/me`, { headers: { Cookie: cookie.split(";")[0] } });
    assert.equal((await me.json()).user.email, TEST_USER.email);

    const ext = await fetch(`${s.base}/api/auth/login`, json({ email: TEST_USER.email, password: TEST_USER.password, client: "extension" }));
    const { token } = await ext.json();
    assert.ok(token.length > 30);
    assert.equal(ext.headers.get("set-cookie"), null);
    const meExt = await fetch(`${s.base}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(meExt.status, 200);
  } finally {
    s.close();
  }
});

test("register: takroriy email 409, noto'g'ri ma'lumot 400", async () => {
  const s = await startServer(appOptions, { login: false });
  try {
    assert.equal((await fetch(`${s.base}/api/auth/register`, json(TEST_USER))).status, 201);
    const dup = await fetch(`${s.base}/api/auth/register`, json({ ...TEST_USER, email: TEST_USER.email.toUpperCase() }));
    assert.equal(dup.status, 409);
    assert.equal((await dup.json()).code, "duplicate_email");
    assert.equal((await fetch(`${s.base}/api/auth/register`, json({ name: "A" }))).status, 400);
  } finally {
    s.close();
  }
});

test("register: savollar javobi (profil) saqlanadi va /me qaytaradi, noto'g'risi 400", async () => {
  const profile = { lang: "ru", goal: "exam", length: "batafsil", persona: "mehribon", level: "8-9" };
  const s = await startServer(appOptions, { login: false });
  try {
    const res = await fetch(`${s.base}/api/auth/register`, json({ ...TEST_USER, profile: { ...profile, extra: "x" } }));
    assert.equal(res.status, 201);
    assert.deepEqual((await res.json()).user.profile, profile); // noma'lum maydon tashlanadi
    const cookie = res.headers.get("set-cookie").split(";")[0];
    const me = await fetch(`${s.base}/api/auth/me`, { headers: { Cookie: cookie } });
    assert.deepEqual((await me.json()).user.profile, profile);

    const bad = await fetch(`${s.base}/api/auth/register`, json({ ...TEST_USER, email: "b@b.uz", profile: { persona: "yovuz" } }));
    assert.equal(bad.status, 400);
  } finally {
    s.close();
  }
});

test("PUT /api/auth/profile: oddiy foydalanuvchi o'zgartira olmaydi (403), role ko'rinmaydi", async () => {
  const s = await startServer(appOptions, { login: false });
  try {
    const res = await fetch(`${s.base}/api/auth/register`, json({ ...TEST_USER, profile: { persona: "mehribon" } }));
    const body = await res.json();
    assert.equal(body.user.role, undefined);
    const cookie = res.headers.get("set-cookie").split(";")[0];
    const put = await fetch(`${s.base}/api/auth/profile`, {
      method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ profile: { persona: "jahldor" } }),
    });
    assert.equal(put.status, 403);
  } finally {
    s.close();
  }
});

test("support (SUPPORT_EMAILS): role qaytadi, ovoz xizmatini hammaga tanlaydi; oddiy foydalanuvchi — 403", async () => {
  const seen = [];
  const synth = (tag) => ({ configured: true, async synthesize(_t, o) { seen.push(o); return Buffer.from(tag); } });
  const options = {
    ...appOptions,
    env: { SUPPORT_EMAILS: ` ${TEST_USER.email.toUpperCase()} , boshqa@x.uz` },
    ttsProviders: { elevenlabs: synth("E"), fishaudio: synth("F") },
  };
  const s = await startServer(options, { login: false });
  try {
    const reg = await fetch(`${s.base}/api/auth/register`, json(TEST_USER));
    assert.equal((await reg.json()).user.role, "support");
    const support = { Cookie: reg.headers.get("set-cookie").split(";")[0] };
    const user = await fetch(`${s.base}/api/auth/register`, json({ ...TEST_USER, email: "oddiy@x.uz" }));
    const plain = { Cookie: user.headers.get("set-cookie").split(";")[0] };
    const call = (method, path, headers, body) =>
      fetch(`${s.base}${path}`, { method, headers: { "Content-Type": "application/json", ...headers }, body: body && JSON.stringify(body) });
    const tts = async (headers) => Buffer.from(await (await call("POST", "/api/tts", headers, { text: "Salom" })).arrayBuffer()).toString();

    const settings = await (await call("GET", "/api/admin/settings", support)).json();
    assert.deepEqual(settings, {
      llmProvider: "claude",
      llms: { claude: false, gemini: false, openai: false },
      ttsProvider: "elevenlabs",
      fishModel: "drama-3",
      fishModels: ["s2.1-pro-free", "drama-3"],
      providers: { elevenlabs: true, fishaudio: true },
      costs: { llm: { claude: 195, gemini: 250, openai: 187 }, tts: { fishaudio: 355, elevenlabs: 1205, gemini: 173, openai: 96 } },
    });
    // Miya: Gemini tanlanadi va qaytariladi; noto'g'ri qiymat — 400.
    assert.equal((await (await call("PUT", "/api/admin/settings", support, { llmProvider: "gemini" })).json()).llmProvider, "gemini");
    assert.equal((await call("PUT", "/api/admin/settings", support, { llmProvider: "gpt" })).status, 400);
    assert.equal((await (await call("PUT", "/api/admin/settings", support, { llmProvider: "openai" })).json()).llmProvider, "openai");
    assert.equal((await (await call("PUT", "/api/admin/settings", support, { ttsProvider: "openai" })).json()).ttsProvider, "openai");
    assert.equal((await call("PUT", "/api/admin/settings", support, { ttsProvider: "elevenlabs" })).status, 200);
    const model = await (await call("PUT", "/api/admin/settings", support, { fishModel: "s2.1-pro-free" })).json();
    assert.equal(model.fishModel, "s2.1-pro-free");
    assert.equal(model.ttsProvider, "elevenlabs"); // bitta maydon o'zgarsa, boshqasi tegilmaydi
    assert.equal((await call("PUT", "/api/admin/settings", support, { fishModel: "gpt" })).status, 400);
    assert.equal(await tts(plain), "E");

    assert.equal((await call("PUT", "/api/admin/settings", support, { ttsProvider: "fishaudio" })).status, 200);
    assert.equal(await tts(plain), "F"); // support tanlovi hammaga ta'sir qiladi
    assert.equal(seen.at(-1).model, "s2.1-pro-free"); // tanlangan Fish modeli uzatiladi
    assert.equal((await call("PUT", "/api/admin/settings", support, { ttsProvider: "yovuz" })).status, 400);

    assert.equal((await call("GET", "/api/admin/settings", plain)).status, 403);
    assert.equal((await call("PUT", "/api/admin/settings", plain, { ttsProvider: "elevenlabs" })).status, 403);
    assert.equal((await call("PUT", "/api/auth/profile", plain, { profile: { persona: "jahldor" } })).status, 403);
  } finally {
    s.close();
  }
});

test("tts: tanlangan xizmat (Fish) xato bersa — o'sha so'rov ElevenLabs'ga o'tadi", async () => {
  const failing = { configured: true, async synthesize() { throw new Error("Fish Audio TTS 402: kredit tugadi"); } };
  const eleven = { configured: true, async synthesize() { return Buffer.from("E"); } };
  const options = { ...appOptions, env: { SUPPORT_EMAILS: TEST_USER.email }, ttsProviders: { elevenlabs: eleven, fishaudio: failing } };
  const s = await startServer(options, { login: false });
  try {
    const reg = await fetch(`${s.base}/api/auth/register`, json(TEST_USER));
    const headers = { "Content-Type": "application/json", Cookie: reg.headers.get("set-cookie").split(";")[0] };
    await fetch(`${s.base}/api/admin/settings`, { method: "PUT", headers, body: JSON.stringify({ ttsProvider: "fishaudio" }) });
    const res = await fetch(`${s.base}/api/tts`, { method: "POST", headers, body: JSON.stringify({ text: "Salom" }) });
    assert.equal(res.status, 200);
    assert.equal(Buffer.from(await res.arrayBuffer()).toString(), "E");
  } finally {
    s.close();
  }
});

test("PUT /api/auth/profile: support profilni yangilaydi, /me qaytaradi; noto'g'ri — 400, kirmagan — 401", async () => {
  const s = await startServer({ ...appOptions, env: { SUPPORT_EMAILS: TEST_USER.email } }, { login: false });
  try {
    const res = await fetch(`${s.base}/api/auth/register`, json({ ...TEST_USER, profile: { persona: "mehribon", level: "5-7" } }));
    const cookie = res.headers.get("set-cookie").split(";")[0];
    const put = (body, headers = { Cookie: cookie }) =>
      fetch(`${s.base}/api/auth/profile`, { method: "PUT", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

    const ok = await put({ profile: { persona: "jahldor", level: "student" } });
    assert.equal(ok.status, 200);
    assert.deepEqual((await ok.json()).user.profile, { persona: "jahldor", level: "student" });
    const me = await fetch(`${s.base}/api/auth/me`, { headers: { Cookie: cookie } });
    assert.deepEqual((await me.json()).user.profile, { persona: "jahldor", level: "student" });

    assert.equal((await put({ profile: { level: "99" } })).status, 400);
    assert.equal((await put({ profile: { persona: "neytral" } }, {})).status, 401);
  } finally {
    s.close();
  }
});

test("login: noto'g'ri parol 401, logout sessiyani o'chiradi", async () => {
  const s = await startServer(appOptions);
  try {
    const bad = await fetch(`${s.base}/api/auth/login`, json({ email: TEST_USER.email, password: "notogri-parol" }));
    assert.equal(bad.status, 401);
    assert.equal((await bad.json()).code, "bad_credentials");

    assert.equal((await s.raw("/api/auth/me")).status, 200);
    const out = await s.post("/api/auth/logout", {});
    assert.match(out.headers.get("set-cookie"), /Max-Age=0/);
    assert.equal((await s.raw("/api/auth/me")).status, 401);
  } finally {
    s.close();
  }
});

test("login: urinishlar cheklangan (parol tanlashdan himoya)", async () => {
  const s = await startServer({ ...appOptions, env: { AKA_AUTH_RATE_MAX: "3" } }, { login: false });
  try {
    let last;
    for (let i = 0; i < 4; i++) last = await fetch(`${s.base}/api/auth/login`, json({ email: "x@y.uz", password: "12345678" }));
    assert.equal(last.status, 429);
  } finally {
    s.close();
  }
});

test("/login: kirgan foydalanuvchi to'g'ridan-to'g'ri ilovaga o'tadi", async () => {
  const s = await startServer(appOptions);
  try {
    const r = await s.raw("/login", { redirect: "manual" });
    assert.equal(r.status, 302);
    assert.equal(r.headers.get("location"), "/app/");
  } finally {
    s.close();
  }
});
