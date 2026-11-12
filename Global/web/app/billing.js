// Obuna va to'lov oynasi (PayGate): sozlamalardagi "Obuna" qatori va to'lov dialogi.
// 1-qadamda tanlov: oylik tarif (konstruktor) yoki bir martalik "Suhbatga tayyorgarlik" paketi.
// O'quvchi kartaga aniq summani o'tkazadi; holat har 5 soniyada so'raladi — tushishi bilan obuna ochiladi.
import { getLang, t } from "./i18n.js";
import { createPlanBuilder } from "../shared/plan-builder.js";
import { PACKAGES } from "../shared/plan-pricing.js";

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
  let mode = "plan"; // "plan" — oylik tarif, "package" — suhbat paketi
  let selectedPackage = "start";

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
      row.hidden = !s.configured || (!s.paywall && !s.paid && !s.package);
      if (row.hidden) return s;
      if (s.package) {
        $("billingStatus").textContent = t("pay.packageLeft").replace("{n}", s.package.remaining).replace("{date}", formatDate(s.package.until));
        $("billingStatus").classList.remove("is-warn");
        return s;
      }
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
        $("payState").textContent = p.package ? t("pay.packageSuccess") : t("pay.success").replace("{date}", formatDate(p.paidUntil));
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

  /** Paket kartalari (Start / Pro): bittasi tanlanadi. */
  function renderPackages() {
    const fmt = (key, n) => t(key).replace("{n}", n);
    const cards = Object.entries(PACKAGES).map(([key, p]) => `
      <button type="button" class="pay-package" role="radio" data-package="${key}" aria-checked="${key === selectedPackage}">
        <strong>${t(`pay.package${key[0].toUpperCase()}${key.slice(1)}`)}</strong>
        <span class="price">${priceFmt.format(p.price)} ${t("pay.som")}</span>
        <small>${fmt("pay.packageMinutes", p.minutes)} · ${fmt("pay.packageDays", p.days)}</small>
      </button>`).join("");
    // Matnlar — i18n lug'atidan (statik), narxlar — PACKAGES'dan: foydalanuvchi kiritgan ma'lumot yo'q.
    $("payPackages").innerHTML = `<p class="intro">${t("pay.packageIntro")}</p>
      <div role="radiogroup" class="pay-packages">${cards}</div>
      <p class="features">${t("pay.packageFeatures")}</p>`;
  }

  /** Oylik tarif yoki paket ko'rinishi. */
  function setMode(next) {
    mode = next;
    $("payTabPlan").setAttribute("aria-pressed", String(mode === "plan"));
    $("payTabPackage").setAttribute("aria-pressed", String(mode === "package"));
    $("payPlan").hidden = mode !== "plan";
    $("payPackages").hidden = mode !== "package";
    if (mode === "package") renderPackages();
  }

  /** To'lov oynasi: 1-qadam — reja (tayyor tarif yoki konstruktor) yoki paket. */
  function open() {
    const dialog = $("payDialog");
    stop();
    $("payDetails").hidden = true;
    $("payRetry").hidden = true;
    $("payState").classList.remove("is-ok");
    $("payState").textContent = "";
    $("payPlanStep").hidden = false;
    builder = createPlanBuilder($("payPlan"), { lang: getLang(), initial: initialPlan() });
    // Kunlik daqiqa — tarif kartasi va haqiqiy limit bilan bir xil (joriy miya + ovoz juftligi).
    fetch(`${apiBase()}/api/tariffs`, { cache: "no-cache" }).then((r) => r.json()).then((d) => builder?.setRate(d.minutesPerSom)).catch(() => {});
    setMode(mode);
    if (!dialog.open) dialog.showModal();
  }

  /** 2-qadam: tanlangan reja yoki paket bo'yicha to'lov (kutilayotgani bo'lsa — o'shani ko'rsatadi). */
  async function pay() {
    // Konstruktor o'zi paketni ham yig'adi ("Suhbatga tayyorgarlik" tanlansa) — getPurchase shuni qaytaradi.
    const purchase = mode === "package" ? { package: selectedPackage } : builder.getPurchase();
    $("payPlanStep").hidden = true;
    $("payRetry").hidden = true;
    $("payState").textContent = t("pay.creating");
    try {
      const res = await fetch(`${apiBase()}/api/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(purchase),
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
  $("payTabPlan").addEventListener("click", () => setMode("plan"));
  $("payTabPackage").addEventListener("click", () => setMode("package"));
  $("payPackages").addEventListener("click", (e) => {
    const card = e.target.closest("[data-package]");
    if (!card) return;
    selectedPackage = card.dataset.package;
    renderPackages();
  });
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
