// Oddiy xotiradagi so'rov cheklovchi. Kirgan foydalanuvchi — o'z ID'si bo'yicha, kirmagan — IP bo'yicha.
const MAX_TRACKED = 10_000;

const defaultKey = (req) => (req.user ? `user:${req.user.id}` : `ip:${req.ip}`);

/**
 * @param {{ windowMs: number, max: number, message?: string, key?: (req: import("express").Request) => string }} options
 */
export function rateLimiter({
  windowMs,
  max,
  message = "Juda ko'p so'rov yubordingiz, jigar. Bir oz dam olib, keyinroq urinib ko'r.",
  key = defaultKey,
}) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const id = key(req);
    const entry = hits.get(id);
    if (!entry || now - entry.start > windowMs) {
      hits.set(id, { start: now, count: 1 });
      if (hits.size > MAX_TRACKED) {
        for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
      }
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set("Retry-After", String(Math.ceil((entry.start + windowMs - now) / 1000)));
      return res.status(429).json({ error: message });
    }
    next();
  };
}
