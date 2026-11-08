// Obuna va to'lov oynasi (PayGate): sozlamalardagi "Obuna" qatori va to'lov dialogi.
// O'quvchi kartaga aniq summani o'tkazadi; holat har 5 soniyada so'raladi — tushishi bilan obuna ochiladi.
import { getLang, t } from "./i18n.js";
import { createPlanBuilder } from "../shared/plan-builder.js";

const PLAN_KEY = "jigar.plan"; // landing konstruktorida yig'ilgan reja

const POLL_MS = 5000;
const priceFmt = new Intl.NumberFormat("ru-RU");
const $ = (id) => document.getElementById(id);
const formatDate = (iso) => new Date(iso).toLocaleDateString("ru-RU");
const daysLeft = (iso) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));

/**
 * @param {{ apiBase: () => string, authHeaders: () => Record<string, string> }} deps
 */
export function createBilling({ apiBase, authHeaders }) {
  let pollTimer = 0;
  let tickTimer = 0;
  let current = null; // joriy to'lov
  let builder = null;
  let tariff = null; // o'quvchining hozirgi tarifi (/api/subscription)

  async function request(path, method = "GET") {
    const res = await fetch(`${apiBase()}${path}`, { method, headers: { "Content-Type": "application/json", ...authHeaders() } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.code === "payments_off" ? t("pay.off") : t("pay.failed"));
    return data;
  }

  /** Sozlamalardagi "Obuna" qatori: holat matni; paywall o'chiq va obuna yo'q bo'lsa — qator yashirin. */
  async function refresh() {
    try {
      const s = await request("/api/subscription");
      tariff = s.tariff;
      const row = $("billingRow");
      row.hidden = !s.configured || (!s.paywall && !s.paid);
      if (row.hidden) return s;
      $("billingStatus").textContent = s.paid
        ? t("pay.activeUntil").replace("{date}", formatDate(s.paidUntil))
        : s.trial
          ? t("pay.trialLeft").replace("{n}", daysLeft(s.trialEndsAt))
          : t("pay.inactive");
      $("billingStatus").classList.toggle("is-warn", !s.paid);
      return s;
    } catch {
      return null; // tarmoq yo'q — qator avvalgi holatda qoladi
    }
  }

  function stop() {
    clearTimeout(pollTimer);
    clearInterval(tickTimer);
  }

  function renderTimer() {
    const left = Math.max(0, current.expireAt - Math.floor(Date.now() / 1000));
    $("payTimer").textContent = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
    if (left === 0) {
      stop();
      $("payState").textContent = t("pay.expired");
      $("payRetry").hidden = false;
    }
  }

  async function poll() {
    try {
      const p = await request(`/api/payments/${encodeURIComponent(current.paymentId)}`);
      if (p.status === "paid") {
        stop();
        $("payDetails").hidden = true;
        $("payState").textContent = t("pay.success").replace("{date}", formatDate(p.paidUntil));
        $("payState").classList.add("is-ok");
        refresh();
        return;
      }
      if (p.status === "cancel") {
        stop();
        $("payState").textContent = t("pay.expired");
        $("payRetry").hidden = false;
        return;
      }
    } catch {
      /* tarmoq uzilsa — keyingi urinishda */
    }
    pollTimer = setTimeout(poll, POLL_MS);
  }

  /** Boshlang'ich reja: landing konstruktori -> o'quvchining hozirgi tarifi -> standart. */
  function initialPlan() {
    try {
      const saved = JSON.parse(localStorage.getItem(PLAN_KEY) || "null");
      if (saved?.goals?.length) return saved;
    } catch {
      /* buzilgan qiymat — e'tiborsiz */
    }
    return tariff ? { goals: tariff.goals ?? [tariff.goal], minutes: tariff.minutes } : undefined;
  }

  /** To'lov oynasi: 1-qadam — reja (tayyor tarif yoki konstruktor). */
  function open() {
    const dialog = $("payDialog");
    stop();
    $("payDetails").hidden = true;
    $("payRetry").hidden = true;
    $("payState").classList.remove("is-ok");
    $("payState").textContent = "";
    $("payPlanStep").hidden = false;
    builder = createPlanBuilder($("payPlan"), { lang: getLang(), initial: initialPlan() });
    if (!dialog.open) dialog.showModal();
  }

  /** 2-qadam: tanlangan reja bo'yicha to'lov (kutilayotgani bo'lsa — o'shani ko'rsatadi). */
  async function pay() {
    const plan = builder.getPlan();
    $("payPlanStep").hidden = true;
    $("payRetry").hidden = true;
    $("payState").textContent = t("pay.creating");
    try {
      const res = await fetch(`${apiBase()}/api/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.code === "payments_off" ? t("pay.off") : t("pay.failed"));
      current = data;
      $("payAmount").textContent = `${priceFmt.format(current.amount)} ${t("pay.som")}`;
      $("payCard").textContent = String(current.card ?? "").replace(/(\d{4})(?=\d)/g, "$1 ");
      $("payHolder").textContent = current.cardHolder ?? "";
      $("payDetails").hidden = false;
      $("payState").textContent = t("pay.waiting");
      renderTimer();
      tickTimer = setInterval(renderTimer, 1000);
      pollTimer = setTimeout(poll, POLL_MS);
    } catch (err) {
      $("payState").textContent = err.message;
      $("payRetry").hidden = false;
    }
  }

  const copy = (buttonId, value) => async () => {
    try {
      await navigator.clipboard.writeText(String(value() ?? ""));
      $(buttonId).textContent = t("pay.copied");
    } catch {
      /* clipboard ruxsati yo'q — qiymat ekranda ko'rinib turibdi */
    }
  };

  $("payBtn").addEventListener("click", open);
  $("payRetry").addEventListener("click", open);
  $("payContinue").addEventListener("click", pay);
  $("payClose").addEventListener("click", () => {
    stop();
    $("payDialog").close();
  });
  $("payCopy").addEventListener("click", copy("payCopy", () => current?.card));
  $("payAmountCopy").addEventListener("click", copy("payAmountCopy", () => current?.amount));

  return { refresh, open };
}
