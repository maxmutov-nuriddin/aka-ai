// Support paneli — "Foydalanuvchilar": filtr, saralash, jadval va tahrirlash oynasi (drawer).
import { fitLevel, levelsForGoal } from "/shared/levels.js";
import { $, GOALS, LEVELS, PERSONAS, api, confirmDialog, esc, formatDate, initials, num, relativeDay, som, toast } from "./lib.js";

const FILTERS = {
  all: { label: "Hammasi", test: () => true },
  active: { label: "Bugun faol", test: (u) => u.usedMinutes > 0 },
  limit: { label: "Limit tugagan", test: (u) => u.limitMinutes != null && u.usedMinutes >= u.limitMinutes },
  blocked: { label: "Bloklangan", test: (u) => u.blocked },
};
const SORTERS = {
  name: (u) => u.name.toLowerCase(),
  tariff: (u) => u.tariff.price,
  usage: (u) => u.usedMinutes,
  last: (u) => u.lastActiveDay ?? "",
};

const today = (state) => state.stats?.days.at(-1)?.day ?? new Date().toISOString().slice(0, 10);
const userById = (state, id) => state.users.find((u) => u.id === id);
const usagePct = (u) => (u.limitMinutes ? Math.min(100, Math.round((u.usedMinutes / u.limitMinutes) * 100)) : 0);

function matches(state, u) {
  const q = state.query;
  if (q && !`${u.name} ${u.email} #${u.id}`.toLowerCase().includes(q)) return false;
  return FILTERS[state.filter].test(u);
}

function sorted(state, list) {
  const { key, dir } = state.sort;
  const get = SORTERS[key];
  const sign = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => (get(a) > get(b) ? sign : get(a) < get(b) ? -sign : 0));
}

function statusPill(u) {
  if (u.role === "support") return `<span class="pill pill-accent">Support</span>`;
  if (u.blocked) return `<span class="pill pill-danger">Bloklangan</span>`;
  if (u.limitMinutes != null && u.usedMinutes >= u.limitMinutes) return `<span class="pill pill-warn">Limit tugagan</span>`;
  return `<span class="pill pill-ok">Faol</span>`;
}

function usageCell(u) {
  if (u.limitMinutes == null) return `<span class="usage-text">${num(u.usedMinutes)} daq</span><small class="sub">limitsiz</small>`;
  const pct = usagePct(u);
  return `<span class="usage-text">${num(u.usedMinutes)} <small>/ ${num(u.limitMinutes)} daq</small></span>
    <span class="meter sm${pct >= 100 ? " is-full" : pct >= 80 ? " is-high" : ""}"><i style="width:${pct}%"></i></span>`;
}

function rowHtml(state, u) {
  const p = u.profile ?? {};
  const persona = p.persona ?? "neytral";
  return `<tr data-id="${u.id}" tabindex="0" class="${u.blocked ? "is-blocked" : ""}${state.openUserId === u.id ? " is-open" : ""}">
    <td data-label="Foydalanuvchi"><div class="who">
      <span class="avatar-sm" data-persona="${esc(persona)}">${esc(initials(u.name))}</span>
      <span class="who-text"><strong>${esc(u.name)}</strong><small>${esc(u.email)}</small></span>
    </div></td>
    <td data-label="Tarif"><span class="tariff"><span class="tariff-dot" data-goal="${u.tariff.goal}"></span>${GOALS[u.tariff.goal]}</span><small class="sub">${som(u.tariff.price)}</small></td>
    <td data-label="Xarakter"><span class="persona" data-persona="${esc(persona)}">${PERSONAS[persona] ?? esc(persona)}</span><small class="sub">${u.role === "support" ? "Erkin · support" : LEVELS[p.level] ?? "—"}</small></td>
    <td data-label="Bugun">${usageCell(u)}</td>
    <td data-label="Oxirgi faollik"><span>${relativeDay(u.lastActiveDay, today(state))}</span></td>
    <td data-label="Holat">${statusPill(u)}</td>
    <td class="cell-chev"><svg class="i"><use href="#i-chev"/></svg></td>
  </tr>`;
}

function renderChips(state) {
  $("filterChips").innerHTML = Object.entries(FILTERS)
    .map(([key, f]) => {
      const count = state.users.filter(f.test).length;
      return `<button type="button" class="chip-btn" data-filter="${key}" aria-pressed="${state.filter === key}">${f.label}<b>${count}</b></button>`;
    })
    .join("");
}

export function renderUsers(ctx) {
  const { state } = ctx;
  renderChips(state);
  const list = sorted(state, state.users.filter((u) => matches(state, u)));
  $("usersBody").innerHTML = list.map((u) => rowHtml(state, u)).join("");
  $("usersEmpty").hidden = list.length > 0;
  for (const th of document.querySelectorAll(".th-sort")) {
    const active = th.dataset.sort === state.sort.key;
    th.classList.toggle("is-active", active);
    th.dataset.dir = active ? state.sort.dir : "";
  }
  if (state.openUserId != null) fillDrawer(ctx);
}

