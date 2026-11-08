import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { startServer, TEST_USER } from "./helpers.js";
import { createPaygate } from "../../server/payments/paygate.js";

const SHOP = { PAYGATE_URL: "https://pg.example", PAYGATE_SHOP_ID: "shop_1", PAYGATE_SHOP_KEY: "sk_test" };
const md5 = (s) => createHash("md5").update(s).digest("hex");
const sign = (paymentId, amount) => md5(`shop_1${paymentId}${amount}sk_test`);
const voice = { configured: true, async synthesize() { return Buffer.from("A"); } };
const fakeJigar = { async chat() { return { text: "ok", parsed: {} }; } };

/** Soxta PayGate: create — karta va aniq summa; status — testda o'zgartiriladi. */
function fakePaygate() {
  const state = { created: [], status: "pending" };
  return {
    state,
    configured: true,
    async create({ amount, orderId }) {
      state.created.push({ amount, orderId });
      return { payment_id: `p${state.created.length}`, order_id: orderId, amount: amount + 37, card: "8600111122223333", card_holder: "JIGAR AI", expires_in: 300, expire_at: 1_900_000_000 };
    },
    async status(paymentId) { return { payment_id: paymentId, status: state.status }; },
    verifySign: (body) => body.sign === sign(body.payment_id, body.amount) && body.shop_id === "shop_1",
  };
}

async function setup(env = {}) {
  const paygate = fakePaygate();
  const s = await startServer({ jigar: fakeJigar, tts: voice, stt: voice, paygate, env: { ...SHOP, ...env } }, { login: false });
  const reg = await fetch(`${s.base}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...TEST_USER, client: "extension", profile: { goal: "exam" } }),
  });
  const { token } = await reg.json();
  const call = (method, path, body) => fetch(`${s.base}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body && JSON.stringify(body),
  });
  const callback = (fields) => fetch(`${s.base}/api/payments/callback`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields).toString(),
  });
  return { s, paygate, call, callback };
}

test("PayGate mijozi: to'lov yaratish (form), holat, MD5 imzo", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => ({ payment_id: "x", amount: 299037, card: "8600" }) }; };
  const pg = createPaygate({ env: SHOP, fetchImpl });
  assert.equal(pg.configured, true);
  await pg.create({ amount: 299000, orderId: "O1", completeUrl: "https://jigar.uz/api/payments/callback" });
  assert.equal(calls[0].url, "https://pg.example/payment/create");
  const form = new URLSearchParams(calls[0].init.body);
  assert.equal(form.get("shop_key"), "sk_test");
  assert.equal(form.get("amount"), "299000");
  assert.equal(form.get("complete_url"), "https://jigar.uz/api/payments/callback");
  await pg.status("x");
  assert.match(calls[1].url, /\/payment\/status\?shop_id=shop_1&shop_key=sk_test&payment_id=x$/);
  assert.equal(pg.verifySign({ shop_id: "shop_1", payment_id: "x", amount: "299037", sign: sign("x", "299037") }), true);
  assert.equal(pg.verifySign({ shop_id: "shop_1", payment_id: "x", amount: "1", sign: sign("x", "299037") }), false);
  assert.equal(createPaygate({ env: {} }).configured, false);
});

test("to'lov: tarif narxida yaratiladi, callback (to'g'ri imzo) obunani 30 kunga ochadi, takror callback qo'shmaydi", async () => {
  const { s, paygate, call, callback } = await setup();
  try {
    const created = await (await call("POST", "/api/payments")).json();
    assert.equal(paygate.state.created[0].amount, 299000); // Imtihon tarifi
    assert.equal(created.amount, 299037);
    assert.equal(created.card, "8600111122223333");
    // Kutilayotgan to'lov bo'lsa — yangisi yaratilmaydi.
    assert.equal((await (await call("POST", "/api/payments")).json()).paymentId, created.paymentId);
    assert.equal(paygate.state.created.length, 1);

    assert.equal((await callback({ shop_id: "shop_1", payment_id: created.paymentId, amount: "299037", status: "paid", sign: "soxta" })).status, 403);
    const ok = await callback({ shop_id: "shop_1", payment_id: created.paymentId, amount: "299037", status: "paid", sign: sign(created.paymentId, "299037") });
    assert.equal(ok.status, 200);
    const sub = await (await call("GET", "/api/subscription")).json();
    assert.equal(sub.active, true);
    const days = (Date.parse(sub.paidUntil) - Date.now()) / 86_400_000;
    assert.ok(days > 29.9 && days <= 30);
    await callback({ shop_id: "shop_1", payment_id: created.paymentId, amount: "299037", status: "paid", sign: sign(created.paymentId, "299037") });
    assert.equal((await (await call("GET", "/api/subscription")).json()).paidUntil, sub.paidUntil);
  } finally {
    s.close();
  }
});

