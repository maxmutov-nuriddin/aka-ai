// CORS: Chrome kengaytmasi va ruxsat berilgan saytlar uchun. Kengaytma Bearer token bilan ishlaydi (cookie emas).

/** @param {string[]} allowed manbalar ro'yxati; "chrome-extension://*" — barcha kengaytmalar */
export function cors(allowed) {
  return (req, res, next) => {
    const origin = req.get("Origin");
    if (origin) {
      const ok =
        allowed.includes("*") ||
        allowed.includes(origin) ||
        (allowed.includes("chrome-extension://*") && origin.startsWith("chrome-extension://"));
      if (ok) {
        res.set("Access-Control-Allow-Origin", origin);
        res.set("Vary", "Origin");
        res.set("Access-Control-Allow-Methods", "POST, GET, PUT, OPTIONS"); // PUT — support sozlamalari
        res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
        res.set("Access-Control-Expose-Headers", "X-Word-Starts");
      }
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  };
}
