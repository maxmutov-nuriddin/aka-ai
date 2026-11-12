// Sessiyani aniqlash: veb — httpOnly cookie, kengaytma — "Authorization: Bearer <token>".
// CSRF: cookie SameSite=Lax, API esa faqat application/json yoki audio/* qabul qiladi — boshqa sayt
// bunday so'rovni CORS ruxsatisiz yubora olmaydi.

export const SESSION_COOKIE = "jigar_session";

/** @param {import("express").Request} req @param {string} name */
export function readCookie(req, name) {
  for (const part of (req.get("Cookie") || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return "";
      }
    }
  }
  return "";
}

/** Set-Cookie qiymati. maxAgeSeconds = 0 — cookie o'chiriladi. */
export function sessionCookie(token, { secure, maxAgeSeconds }) {
  const parts = [`${SESSION_COOKIE}=${encodeURIComponent(token)}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** Har so'rovda: req.user (yoki null) va req.sessionToken. */
export function authenticate(store) {
  return (req, _res, next) => {
    const bearer = /^Bearer\s+(\S+)$/i.exec(req.get("Authorization") || "")?.[1];
    const token = bearer || readCookie(req, SESSION_COOKIE);
    req.sessionToken = token || "";
    req.user = token ? store.userForToken(token) : null;
    next();
  };
}

/** API uchun: kirmagan bo'lsa 401. */
export function requireUser(req, res, next) {
  if (req.user) return next();
  res.status(401).json({ error: "Avval kiring yoki ro'yxatdan o'ting.", code: "auth_required" });
}

/** Sahifa uchun: kirmagan bo'lsa kirish sahifasiga, keyin shu yerga qaytadi. */
export function requireUserPage(req, res, next) {
  if (req.user) return next();
  res.redirect(302, `/login?next=${encodeURIComponent(req.originalUrl)}`);
}
