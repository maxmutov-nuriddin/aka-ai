// Joylashga tayyorlik: production tekshiruvlari, zaif parol, jurnal maxfiyligi, baza zaxirasi, qurilma chegarasi.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { productionProblems, isWeakPassword } from "../../server/http/security.js";
import { maskSecrets, redactInput } from "../../server/agent/redact.js";
import { backupDatabase } from "../../server/db/backup.js";
import { openDatabase } from "../../server/db/database.js";
import { createToolbox } from "../../server/agent/toolbox.js";
import { testServices } from "./agent-helpers.js";

const require = createRequire(import.meta.url);

test("productionProblems: lokalda jim; production'da xavfli sozlama — fatal, kam xavfli — ogohlantirish", () => {
  assert.deepEqual(productionProblems({ ECO_LOCAL_NOAUTH: "1" }), { fatal: [], warn: [] });
  const bad = productionProblems({ NODE_ENV: "production", ECO_LOCAL_NOAUTH: "1", ANTHROPIC_API_KEY: "k" });
  assert.equal(bad.fatal.length, 2, "parolsiz kirish va TRUST_PROXY");
  assert.match(bad.fatal[0], /ECO_LOCAL_NOAUTH/);
  assert.equal(productionProblems({ NODE_ENV: "production", TRUST_PROXY: "1", COOKIE_SECURE: "0", ANTHROPIC_API_KEY: "k" }).fatal.length, 1);
  const ok = productionProblems({ NODE_ENV: "production", TRUST_PROXY: "1", ANTHROPIC_API_KEY: "k", HOST: "127.0.0.1", ECO_ALLOWED_ORIGINS: "x" });
  assert.deepEqual(ok, { fatal: [], warn: [] });
  assert.ok(productionProblems({ NODE_ENV: "production", TRUST_PROXY: "1" }).warn.some((w) => /ANTHROPIC/.test(w)));
});

test("isWeakPassword: oddiy va takrorlanuvchi parollar", () => {
  for (const weak of ["12345678", "Password", "11111111", "aaaaaaaaa", "abababab"]) assert.equal(isWeakPassword(weak), true, weak);
  for (const strong of ["kuchli-parol-2026", "Tr0ub4dor&3x"]) assert.equal(isWeakPassword(strong), false, strong);
});

test("redact: kalitlar yashiriladi; fayl mazmuni va SMS matni jurnalga tushmaydi", () => {
  assert.equal(maskSecrets("sk-ant-api03-ABCDEFGHIJKLMNOP"), "***");
  assert.equal(maskSecrets("curl -H 'Authorization: Bearer abcdefghijklmnop'"), "curl -H 'Authorization: ***'");
  assert.equal(maskSecrets("--password=Sirli123 --token abc"), "--*** ***");
  assert.equal(maskSecrets("jgr_abcdefghijklmnopq"), "***");
  assert.equal(maskSecrets("oddiy matn va 12345"), "oddiy matn va 12345");
  assert.match(redactInput("pc_write_file", { path: "~/a.txt", content: "parol=xyz maxfiy" }), /"content":"\(16 belgi\)"/);
  assert.doesNotMatch(redactInput("phone", { action: "sms", to: "+998901234567", text: "yashirin xabar" }), /yashirin/);
  assert.match(redactInput("pc_dev", { action: "claude", prompt: "x".repeat(500) }), /x{120}/);
});

test("toolbox: jurnalga maxfiy ma'lumot tushmaydi (fayl mazmuni, parol)", async () => {
  const { services } = testServices();
  const hub = {
    list: () => [{ id: "pc-0001", name: "Mac", platform: "darwin", kind: "pc" }],
    call: async () => ({ text: "token=SIRLIKALIT123456 yozildi" }),
  };
  const box = createToolbox({ hub, userId: 1, access: "full", ask: async () => true, services });
  await box.run("pc_write_file", { path: "~/a.txt", content: "juda maxfiy mazmun", reason: "sinov" });
  const entry = services.journal.list(1, "action")[0];
  assert.doesNotMatch(entry.detail, /maxfiy mazmun|SIRLIKALIT/);
});

test("baza zaxirasi: bugungi nusxa bir marta; eskilari (7 tadan ortig'i) o'chadi; zaxira ochiladi", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "jigar-backup-"));
  const file = path.join(dir, "src.db");
  const db = openDatabase(file);
  db.prepare("INSERT INTO users (name, email, password_hash) VALUES ('Egasi', 'egasi@jigar.local', 'x')").run();
  for (let day = 1; day <= 9; day++) writeFileSync(path.join(dir, `eco-2026-11-0${day}.db`), "eski");
  const when = Date.parse("2026-11-13T10:00:00Z");
  const created = backupDatabase(db, dir, { now: () => when });
  assert.equal(path.basename(created), "eco-2026-11-13.db");
  assert.equal(backupDatabase(db, dir, { now: () => when }), null, "bugun yana yaratilmaydi");
  const kept = readdirSync(dir).filter((f) => /^eco-/.test(f));
  assert.equal(kept.length, 7);
  assert.ok(!kept.includes("eco-2026-11-01.db"));
  const copy = openDatabase(created);
  assert.equal(copy.prepare("SELECT COUNT(*) AS n FROM users").get().n, 1);
});

test("qurilma chegarasi: server cheksiz yuborsa ham 'full'dan oshmaydi; noto'g'ri daraja — safe", () => {
  const { effectiveLevel } = require("../../desktop/access-cap.js");
  assert.equal(effectiveLevel("unlimited"), "unlimited");
  assert.equal(effectiveLevel("unlimited", "unlimited"), "unlimited");
  assert.equal(effectiveLevel("full", "wide"), "wide");
  assert.equal(effectiveLevel("wide", "full"), "wide");
  assert.equal(effectiveLevel("root", "full"), "safe");
  assert.equal(effectiveLevel(undefined, "yomon"), "safe");
});

test("rateLimitUntil: 429 da kutish vaqti 'retry in' dan; topilmasa — 1 soat; boshqa xato — null", async () => {
  const { rateLimitUntil } = await import("../../server/app.js");
  assert.equal(rateLimitUntil("Gemini TTS 429: Please retry in 5h4m25s or upgrade", 0), (5 * 3600 + 4 * 60 + 25) * 1000);
  assert.equal(rateLimitUntil("Rate limit exceeded, retry in 30s", 0), 30_000);
  assert.equal(rateLimitUntil("429 Too Many Requests", 0), 3600_000);
  assert.equal(rateLimitUntil("ECONNRESET", 0), null);
});
