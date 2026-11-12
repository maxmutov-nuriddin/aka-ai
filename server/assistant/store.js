// Shaxsiy yordamchi (support, "Jarvis"): Jigar eslab qoladigan faktlar (xotira) va eslatmalar.
// Jigar javobidagi yashirin bo'limlardan ([XOTIRA], [ESLATMA]) yoziladi — server/core/parse.js.
import { ValidationError } from "../core/errors.js";

export const MEMORY_LIMIT = 60; // eng eski faktlar o'chiriladi — promptga sig'sin
export const MEMORY_CHARS = 200;
export const REMINDER_CHARS = 300;
const REMINDER_LIMIT = 100; // bajarilmagan eslatmalar
const MAX_AHEAD_MS = 366 * 24 * 60 * 60_000; // ko'pi bilan 1 yil oldinga
const GRACE_MS = 5 * 60_000; // "hozir" deb aytilgan eslatma — biroz o'tgan vaqt ham qabul

const squeeze = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const sameFact = (a, b) => a.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "") === b.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Eslatmani tekshiradi: vaqt (ISO, vaqt zonasi bilan) kelajakda va 1 yil ichida, matn bo'sh emas.
 * @returns {{ dueAt: string, text: string }}
 */
export function normalizeReminder(input, now = new Date()) {
  const text = squeeze(input?.text).slice(0, REMINDER_CHARS);
  const due = Date.parse(String(input?.dueAt ?? ""));
  if (!text) throw new ValidationError("Eslatma matni bo'sh");
  if (!Number.isFinite(due)) throw new ValidationError("Eslatma vaqti noto'g'ri");
  if (due < now.getTime() - GRACE_MS || due > now.getTime() + MAX_AHEAD_MS) throw new ValidationError("Eslatma vaqti o'tib ketgan yoki juda uzoq");
  return { dueAt: new Date(due).toISOString(), text };
}

/**
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {{ now?: () => Date }} [options]
 */
export function createAssistantStore(db, { now = () => new Date() } = {}) {
  const q = {
    memories: db.prepare("SELECT id, text, created_at AS createdAt FROM memories WHERE user_id = ? ORDER BY id"),
    addMemory: db.prepare("INSERT INTO memories (user_id, text) VALUES (?, ?)"),
    trimMemories: db.prepare(
      "DELETE FROM memories WHERE user_id = ? AND id NOT IN (SELECT id FROM memories WHERE user_id = ? ORDER BY id DESC LIMIT ?)",
    ),
    deleteMemory: db.prepare("DELETE FROM memories WHERE user_id = ? AND id = ?"),
    clearMemories: db.prepare("DELETE FROM memories WHERE user_id = ?"),
    addReminder: db.prepare("INSERT INTO reminders (user_id, due_at, text) VALUES (?, ?, ?)"),
    pending: db.prepare("SELECT id, due_at AS dueAt, text FROM reminders WHERE user_id = ? AND done = 0 ORDER BY due_at LIMIT ?"),
    due: db.prepare("SELECT id, due_at AS dueAt, text FROM reminders WHERE user_id = ? AND done = 0 AND due_at <= ? ORDER BY due_at"),
    done: db.prepare("UPDATE reminders SET done = 1 WHERE user_id = ? AND id = ?"),
    deleteReminder: db.prepare("DELETE FROM reminders WHERE user_id = ? AND id = ?"),
  };

  const listMemories = (userId) => q.memories.all(userId);

  /** Yangi faktlarni qo'shadi (takrorlarini tashlab). Qaytaradi: qo'shilganlari. */
  function addMemories(userId, facts) {
    const existing = listMemories(userId).map((m) => m.text);
    const added = [];
    for (const raw of Array.isArray(facts) ? facts : []) {
      const text = squeeze(raw).slice(0, MEMORY_CHARS);
      if (!text || [...existing, ...added].some((t) => sameFact(t, text))) continue;
      q.addMemory.run(userId, text);
      added.push(text);
    }
    if (added.length) q.trimMemories.run(userId, userId, MEMORY_LIMIT);
    return added;
  }

  /** Eslatmalarni qo'shadi; noto'g'rilari tashlanadi (Jigar javobi buzilmasin). Qaytaradi: qo'shilganlari. */
  function addReminders(userId, items) {
    const added = [];
    for (const item of Array.isArray(items) ? items : []) {
      if (q.pending.all(userId, REMINDER_LIMIT).length >= REMINDER_LIMIT) break;
      try {
        const { dueAt, text } = normalizeReminder(item, now());
        const { lastInsertRowid } = q.addReminder.run(userId, dueAt, text);
        added.push({ id: Number(lastInsertRowid), dueAt, text });
      } catch (err) {
        if (!(err instanceof ValidationError)) throw err;
      }
    }
    return added;
  }

  return {
    listMemories,
    addMemories,
    deleteMemory: (userId, id) => q.deleteMemory.run(userId, Number(id)).changes > 0,
    clearMemories: (userId) => q.clearMemories.run(userId).changes,
    addReminders,
    pendingReminders: (userId) => q.pending.all(userId, REMINDER_LIMIT),
    dueReminders: (userId) => q.due.all(userId, now().toISOString()),
    markReminderDone: (userId, id) => q.done.run(userId, Number(id)).changes > 0,
    deleteReminder: (userId, id) => q.deleteReminder.run(userId, Number(id)).changes > 0,
  };
}
