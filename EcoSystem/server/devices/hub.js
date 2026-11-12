// Qurilmalar markazi: egasining kompyuteri (desktop ilova) serverga "long-poll" bilan ulanadi va Jigarning qo'li bo'ladi.
// Desktop: POST /api/devices/poll — buyruq kutadi (25 s), bajarib POST /api/devices/result — natijani qaytaradi.
// Chat (telefon yoki kompyuterdan): hub.call() — buyruqni navbatga qo'yadi va natijani kutadi.
// Xotirada (in-memory): server qayta ishga tushsa, desktop o'zi qayta ulanadi.
import { randomUUID } from "node:crypto";

export const POLL_WAIT_MS = 25_000; // bitta poll so'rovi shuncha kutadi (proksi va brauzer timeout'idan kam)
export const ONLINE_GRACE_MS = 40_000; // oxirgi poll'dan beri shuncha vaqt o'tmagan bo'lsa — ulangan
export const CALL_TIMEOUT_MS = 90_000; // buyruq natijasi shuncha vaqtda kelmasa — xato
const NAME_MAX = 60;

export class DeviceOfflineError extends Error {
  constructor() {
    super("Kompyuter ulanmagan: Jigar desktop ilovasini oching.");
    this.name = "DeviceOfflineError";
  }
}

const clean = (value, max) => String(value ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, max);

/**
 * @param {{ now?: () => number, pollWaitMs?: number, callTimeoutMs?: number }} [options]
 */
export function createDeviceHub({ now = Date.now, pollWaitMs = POLL_WAIT_MS, callTimeoutMs = CALL_TIMEOUT_MS } = {}) {
  /** userId -> { info, lastSeen, waiter, queue, pending } */
  const devices = new Map();

  function slot(userId) {
    if (!devices.has(userId)) {
      devices.set(userId, { info: null, lastSeen: 0, waiter: null, queue: [], pending: new Map() });
    }
    return devices.get(userId);
  }

  const isOnline = (entry) => Boolean(entry?.info) && (Boolean(entry.waiter) || now() - entry.lastSeen < ONLINE_GRACE_MS);

  /** Kutib turgan poll'ga buyruqni beradi (bo'lsa). */
  function flush(entry) {
    if (!entry.waiter || entry.queue.length === 0) return;
    const { resolve, timer } = entry.waiter;
    entry.waiter = null;
    clearTimeout(timer);
    resolve(entry.queue.shift());
  }

  return {
    /**
     * Desktop chaqiradi: ro'yxatdan o'tadi va buyruq kutadi. Buyruq bo'lmasa — null (desktop qayta so'raydi).
     * Yangi poll eskisini yopadi (bitta kompyuter — bitta ulanish).
     */
    poll(userId, info) {
      const entry = slot(userId);
      entry.info = { name: clean(info?.name, NAME_MAX) || "Kompyuter", platform: clean(info?.platform, 20) || "unknown" };
      entry.lastSeen = now();
      if (entry.waiter) {
        clearTimeout(entry.waiter.timer);
        entry.waiter.resolve(null);
        entry.waiter = null;
      }
      if (entry.queue.length) return Promise.resolve(entry.queue.shift());
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (entry.waiter?.resolve === resolve) entry.waiter = null;
          entry.lastSeen = now();
          resolve(null);
        }, pollWaitMs);
        timer.unref?.();
        entry.waiter = { resolve, timer };
      });
    },

    /** Desktop natijani qaytaradi. Noma'lum (yoki muddati o'tgan) buyruq — false. */
    resolve(userId, commandId, result) {
      const entry = devices.get(userId);
      const pending = entry?.pending.get(String(commandId));
      if (!pending) return false;
      entry.pending.delete(String(commandId));
      clearTimeout(pending.timer);
      entry.lastSeen = now();
      pending.resolve(result ?? {});
      return true;
    },

    /**
     * Kompyuterga buyruq: { tool, input, approved }. Natija — desktop qaytargan obyekt.
     * @returns {Promise<Record<string, unknown>>}
     */
    call(userId, { tool, input = {}, approved = false }) {
      const entry = devices.get(userId);
      if (!isOnline(entry)) return Promise.reject(new DeviceOfflineError());
      const command = { id: randomUUID(), tool, input, approved };
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          entry.pending.delete(command.id);
          entry.queue = entry.queue.filter((c) => c.id !== command.id);
          reject(new Error("Kompyuter javob bermadi (vaqt tugadi)."));
        }, callTimeoutMs);
        timer.unref?.();
        entry.pending.set(command.id, { resolve, timer });
        entry.queue.push(command);
        flush(entry);
      });
    },

    /** Uzilgan poll'ga berilgan buyruq — navbat boshiga qaytadi (natija hali kutilmoqda). */
    requeue(userId, command) {
      const entry = devices.get(userId);
      if (!entry?.pending.has(command.id)) return;
      entry.queue.unshift(command);
      flush(entry);
    },

    /** { online, name, platform } — kompyuter ulanganmi. */
    status(userId) {
      const entry = devices.get(userId);
      return isOnline(entry) ? { online: true, ...entry.info } : { online: false };
    },
  };
}
