// PayGate — to'lov shlyuzi (karta orqali: Payme / Click / Humo). Kalitlar faqat serverda (.env).
// Oqim: /payment/create -> mijoz kartaga aniq summani o'tkazadi -> PayGate callback yuboradi yoki /payment/status.
import { createHash, timingSafeEqual } from "node:crypto";

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * @param {{ env?: Record<string, string | undefined>, fetchImpl?: typeof fetch }} [options]
 */
export function createPaygate({ env = process.env, fetchImpl = fetch } = {}) {
  const base = env.PAYGATE_URL?.trim().replace(/\/+$/, "");
  const shopId = env.PAYGATE_SHOP_ID?.trim();
  const shopKey = env.PAYGATE_SHOP_KEY?.trim();
  const configured = Boolean(base && shopId && shopKey && /^https:\/\//.test(base));

  async function json(res, label) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) throw new Error(`PayGate ${label} ${res.status}: ${String(data?.error ?? "").slice(0, 200)}`);
    return data;
  }

  /** To'lov yaratadi. Qaytaradi: { payment_id, amount (aniq summa), card, card_holder, expires_in, expire_at }. */
  async function create({ amount, orderId, completeUrl }) {
    if (!configured) throw new Error("PayGate sozlanmagan (PAYGATE_URL, PAYGATE_SHOP_ID, PAYGATE_SHOP_KEY)");
    const body = new URLSearchParams({ shop_id: shopId, shop_key: shopKey, amount: String(amount), order_id: orderId });
    if (completeUrl) body.set("complete_url", completeUrl);
    const res = await fetchImpl(`${base}/payment/create`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return json(res, "create");
  }

  /** To'lov holati: { status: "pending" | "paid" | "cancel", amount, ... }. */
  async function status(paymentId) {
    const query = new URLSearchParams({ shop_id: shopId, shop_key: shopKey, payment_id: paymentId });
    const res = await fetchImpl(`${base}/payment/status?${query}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    return json(res, "status");
  }

  /** Callback imzosi: md5(shop_id + payment_id + amount + shop_key) — soxta tasdiqlardan himoya. */
  function verifySign({ shop_id: shop, payment_id: paymentId, amount, sign }) {
    if (!configured || shop !== shopId || typeof sign !== "string") return false;
    const expected = createHash("md5").update(`${shopId}${paymentId}${amount}${shopKey}`).digest("hex");
    return sign.length === expected.length && timingSafeEqual(Buffer.from(sign), Buffer.from(expected));
  }

  return { configured, create, status, verifySign };
}