test("to'lov holati: callback kelmasa ham server PayGate'dan so'rab tasdiqlaydi; kam summa — tasdiqlanmaydi", async () => {
  const { s, paygate, call, callback } = await setup();
  try {
    const created = await (await call("POST", "/api/payments")).json();
    assert.equal((await (await call("GET", `/api/payments/${created.paymentId}`)).json()).status, "pending");
    paygate.state.status = "paid";
    const st = await (await call("GET", `/api/payments/${created.paymentId}`)).json();
    assert.equal(st.status, "paid");
    assert.ok(st.paidUntil);
    // Boshqa to'lov: kam summa bilan callback — rad etiladi.
    paygate.state.status = "pending";
    const second = await (await call("POST", "/api/payments")).json();
    await callback({ shop_id: "shop_1", payment_id: second.paymentId, amount: "1000", status: "paid", sign: sign(second.paymentId, "1000") });
    assert.equal((await (await call("GET", `/api/payments/${second.paymentId}`)).json()).status, "pending");
  } finally {
    s.close();
  }
});

test("paywall: PAYWALL=1 — sinov muddatidan keyin to'lovsiz chat 402; sinov ichida va to'lagandan keyin — ishlaydi", async () => {
  const chat = (call) => call("POST", "/api/chat", { history: [{ role: "user", content: "x" }] });
  const open = await setup({ PAYWALL: "1", TRIAL_DAYS: "3" });
  try {
    assert.equal((await chat(open.call)).status, 200); // yangi foydalanuvchi — sinov muddati
    const sub = await (await open.call("GET", "/api/subscription")).json();
    assert.equal(sub.paywall, true);
    assert.ok(sub.trialEndsAt);
  } finally {
    open.s.close();
  }
  const closed = await setup({ PAYWALL: "1", TRIAL_DAYS: "0" });
  try {
    const denied = await chat(closed.call);
    assert.equal(denied.status, 402);
    assert.equal((await denied.json()).code, "payment_required");
    const created = await (await closed.call("POST", "/api/payments")).json();
    await closed.callback({ shop_id: "shop_1", payment_id: created.paymentId, amount: String(created.amount), status: "paid", sign: sign(created.paymentId, String(created.amount)) });
    assert.equal((await chat(closed.call)).status, 200);
  } finally {
    closed.s.close();
  }
});

test("oyna yopilgan va to'lov muddati o'tgan bo'lsa ham: obuna holati so'ralganda oxirgi to'lovlar qayta tekshiriladi", async () => {
  const { s, paygate, call } = await setup();
  try {
    const created = await (await call("POST", "/api/payments")).json();
    // To'lov "muddati o'tgan" (kutilayotganlar ro'yxatidan chiqqan), lekin PayGate'da — to'langan.
    paygate.state.status = "paid";
    s.app.paymentsForTest.expire(created.paymentId);
    const sub = await (await call("GET", "/api/subscription")).json();
    assert.equal(sub.paid, true);
  } finally {
    s.close();
  }
});

test("konstruktor rejasi bilan to'lov: summa rejadan, to'langach reja va limit o'quvchiga o'tadi", async () => {
  const { s, paygate, call, callback } = await setup();
  try {
    assert.equal((await call("POST", "/api/payments", { plan: { goals: ["hack"], minutes: 10 } })).status, 400);
    const created = await (await call("POST", "/api/payments", { plan: { goals: ["study", "language"], minutes: 18 } })).json();
    assert.equal(paygate.state.created.at(-1).amount, 449000); // til daqiqa narxi (299000/12) x 18 = 448 500 -> 449 000
    await callback({ shop_id: "shop_1", payment_id: created.paymentId, amount: String(created.amount), status: "paid", sign: sign(created.paymentId, String(created.amount)) });
    const me = await (await call("GET", "/api/auth/me")).json();
    assert.deepEqual(me.user.plan, { goals: ["study", "language"], minutes: 18 });
    const usage = await (await call("GET", "/api/usage")).json();
    assert.equal(usage.tariff.custom, true);
    assert.equal(usage.limitMinutes, 7.1); // 18 x 550/1400 (standart: Claude + ElevenLabs)
  } finally {
    s.close();
  }
});
