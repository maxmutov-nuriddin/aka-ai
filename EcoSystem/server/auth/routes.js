// /api/auth (EcoSystem): egasi — parol qo'yish (setup), kirish (faqat parol), chiqish, parol, profil.
import express from "express";
import { ValidationError } from "../core/errors.js";
import { rateLimiter } from "../http/rate-limit.js";
import { isWeakPassword } from "../http/security.js";
import { BlockedError, DuplicateEmailError, OWNER_EMAIL, SESSION_DAYS } from "./store.js";
import { sessionCookie } from "./session.js";

const AUTH_WINDOW_MS = 15 * 60_000;
const AUTH_MAX = 20; // parolni tanlab topishdan himoya

/**
 * @param {{ store: ReturnType<import("./store.js").createAuthStore>, secureCookies: boolean, authMax?: number }} options
 */
export function createAuthRouter({ store, secureCookies, authMax = AUTH_MAX, production = false }) {
  /** Internetga chiqarilganda zaif parol (12345678 kabi) qabul qilinmaydi; lokal ishda — ruxsat. */
  const weak = (password) => production && isWeakPassword(password);
  const WEAK_MESSAGE = "Parol juda oddiy (12345678, password kabi). Uzunroq va noyob parol tanlang.";
  const router = express.Router();
  const limiter = rateLimiter({
    windowMs: AUTH_WINDOW_MS,
    max: authMax,
    key: (req) => `auth:${req.ip}`,
    message: "Urinishlar juda ko'p. 15 daqiqadan keyin qayta urin.",
  });
  const maxAgeSeconds = SESSION_DAYS * 86_400;

  /** Veb — cookie o'rnatiladi; kengaytma — token javobda qaytadi (chrome.storage'da saqlanadi). */
  function startSession(req, res, user, status = 200) {
    const client = req.body?.client === "extension" ? "extension" : "web";
    const token = store.createSession(user.id, client);
    if (client === "extension") return res.status(status).json({ user, token });
    res.set("Set-Cookie", sessionCookie(token, { secure: secureCookies, maxAgeSeconds }));
    res.status(status).json({ user });
  }

  // Birinchi ochilish: egasi parol qo'yadi (ism — ixtiyoriy). Hisob allaqachon bor bo'lsa — 409.
  router.post("/setup", limiter, async (req, res) => {
    try {
      if (store.ownerUser()) return res.status(409).json({ error: "Parol allaqachon qo'yilgan. Kiring.", code: "already_setup" });
      if (weak(req.body?.password)) return res.status(400).json({ error: WEAK_MESSAGE, code: "weak_password" });
      const name = String(req.body?.name ?? "").trim() || "Egasi";
      const user = await store.createUser({ name, email: OWNER_EMAIL, password: req.body?.password, profile: req.body?.profile });
      startSession(req, res, user, 201);
    } catch (err) {
      if (err instanceof ValidationError) return res.status(400).json({ error: err.message, code: "invalid" });
      if (err instanceof DuplicateEmailError) return res.status(409).json({ error: "Parol allaqachon qo'yilgan. Kiring.", code: "already_setup" });
      console.error("[/api/auth/setup]", err);
      res.status(500).json({ error: "Sozlab bo'lmadi.", code: "server" });
    }
  });

  // Kirish — faqat parol (yagona hisob — egasi).
  router.post("/login", limiter, async (req, res) => {
    try {
      const user = await store.verifyCredentials(OWNER_EMAIL, req.body?.password);
      if (!user) return res.status(401).json({ error: "Parol noto'g'ri.", code: "bad_credentials" });
      startSession(req, res, user);
    } catch (err) {
      if (err instanceof ValidationError) return res.status(400).json({ error: err.message, code: "invalid" });
      if (err instanceof BlockedError) return res.status(403).json({ error: err.message, code: "blocked" });
      console.error("[/api/auth/login]", err);
      res.status(500).json({ error: "Kirib bo'lmadi.", code: "server" });
    }
  });

  // Parolni o'zgartirish (Sozlamalar) — boshqa qurilmalardan shu parol bilan kiriladi.
  router.put("/password", limiter, async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Kirilmagan.", code: "auth_required" });
    try {
      if (weak(req.body?.password)) return res.status(400).json({ error: WEAK_MESSAGE, code: "weak_password" });
      await store.updatePassword(req.user.id, req.body?.password);
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof ValidationError) return res.status(400).json({ error: err.message, code: "invalid" });
      console.error("[/api/auth/password]", err);
      res.status(500).json({ error: "Parolni saqlab bo'lmadi.", code: "server" });
    }
  });

  router.post("/logout", (req, res) => {
    store.deleteSession(req.sessionToken);
    res.set("Set-Cookie", sessionCookie("", { secure: secureCookies, maxAgeSeconds: 0 }));
    res.json({ ok: true });
  });

  // Profilni yangilash (sozlamalardagi xarakter / sinf tanlovi).
  router.put("/profile", (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Kirilmagan.", code: "auth_required" });
    // Oddiy foydalanuvchi ro'yxatdan o'tishda tanlagan sozlamalarda qoladi — o'zgartirish faqat support uchun.
    // EcoSystem: kirgan har kim — egasi (ro'yxatdan faqat ECO_OWNER_EMAILS o'tadi)
    try {
      res.json({ user: store.updateProfile(req.user.id, req.body?.profile) });
    } catch (err) {
      if (err instanceof ValidationError) return res.status(400).json({ error: err.message, code: "invalid" });
      console.error("[/api/auth/profile]", err);
      res.status(500).json({ error: "Profilni saqlab bo'lmadi.", code: "server" });
    }
  });

  // Til (UZ/RU) — har bir kirgan foydalanuvchi o'zi tanlaydi; Jigar shu tilda gapiradi.
  router.put("/lang", (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Kirilmagan.", code: "auth_required" });
    try {
      res.json({ user: store.updateLang(req.user.id, req.body?.lang) });
    } catch (err) {
      if (err instanceof ValidationError) return res.status(400).json({ error: err.message, code: "invalid" });
      console.error("[/api/auth/lang]", err);
      res.status(500).json({ error: "Tilni saqlab bo'lmadi.", code: "server" });
    }
  });

  // Ism — hisobning shaxsiy maydoni; uni har bir kirgan foydalanuvchi yangilay oladi.
  router.put("/name", (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Kirilmagan.", code: "auth_required" });
    try {
      res.json({ user: store.updateName(req.user.id, req.body?.name) });
    } catch (err) {
      if (err instanceof ValidationError) return res.status(400).json({ error: err.message, code: "invalid" });
      console.error("[/api/auth/name]", err);
      res.status(500).json({ error: "Ismni saqlab bo'lmadi.", code: "server" });
    }
  });

  router.get("/me", (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Kirilmagan.", code: "auth_required" });
    res.json({ user: req.user });
  });

  return router;
}
