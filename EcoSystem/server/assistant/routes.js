// Shaxsiy yordamchi (support) yo'llari: xotira va eslatmalarni ko'rish, o'chirish, vaqti kelganlarini olish.
import express from "express";

const WEEKDAYS = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];
const TASHKENT_OFFSET_MS = 5 * 60 * 60_000; // UTC+5, yozgi vaqt yo'q
const pad = (n) => String(n).padStart(2, "0");

/** Jigarga hozirgi vaqt (Toshkent): "Hozir: payshanba, 2026-11-12 19:40 (Toshkent, +05:00)". */
export function tashkentNowNote(now = new Date()) {
  const t = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  const date = `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  return `Hozir: ${WEEKDAYS[t.getUTCDay()]}, ${date} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())} (Toshkent, +05:00)`;
}

/**
 * @param {{ assistant: ReturnType<import("./store.js").createAssistantStore> }} deps
 */
export function createAssistantRouter({ assistant }) {
  const router = express.Router();
  // Faqat kirganlar.
  router.use((req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Kirilmagan.", code: "auth_required" });
    // EcoSystem: kirgan har kim — egasi (ro'yxatdan faqat ECO_OWNER_EMAILS o'tadi)
    next();
  });

  router.get("/", (req, res) => {
    res.json({ memories: assistant.listMemories(req.user.id), reminders: assistant.pendingReminders(req.user.id) });
  });
  router.delete("/memories", (req, res) => res.json({ deleted: assistant.clearMemories(req.user.id) }));
  router.delete("/memories/:id", (req, res) => res.json({ ok: assistant.deleteMemory(req.user.id, req.params.id) }));
  // Vaqti kelgan eslatmalar — ilova har yarim daqiqada so'raydi.
  router.get("/reminders/due", (req, res) => res.json({ reminders: assistant.dueReminders(req.user.id) }));
  router.post("/reminders/:id/done", (req, res) => res.json({ ok: assistant.markReminderDone(req.user.id, req.params.id) }));
  router.delete("/reminders/:id", (req, res) => res.json({ ok: assistant.deleteReminder(req.user.id, req.params.id) }));
  return router;
}
