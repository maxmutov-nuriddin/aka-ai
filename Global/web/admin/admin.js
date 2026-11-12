// Support paneli: holat, bo'limlar (Umumiy / Foydalanuvchilar / Sozlamalar), ma'lumot yuklash.
// Server: server/admin/routes.js (/api/admin/*). Faqat support (SUPPORT_EMAILS) ochadi.
import { $, LLMS, PROVIDERS, api, initials, toast } from "./lib.js";
import { renderOverview, wireOverview } from "./overview.js";
import { closeDrawer, initUsers, openDrawer, renderUsers } from "./users.js";
import { initSettings, renderSettings } from "./settings.js";

const VIEWS = {
  overview: { title: "Umumiy", sub: "Bugungi holat va oxirgi 30 kun" },
  users: { title: "Foydalanuvchilar", sub: "Tarif, sarf va hisobni boshqarish" },
  settings: { title: "Sozlamalar", sub: "Hamma uchun umumiy sozlamalar va tariflar" },
};

/** Panel holati — barcha bo'limlar shu yerdan o'qiydi. */
const state = {
  me: null,
  users: [],
  stats: null,
  settings: null,
  view: "overview",
  metric: "minutes",
  query: "",
  filter: "all",
  sort: { key: "last", dir: "desc" },
  openUserId: null,
};

const ctx = {
  state,
  reload: () => loadData(),
  openUser: (id) => {
    showView("users");
    openDrawer(ctx, id);
  },
};

function renderAll() {
  if (!state.stats) return;
  renderOverview(ctx);
  renderUsers(ctx);
  renderSettings(ctx);
  $("navUsersCount").textContent = state.users.length || "";
  const s = state.settings;
  $("providerChip").querySelector("span").textContent = s ? `${LLMS[s.llmProvider] ?? "—"} · ${PROVIDERS[s.ttsProvider] ?? "—"}` : "—";
}

function showView(view) {
  const next = VIEWS[view] ? view : "overview";
  state.view = next;
  for (const el of document.querySelectorAll(".view")) el.hidden = el.dataset.view !== next;
  for (const b of document.querySelectorAll("[data-nav]")) b.setAttribute("aria-current", String(b.dataset.nav === next));
  $("viewTitle").textContent = VIEWS[next].title;
  $("viewSub").textContent = VIEWS[next].sub;
  if (location.hash !== `#${next}`) history.replaceState(null, "", `#${next}`);
  if (next !== "users") closeDrawer(ctx);
}

async function loadData() {
  const btn = $("refreshBtn");
  btn.classList.add("is-loading");
  try {
    const [users, stats, settings] = await Promise.all([api("/api/admin/users"), api("/api/admin/stats"), api("/api/admin/settings")]);
    state.users = users.users;
    state.stats = stats;
    state.settings = settings;
    renderAll();
    $("updatedAt").textContent = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.classList.remove("is-loading");
  }
}

async function loadMe() {
  const { user } = await api("/api/auth/me");
  state.me = user;
  $("meAvatar").textContent = initials(user.name);
  $("meName").textContent = user.name;
  $("meEmail").textContent = user.email;
}

// ---------- Hodisalar ----------
for (const b of document.querySelectorAll("[data-nav]")) b.addEventListener("click", () => showView(b.dataset.nav));
window.addEventListener("hashchange", () => showView(location.hash.slice(1)));
$("refreshBtn").addEventListener("click", async () => {
  await loadData();
  toast("Ma'lumotlar yangilandi");
});
$("logoutBtn").addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } finally {
    location.href = "/login";
  }
});
for (const b of document.querySelectorAll("[data-metric]")) {
  b.addEventListener("click", () => {
    state.metric = b.dataset.metric;
    for (const x of document.querySelectorAll("[data-metric]")) x.setAttribute("aria-pressed", String(x === b));
    renderOverview(ctx);
  });
}

wireOverview(ctx);
initUsers(ctx);
initSettings(ctx);
showView(location.hash.slice(1) || "overview");
loadMe()
  .then(loadData)
  .catch((err) => toast(err.message, true));
