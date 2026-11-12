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

/** Nudge kartasi: sarlavha (turi bo'yicha) va matn. */
export function nudgeCard(nudge, t) {
  const card = el("article", `msg jigar card nudge nudge-${nudge.kind}`);
  const icon = nudge.kind === "morning" ? "🌅" : nudge.kind === "evening" ? "🌙" : "💡";
  card.append(el("h3", null, `${icon} ${t(`nudge.${nudge.kind}`)}`));
  card.append(el("p", null, nudge.text));
  return card;
}

/** Kompyuter holati (Sozlamalar oynasida). */
export async function deviceStatusText({ apiBase, authHeaders, t }) {
  try {
    const res = await fetch(`${apiBase()}/api/devices`, { headers: authHeaders() });
    const { pc } = await res.json();
    return pc?.online ? `🖥 ${t("pc.online")}: ${pc.name}` : `🖥 ${t("pc.offline")}`;
  } catch {
    return "";
  }
}
