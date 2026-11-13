// Kuzatuvlar (ECOTIZIM-REJA.md, 7-band): "qarab tur, tugasa o'chir / menga ayt".
// Shart (condition) qurilmada tekshiriladi (desktop: pc_probe), baholash — shu yerda (sof funksiya, testlanadi).
// Xavfli amal (o'chirish, qayta yoqish, hammasini yopish) — 60 soniyalik ogohlantirish bilan; egasi bekor qila oladi.
import { ValidationError } from "../core/errors.js";

export const CONDITION_TYPES = ["process_exit", "process_idle", "screen_still", "screen_text", "file", "time"];
export const ACTION_TYPES = ["notify", "lock", "sleep", "shutdown", "restart", "quit_all", "scenario"];
export const COUNTDOWN_ACTIONS = new Set(["shutdown", "restart", "quit_all"]);
export const COUNTDOWN_MS = 60_000;
const DEFAULT_HOURS = 6;
const MAX_HOURS = 24;
const DEFAULTS = { idleMinutes: 2, idleCpu: 5, stillMinutes: 3 };
const TEXT_MAX = 300;

const str = (v, n = TEXT_MAX) => String(v ?? "").trim().slice(0, n);
const minutes = (v, fallback) => Math.min(240, Math.max(1, Math.round(Number(v) || fallback)));

/** Shartni tekshiradi va tozalaydi. */
export function normalizeCondition(input) {
  const type = input?.type;
  if (!CONDITION_TYPES.includes(type)) throw new ValidationError(`condition.type: ${CONDITION_TYPES.join(" | ")}`);
  if (type === "process_exit" || type === "process_idle") {
    const name = str(input.name, 100);
    const pid = Number.isInteger(input.pid) && input.pid > 0 ? input.pid : null;
    if (!name && !pid) throw new ValidationError("Jarayon nomi (name) yoki pid kerak");
    return type === "process_exit" ? { type, name, pid }
      : { type, name, pid, minutes: minutes(input.minutes, DEFAULTS.idleMinutes), cpu: Math.min(50, Math.max(1, Number(input.cpu) || DEFAULTS.idleCpu)) };
  }
  if (type === "screen_still") return { type, minutes: minutes(input.minutes, DEFAULTS.stillMinutes) };
  if (type === "screen_text") {
    const text = str(input.text);
    if (!text) throw new ValidationError("Ekranda kutiladigan matn (text) kerak");
    return { type, text };
  }
  if (type === "file") {
    const path = str(input.path, 1024);
    if (!path) throw new ValidationError("Fayl yo'li (path) kerak");
    return { type, path, event: input.event === "changed" ? "changed" : "exists" };
  }
  const at = Date.parse(String(input.at ?? ""));
  if (!Number.isFinite(at)) throw new ValidationError("Vaqt (at) ISO shaklida kerak, masalan 2026-11-14T23:00:00+05:00");
  return { type, at: new Date(at).toISOString() };
}

export function normalizeAction(input) {
  const type = input?.type ?? "notify";
  if (!ACTION_TYPES.includes(type)) throw new ValidationError(`action.type: ${ACTION_TYPES.join(" | ")}`);
  if (type === "scenario" && !str(input.scenario, 60)) throw new ValidationError("Ssenariy nomi kerak");
  return { type, message: str(input?.message), ...(type === "scenario" ? { scenario: str(input.scenario, 60) } : {}) };
}

/**
 * Shart bajarildimi. probe — qurilma javobi: { running, cpu } | { hash } | { match } | { exists, mtime }.
 * @returns {{ met: boolean, state: object, detail: string }}
 */