// ---------- Drawer ----------
let draft = null;

const pickHtml = (map, selected, name) =>
  Object.entries(map)
    .map(([value, label]) => `<button type="button" role="radio" data-${name}="${value}" aria-checked="${value === selected}"${name === "persona" ? ` data-persona-color="${value}"` : ""}>${label}</button>`)
    .join("");

const originalOf = (u) => ({ goal: u.tariff.goal, persona: u.profile?.persona ?? "neytral", level: u.profile?.level ?? "" });

/** Profil formasini qoralama (draft) bo'yicha chizadi; o'zgarish bo'lsa "Saqlash" yoqiladi. */
function renderDraft(u) {
  $("dGoal").innerHTML = Object.entries(GOALS)
    .map(([g, label]) => `<option value="${g}"${g === draft.goal ? " selected" : ""}>${label}</option>`)
    .join("");
  $("dPersona").innerHTML = pickHtml(PERSONAS, draft.persona, "persona");
  // Sinf — yo'nalishga mos (maktab darsida "talaba" yo'q, universitetda faqat "talaba").
  const allowed = levelsForGoal(draft.goal);
  const levels = Object.fromEntries(Object.entries(LEVELS).filter(([value]) => allowed.includes(value)));
  // Support — sinfsiz, erkin rejim (server: unrestricted) — sinf tanlanmaydi.
  $("dLevel").innerHTML = u.role === "support"
    ? `<button type="button" role="radio" aria-checked="true" disabled>Erkin (support)</button>`
    : pickHtml(levels, draft.level, "level");
  const original = originalOf(u);
  const dirty = Object.keys(original).some((k) => draft[k] !== original[k]);
  $("dSave").disabled = !dirty;
  $("dDirty").textContent = dirty ? "Saqlanmagan o'zgarishlar bor" : "";
}

function fillDrawer(ctx) {
  const { state } = ctx;
  const u = userById(state, state.openUserId);
  if (!u) return closeDrawer(ctx);
  const self = u.id === state.me?.id;
  const persona = u.profile?.persona ?? "neytral";
  $("dAvatar").textContent = initials(u.name);
  $("dAvatar").dataset.persona = persona;
  $("dName").textContent = u.name;
  $("dEmail").textContent = u.email;
  $("dMeta").innerHTML = [
    ["ID", `#${u.id}`],
    ["Ro'yxatdan o'tgan", formatDate(u.createdAt)],
    ["Oxirgi faollik", relativeDay(u.lastActiveDay, today(state))],
    ["Obuna", u.paidUntil && Date.parse(u.paidUntil) > Date.now() ? `${new Date(u.paidUntil).toLocaleDateString("ru-RU")} gacha` : "yo'q"],
    ["Holat", statusPill(u)],
  ]
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
    .join("");

  const pct = usagePct(u);
  $("dUsage").textContent = u.limitMinutes == null ? `${num(u.usedMinutes)} daq` : `${num(u.usedMinutes)} / ${num(u.limitMinutes)} daq`;
  $("dUsageSub").textContent = u.limitMinutes == null ? "Support — limit yo'q" : `${pct}% · ${GOALS[u.tariff.goal]} tarifi`;
  $("dMeter").style.width = `${pct}%`;
  $("dMeter").parentElement.className = `meter${pct >= 100 ? " is-full" : pct >= 80 ? " is-high" : ""}`;

  if (!draft || draft.id !== u.id) draft = { id: u.id, ...originalOf(u) };
  renderDraft(u);

  for (const row of document.querySelectorAll("[data-self-hide]")) row.hidden = self;
  $("dBlockTitle").textContent = u.blocked ? "Blokdan chiqarish" : "Bloklash";
  $("dBlockSub").textContent = u.blocked ? "Yana kira oladi va Jigardan foydalanadi" : "Darhol tizimdan chiqariladi, kira olmaydi";
  $("dBlockBtn").textContent = u.blocked ? "Blokdan chiqarish" : "Bloklash";
  document.querySelector('[data-act="reset"]').disabled = !u.usedMinutes;
}

export function openDrawer(ctx, id) {
  ctx.state.openUserId = id;
  draft = null;
  fillDrawer(ctx);
  $("drawer").classList.add("is-open");
  $("drawer").setAttribute("aria-hidden", "false");
  $("scrim").hidden = false;
  for (const tr of document.querySelectorAll("#usersBody tr")) tr.classList.toggle("is-open", Number(tr.dataset.id) === id);
  $("drawerClose").focus();
}

