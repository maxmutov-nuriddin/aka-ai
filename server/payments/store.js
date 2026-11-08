// To'lovlar va obuna (repository). Obuna — users.paid_until (ISO vaqt); har to'lov +30 kun.
// Bir to'lov faqat bir marta hisoblanadi: holat "pending" -> "paid" o'tishi tranzaksiyada.

export const SUBSCRIPTION_DAYS = 30;
const DAY_MS = 86_400_000;

/**
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {{ now?: () => Date }} [options]
 */
export function createPaymentStore(db, { now = () => new Date() } = {}) {
  const q = {
    insert: db.prepare(
      `INSERT INTO payments (payment_id, order_id, user_id, goal, amount, card, card_holder, expire_at, plan)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    byId: db.prepare("SELECT * FROM payments WHERE payment_id = ?"),
    pendingFor: db.prepare(
      "SELECT * FROM payments WHERE user_id = ? AND status = 'pending' AND expire_at > ? ORDER BY created_at DESC LIMIT 1",
    ),
    markPaid: db.prepare("UPDATE payments SET status = 'paid', paid_at = ? WHERE payment_id = ? AND status = 'pending'"),
    markCancelled: db.prepare("UPDATE payments SET status = 'cancel' WHERE payment_id = ? AND status = 'pending'"),
    // Oxirgi kutilayotgan to'lovlar (muddati o'tganlari ham): o'quvchi pul o'tkazib, oynani yopgan bo'lishi mumkin.
    recentPending: db.prepare(
      "SELECT payment_id, amount FROM payments WHERE user_id = ? AND status = 'pending' AND expire_at > ? ORDER BY created_at DESC LIMIT 5",
    ),
    expire: db.prepare("UPDATE payments SET expire_at = ? WHERE payment_id = ?"),
    user: db.prepare("SELECT created_at, paid_until FROM users WHERE id = ?"),
    setPaidUntil: db.prepare("UPDATE users SET paid_until = ?, plan = COALESCE(?, plan) WHERE id = ?"),
  };
  const nowSec = () => Math.floor(now().getTime() / 1000);

  function create({ paymentId, orderId, userId, goal, amount, card, cardHolder, expireAt, plan = null }) {
    q.insert.run(paymentId, orderId, userId, goal, amount, card ?? null, cardHolder ?? null, expireAt, plan ? JSON.stringify(plan) : null);
    return q.byId.get(paymentId);
  }

  /** Foydalanuvchining hali tugamagan kutilayotgan to'lovi (yangi karta so'rovi yaratmaslik uchun). */
  const pendingFor = (userId) => q.pendingFor.get(userId, nowSec()) ?? null;
  const byId = (paymentId) => q.byId.get(paymentId) ?? null;

  /**
   * To'lovni tasdiqlaydi va obunani uzaytiradi (faqat birinchi marta; to'langan summa kutilganidan kam bo'lmasin).
   * Qaytaradi: true — hozir tasdiqlandi, false — allaqachon tasdiqlangan, topilmadi yoki summa kam.
   */
  function markPaid(paymentId, paidAmount) {
    const payment = q.byId.get(paymentId);
    if (!payment || payment.status !== "pending" || Number(paidAmount) < payment.amount) return false;
    db.exec("BEGIN");
    try {
      if (q.markPaid.run(now().toISOString(), paymentId).changes === 0) {
        db.exec("ROLLBACK");
        return false;
      }
      const current = Date.parse(q.user.get(payment.user_id)?.paid_until ?? "") || 0;
      const from = Math.max(current, now().getTime());
      // To'langan reja (konstruktor yoki tayyor tarif) o'quvchiga o'tadi — limit va Jigar doirasi shundan.
      q.setPaidUntil.run(new Date(from + SUBSCRIPTION_DAYS * DAY_MS).toISOString(), payment.plan ?? null, payment.user_id);
      db.exec("COMMIT");
      return true;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }

  const markCancelled = (paymentId) => q.markCancelled.run(paymentId).changes > 0;
  /** Oxirgi N soatdagi tasdiqlanmagan to'lovlar (muddati o'tgan bo'lsa ham) — qayta tekshirish uchun. */
  const recentPending = (userId, hours = 24) => q.recentPending.all(userId, nowSec() - hours * 3600);
  /** Faqat testlar uchun: to'lov muddatini o'tgan qilib qo'yadi. */
  const expireForTest = (paymentId) => q.expire.run(nowSec() - 1, paymentId);

  /** Obuna holati: to'langan muddat yoki ro'yxatdan o'tgandan keyingi bepul sinov. */
  function access(userId, trialDays) {
    const row = q.user.get(userId);
    const paidUntil = row?.paid_until ?? null;
    const created = Date.parse(`${String(row?.created_at ?? "").replace(" ", "T")}Z`) || now().getTime();
    const trialEndsAt = new Date(created + trialDays * DAY_MS).toISOString();
    const t = now().getTime();
    const paid = Boolean(paidUntil && Date.parse(paidUntil) > t);
    const trial = !paid && t < Date.parse(trialEndsAt);
    return { active: paid || trial, paid, trial, paidUntil, trialEndsAt };
  }

  return { create, pendingFor, byId, markPaid, markCancelled, recentPending, expireForTest, access };
}
