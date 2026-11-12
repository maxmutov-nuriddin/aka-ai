// Shaxsiy yordamchi (faqat support, "Jarvis"): eslatmalar (bildirishnoma + ovoz), xotira va eslatmalar oynasi,
// Jigar tayyorlagan faylni yuklab olish. Server: /api/assistant (server/assistant/routes.js).

import { FILE_TYPES } from "../shared/parse.js";

const POLL_MS = 30_000; // vaqti kelgan eslatmalarni tekshirish oralig'i
const BOM = "﻿"; // Excel CSV'dagi o'zbekcha harflarni to'g'ri ochishi uchun

/**
 * @param {{ apiBase: () => string, authHeaders: () => Record<string, string>, onReminder: (r: {id:number,text:string}) => void,
 *           t: (key: string) => string }} deps
 */
export function createAssistant({ apiBase, authHeaders, onReminder, t }) {
  let timer = null;
  const call = async (path, method = "GET") => {
    const res = await fetch(`${apiBase()}/api/assistant${path}`, { method, headers: authHeaders() });
    if (!res.ok) throw new Error(`assistant ${res.status}`);
    return res.json();
  };

  async function checkDue() {
    let due = [];
    try {
      ({ reminders: due } = await call("/reminders/due"));
    } catch {
      return; // tarmoq yo'q — keyingi safar
    }
    for (const reminder of due) {
      notify(reminder.text);
      onReminder(reminder);
      await call(`/reminders/${reminder.id}/done`, "POST").catch(() => {});
    }
  }

  function notify(text) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      new Notification(`⏰ ${t("asst.reminder")}`, { body: text, tag: `jigar-${text}` });
    } catch {
      /* ba'zi brauzerlar (mobil) sahifadan bildirishnoma bermaydi — ovozli eslatma baribir bor */
    }
  }

  return {
    /** Support kirganda yoqiladi: eslatmalarni muntazam tekshiradi. */
    start() {
      if (timer) return;
      checkDue();
      timer = setInterval(checkDue, POLL_MS);
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
    /** Eslatma qo'yilganda — brauzerdan bildirishnoma ruxsatini so'raydi (bir marta). */
    askNotifications() {
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
    },
    list: () => call(""),
    deleteMemory: (id) => call(`/memories/${id}`, "DELETE"),
    clearMemories: () => call("/memories", "DELETE"),
    deleteReminder: (id) => call(`/reminders/${id}`, "DELETE"),
  };
}

/** Jigar tayyorlagan fayl ([FAYL]) — bosilsa yuklab olinadi. Word (.doc) — HTML, Excel (.csv) — UTF-8 BOM bilan. */
export function fileButton({ nomi, mazmun }, label) {
  const ext = nomi.split(".").pop().toLowerCase();
  const type = FILE_TYPES[ext] ?? "text/plain";
  const body = ext === "doc"
    ? `<html><head><meta charset="utf-8"></head><body>${mazmun}</body></html>`
    : ext === "csv" ? BOM + mazmun : mazmun;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "file-download";
  btn.textContent = `⬇ ${label}: ${nomi}`;
  btn.addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([body], { type: `${type};charset=utf-8` }));
    const a = document.createElement("a");
    a.href = url;
    a.download = nomi;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  return btn;
}

// Brauzerlarda o'zbekcha oy nomlari yo'q ("M11") — o'zimiz yozamiz. Vaqt — foydalanuvchi qurilmasi vaqtida.
const MONTHS = {
  uz: ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"],
  ru: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
};
const pad2 = (n) => String(n).padStart(2, "0");

/** "13-noyabr, 09:30" / "13 ноября, 09:30". */
export function formatDue(iso, lang = "uz") {
  const d = new Date(iso);
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return lang === "ru" ? `${d.getDate()} ${MONTHS.ru[d.getMonth()]}, ${time}` : `${d.getDate()}-${MONTHS.uz[d.getMonth()]}, ${time}`;
}

/** Xotira va eslatmalar oynasini to'ldiradi (o'chirish tugmalari bilan). Matn — textContent (xavfsiz). */
export async function renderAssistantPanel(container, assistant, { t, lang }) {
  container.textContent = t("asst.loading");
  let data;
  try {
    data = await assistant.list();
  } catch {
    container.textContent = t("asst.error");
    return;
  }
  const section = (title, items, emptyText, render) => {
    const box = document.createElement("section");
    const h = document.createElement("h3");
    h.textContent = title;
    box.append(h);
    if (!items.length) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = emptyText;
      box.append(p);
    }
    const ul = document.createElement("ul");
    for (const item of items) ul.append(render(item));
    box.append(ul);
    return box;
  };
  const row = (text, onDelete) => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = text;
    const del = document.createElement("button");
    del.type = "button";
    del.className = "link";
    del.textContent = "×";
    del.setAttribute("aria-label", t("asst.delete"));
    del.addEventListener("click", async () => {
      await onDelete().catch(() => {});
      li.remove();
    });
    li.append(span, del);
    return li;
  };
  const reminders = section(t("asst.reminders"), data.reminders, t("asst.noReminders"),
    (r) => row(`${formatDue(r.dueAt, lang)} — ${r.text}`, () => assistant.deleteReminder(r.id)));
  const memories = section(t("asst.memory"), data.memories, t("asst.noMemory"),
    (m) => row(m.text, () => assistant.deleteMemory(m.id)));
  if (data.memories.length) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "ghost";
    clear.textContent = t("asst.clearMemory");
    clear.addEventListener("click", async () => {
      await assistant.clearMemories().catch(() => {});
      renderAssistantPanel(container, assistant, { t, lang });
    });
    memories.append(clear);
  }
  container.replaceChildren(reminders, memories);
}