export function closeDrawer(ctx) {
  ctx.state.openUserId = null;
  draft = null;
  $("drawer").classList.remove("is-open");
  $("drawer").setAttribute("aria-hidden", "true");
  $("scrim").hidden = true;
  for (const tr of document.querySelectorAll("#usersBody tr.is-open")) tr.classList.remove("is-open");
}

function setDraft(ctx, patch) {
  draft = { ...draft, ...patch };
  renderDraft(userById(ctx.state, ctx.state.openUserId));
}

async function saveProfile(ctx) {
  const u = userById(ctx.state, ctx.state.openUserId);
  const { id: _id, ...fields } = draft;
  const profile = { ...(u.profile ?? {}), ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v)) };
  $("dSave").disabled = true;
  try {
    await api(`/api/admin/users/${u.id}`, { method: "PUT", body: { profile } });
    toast(`${u.name}: profil saqlandi`);
    draft = null;
    await ctx.reload();
  } catch (err) {
    toast(err.message, true);
    $("dSave").disabled = false;
  }
}

const ACTIONS = {
  async reset(u) {
    await api(`/api/admin/users/${u.id}/reset-usage`, { method: "POST" });
    return `${u.name}: bugungi limit tiklandi`;
  },
  async block(u) {
    const blocked = !u.blocked;
    if (blocked) {
      const ok = await confirmDialog({
        title: `${u.name} bloklansinmi?`,
        text: "U darhol tizimdan chiqariladi va qayta kira olmaydi. Keyin blokdan chiqarish mumkin.",
        confirmLabel: "Bloklash",
        danger: true,
      });
      if (!ok) return null;
    }
    await api(`/api/admin/users/${u.id}`, { method: "PUT", body: { blocked } });
    return blocked ? `${u.name} bloklandi` : `${u.name} blokdan chiqarildi`;
  },
  async delete(u, ctx) {
    const ok = await confirmDialog({
      title: "Hisob butunlay o'chirilsinmi?",
      text: `${u.name} (${u.email}) — profil va barcha sarf yozuvlari o'chadi. Bu amalni qaytarib bo'lmaydi.`,
      confirmLabel: "O'chirish",
      danger: true,
    });
    if (!ok) return null;
    await api(`/api/admin/users/${u.id}`, { method: "DELETE" });
    closeDrawer(ctx);
    return `${u.name} o'chirildi`;
  },
};

async function runAction(ctx, button) {
  const u = userById(ctx.state, ctx.state.openUserId);
  const action = ACTIONS[button.dataset.act];
  if (!u || !action) return;
  button.disabled = true;
  try {
    const message = await action(u, ctx);
    if (message) {
      toast(message);
      await ctx.reload();
    }
  } catch (err) {
    toast(err.message, true);
  } finally {
    button.disabled = false;
  }
}

export function initUsers(ctx) {
  const { state } = ctx;
  $("search").addEventListener("input", (e) => {
    state.query = e.target.value.trim().toLowerCase();
    renderUsers(ctx);
  });
  $("filterChips").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-filter]");
    if (!chip) return;
    state.filter = chip.dataset.filter;
    renderUsers(ctx);
  });
  for (const th of document.querySelectorAll(".th-sort")) {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      state.sort = { key, dir: state.sort.key === key && state.sort.dir === "desc" ? "asc" : "desc" };
      renderUsers(ctx);
    });
  }
  const body = $("usersBody");
  body.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (tr) openDrawer(ctx, Number(tr.dataset.id));
  });
  body.addEventListener("keydown", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (tr && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      openDrawer(ctx, Number(tr.dataset.id));
    }
  });

  $("dGoal").addEventListener("change", (e) => {
    const goal = e.target.value;
    setDraft(ctx, { goal, level: fitLevel(goal, draft.level) ?? "" }); // sinf yangi yo'nalishga moslanadi
  });
  $("dPersona").addEventListener("click", (e) => {
    const b = e.target.closest("[data-persona]");
    if (b) setDraft(ctx, { persona: b.dataset.persona });
  });
  $("dLevel").addEventListener("click", (e) => {
    const b = e.target.closest("[data-level]");
    if (b) setDraft(ctx, { level: b.dataset.level });
  });
  $("profileForm").addEventListener("submit", (e) => {
    e.preventDefault();
    saveProfile(ctx);
  });
  $("dActions").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (b) runAction(ctx, b);
  });
  $("drawerClose").addEventListener("click", () => closeDrawer(ctx));
  $("scrim").addEventListener("click", () => closeDrawer(ctx));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.openUserId != null && !$("confirmDialog").open) closeDrawer(ctx);
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName ?? "");
    if (e.key === "/" && !typing && state.view === "users") {
      e.preventDefault();
      $("search").focus();
    }
  });
}
