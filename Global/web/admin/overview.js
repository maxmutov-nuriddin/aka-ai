// Support paneli — "Umumiy" bo'limi: ko'rsatkichlar, 30 kunlik grafik, tariflar, e'tibor ro'yxatlari.
import { $, GOALS, esc, initials, num, som } from "./lib.js";

const NEW_USER_DAYS = 7;
const TOP_COUNT = 5;
const GRID_LINES = 4;
const AXIS_EVERY = 6; // har nechanchi kun sanasi pastda yoziladi
const DAY_MS = 86_400_000;

const isCustomer = (u) => u.role !== "support";
const limitReached = (u) => u.limitMinutes != null && u.usedMinutes >= u.limitMinutes;

/** "+3 kechaga nisbatan" — o'sish yashil, kamayish qizil. */
function delta(el, today, yesterday, unit = "") {
  const diff = Math.round((today - yesterday) * 10) / 10;
  el.className = diff > 0 ? "up" : diff < 0 ? "down" : "";
  el.textContent = diff === 0 ? "kechagidek" : `${diff > 0 ? "+" : "−"}${num(Math.abs(diff))}${unit} kechaga nisbatan`;
}

function renderKpis({ state }) {
  const { stats, users } = state;
  const today = stats.days.at(-1);
  const yesterday = stats.days.at(-2) ?? { users: 0, minutes: 0 };
  const since = Date.now() - NEW_USER_DAYS * DAY_MS;
  const fresh = users.filter((u) => u.createdAt && Date.parse(`${u.createdAt.replace(" ", "T")}Z`) >= since).length;
  const blocked = users.filter((u) => u.blocked).length;

  $("kpiUsers").textContent = num(stats.users);
  $("kpiUsersSub").textContent = `+${fresh} oxirgi ${NEW_USER_DAYS} kunda${blocked ? ` · ${blocked} bloklangan` : ""}`;
  $("kpiActive").textContent = num(stats.activeToday);
  delta($("kpiActiveSub"), today.users, yesterday.users);
  $("kpiMinutes").textContent = num(stats.minutesToday);
  delta($("kpiMinutesSub"), today.minutes, yesterday.minutes, " daq");
  const perMinute = stats.costPerMinuteSom ?? 0; // joriy juftlik: miya + ovoz
  const month = stats.days.reduce((sum, d) => sum + d.minutes, 0) * perMinute;
  $("kpiCost").textContent = som(stats.costTodaySom);
  $("kpiCostSub").textContent = `30 kunda ${som(month)} · ~${num(perMinute)}/daq`;
}

/** Y o'qi uchun "chiroyli" yuqori chegara: 1, 2, 5, 10, 20, 50… */
function niceMax(value) {
  if (value <= 0) return GRID_LINES;
  const step = 10 ** Math.floor(Math.log10(value));
  const nice = [1, 2, 5, 10].map((m) => m * step).find((m) => m >= value);
  return Math.max(GRID_LINES, Math.ceil(nice / GRID_LINES) * GRID_LINES);
}

function renderChart({ state }) {
  const { days } = state.stats;
  const key = state.metric;
  const max = niceMax(Math.max(...days.map((d) => d[key])));
  const total = days.reduce((sum, d) => sum + d[key], 0);

  $("chartGrid").innerHTML = Array.from({ length: GRID_LINES + 1 }, (_, i) => {
    const value = (max / GRID_LINES) * (GRID_LINES - i);
    return `<div class="grid-line"><span>${num(value)}</span></div>`;
  }).join("");
  $("chartBars").innerHTML = days
    .map((d, i) => {
      const pct = (d[key] / max) * 100;
      return `<button type="button" class="bar${d[key] ? "" : " is-zero"}${i === days.length - 1 ? " is-today" : ""}" data-i="${i}"
        aria-label="${d.day}: ${num(d.minutes)} daqiqa, ${d.users} faol"><i style="height:${pct.toFixed(1)}%"></i></button>`;
    })
    .join("");
  $("chartAxis").innerHTML = days
    .map((d, i) => (i % AXIS_EVERY === 0 || i === days.length - 1 ? `<span style="left:${((i + 0.5) / days.length) * 100}%">${d.day.slice(8)}.${d.day.slice(5, 7)}</span>` : ""))
    .join("");
  $("chartSub").textContent = key === "minutes" ? `30 kunda jami ${num(total)} daqiqa` : `30 kunda ${num(total)} faol kun (foydalanuvchi × kun)`;
}

