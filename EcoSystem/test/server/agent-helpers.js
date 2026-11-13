// Agent testlari uchun: xotiradagi bazada egasi va barcha xizmatlar (jurnal, kuzatuvlar, loyihalar ...).
import { openDatabase } from "../../server/db/database.js";
import { createJournal } from "../../server/agent/journal.js";
import { createWatchStore } from "../../server/agent/watches.js";
import { createProjects, createScenarios, createApiTokens } from "../../server/agent/records.js";
import { createNudgeStore } from "../../server/proactive/store.js";
import { createEcoSettings } from "../../server/settings.js";
import { createApprovals } from "../../server/devices/approvals.js";

/** Egasi id=1 (FK uchun) va xizmatlar. */
export function testServices({ now = Date.now, dir = null } = {}) {
  const db = openDatabase(":memory:");
  db.prepare("INSERT INTO users (id, name, email, password_hash) VALUES (1, 'Egasi', 'egasi@jigar.local', 'x')").run();
  const services = {
    journal: createJournal(db, { dir, now, log: () => {} }), watches: createWatchStore(db, { now }), projects: createProjects(db),
    scenarios: createScenarios(db), tokens: createApiTokens(db, { now }), nudges: createNudgeStore(db, { now }),
    settings: createEcoSettings(db, {}, { now }), approvals: createApprovals({ now }),
  };
  return { db, services };
}
