// Sozlamalardagi Jarvis bo'limi: Siri kalitlari, jurnal (qilolmagan ishlar, xatolar, harakatlar), favqulodda TO'XTA.
// Server: /api/tokens, /api/journal/:kind, /api/stop (server/agent/routes.js). Matnlar — textContent (xavfsiz).
import { canResetServer, resetServer } from "./phone-agent.js";
import { askConfirm } from "./confirm-dialog.js";

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

/**
 * @param {{ apiBase: () => string, authHeaders: () => Record<string, string>, status: HTMLElement }} deps
 * @returns {HTMLElement}
 */
export function agentSection({ apiBase, authHeaders, status }) {
  const request = async (path, method = "GET", body) => {
    const res = await fetch(`${apiBase()}${path}`, { method, headers: { "Content-Type": "application/json", ...authHeaders() }, body: body && JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  };
  const box = el("div", "eco-agent");

  // --- Siri kalitlari ---
  const siri = el("div", "eco-field");
  siri.append(el("span", "setting-label", "Siri uchun kalit (\"Hey Siri, Jigar\")"));
  const tokenList = el("ul", "eco-tokens");
  const shown = el("code", "eco-token-new");
  shown.hidden = true;
  const create = el("button", "ghost", "Yangi kalit yaratish");
  create.type = "button";

  async function refreshTokens() {
    const { tokens } = await request("/api/tokens").catch(() => ({ tokens: [] }));
    tokenList.replaceChildren(...tokens.map((t) => {
      const li = el("li", null, `${t.scope === "device" ? "📱 " : "🎙 "}${t.name} · ${t.lastUsed ? `oxirgi: ${t.lastUsed.slice(0, 16).replace("T", " ")}` : "ishlatilmagan"} `);
      const del = el("button", "link", "o'chirish");
      del.type = "button";
      del.addEventListener("click", async () => {
        const sure = await askConfirm({
          title: "Siri kaliti o'chirilsinmi?",
          text: `"${t.name}" kaliti bilan Siri (yoki telefon agenti) endi Jigar'ga ulana olmaydi. Rostdan ham o'chirmoqchimisiz?`,
          confirm: "O'chirish",
        });
        if (!sure) return;
        await request(`/api/tokens/${t.id}`, "DELETE").catch(() => {});
        refreshTokens();
      });
      li.append(del);
      return li;
    }));
  }
  create.addEventListener("click", async () => {
    try {
      const { token } = await request("/api/tokens", "POST", { name: navigator.platform.includes("Mac") ? "Mac" : "iPhone" });
      shown.textContent = token;
      shown.hidden = false;
      status.textContent = "Kalit bir marta ko'rsatiladi — nusxalab, Shortcuts'dagi \"Jigar\" buyrug'iga qo'ying.";
      refreshTokens();
    } catch (err) {
      status.textContent = err.message;
    }
  });
  siri.append(create, shown, tokenList);

  // --- Jurnal ---
  const journal = el("div", "eco-field");
  journal.append(el("span", "setting-label", "Jurnal (~/Jigar papkasida ham bor)"));
  for (const [kind, label] of [["gaps", "Qilolmagan ishlar"], ["errors", "Xatolar"], ["actions", "Harakatlar"]]) {
    const link = el("button", "ghost", `📓 ${label}`);
    link.type = "button";
    link.addEventListener("click", async () => {
      const res = await fetch(`${apiBase()}/api/journal/${kind}`, { headers: authHeaders() });
      if (!res.ok) return void (status.textContent = "Jurnalni olib bo'lmadi.");
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: `${label}.md` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    journal.append(link);
  }

  // --- TO'XTA ---
  const stop = el("button", "danger eco-stop", "⛔ TO'XTA — hammasini bekor qil");
  stop.type = "button";
  stop.addEventListener("click", async () => {
    const sure = await askConfirm({
      title: "Hammasi to'xtatilsinmi?",
      text: "Barcha kuzatuvlar bekor qilinadi va ruxsat darajasi \"Xavfsiz\"ga tushadi. Rostdan ham to'xtatmoqchimisiz?",
      confirm: "Ha, to'xtat",
    });
    if (!sure) return;
    try {
      const { cancelled } = await request("/api/stop", "POST", {});
      status.textContent = `To'xtatildi: ${cancelled} ta kuzatuv bekor, ruxsat — xavfsiz.`;
    } catch (err) {
      status.textContent = err.message;
    }
  });

  box.append(siri, journal, stop);
  if (canResetServer()) {
    const server = el("button", "ghost", "📱 Server manzilini o'zgartirish");
    server.type = "button";
    server.addEventListener("click", async () => {
      const sure = await askConfirm({
        title: "Server manzili o'zgartirilsinmi?",
        text: "Telefon hozirgi serverdan uziladi va manzilni qayta kiritasiz. Rostdan ham davom etasizmi?",
        confirm: "O'zgartirish",
      });
      if (sure) resetServer();
    });
    box.append(server);
  }
  refreshTokens();
  return box;
}
