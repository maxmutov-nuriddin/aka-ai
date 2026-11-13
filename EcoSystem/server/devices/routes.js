// Qurilma yo'llari (faqat kirganlar):
//   POST /api/devices/poll    — qurilma: buyruq kutadi ({ id, name, platform, kind } bilan)
//   POST /api/devices/result  — desktop ilova: buyruq natijasi ({ id, result })
//   GET  /api/devices         — ilova: ulangan qurilmalar ro'yxati
//   POST /api/actions/:id     — ilova: xavfli amalga ruxsat ({ approve: true|false })
//   GET  /api/nudges          — ilova: Jigar o'zi aytgan, hali ko'rilmagan gaplar
//   POST /api/nudges/:id/seen — ilova: ko'rildi
import express from "express";

const RESULT_TEXT_MAX = 200_000;
const RESULT_IMAGE_MAX = 6_000_000; // base64 (~4.5 MB JPEG)

/** Desktop natijasini tekshiradi: faqat { text, image, error } (satr) va o'lcham chegarasi. */
export function normalizeResult(raw) {
  const out = {};
  if (typeof raw?.error === "string") out.error = raw.error.slice(0, RESULT_TEXT_MAX);
  if (typeof raw?.text === "string") out.text = raw.text.slice(0, RESULT_TEXT_MAX);
  if (typeof raw?.image === "string" && raw.image.length <= RESULT_IMAGE_MAX) out.image = raw.image;
  return out;
}

/**
 * @param {{ hub: object, approvals: object, nudges: object }} deps
 */
export function createDeviceRouter({ hub, approvals, nudges, tokens = null }) {
  const router = express.Router();
  // Faqat shu yo'llar uchun (router /api ga ulangan — boshqa yo'llarga tegmasin).
  const signedIn = (req, res, next) =>
    req.user ? next() : res.status(401).json({ error: "Kirilmagan.", code: "auth_required" });
  // Telefon agenti (Android, fonda) — sessiya cookie'si yo'q: shaxsiy kalit (jgr_...) bilan, faqat poll va natija.
  router.use(["/devices/poll", "/devices/result"], (req, _res, next) => {
    if (!req.user && tokens) {
      const userId = tokens.userIdFor(/^Bearer\s+(\S+)$/i.exec(req.get("Authorization") || "")?.[1], "device");
      if (userId) req.user = { id: userId };
    }
    next();
  });
  router.use(["/devices", "/actions", "/nudges"], signedIn);

  router.post("/devices/poll", async (req, res) => {
    const { id, name, platform, kind } = req.body ?? {};
    const command = await hub.poll(req.user.id, { id, name, platform, kind });
    // Ulanish uzilgan bo'lsa — buyruq yo'qolmasin: navbatga qaytariladi, keyingi poll oladi.
    if (command && (res.destroyed || req.socket?.destroyed)) return hub.requeue(req.user.id, command);
    if (!res.destroyed) res.json({ command });
  });
  router.post("/devices/result", (req, res) => {
    const ok = hub.resolve(req.user.id, String(req.body?.id ?? ""), normalizeResult(req.body?.result));
    res.status(ok ? 200 : 404).json({ ok });
  });
  router.get("/devices", (req, res) => res.json({ devices: hub.list(req.user.id) }));

  router.post("/actions/:id", (req, res) => {
    const ok = approvals.answer(req.user.id, req.params.id, req.body?.approve === true);
    res.status(ok ? 200 : 404).json({ ok });
  });

  router.get("/nudges", (req, res) => res.json({ nudges: nudges.unseen(req.user.id) }));
  router.post("/nudges/:id/seen", (req, res) => res.json({ ok: nudges.markSeen(req.user.id, req.params.id) }));
  return router;
}
