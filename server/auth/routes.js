// /api/auth: ro'yxatdan o'tish, kirish, chiqish, joriy foydalanuvchi.
import express from "express";
import { ValidationError } from "../core/errors.js";
import { rateLimiter } from "../http/rate-limit.js";
import { DuplicateEmailError, SESSION_DAYS } from "./store.js";
import { sessionCookie } from "./session.js";

const AUTH_WINDOW_MS = 15 * 60_000;
const AUTH_MAX = 20; // parolni tanlab topishdan himoya

/**
 * @param {{ store: ReturnType<import("./store.js").createAuthStore>, secureCookies: boolean, authMax?: number }} options
 */
export function createAuthRouter({ store, secureCookies, authMax = AUTH_MAX }) {
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

  router.post("/register", limiter, async (req, res) => {
    try {
      const user = await store.createUser(req.body ?? {});
      startSession(req, res, user, 201);
    } catch (err) {
      if (err instanceof ValidationError) return res.status(400).json({ error: err.message, code: "invalid" });
      if (err instanceof DuplicateEmailError) return res.status(409).json({ error: err.message, code: "duplicate_email" });
      console.error("[/api/auth/register]", err);
      res.status(500).json({ error: "Ro'yxatdan o'tkazib bo'lmadi.", code: "server" });
    }
  });

  router.post("/login", limiter, async (req, res) => {
    try {
      const user = await store.verifyCredentials(req.body?.email, req.body?.password);
      if (!user) return res.status(401).json({ error: "Email yoki parol noto'g'ri.", code: "bad_credentials" });
      startSession(req, res, user);
    } catch (err) {
      if (err instanceof ValidationError) return res.status(400).json({ error: err.message, code: "invalid" });
      console.error("[/api/auth/login]", err);
      res.status(500).json({ error: "Kirib bo'lmadi.", code: "server" });
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
    if (req.user.role !== "support") return res.status(403).json({ error: "Faqat support uchun.", code: "forbidden" });
    try {
      res.json({ user: store.updateProfile(req.user.id, req.body?.profile) });
    } catch (err) {
      if (err instanceof ValidationError) return res.status(400).json({ error: err.message, code: "invalid" });
      console.error("[/api/auth/profile]", err);
      res.status(500).json({ error: "Profilni saqlab bo'lmadi.", code: "server" });
    }
  });

  router.get("/me", (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Kirilmagan.", code: "auth_required" });
    res.json({ user: req.user });
  });

  return router;
}