function showTip(state, bar) {
  const tip = $("chartTip");
  if (!bar) {
    tip.hidden = true;
    return;
  }
  const d = state.stats.days[Number(bar.dataset.i)];
  tip.innerHTML = `<strong>${d.day}</strong><span>${num(d.minutes)} daqiqa</span><span>${d.users} faol</span>`;
  tip.hidden = false;
  const chart = $("chart").getBoundingClientRect();
  const rect = bar.getBoundingClientRect();
  const x = Math.min(Math.max(rect.left - chart.left + rect.width / 2, 60), chart.width - 60);
  tip.style.left = `${x}px`;
}

function renderTariffs({ state }) {
  const paying = state.users.filter((u) => isCustomer(u) && !u.blocked);
  const counts = Object.fromEntries(Object.keys(GOALS).map((g) => [g, 0]));
  for (const u of paying) counts[u.tariff.goal] = (counts[u.tariff.goal] ?? 0) + 1;
  const max = Math.max(1, ...Object.values(counts));
  const prices = Object.fromEntries((state.stats.tariffs ?? []).map((t) => [t.goal, t.price]));
  $("mrr").textContent = som(paying.reduce((sum, u) => sum + u.tariff.price, 0));
  $("tariffDist").innerHTML = Object.entries(counts)
    .map(
      ([goal, count]) => `<li>
        <div class="dist-label"><span class="tariff-dot" data-goal="${goal}"></span>${GOALS[goal]}<small>${som(prices[goal] ?? 0)}</small></div>
        <div class="dist-bar"><i data-goal="${goal}" style="width:${(count / max) * 100}%"></i></div>
        <b>${count}</b>
      </li>`,
    )
    .join("");
}

const personRow = (u, right) => `<li><button type="button" class="list-item" data-user="${u.id}">
  <span class="avatar-sm" data-persona="${esc(u.profile?.persona ?? "neytral")}">${esc(initials(u.name))}</span>
  <span class="list-text"><strong>${esc(u.name)}</strong><small>${esc(u.email)}</small></span>
  ${right}
</button></li>`;

function renderLists({ state }) {
  const attention = state.users.filter((u) => u.blocked || limitReached(u));
  $("attentionList").innerHTML = attention.length
    ? attention
        .map((u) => personRow(u, u.blocked ? `<span class="pill pill-danger">Bloklangan</span>` : `<span class="pill pill-warn">Limit tugagan</span>`))
        .join("")
    : `<li class="list-empty">Hammasi joyida — limiti tugagan yoki bloklangan foydalanuvchi yo'q.</li>`;

  const top = state.users.filter((u) => u.usedMinutes > 0).sort((a, b) => b.usedMinutes - a.usedMinutes).slice(0, TOP_COUNT);
  $("topList").innerHTML = top.length
    ? top.map((u) => personRow(u, `<span class="list-num">${num(u.usedMinutes)}<small> daq</small></span>`)).join("")
    : `<li class="list-empty">Bugun hali hech kim gaplashmadi.</li>`;
}

export function renderOverview(ctx) {
  if (!ctx.state.stats) return;
  renderKpis(ctx);
  renderChart(ctx);
  renderTariffs(ctx);
  renderLists(ctx);
}

// Grafik ustida ko'rsatma va ro'yxatdan foydalanuvchini ochish (bir marta ulanadi).
let wired = false;
export function wireOverview(ctx) {
  if (wired) return;
  wired = true;
  const bars = $("chartBars");
  bars.addEventListener("pointerover", (e) => showTip(ctx.state, e.target.closest(".bar")));
  bars.addEventListener("focusin", (e) => showTip(ctx.state, e.target.closest(".bar")));
  bars.addEventListener("pointerleave", () => showTip(ctx.state, null));
  bars.addEventListener("focusout", () => showTip(ctx.state, null));
  for (const id of ["attentionList", "topList"]) {
    $(id).addEventListener("click", (e) => {
      const item = e.target.closest("[data-user]");
      if (item) ctx.openUser(Number(item.dataset.user));
    });
  }
}
