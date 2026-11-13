// Xavfsizlik sarlavhalari va ishga tushirish tekshiruvlari (joylash uchun).
//  - securityHeaders: clickjacking, MIME-sniffing, Referrer; production'da HSTS.
//  - productionProblems: internetga chiqarishdan oldin xavfli sozlamalarni aniqlaydi (serverni to'xtatadi yoki ogohlantiradi).

/** Har javobga qo'shiladigan sarlavhalar. Mikrofon va kamera — faqat shu sahifa; geolokatsiya va boshqalar — yo'q. */
export function securityHeaders({ production = false } = {}) {
  return (_req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "microphone=(self), camera=(self), geolocation=(), payment=()",
      "Cross-Origin-Opener-Policy": "same-origin",
    });
    if (production) res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    next();
  };
}

const COMMON_PASSWORDS = new Set([
  "12345678", "123456789", "1234567890", "11111111", "00000000", "password", "password1", "qwertyui", "qwerty123",
  "iloveyou", "abc12345", "12341234", "87654321", "jigar123", "jigar1234", "admin123", "parol123", "12345678a",
]);

/** Juda zaif parolmi (internetga chiqarilganda ruxsat berilmaydi). */
export function isWeakPassword(password) {
  const p = String(password ?? "");
  if (COMMON_PASSWORDS.has(p.toLowerCase())) return true;
  if (/^(.)\1+$/.test(p)) return true; // aaaaaaaa
  return new Set(p).size < 4; // 4 tadan kam har xil belgi
}

/**
 * Production sozlamalari: { fatal: [...], warn: [...] } — fatal bo'lsa server ishga tushmaydi.
 * @param {Record<string, string | undefined>} env
 */
export function productionProblems(env) {
  const fatal = [];
  const warn = [];
  if (env.NODE_ENV !== "production") return { fatal, warn };
  if (env.ECO_LOCAL_NOAUTH === "1") fatal.push("ECO_LOCAL_NOAUTH=1 — internetda parolsiz kirish ochiq qoladi. ECO_LOCAL_NOAUTH=0 qiling.");
  if (!env.TRUST_PROXY) fatal.push("TRUST_PROXY o'rnatilmagan — proksi (HTTPS) orqasida TRUST_PROXY=1 bo'lishi shart (aks holda hamma so'rov bir IP'dan deb sanaladi).");
  if (env.COOKIE_SECURE === "0") fatal.push("COOKIE_SECURE=0 — sessiya cookie'si shifrlanmagan aloqada yuboriladi.");
  if (!env.ANTHROPIC_API_KEY?.trim()) warn.push("ANTHROPIC_API_KEY yo'q — Jigar javob bera olmaydi.");
  if ((env.HOST || "0.0.0.0") === "0.0.0.0" && !env.ECO_DOCKER) warn.push("HOST=0.0.0.0 — proksidan tashqari ham kirish mumkin. Proksi bir mashinada bo'lsa HOST=127.0.0.1 qiling.");
  if (!env.ECO_ALLOWED_ORIGINS?.trim()) warn.push("ECO_ALLOWED_ORIGINS bo'sh — boshqa manbadan (masalan, kengaytma) API'ga kirish yopiq. Odatda shunday kerak.");
  return { fatal, warn };
}
