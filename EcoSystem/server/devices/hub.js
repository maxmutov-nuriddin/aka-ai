// Qurilmalar markazi: egasining qurilmalari (desktop ilovalar; keyin Android agent) serverga "long-poll" bilan ulanadi
// va Jigarning qo'li bo'ladi. Har qurilma — o'z id'si, nomi, platformasi va turi bilan (ECOTIZIM-REJA.md).
// Qurilma: POST /api/devices/poll — buyruq kutadi (25 s), bajarib POST /api/devices/result — natijani qaytaradi.
// Chat (istalgan qurilmadan): hub.call() — buyruqni o'sha qurilma navbatiga qo'yadi va natijani kutadi.
// Xotirada (in-memory): server qayta ishga tushsa, qurilmalar o'zi qayta ulanadi.
import { randomUUID } from "node:crypto";

export const POLL_WAIT_MS = 25_000; // bitta poll so'rovi shuncha kutadi (proksi va brauzer timeout'idan kam)
export const ONLINE_GRACE_MS = 40_000; // oxirgi poll'dan beri shuncha vaqt o'tmagan bo'lsa — ulangan
export const CALL_TIMEOUT_MS = 90_000; // buyruq natijasi shuncha vaqtda kelmasa — xato
export const DEVICE_KINDS = ["pc", "phone"];
const NAME_MAX = 60;
const ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

export class DeviceOfflineError extends Error {
  constructor(message = "Kompyuter ulanmagan: Jigar desktop ilovasini oching.") {
    super(message);
    this.name = "DeviceOfflineError";
  }
}

const clean = (value, max) => String(value ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, max);

/** Qurilma ma'lumoti: id (berilmasa — nomidan), nom, platforma, tur. */
export function normalizeDeviceInfo(info) {
  const name = clean(info?.name, NAME_MAX) || "Kompyuter";
  const rawId = String(info?.id ?? "");
  const id = ID_RE.test(rawId) ? rawId : `name-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50) || "pc"}`;
  const kind = DEVICE_KINDS.includes(info?.kind) ? info.kind : "pc";
  return { id, name, platform: clean(info?.platform, 20) || "unknown", kind };
}

/**
 * @param {{ now?: () => number, pollWaitMs?: number, callTimeoutMs?: number }} [options]
 */
export function createDeviceHub({ now = Date.now, pollWaitMs = POLL_WAIT_MS, callTimeoutMs = CALL_TIMEOUT_MS } = {}) {
  /** userId -> Map(deviceId -> { info, lastSeen, waiter, queue, pending }) */
  const users = new Map();

  function devicesOf(userId) {
    if (!users.has(userId)) users.set(userId, new Map());
    return users.get(userId);
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

  /** Buyruq kimga tegishli — barcha qurilmalardan qidiradi (natija va requeue uchun). */
  function entryWithCommand(userId, commandId) {
    for (const entry of devicesOf(userId).values()) if (entry.pending.has(commandId)) return entry;
    return null;
  }

  return {
    /**
     * Qurilma chaqiradi: ro'yxatdan o'tadi va buyruq kutadi. Buyruq bo'lmasa — null (qurilma qayta so'raydi).
     * Shu qurilmaning yangi poll'i eskisini yopadi (bitta qurilma — bitta ulanish).
     */
    poll(userId, rawInfo) {
      const info = normalizeDeviceInfo(rawInfo);
      const devices = devicesOf(userId);
      if (!devices.has(info.id)) devices.set(info.id, { info, lastSeen: 0, waiter: null, queue: [], pending: new Map() });
      const entry = devices.get(info.id);
      entry.info = info;
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

    /** Qurilma natijani qaytaradi. Noma'lum (yoki muddati o'tgan) buyruq — false. */
    resolve(userId, commandId, result) {
      const id = String(commandId);
      const entry = entryWithCommand(userId, id);
      if (!entry) return false;
      const pending = entry.pending.get(id);
      entry.pending.delete(id);
      clearTimeout(pending.timer);
      entry.lastSeen = now();
      pending.resolve(result ?? {});
      return true;
    },

    /**
     * Qurilmaga buyruq: { tool, input, approved }. Natija — qurilma qaytargan obyekt.
     * @param {string} deviceId
     * @returns {Promise<Record<string, unknown>>}
     */
    call(userId, deviceId, { tool, input = {}, approved = false }) {
      const entry = devicesOf(userId).get(deviceId);
      if (!isOnline(entry)) return Promise.reject(new DeviceOfflineError());
      const command = { id: randomUUID(), tool, input, approved };
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          entry.pending.delete(command.id);
          entry.queue = entry.queue.filter((c) => c.id !== command.id);
          reject(new Error(`${entry.info.name} javob bermadi (vaqt tugadi).`));
        }, callTimeoutMs);
        timer.unref?.();
        entry.pending.set(command.id, { resolve, timer });
        entry.queue.push(command);
        flush(entry);
      });
    },

    /** Uzilgan poll'ga berilgan buyruq — navbat boshiga qaytadi (natija hali kutilmoqda). */
    requeue(userId, command) {
      const entry = entryWithCommand(userId, command.id);
      if (!entry) return;
      entry.queue.unshift(command);
      flush(entry);
    },

    /** Ulangan qurilmalar: [{ id, name, platform, kind }]. */
    list(userId) {
      return [...devicesOf(userId).values()].filter(isOnline).map((e) => ({ ...e.info }));
    },
  };
}

/**
 * Qaysi qurilmada bajariladi: aytilgan nom/id → shu qurilma (chat yozilgan kompyuter) → shu turdagi yagona qurilma.
 * @param {{id: string, name: string, kind: string}[]} all ulanganlar
 * @param {"pc" | "phone"} kind asbob qaysi turdagi qurilma uchun
 * @returns {{ device: object } | { error: string }}
 */
export function pickDevice(all, hint, currentId = null, kind = "pc") {
  const devices = all.filter((d) => d.kind === kind);
  const pcs = devices;
  const names = devices.map((d) => d.name).join(", ");
  if (kind === "phone" && !devices.length) return { error: "Telefon ulanmagan: Android'da Jigar ilovasini oching (agent yoqiladi)." };
  const wanted = String(hint ?? "").trim().toLowerCase();
  if (wanted) {
    const found = devices.find((d) => d.id === hint || d.name.toLowerCase() === wanted)
      ?? devices.find((d) => d.name.toLowerCase().includes(wanted) || wanted.includes(d.name.toLowerCase()));
    return found ? { device: found } : { error: `"${hint}" qurilmasi ulanmagan. Ulanganlar: ${names || "yo'q"}.` };
  }
  const current = devices.find((d) => d.id === currentId);
  if (current) return { device: current };
  if (pcs.length === 1) return { device: pcs[0] };
  if (!pcs.length) return { error: "Kompyuter ulanmagan: Jigar desktop ilovasini oching." };
  return { error: `Bir nechta kompyuter ulangan (${names}) — "device" bilan qaysi biri ekanini ayt yoki egasidan so'ra.` };
}
