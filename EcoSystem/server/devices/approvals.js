// Xavfli amallar uchun tasdiq: Jigar kompyuterda buyruq bajarish yoki fayl yozishdan oldin egasidan "Ha" kutadi.
// Chat oqimi {"type":"confirm"} hodisasini yuboradi; ilova (telefon yoki kompyuter) POST /api/actions/:id bilan javob beradi.
import { randomUUID } from "node:crypto";

export const APPROVAL_TIMEOUT_MS = 120_000; // javob bo'lmasa — rad etilgan hisoblanadi

/**
 * @param {{ timeoutMs?: number }} [options]
 */
export function createApprovals({ timeoutMs = APPROVAL_TIMEOUT_MS } = {}) {
  /** id -> { userId, resolve, timer } */
  const waiting = new Map();

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

    /** Egasining javobi. Boshqa foydalanuvchining yoki muddati o'tgan so'rov — false. */
    answer(userId, id, approve) {
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
