import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { startServer, TEST_USER } from "./helpers.js";
import { PACKAGES, PACKAGE_MAX_MINUTES, PACKAGE_MIN_MINUTES, packageFor, packageMinutesForBudget } from "../../server/usage/plan-pricing.js";
import { systemPromptFor, GOALS } from "../../server/core/jigar.js";

const SHOP = { PAYGATE_URL: "https://pg.example", PAYGATE_SHOP_ID: "shop_1", PAYGATE_SHOP_KEY: "sk_test" };
const md5 = (s) => createHash("md5").update(s).digest("hex");
const sign = (paymentId, amount) => md5(`shop_1${paymentId}${amount}sk_test`);
const voice = { configured: true, async synthesize() { return Buffer.from("A"); } };

function fakePaygate() {
  const state = { created: [] };
  return {
    state,
    configured: true,
    async create({ amount, orderId }) {
      state.created.push({ amount, orderId });
      return { payment_id: `p${state.created.length}`, order_id: orderId, amount, card: "8600111122223333", card_holder: "JIGAR AI", expire_at: 1_900_000_000 };
    },
    async status(paymentId) { return { payment_id: paymentId, status: "pending" }; },
    verifySign: (body) => body.sign === sign(body.payment_id, body.amount) && body.shop_id === "shop_1",
  };
}

async function setup(env = {}) {
  const paygate = fakePaygate();
  const chats = [];
  const jigar = { async chat(args) { chats.push(args); return { text: "ok", parsed: {} }; } };
  const s = await startServer({ jigar, tts: voice, stt: voice, paygate, env: { ...SHOP, ...env } }, { login: false });
  const reg = await fetch(`${s.base}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...TEST_USER, client: "extension", profile: { goal: "study", level: "10-11" } }),
  });
  const { token } = await reg.json();
  const call = (method, path, body) => fetch(`${s.base}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body && JSON.stringify(body),
  });
  const pay = async (pkg) => {
    const created = await (await call("POST", "/api/payments", { package: pkg })).json();
    const amount = String(created.amount);
    await fetch(`${s.base}/api/payments/callback`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ shop_id: "shop_1", payment_id: created.paymentId, amount, status: "paid", sign: sign(created.paymentId, amount) }).toString(),
    });
    return created;
  };
  return { s, paygate, call, pay, chats };
}

const chatBody = { history: [{ role: "user", content: "Salom" }] };

test("paketlar: Start va Pro — daqiqa, muddat, narx; noma'lum — null", () => {
  assert.deepEqual(PACKAGES, {
    start: { minutes: 60, days: 14, price: 59_000 },
    pro: { minutes: 150, days: 30, price: 129_000 },
  });
  assert.deepEqual(packageFor("pro"), { key: "pro", minutes: 150, days: 30, price: 129_000 });
  assert.equal(packageFor("mega"), null);
  assert.equal(packageFor(undefined), null);
});

test("paket konstruktori: Start/Pro yig'ilsa — aynan o'sha; oraliq — chiziqli; noto'g'ri hajm — null", () => {
  assert.deepEqual(packageFor("custom:60"), packageFor("start")); // tayyor paketni yig'sa — bir xil
  assert.deepEqual(packageFor("custom:150"), packageFor("pro"));
  assert.deepEqual(packageFor("custom:90"), { key: "custom:90", minutes: 90, days: 19, price: 82_000 });
  assert.deepEqual(packageFor("custom:300"), { key: "custom:300", minutes: 300, days: 57, price: 246_000 });
  assert.equal(packageFor(`custom:${PACKAGE_MIN_MINUTES - 10}`), null);
  assert.equal(packageFor(`custom:${PACKAGE_MAX_MINUTES + 10}`), null);
  assert.equal(packageFor("custom:95"), null); // 10 daqiqa qadam
  assert.equal(packageFor("custom:abc"), null);
  assert.equal(packageMinutesForBudget(129_000), 150);
  assert.equal(packageMinutesForBudget(1), PACKAGE_MIN_MINUTES);
});

test("suhbatga tayyorgarlik: yo'nalish va prompt rejimi", () => {
  assert.ok(GOALS.includes("interview"));
  const prompt = systemPromptFor("oddiy", "uz", { goal: "interview", level: "student" });
  assert.match(prompt, /SUHBATGA TAYYORGARLIK/);
  assert.doesNotMatch(systemPromptFor("oddiy", "uz", { goal: "study" }), /SUHBATGA TAYYORGARLIK/);
});

test("paket to'lovi: summa paketdan; balans ochiladi, kunlik limit o'rniga paket qoldig'i; Jigar suhbat rejimida", async () => {
  const { s, paygate, call, pay, chats } = await setup({ PAYWALL: "1", TRIAL_DAYS: "0" });
  try {
    assert.equal((await call("POST", "/api/chat", chatBody)).status, 402); // sinov yo'q, obuna yo'q
    assert.equal((await call("POST", "/api/payments", { package: "mega" })).status, 400);

    const created = await pay("pro");
    assert.equal(paygate.state.created.at(-1).amount, 129_000);
    assert.equal(created.package, "pro");

    const me = await (await call("GET", "/api/auth/me")).json();
    assert.equal(me.user.package.key, "pro");
    assert.equal(me.user.package.minutes, 150);
    assert.ok(Date.parse(me.user.package.until) > Date.now() + 29 * 86_400_000);

    let usage = await (await call("GET", "/api/usage")).json();
    assert.deepEqual({ ...usage.package, until: undefined }, { key: "pro", minutes: 150, used: 0, remaining: 150, until: undefined });
    assert.equal(usage.remainingMinutes, 150);

    assert.equal((await call("POST", "/api/chat", chatBody)).status, 200); // paket — paywall'dan o'tadi
    assert.ok(chats.at(-1).goals.includes("interview"));
    assert.ok(chats.at(-1).goals.includes("study")); // o'z yo'nalishi ham qoladi

    usage = await (await call("GET", "/api/usage")).json();
    assert.equal(usage.package.used, 0.5);
    assert.equal(usage.remainingMinutes, 149.5);

    const sub = await (await call("GET", "/api/subscription")).json();
    assert.equal(sub.package.key, "pro");

    assert.equal((await call("POST", "/api/payments", { package: "custom:95" })).status, 400);
    await pay("start"); // faol paketga qo'shiladi: daqiqa yig'iladi, muddat qisqarmaydi
    const after = (await (await call("GET", "/api/auth/me")).json()).user.package;
    assert.equal(after.minutes, 210);
    assert.equal(after.until, me.user.package.until);
  } finally {
    s.close();
  }
});
