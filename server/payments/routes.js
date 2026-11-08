// /api/payments, /api/subscription: obuna to'lovi (PayGate). Callback — ochiq, lekin MD5 imzo bilan himoyalangan.
import express from "express";
import { randomBytes } from "node:crypto";
import { requireUser } from "../auth/session.js";
import { normalizePlan, planPrice, standardPlan, tariffOf } from "../usage/tariffs.js";

const DEFAULT_TRIAL_DAYS = 3;

/**
 * @param {{ paygate: ReturnType<import("./paygate.js").createPaygate>,
 *           payments: ReturnType<import("./store.js").createPaymentStore>,
 *           env: Record<string, string | undefined>, limiter: import("express").RequestHandler }} options
 */
export function createPaymentRouter({ paygate, payments, env, limiter }) {
  const router = express.Router();
  const trialSetting = Number(env.TRIAL_DAYS);
  const trialDays = env.TRIAL_DAYS != null && env.TRIAL_DAYS !== "" && Number.isFinite(trialSetting) ? trialSetting : DEFAULT_TRIAL_DAYS;
  const paywall = env.PAYWALL === "1";
  // Callback manzili: server internetdan ko'rinsa (PUBLIC_URL) — PayGate o'zi xabar beradi; aks holda holat so'rab turiladi.
  const completeUrl = env.PUBLIC_URL?.trim() ? `${env.PUBLIC_URL.trim().replace(/\/+$/, "")}/api/payments/callback` : undefined;

  const view = (p) => ({
    paymentId: p.payment_id,
    amount: p.amount,
    card: p.card,
    cardHolder: p.card_holder,
    expireAt: p.expire_at,
    status: p.status,
    goal: p.goal,
    plan: p.plan ? JSON.parse(p.plan) : null,
  });

  /** To'lov tasdiqlansa — obuna; bekor bo'lsa — belgilanadi. */
  function apply(paymentId, status, amount) {
    if (status === "paid") return payments.markPaid(paymentId, amount);
    if (status === "cancel") payments.markCancelled(paymentId);
    return false;
  }

  /** Callback kelmagan to'lovlarni PayGate'dan qayta so'raydi (oyna yopilgan, server internetdan ko'rinmaydi). */
  async function reconcile(userId) {
    for (const p of payments.recentPending(userId)) {
      try {
        const remote = await paygate.status(p.payment_id);
        apply(p.payment_id, remote.status, remote.amount ?? p.amount);
      } catch (err) {
        console.warn("[payments] holatni tekshirib bo'lmadi:", err.message);
      }
    }
  }

  router.get("/subscription", requireUser, async (req, res) => {
    if (paygate.configured) await reconcile(req.user.id);
    const access = payments.access(req.user.id, trialDays);
    res.json({ paywall, ...access, tariff: tariffOf(req.user.profile?.goal, req.user.plan), configured: paygate.configured });
  });

  // Yangi to'lov: reja (konstruktor) yoki o'quvchining tayyor tarifi narxida.
  // Xuddi shu rejaga kutilayotgan (muddati o'tmagan) to'lov bo'lsa — o'sha qaytariladi.
  router.post("/payments", requireUser, limiter, async (req, res) => {
    if (!paygate.configured) return res.status(503).json({ error: "To'lov hozircha ulanmagan.", code: "payments_off" });
    const requested = req.body?.plan;
    const plan = requested === undefined ? standardPlan(req.user.profile?.goal) : normalizePlan(requested);
    if (!plan) return res.status(400).json({ error: "Reja noto'g'ri: yo'nalishlar va 5–30 daqiqa kerak.", code: "invalid" });
    const amount = planPrice(plan.goals, plan.minutes);
    const pending = payments.pendingFor(req.user.id);
    if (pending && pending.plan === JSON.stringify(plan)) return res.json(view(pending));
    const orderId = `JIGAR_${req.user.id}_${randomBytes(6).toString("hex")}`;
    const tariff = { goal: plan.goals[0], price: amount };
    try {
      const p = await paygate.create({ amount, orderId, completeUrl });
      const saved = payments.create({
        paymentId: String(p.payment_id),
        orderId,
        userId: req.user.id,
        goal: tariff.goal,
        amount: Number(p.amount) || tariff.price,
        card: p.card,
        cardHolder: p.card_holder,
        expireAt: Number(p.expire_at) || Math.floor(Date.now() / 1000) + (Number(p.expires_in) || 300),
        plan,
      });
      res.status(201).json(view(saved));
    } catch (err) {
      console.error("[/api/payments]", err.message);
      res.status(502).json({ error: "To'lovni yaratib bo'lmadi. Birozdan keyin qayta urinib ko'ring.", code: "payments_failed" });
    }
  });

  // PayGate callback (form-data). Imzo noto'g'ri — 403; to'g'ri — holat qo'llanadi (takror kelsa — ta'sirsiz).
  router.post("/payments/callback", express.urlencoded({ extended: false }), (req, res) => {
    const body = req.body ?? {};
    if (!paygate.verifySign(body)) return res.status(403).send("Noto'g'ri imzo");
    const paymentId = String(body.payment_id);
    if (!payments.byId(paymentId)) return res.status(404).send("To'lov topilmadi");
    if (body.status === "paid" && !apply(paymentId, "paid", body.amount)) {
      console.warn(`[/api/payments/callback] tasdiqlanmadi: ${paymentId} (allaqachon yoki summa kam: ${body.amount})`);
    } else if (body.status === "cancel") {
      apply(paymentId, "cancel");
    }
    res.send("OK");
  });

  // Holat: kutilayotgan bo'lsa — PayGate'dan so'raladi (callback kelmasa ham tasdiqlanadi).
  router.get("/payments/:id", requireUser, async (req, res) => {
    const payment = payments.byId(req.params.id);
    if (!payment || payment.user_id !== req.user.id) return res.status(404).json({ error: "To'lov topilmadi.", code: "not_found" });
    if (payment.status === "pending") {
      try {
        const remote = await paygate.status(payment.payment_id);
        apply(payment.payment_id, remote.status, remote.amount ?? payment.amount);
      } catch (err) {
        console.warn("[/api/payments/:id]", err.message); // keyingi so'rovda qayta tekshiriladi
      }
    }
    const fresh = payments.byId(payment.payment_id);
    res.json({ ...view(fresh), paidUntil: payments.access(req.user.id, trialDays).paidUntil });
  });

  /** Chat uchun: paywall yoqilgan va obuna/sinov yo'q bo'lsa — false (support — har doim ruxsat). */
  const canUse = (user) => !paywall || user.role === "support" || payments.access(user.id, trialDays).active;

  return { router, canUse, reconcile };
}
