// Egasining yozuvlari: loyihalar (nom → papka; VS Code va Claude Code uchun), ssenariylar (bir so'z — bir nechta ish),
// Siri kalitlari (faqat /api/voice uchun, bazada xeshi saqlanadi).
import { createHash, randomBytes } from "node:crypto";
import { ValidationError } from "../core/errors.js";

const NAME_MAX = 60;
const PATH_MAX = 1024;
const STEPS_MAX = 2000;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const TOKEN_PREFIX = "jgr_";
export const TOKEN_SCOPES = ["siri", "device"];

const cleanName = (s) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
const key = (s) => cleanName(s).toLowerCase();
const hash = (token) => createHash("sha256").update(token).digest("hex");

/** @param {import("node:sqlite").DatabaseSync} db */
export function createProjects(db) {
  const q = {
    upsert: db.prepare("INSERT INTO projects (user_id, name, path) VALUES (?, ?, ?) ON CONFLICT(user_id, name) DO UPDATE SET path = excluded.path"),
    list: db.prepare("SELECT name, path FROM projects WHERE user_id = ? ORDER BY name"),
    remove: db.prepare("DELETE FROM projects WHERE user_id = ? AND name = ?"),
  };
  return {
    save(userId, name, path) {
      const n = key(name);
      const p = String(path ?? "").trim().slice(0, PATH_MAX);
      if (!n || !p) throw new ValidationError("Loyiha nomi va papkasi kerak");
      q.upsert.run(userId, n, p);
      return { name: n, path: p };
    },
    list: (userId) => q.list.all(userId),
    /** Nom bo'yicha (to'liq yoki qisman). */
    find(userId, name) {
      const n = key(name);
      const all = q.list.all(userId);
      return all.find((p) => p.name === n) ?? all.find((p) => p.name.includes(n) || n.includes(p.name)) ?? null;
    },
    remove: (userId, name) => q.remove.run(userId, key(name)).changes > 0,
  };
}

/** @param {import("node:sqlite").DatabaseSync} db */
export function createScenarios(db) {
  const q = {
    upsert: db.prepare("INSERT INTO scenarios (user_id, name, steps, at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, name) DO UPDATE SET steps = excluded.steps, at = excluded.at"),
    list: db.prepare("SELECT name, steps, at, last_run AS lastRun FROM scenarios WHERE user_id = ? ORDER BY name"),
    timed: db.prepare("SELECT user_id AS userId, name, steps, at, last_run AS lastRun FROM scenarios WHERE at IS NOT NULL"),
    ran: db.prepare("UPDATE scenarios SET last_run = ? WHERE user_id = ? AND name = ?"),
    remove: db.prepare("DELETE FROM scenarios WHERE user_id = ? AND name = ?"),
  };
  return {
    /** at — "HH:MM" (Toshkent, har kuni) yoki bo'sh. */
    save(userId, name, steps, at = null) {
      const n = key(name);
      const s = String(steps ?? "").trim().slice(0, STEPS_MAX);
      if (!n || !s) throw new ValidationError("Ssenariy nomi va qadamlari kerak");
      if (at && !TIME_RE.test(at)) throw new ValidationError("Vaqt HH:MM shaklida bo'lsin (masalan 08:00)");
      q.upsert.run(userId, n, s, at || null);
      return { name: n, steps: s, at: at || null };
    },
    list: (userId) => q.list.all(userId),
    find: (userId, name) => q.list.all(userId).find((s) => s.name === key(name)) ?? null,
    timed: () => q.timed.all(),
    markRun: (userId, name, day) => q.ran.run(day, userId, key(name)),
    remove: (userId, name) => q.remove.run(userId, key(name)).changes > 0,
  };
}

/** @param {import("node:sqlite").DatabaseSync} db */
export function createApiTokens(db, { now = Date.now } = {}) {
  const q = {
    add: db.prepare("INSERT INTO api_tokens (user_id, name, token_hash, created_at, scope) VALUES (?, ?, ?, ?, ?)"),
    list: db.prepare("SELECT id, name, scope, created_at AS createdAt, last_used AS lastUsed FROM api_tokens WHERE user_id = ? ORDER BY id"),
    byHash: db.prepare("SELECT id, user_id AS userId, scope FROM api_tokens WHERE token_hash = ?"),
    used: db.prepare("UPDATE api_tokens SET last_used = ? WHERE id = ?"),
    remove: db.prepare("DELETE FROM api_tokens WHERE user_id = ? AND id = ?"),
  };
  return {
    /** Yangi kalit — faqat shu yerda bir marta ko'rsatiladi. scope: "siri" | "device". */
    create(userId, name, scope = "siri") {
      if (!TOKEN_SCOPES.includes(scope)) throw new ValidationError(`scope: ${TOKEN_SCOPES.join(" | ")}`);
      const token = `${TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
      const { lastInsertRowid } = q.add.run(userId, cleanName(name) || "Siri", hash(token), new Date(now()).toISOString(), scope);
      return { id: Number(lastInsertRowid), token, scope };
    },
    list: (userId) => q.list.all(userId),
    /** Kalit egasining id'si — faqat shu turdagi (scope) kalit bo'lsa; boshqasi — null. */
    userIdFor(token, scope) {
      if (typeof token !== "string" || !token.startsWith(TOKEN_PREFIX)) return null;
      const row = q.byHash.get(hash(token));
      if (!row || row.scope !== scope) return null;
      q.used.run(new Date(now()).toISOString(), row.id);
      return row.userId;
    },
    remove: (userId, id) => q.remove.run(userId, Number(id)).changes > 0,
  };
}
