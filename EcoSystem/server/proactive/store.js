// Jigar o'zi birinchi aytgan gaplar ("nudge"): ekranga qarab maslahat (watch), ertalabki (morning) va kechki (evening) xulosa.
// Ilova har yarim daqiqada ko'rilmaganlarini so'raydi (GET /api/nudges), ko'rsatadi va "ko'rildi" deb belgilaydi.
export const NUDGE_KINDS = ["watch", "morning", "evening"];
export const NUDGE_CHARS = 1500;
const UNSEEN_LIMIT = 20;
const KEEP_LAST = 200; // eski gaplar o'chiriladi

/** SQLite vaqt matni (UTC): "2026-11-13 08:00:00" — datetime('now') bilan bir xil shakl. */
export const sqlTime = (ms) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);

/**
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {{ now?: () => number }} [options]
 */
export function createNudgeStore(db, { now = Date.now } = {}) {
  const q = {
    add: db.prepare("INSERT INTO nudges (user_id, kind, text, created_at) VALUES (?, ?, ?, ?)"),
    trim: db.prepare("DELETE FROM nudges WHERE user_id = ? AND id NOT IN (SELECT id FROM nudges WHERE user_id = ? ORDER BY id DESC LIMIT ?)"),
    unseen: db.prepare("SELECT id, kind, text, created_at AS createdAt FROM nudges WHERE user_id = ? AND seen = 0 ORDER BY id LIMIT ?"),
    seen: db.prepare("UPDATE nudges SET seen = 1 WHERE user_id = ? AND id = ?"),
    since: db.prepare("SELECT id, kind, text, created_at AS createdAt FROM nudges WHERE user_id = ? AND created_at >= ? ORDER BY id"),
    lastOfKind: db.prepare("SELECT created_at AS createdAt FROM nudges WHERE user_id = ? AND kind = ? ORDER BY id DESC LIMIT 1"),
  };

  return {
    /** Yangi gap. Bo'sh matn yoki noma'lum tur — null. */
    add(userId, kind, text) {
      const clean = String(text ?? "").trim().slice(0, NUDGE_CHARS);
      if (!clean || !NUDGE_KINDS.includes(kind)) return null;
      const createdAt = sqlTime(now());
      const { lastInsertRowid } = q.add.run(userId, kind, clean, createdAt);
      q.trim.run(userId, userId, KEEP_LAST);
      return { id: Number(lastInsertRowid), kind, text: clean, createdAt };
    },
    unseen: (userId) => q.unseen.all(userId, UNSEEN_LIMIT),
    markSeen: (userId, id) => q.seen.run(userId, Number(id)).changes > 0,
    /** Oxirgi `ms` ichidagi gaplar (takrorlamaslik va suhbatda eslash uchun). */
    since: (userId, ms) => q.since.all(userId, sqlTime(now() - ms)),
    /** Shu turdagi oxirgi gap vaqti (ms) yoki null. */
    lastAt(userId, kind) {
      const row = q.lastOfKind.get(userId, kind);
      return row ? Date.parse(`${row.createdAt.replace(" ", "T")}Z`) : null;
    },
  };
}
