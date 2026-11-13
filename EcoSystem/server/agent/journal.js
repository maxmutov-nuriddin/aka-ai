// Jurnal (ECOTIZIM-REJA.md, 11-band): Jigar bilmagan yoki qilolmagan ishlar (gap), asbob xatolari (error)
// va bajargan ishlari (action). Bazada saqlanadi; berilgan papkaga md fayllar ham yoziladi (~/Jigar):
//   QILOLMAGAN-ISHLAR.md, XATOLAR.md, HARAKATLAR.md — egasi "qilolmagan ishlaringni ber" desa, Jigar beradi.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { maskSecrets } from "./redact.js";

export const JOURNAL_KINDS = { gap: "QILOLMAGAN-ISHLAR.md", error: "XATOLAR.md", action: "HARAKATLAR.md" };
const TITLES = { gap: "Jigar qilolmagan ishlar", error: "Jigar xatolari", action: "Jigar bajargan ishlar" };
const TITLE_MAX = 200;
const DETAIL_MAX = 2000;
const FILE_LIMIT = 300; // md faylda oxirgi shuncha yozuv
const KEEP = { gap: 1000, error: 500, action: 2000 };
const TASHKENT_OFFSET_MS = 5 * 60 * 60_000;

const squeeze = (s, n) => maskSecrets(String(s ?? "")).replace(/\s+/g, " ").trim().slice(0, n);
const localTime = (iso) => new Date(Date.parse(iso) + TASHKENT_OFFSET_MS).toISOString().replace("T", " ").slice(0, 16);

/** Bitta yozuv — md bo'lim. detail: { so'rov, sabab, kerak, ... } yoki matn. */
export function entryMarkdown(entry) {
  const lines = [`## #${entry.id} · ${localTime(entry.createdAt)} — ${entry.title}`];
  let detail = {};
  try {
    detail = JSON.parse(entry.detail || "{}");
  } catch {
    detail = { izoh: entry.detail };
  }
  for (const [key, value] of Object.entries(detail)) if (value) lines.push(`- ${key}: ${String(value).replace(/\n/g, " ")}`);
  if (entry.device) lines.push(`- qurilma: ${entry.device}`);
  if (entry.kind === "gap") lines.push(`- holat: ${entry.status === "open" ? "ochiq" : "yopildi"}`);
  return lines.join("\n");
}

export function journalMarkdown(kind, entries) {
  const open = entries.filter((e) => e.status === "open").length;
  const head = kind === "gap" ? `\n\nOchiq: ${open} ta. "Qilolmagan ishlaringni ber" — Jigar shu ro'yxatni beradi.` : "";
  return `# ${TITLES[kind]}${head}\n\n${entries.map(entryMarkdown).join("\n\n") || "Hozircha yozuv yo'q."}\n`;
}

/**
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {{ dir?: string | null, now?: () => number, log?: (m: string) => void }} [options] dir — md fayllar papkasi (null — yozilmaydi)
 */
export function createJournal(db, { dir = null, now = Date.now, log = console.warn } = {}) {
  const q = {
    add: db.prepare("INSERT INTO journal (user_id, kind, title, detail, device, created_at) VALUES (?, ?, ?, ?, ?, ?)"),
    list: db.prepare("SELECT id, kind, title, detail, status, device, created_at AS createdAt FROM journal WHERE user_id = ? AND kind = ? ORDER BY id DESC LIMIT ?"),
    listOpen: db.prepare("SELECT id, kind, title, detail, status, device, created_at AS createdAt FROM journal WHERE user_id = ? AND kind = ? AND status = 'open' ORDER BY id DESC LIMIT ?"),
    close: db.prepare("UPDATE journal SET status = 'closed' WHERE user_id = ? AND id = ? AND kind = 'gap'"),
    trim: db.prepare("DELETE FROM journal WHERE user_id = ? AND kind = ? AND id NOT IN (SELECT id FROM journal WHERE user_id = ? AND kind = ? ORDER BY id DESC LIMIT ?)"),
  };

  const list = (userId, kind, { openOnly = false, limit = FILE_LIMIT } = {}) =>
    (openOnly ? q.listOpen : q.list).all(userId, kind, limit);

  /** md faylni qayta yozadi (papka berilgan bo'lsa). Xato — logga, jurnal ishlashda davom etadi. */
  function writeFile(userId, kind) {
    if (!dir) return;
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, JOURNAL_KINDS[kind]), journalMarkdown(kind, list(userId, kind)));
    } catch (err) {
      log(`[journal] ${JOURNAL_KINDS[kind]} yozilmadi: ${err.message}`);
    }
  }

  return {
    dir,
    /** @param {"gap"|"error"|"action"} kind @param {Record<string, string> | string} detail */
    add(userId, kind, title, detail = {}, device = null) {
      if (!JOURNAL_KINDS[kind]) return null;
      const cleanTitle = squeeze(title, TITLE_MAX) || "—";
      const body = typeof detail === "string" ? JSON.stringify({ izoh: squeeze(detail, DETAIL_MAX) })
        : JSON.stringify(Object.fromEntries(Object.entries(detail).map(([k, v]) => [k, squeeze(v, DETAIL_MAX)])));
      const createdAt = new Date(now()).toISOString();
      const { lastInsertRowid } = q.add.run(userId, kind, cleanTitle, body, device ? squeeze(device, 60) : null, createdAt);
      q.trim.run(userId, kind, userId, kind, KEEP[kind]);
      writeFile(userId, kind);
      return Number(lastInsertRowid);
    },
    list,
    close(userId, id) {
      const ok = q.close.run(userId, Number(id)).changes > 0;
      if (ok) writeFile(userId, "gap");
      return ok;
    },
    markdown: (userId, kind) => journalMarkdown(kind, list(userId, kind)),
    filePath: (kind) => (dir ? path.join(dir, JOURNAL_KINDS[kind]) : null),
  };
}