export function evaluate(condition, probe, state = {}, nowMs = Date.now()) {
  switch (condition.type) {
    case "process_exit":
      return { met: probe.running === 0, state, detail: "jarayon tugadi" };
    case "process_idle": {
      if (probe.running === 0) return { met: true, state, detail: "jarayon tugadi" };
      const idle = Number(probe.cpu) < condition.cpu;
      const idleSince = idle ? (state.idleSince ?? nowMs) : null;
      const met = idle && nowMs - idleSince >= condition.minutes * 60_000;
      return { met, state: { ...state, idleSince }, detail: `${condition.minutes} daqiqa bo'sh turdi` };
    }
    case "screen_still": {
      const same = Boolean(probe.hash) && probe.hash === state.hash;
      const stillSince = same ? state.stillSince : nowMs;
      return { met: same && nowMs - stillSince >= condition.minutes * 60_000, state: { hash: probe.hash, stillSince }, detail: `ekran ${condition.minutes} daqiqa o'zgarmadi` };
    }
    case "screen_text":
      return { met: probe.match === true, state, detail: `ekranda "${condition.text}" chiqdi` };
    case "file": {
      if (condition.event === "exists") return { met: probe.exists === true, state, detail: "fayl paydo bo'ldi" };
      if (state.mtime === undefined) return { met: false, state: { mtime: probe.mtime ?? null }, detail: "" };
      return { met: probe.mtime != null && probe.mtime !== state.mtime, state, detail: "fayl o'zgardi" };
    }
    case "time":
      return { met: nowMs >= Date.parse(condition.at), state, detail: "vaqt keldi" };
    default:
      return { met: false, state, detail: "" };
  }
}

/** Kuzatuvni odam tilida (ro'yxat va tasdiq uchun). */
export function describeWatch(w) {
  const c = w.condition;
  const what = {
    process_exit: `"${c.name || c.pid}" tugaguncha`,
    process_idle: `"${c.name || c.pid}" ${c.minutes} daqiqa bo'sh qolguncha`,
    screen_still: `ekran ${c.minutes} daqiqa o'zgarmaguncha`,
    screen_text: `ekranda "${c.text}" chiqquncha`,
    file: `${c.path} ${c.event === "changed" ? "o'zgarguncha" : "paydo bo'lguncha"}`,
    time: `${c.at} gacha`,
  }[c.type];
  const then = { notify: "xabar beraman", lock: "qulflayman", sleep: "uxlataman", shutdown: "o'chiraman", restart: "qayta yoqaman", quit_all: "hamma ilovalarni yopaman", scenario: `"${w.action.scenario}" ssenariysini bajaraman` }[w.action.type];
  return `${w.deviceName ? `[${w.deviceName}] ` : ""}${what} kutaman, keyin ${then}`;
}

/** @param {import("node:sqlite").DatabaseSync} db */
export function createWatchStore(db, { now = Date.now } = {}) {
  const row = (r) => r && {
    id: r.id, userId: r.user_id, deviceId: r.device_id, deviceName: r.device_name, condition: JSON.parse(r.condition),
    action: JSON.parse(r.action), note: r.note, approved: r.approved === 1, state: JSON.parse(r.state), status: r.status,
    fireAt: r.fire_at, expiresAt: r.expires_at, createdAt: r.created_at,
  };
  const q = {
    add: db.prepare(`INSERT INTO watches (user_id, device_id, device_name, condition, action, note, approved, expires_at, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    get: db.prepare("SELECT * FROM watches WHERE id = ?"),
    live: db.prepare("SELECT * FROM watches WHERE status IN ('active', 'countdown') ORDER BY id"),
    mine: db.prepare("SELECT * FROM watches WHERE user_id = ? AND status IN ('active', 'countdown') ORDER BY id"),
    update: db.prepare("UPDATE watches SET state = ?, status = ?, fire_at = ? WHERE id = ?"),
    cancel: db.prepare("UPDATE watches SET status = 'cancelled' WHERE user_id = ? AND id = ? AND status IN ('active', 'countdown')"),
    cancelAll: db.prepare("UPDATE watches SET status = 'cancelled' WHERE user_id = ? AND status IN ('active', 'countdown')"),
  };
  return {
    create(userId, { deviceId, deviceName, condition, action, note = "", approved = false, hours }) {
      const h = Math.min(MAX_HOURS, Math.max(0.1, Number(hours) || DEFAULT_HOURS));
      const at = now();
      const { lastInsertRowid } = q.add.run(userId, deviceId, deviceName ?? "", JSON.stringify(condition), JSON.stringify(action),
        str(note), approved ? 1 : 0, new Date(at + h * 3600_000).toISOString(), new Date(at).toISOString());
      return row(q.get.get(Number(lastInsertRowid)));
    },
    get: (id) => row(q.get.get(Number(id))),
    live: () => q.live.all().map(row),
    mine: (userId) => q.mine.all(userId).map(row),
    update: (id, { state, status, fireAt = null }) => q.update.run(JSON.stringify(state ?? {}), status, fireAt, id),
    cancel: (userId, id) => q.cancel.run(userId, Number(id)).changes > 0,
    cancelAll: (userId) => q.cancelAll.run(userId).changes,
  };
}
