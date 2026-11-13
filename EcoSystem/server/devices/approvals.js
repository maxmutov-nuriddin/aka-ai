// Xavfli amallar uchun tasdiq: Jigar kompyuterda buyruq bajarish yoki fayl yozishdan oldin egasidan "Ha" kutadi.
// Chat oqimi {"type":"confirm"} hodisasini yuboradi; ilova (telefon yoki kompyuter) POST /api/actions/:id bilan javob beradi.
import { randomUUID } from "node:crypto";

export const APPROVAL_TIMEOUT_MS = 120_000; // javob bo'lmasa — rad etilgan hisoblanadi
export const DEFERRED_TTL_MS = 30 * 60_000; // kechiktirilgan tasdiq (Siri, fon vazifasi) — shuncha vaqt kutadi

/**
 * @param {{ timeoutMs?: number }} [options]
 */
export function createApprovals({ timeoutMs = APPROVAL_TIMEOUT_MS, deferredTtlMs = DEFERRED_TTL_MS, now = Date.now } = {}) {
  /** id -> { userId, resolve, timer } */
  const waiting = new Map();
  /** Kechiktirilgan: id -> { userId, run, expiresAt } — so'rov tugagan, "Ha" bosilsa amal shu yerda bajariladi. */
  const deferred = new Map();

  return {
    /**
     * Tasdiq so'rovi. Qaytaradi: id (ilovaga yuboriladi) va javobni kutuvchi promise (true — ruxsat).
     * @returns {{ id: string, decision: Promise<boolean> }}
     */
    request(userId) {
      const id = randomUUID();
      const decision = new Promise((resolve) => {
        const timer = setTimeout(() => {
          waiting.delete(id);
          resolve(false);
        }, timeoutMs);
        timer.unref?.();
        waiting.set(id, { userId, resolve, timer });
      });
      return { id, decision };
    },

    /**
     * Kechiktirilgan tasdiq: chaqiruvchi kutmaydi (Siri, fon vazifasi). "Ha" bosilganda run() bajariladi.
     * @param {() => Promise<void>} run
     * @returns {string} id (ilovadagi tasdiq kartasi uchun)
     */
    defer(userId, run) {
      const id = randomUUID();
      for (const [key, entry] of deferred) if (entry.expiresAt < now()) deferred.delete(key);
      deferred.set(id, { userId, run, expiresAt: now() + deferredTtlMs });
      return id;
    },

    /** Egasining javobi. Boshqa foydalanuvchining yoki muddati o'tgan so'rov — false. */
    answer(userId, id, approve) {
      const later = deferred.get(String(id));
      if (later && later.userId === userId && later.expiresAt >= now()) {
        deferred.delete(String(id));
        if (approve === true) later.run().catch(() => {}); // natija nudge va jurnal orqali egasiga yetadi
        return true;
      }
      const entry = waiting.get(String(id));
      if (!entry || entry.userId !== userId) return false;
      waiting.delete(String(id));
      clearTimeout(entry.timer);
      entry.resolve(approve === true);
      return true;
    },

    /** Chat uzilsa — kutilayotgan so'rov rad etiladi. */
    cancel(id) {
      const entry = waiting.get(String(id));
      if (!entry) return;
      waiting.delete(String(id));
      clearTimeout(entry.timer);
      entry.resolve(false);
    },
  };
}
