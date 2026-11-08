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
  // Kunlik sarf (tarif limiti): foydalanuvchi × kun (Toshkent vaqti) — nechta savol berildi.
  `CREATE TABLE usage_daily (
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     day     TEXT    NOT NULL,
     chats   INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (user_id, day)
   );`,
  // Daqiqa limiti uchun: Jigar ovozga aylantirgan belgilar (~900 belgi = 1 daqiqa).
  `ALTER TABLE usage_daily ADD COLUMN tts_chars INTEGER NOT NULL DEFAULT 0;`,
  // Support bloklagan hisob: kira olmaydi, sessiyalari bekor qilinadi.
  `ALTER TABLE users ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0;`,
  // Obuna to'lovlari (PayGate) va obuna muddati (har to'lov +30 kun).
  `CREATE TABLE payments (
     payment_id  TEXT PRIMARY KEY,
     order_id    TEXT NOT NULL UNIQUE,
     user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     goal        TEXT NOT NULL,
     amount      INTEGER NOT NULL,
     status      TEXT NOT NULL DEFAULT 'pending',
     card        TEXT,
     card_holder TEXT,
     expire_at   INTEGER NOT NULL,
     created_at  TEXT NOT NULL DEFAULT (datetime('now')),
     paid_at     TEXT
   );
   CREATE INDEX payments_by_user ON payments(user_id, status);
   ALTER TABLE users ADD COLUMN paid_until TEXT;`,
  // Konstruktor tarifi: o'quvchi to'lagan reja ({ goals, minutes }) — to'lovda va foydalanuvchida.
  `ALTER TABLE users ADD COLUMN plan TEXT;
   ALTER TABLE payments ADD COLUMN plan TEXT;`,
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
