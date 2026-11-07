// Baza: VPS diskidagi bitta SQLite fayl (node:sqlite — qo'shimcha paket va alohida server kerak emas).
// Sxema versiyasi PRAGMA user_version'da saqlanadi; yangi o'zgarish — MIGRATIONS oxiriga qo'shiladi.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

const MIGRATIONS = [
  `CREATE TABLE users (
     id            INTEGER PRIMARY KEY AUTOINCREMENT,
     name          TEXT    NOT NULL,
     email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
     password_hash TEXT    NOT NULL,
     created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
   );
   CREATE TABLE sessions (
     token_hash TEXT    PRIMARY KEY,
     user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     client     TEXT    NOT NULL,
     created_at TEXT    NOT NULL DEFAULT (datetime('now')),
     expires_at TEXT    NOT NULL
   );
   CREATE INDEX sessions_by_user ON sessions(user_id);`,
  // Ro'yxatdan o'tishdagi savollar javobi (til, maqsad, uzunlik, xarakter, sinf) — JSON.
  `ALTER TABLE users ADD COLUMN profile TEXT;`,
  // Umumiy sozlamalar (support o'zgartiradi, hamma foydalanuvchiga ta'sir qiladi): masalan, ovoz xizmati.
  `CREATE TABLE settings (
     key   TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );`,
];

/**
 * Bazani ochadi (yo'q bo'lsa yaratadi) va sxemani oxirgi versiyagacha yangilaydi.
 * @param {string} file fayl yo'li yoki ":memory:" (testlar uchun)
 * @returns {DatabaseSync}
 */
export function openDatabase(file) {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;");
  migrate(db);
  return db;
}

function migrate(db) {
  const { user_version: version } = db.prepare("PRAGMA user_version").get();
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw new Error(`Baza migratsiyasi ${i + 1} bajarilmadi: ${err.message}`);
    }
  }
}
