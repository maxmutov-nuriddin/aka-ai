// Bazaning kunlik zaxira nusxasi (VACUUM INTO — ish paytida ham xavfsiz, bitta toza fayl).
// data/backups/eco-YYYY-MM-DD.db; oxirgi KEEP_DAYS ta saqlanadi. Bazada xotira, eslatmalar, kuzatuvlar, kalitlar bor.
import { mkdirSync, readdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";

export const KEEP_DAYS = 7;
export const BACKUP_EVERY_MS = 24 * 60 * 60_000;
const NAME_RE = /^eco-\d{4}-\d{2}-\d{2}\.db$/;

const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Bugungi zaxira yo'q bo'lsa — yaratadi; eskilarini o'chiradi.
 * @param {import("node:sqlite").DatabaseSync} db
 * @returns {string | null} yaratilgan fayl yo'li (bugun allaqachon bor bo'lsa — null)
 */
export function backupDatabase(db, dir, { now = Date.now, keep = KEEP_DAYS } = {}) {
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `eco-${dayOf(now())}.db`);
  let created = null;
  if (!existsSync(target)) {
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
    created = target;
  }
  const old = readdirSync(dir).filter((f) => NAME_RE.test(f)).sort().slice(0, -keep);
  for (const file of old) rmSync(path.join(dir, file), { force: true });
  return created;
}

/** Ishga tushganda va keyin har kuni zaxira; xato — logga (server ishlashda davom etadi). */
export function scheduleBackups(db, dir, { log = console.warn } = {}) {
  const run = () => {
    try {
      backupDatabase(db, dir);
    } catch (err) {
      log(`[backup] zaxira yaratilmadi: ${err.message}`);
    }
  };
  run();
  setInterval(run, BACKUP_EVERY_MS).unref();
}
