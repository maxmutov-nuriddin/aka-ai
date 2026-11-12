// Foydalanuvchilar va sessiyalar (repository). Token bazada faqat sha256 xesh ko'rinishida saqlanadi —
// baza o'g'irlansa ham sessiyani tiklab bo'lmaydi.
import { createHash, randomBytes } from "node:crypto";
import { ValidationError } from "../core/errors.js";
import { hashPassword, verifyPassword } from "./passwords.js";
import { normalizeProfile, parseStoredProfile } from "./profile.js";

// EcoSystem'da tarif rejasi yo'q (users.plan ustuni bazada qoladi, ishlatilmaydi).
const parsePlan = () => null;

/** Saqlangan paket: { key, minutes, startDay, until } — buzilgan bo'lsa null. */
const parsePackage = (text) => {
  try {
    const p = text ? JSON.parse(text) : null;
    return p && typeof p.key === "string" && Number.isFinite(p.minutes) && typeof p.startDay === "string" && typeof p.until === "string"
      ? { key: p.key, minutes: p.minutes, startDay: p.startDay, until: p.until }
      : null;
  } catch {
    return null;
  }
};

export const SESSION_DAYS = 30;
const CLIENTS = new Set(["web", "extension"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LIMITS = { nameMin: 2, nameMax: 60, emailMax: 254, passwordMin: 8, passwordMax: 128 };

export class DuplicateEmailError extends Error {}
export class BlockedError extends Error {}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const str = (v) => (typeof v === "string" ? v : "");

const DEFAULT_EMAIL_DOMAIN = "gmail.com";
const LOCAL_PART_RE = /^[a-z0-9._+-]+$/;
// Gmail domenidagi tez-tez uchraydigan xatolar.
const DOMAIN_TYPOS = new Map(
  ["gmail.ocm", "gmail.cmo", "gmail.co", "gmail.cm", "gmail.con", "gmail.om", "gmial.com", "gmal.com", "gamil.com", "gmaill.com", "gnail.com"]
    .map((typo) => [typo, DEFAULT_EMAIL_DOMAIN]),
);

/**
 * Emailni tozalaydi: kichik harf; "@" yo'q bo'lsa — "@gmail.com" qo'shiladi; gmail xatolari tuzatiladi.
 * Boshqa domen (masalan, mail.uz) tegilmaydi. Email bo'lolmaydigan matn o'zgarmaydi — validatsiya rad etadi.
 */
export function normalizeEmail(email) {
  const clean = str(email).trim().toLowerCase();
  if (!clean.includes("@")) return LOCAL_PART_RE.test(clean) ? `${clean}@${DEFAULT_EMAIL_DOMAIN}` : clean;
  const at = clean.lastIndexOf("@");
  const domain = clean.slice(at + 1);
  return DOMAIN_TYPOS.has(domain) ? `${clean.slice(0, at)}@${DOMAIN_TYPOS.get(domain)}` : clean;
}

/** Ro'yxatdan o'tish ma'lumotini tekshiradi. Qaytaradi: tozalangan {name, email, password}. */
export function validateRegistration({ name, email, password } = {}) {
  const cleanName = validateName(name);
  const cleanEmail = normalizeEmail(email);
  const pass = str(password);
  if (!EMAIL_RE.test(cleanEmail) || cleanEmail.length > LIMITS.emailMax) {
    throw new ValidationError("Email noto'g'ri.");
  }
  if (pass.length < LIMITS.passwordMin || pass.length > LIMITS.passwordMax) {
    throw new ValidationError(`Parol kamida ${LIMITS.passwordMin} belgi bo'lsin.`);
  }
  return { name: cleanName, email: cleanEmail, password: pass };
}

/** Ismni ro'yxatdan o'tish va hisob sozlamalarida bir xil qoida bilan tekshiradi. */
export function validateName(name) {
  const cleanName = str(name).trim().replace(/\s+/g, " ");
  if (cleanName.length < LIMITS.nameMin || cleanName.length > LIMITS.nameMax) {
    throw new ValidationError(`Ism ${LIMITS.nameMin}-${LIMITS.nameMax} belgi bo'lsin.`);
  }
  return cleanName;
}

/** SUPPORT_EMAILS ("a@x.uz, b@y.uz") — kichik harfli to'plam. */
export function parseSupportEmails(value) {
  return new Set(String(value ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
}

/** Mijozga beriladigan foydalanuvchi. Profil va "support" roli faqat bor bo'lsa qo'shiladi. */
function publicUser(row, supportEmails) {
  if (!row) return null;
  const profile = parseStoredProfile(row.profile);
  const support = supportEmails.has(String(row.email).toLowerCase());
  const plan = parsePlan(row.plan); // konstruktor/tarif rejasi (to'langan bo'lsa)
  const pkg = parsePackage(row.package); // Suhbatga tayyorgarlik paketi (to'langan bo'lsa)
  return {
    id: row.id, name: row.name, email: row.email,
    ...(profile ? { profile } : {}), ...(plan ? { plan } : {}), ...(pkg ? { package: pkg } : {}), ...(support ? { role: "support" } : {}),
  };
}

/**
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {{ now?: () => Date }} [options]
 */
export function createAuthStore(db, { now = () => new Date(), supportEmails = new Set() } = {}) {
  const toPublic = (row) => publicUser(row, supportEmails);
  const q = {
    insertUser: db.prepare("INSERT INTO users (name, email, password_hash, profile) VALUES (?, ?, ?, ?)"),
    userByEmail: db.prepare("SELECT id, name, email, password_hash, profile, blocked FROM users WHERE email = ?"),
    listUsers: db.prepare("SELECT id, name, email, profile, plan, package, blocked, created_at, paid_until FROM users ORDER BY id"),
    setBlocked: db.prepare("UPDATE users SET blocked = ? WHERE id = ?"),
    deleteUser: db.prepare("DELETE FROM users WHERE id = ?"),
    deleteUserSessions: db.prepare("DELETE FROM sessions WHERE user_id = ?"),
    insertSession: db.prepare("INSERT INTO sessions (token_hash, user_id, client, expires_at) VALUES (?, ?, ?, ?)"),
    sessionUser: db.prepare(
      `SELECT u.id, u.name, u.email, u.profile, u.plan, u.package FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.blocked = 0`,
    ),
    updateProfile: db.prepare("UPDATE users SET profile = ? WHERE id = ?"),
    updateName: db.prepare("UPDATE users SET name = ? WHERE id = ?"),
    userById: db.prepare("SELECT id, name, email, profile, plan, package FROM users WHERE id = ?"),
    deleteSession: db.prepare("DELETE FROM sessions WHERE token_hash = ?"),
    deleteExpired: db.prepare("DELETE FROM sessions WHERE expires_at <= ?"),
  };
  // Mavjud bo'lmagan email bilan kirishda ham parol tekshirilgandek vaqt o'tsin (email borligini oshkor qilmaslik).
  let dummyHash = null;

  async function createUser(input) {
    const { name, email, password } = validateRegistration(input);
    const profile = normalizeProfile(input?.profile); // xato bo'lsa — parol xeshlanmasdan oldin to'xtaymiz
    if (q.userByEmail.get(email)) throw new DuplicateEmailError("Bu email bilan allaqachon ro'yxatdan o'tilgan.");
    const passwordHash = await hashPassword(password);
    const { lastInsertRowid } = q.insertUser.run(name, email, passwordHash, profile ? JSON.stringify(profile) : null);
    return toPublic(q.userById.get(Number(lastInsertRowid)));
  }

  /** Email va parol to'g'ri bo'lsa — foydalanuvchi, aks holda null. */
  async function verifyCredentials(email, password) {
    const row = q.userByEmail.get(normalizeEmail(email));
    dummyHash ??= await hashPassword("dummy-password-for-timing");
    const ok = await verifyPassword(str(password), row?.password_hash ?? dummyHash);
    if (row && ok && row.blocked) throw new BlockedError("Hisob bloklangan. Support bilan bog'laning.");
    return row && ok ? toPublic(row) : null;
  }

  /** Yangi sessiya. Qaytaradi: xom token (faqat foydalanuvchiga beriladi, bazada xeshi turadi). */
  function createSession(userId, client = "web") {
    if (!CLIENTS.has(client)) throw new ValidationError("client noto'g'ri");
    const token = randomBytes(32).toString("base64url");
    const expires = new Date(now().getTime() + SESSION_DAYS * 86_400_000).toISOString();
    q.insertSession.run(sha256(token), userId, client, expires);
    return token;
  }

  function userForToken(token) {
    if (!token) return null;
    return toPublic(q.sessionUser.get(sha256(token), now().toISOString()));
  }

  /** Profilni almashtiradi (sozlamalardan xarakter, sinf va h.k.). Qaytaradi: yangilangan foydalanuvchi. */
  function updateProfile(userId, input) {
    const profile = normalizeProfile(input);
    q.updateProfile.run(profile ? JSON.stringify(profile) : null, userId);
    return toPublic(q.userById.get(userId));
  }

  /** Til (UZ/RU): har bir foydalanuvchi o'zi o'zgartiradi — profilning qolgan qismi tegilmaydi. */
  function updateLang(userId, lang) {
    const current = parseStoredProfile(q.userById.get(userId)?.profile) ?? {};
    const profile = normalizeProfile({ ...current, lang }); // noto'g'ri til — ValidationError
    q.updateProfile.run(JSON.stringify(profile), userId);
    return toPublic(q.userById.get(userId));
  }

  /** Foydalanuvchi o'z hisobidagi ismni o'zgartirishi mumkin. */
  function updateName(userId, input) {
    const name = validateName(input);
    q.updateName.run(name, userId);
    return toPublic(q.userById.get(userId));
  }

  // ---------- Support (admin panel) ----------
  const adminView = (row) => ({ ...toPublic(row), blocked: Boolean(row.blocked), createdAt: row.created_at, paidUntil: row.paid_until ?? null });

  /** Barcha foydalanuvchilar (support uchun). */
  function listUsers() {
    return q.listUsers.all().map(adminView);
  }

  /** Bloklash / blokdan chiqarish. Bloklansa — barcha sessiyalari bekor. Topilmasa — null. */
  function setBlocked(userId, blocked) {
    if (!q.userById.get(userId)) return null;
    q.setBlocked.run(blocked ? 1 : 0, userId);
    if (blocked) q.deleteUserSessions.run(userId);
    return toPublic(q.userById.get(userId));
  }

  /** Hisobni o'chiradi (sessiyalar va sarf — CASCADE). Qaytaradi: o'chirildimi. */
  function deleteUser(userId) {
    return q.deleteUser.run(userId).changes > 0;
  }

  function deleteSession(token) {
    if (token) q.deleteSession.run(sha256(token));
  }

  function deleteExpiredSessions() {
    q.deleteExpired.run(now().toISOString());
  }

  return { createUser, verifyCredentials, createSession, userForToken, updateProfile, updateLang, updateName, listUsers, setBlocked, deleteUser, deleteSession, deleteExpiredSessions };
}
