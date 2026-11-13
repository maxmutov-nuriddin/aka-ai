// Kompyuter amallari va Jigarning o'z tashabbusi (klient tomoni):
//  - tasdiq kartasi: Jigar buyruq bajarish yoki fayl yozishdan oldin "Ha / Yo'q" so'raydi (POST /api/actions/:id);
//  - nudge'lar: Jigar o'zi aytgan gaplar (ekranga qarab maslahat, ertalabki/kechki xulosa) — GET /api/nudges.
// Barcha matnlar textContent bilan qo'yiladi (serverdan kelgan matn HTML sifatida talqin qilinmaydi).

const NUDGE_POLL_MS = 30_000;

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

/**
 * Tasdiq kartasi. Tugma bosilgach — javob serverga, karta holati yangilanadi.
 * @param {{ id: string, tool: string, reason: string, detail: string }} action
 * @param {{ post: (path: string, body: object) => Promise<Response>, t: (key: string) => string }} deps
 */
export function confirmCard(action, { post, t }) {
  const card = el("article", "msg jigar card pc-confirm");
  card.append(el("h3", null, `🔐 ${t("pc.confirmTitle")}`));
  card.append(el("p", "pc-confirm-what", t(`pc.${String(action.tool).replace(/^pc_/, "")}`)));
  if (action.reason) card.append(el("p", null, action.reason));
  if (action.detail) card.append(el("pre", "pc-confirm-detail", action.detail));
  const row = el("div", "pc-confirm-actions");
  const yes = el("button", "primary", t("pc.yes"));
  const no = el("button", "ghost", t("pc.no"));
  yes.type = "button";
  no.type = "button";
  const status = el("small", "pc-confirm-status");

  async function answer(approve) {
    yes.disabled = true;
    no.disabled = true;
    try {
      const res = await post(`/api/actions/${encodeURIComponent(action.id)}`, { approve });
      status.textContent = res.ok ? t(approve ? "pc.approved" : "pc.denied") : t("pc.expired");
    } catch {
      status.textContent = t("pc.expired");
    }
    row.replaceChildren(status);
  }
  yes.addEventListener("click", () => answer(true));
  no.addEventListener("click", () => answer(false));
  row.append(yes, no);
  card.append(row);
  return card;
}

/**
 * Nudge'larni muntazam so'raydi; har yangisini onNudge'ga beradi va "ko'rildi" deb belgilaydi.
 * @param {{ apiBase: () => string, authHeaders: () => Record<string, string>, onNudge: (n: {id:number,kind:string,text:string}) => void }} deps
 */
export function createNudgeWatcher({ apiBase, authHeaders, onNudge }) {
  let timer = null;
  const call = (path, method = "GET") => fetch(`${apiBase()}${path}`, { method, headers: authHeaders() });

  async function check() {
    let nudges = [];
    try {
      const res = await call("/api/nudges");
      if (!res.ok) return;
      ({ nudges } = await res.json());
    } catch {
      return; // tarmoq yo'q — keyingi safar
    }
    for (const nudge of nudges) {
      onNudge(nudge);
      await call(`/api/nudges/${nudge.id}/seen`, "POST").catch(() => {});
    }
  }

  return {
    start() {
      if (timer) return;
      check();
      timer = setInterval(check, NUDGE_POLL_MS);
    },
  };
}

const NUDGE_ICONS = { morning: "🌅", evening: "🌙", approval: "🔐", countdown: "⏳", alert: "⚠️", result: "✅" };

/** Nudge tugmasi: bosilgach — server, tugmalar o'rniga natija. */
function nudgeButtons(buttons, post) {
  const row = el("div", "pc-confirm-actions");
  const result = el("small", "pc-confirm-status");
  for (const { label, path, body, done, primary } of buttons) {
    const b = el("button", primary ? "primary" : "ghost", label);
    b.type = "button";
    b.addEventListener("click", async () => {
      row.querySelectorAll("button").forEach((x) => { x.disabled = true; });
      const res = await post(path, body).catch(() => null);
      result.textContent = res?.ok ? done : "Muddati o'tgan yoki allaqachon bajarilgan.";
      row.replaceChildren(result);
    });
    row.append(b);
  }
  return row;
}

/**
 * Nudge kartasi: sarlavha (turi bo'yicha), matn; ruxsat so'rovi — Ha/Yo'q, ogohlantirish — Bekor qilish.
 * @param {(path: string, body: object) => Promise<Response>} [post]
 */
export function nudgeCard(nudge, t, post) {
  const card = el("article", `msg jigar card nudge nudge-${nudge.kind}`);
  card.append(el("h3", null, `${NUDGE_ICONS[nudge.kind] ?? "💡"} ${t(`nudge.${nudge.kind}`)}`));
  card.append(el("p", null, nudge.text));
  if (post && nudge.ref && nudge.kind === "approval") {
    const path = `/api/actions/${encodeURIComponent(nudge.ref)}`;
    card.append(nudgeButtons([
      { label: t("pc.yes"), path, body: { approve: true }, done: t("pc.approved"), primary: true },
      { label: t("pc.no"), path, body: { approve: false }, done: t("pc.denied") },
    ], post));
  }
  if (post && nudge.ref && nudge.kind === "countdown") {
    card.append(nudgeButtons([{ label: "Bekor qilish", path: `/api/watches/${encodeURIComponent(nudge.ref)}/cancel`, body: {}, done: "Bekor qilindi ✓", primary: true }], post));
  }
  return card;
}

/** Kompyuter holati (Sozlamalar oynasida). */
export async function deviceStatusText({ apiBase, authHeaders, t }) {
  try {
    const res = await fetch(`${apiBase()}/api/devices`, { headers: authHeaders() });
    const { devices = [] } = await res.json();
    return devices.length ? `🖥 ${t("pc.online")}: ${devices.map((d) => d.name).join(", ")}` : `🖥 ${t("pc.offline")}`;
  } catch {
    return "";
  }
}
