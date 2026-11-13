// Agent yo'llari:
//   POST /api/voice                 — Siri / Shortcuts: { text } → { speech, text } (Siri kaliti yoki sessiya bilan)
//   GET/POST/DELETE /api/tokens     — Siri kalitlari (yaratish — bir marta ko'rsatiladi)
//   GET  /api/journal/:kind         — jurnal md (gaps | errors | actions) — yuklab olish
//   POST /api/watches/:id/cancel    — kuzatuvni bekor qilish (ogohlantirish kartasidagi tugma)
//   POST /api/stop                  — favqulodda TO'XTA (kuzatuvlar bekor, daraja — xavfsiz)
import express from "express";
import { journalMarkdown, JOURNAL_KINDS } from "./journal.js";

const VOICE_HISTORY_MS = 10 * 60_000; // Siri savollari shu vaqt ichida bitta suhbat
const VOICE_HISTORY_MAX = 10;
const VOICE_TEXT_MAX = 1000;
const VOICE_NOTE = "Siri orqali ovozli so'rov: javob 1-2 qisqa gap, faqat gapirish uchun (ro'yxat, kod, chizma yo'q). Asboblar bilan darhol bajar.";
const KIND_BY_NAME = { gaps: "gap", errors: "error", actions: "action" };

/** Siri uchun toza nutq: ovoz/yuz teglari, markdown belgilari olib tashlanadi. */
export function speechText(text) {
  return String(text ?? "").replace(/\[[a-z]+\]\s*/g, "").replace(/[*_`#>|]/g, "").replace(/\n{2,}/g, "\n").trim();
}

// Siri kaliti o'g'irlansa zarar cheklansin: Siri orqali eng yuqori daraja — "keng" (to'liq va cheksiz — faqat ilovadan).
export const VOICE_MAX_LEVEL = "wide";
const LEVEL_ORDER = ["safe", "wide", "full", "unlimited"];
export const capLevel = (level, max = VOICE_MAX_LEVEL) => (LEVEL_ORDER.indexOf(level) > LEVEL_ORDER.indexOf(max) ? max : level);

/**
 * @param {{ jigar, tokens, journal, watches, settings, nudges, makeToolbox: (userId: number, extra?: object) => object,
 *           memories: (userId: number) => string[], nowNote: (toolbox: object) => string, limiter: import("express").RequestHandler }} deps
 */
export function createAgentRouter({ jigar, tokens, journal, watches, settings, makeToolbox, memories, nowNote, limiter }) {
  const router = express.Router();
  const conversations = new Map(); // userId -> { history, at } — Siri suhbati davomi
  const signedIn = (req, res, next) => (req.user ? next() : res.status(401).json({ error: "Kirilmagan.", code: "auth_required" }));

  /** Siri kaliti (Bearer jgr_...) yoki odatdagi sessiya. */
  function voiceAuth(req, res, next) {
    if (req.user) return next();
    const bearer = /^Bearer\s+(\S+)$/i.exec(req.get("Authorization") || "")?.[1];
    const userId = tokens.userIdFor(bearer, "siri");
    if (!userId) return res.status(401).json({ error: "Siri kaliti noto'g'ri yoki o'chirilgan.", speech: "Kalit noto'g'ri. Jigar sozlamalaridan yangi kalit oling." });
    req.user = { id: userId };
    next();
  }

  router.post("/voice", limiter, voiceAuth, async (req, res) => {
    const text = String(req.body?.text ?? "").trim().slice(0, VOICE_TEXT_MAX);
    if (!text) return res.status(400).json({ error: "text bo'sh", speech: "Gapingizni eshitmadim." });
    const userId = req.user.id;
    const previous = conversations.get(userId);
    const history = previous && Date.now() - previous.at < VOICE_HISTORY_MS ? previous.history : [];
    try {
      const toolbox = makeToolbox(userId, { access: capLevel(settings.all().access) });
      const result = await jigar.chat({
        history: [...history, { role: "user", content: text }],
        toolbox, llm: settings.all().llm, length: "qisqa", effort: settings.all().effort,
        memories: memories(userId), nowNote: `${nowNote(toolbox)}. ${VOICE_NOTE}`,
      });
      const answer = result.parsed?.tushuntirish || result.text;
      const nextHistory = [...history, { role: "user", content: result.userContent ?? text }, { role: "assistant", content: result.text }];
      conversations.set(userId, { history: nextHistory.slice(-VOICE_HISTORY_MAX + (nextHistory.length % 2 ? 1 : 0)), at: Date.now() });
      res.json({ speech: speechText(answer), text: answer });
    } catch (err) {
      console.error("[/api/voice]", err);
      res.status(502).json({ error: "Jigar javob bera olmadi.", speech: "Kechirasiz, hozir javob bera olmadim. Qayta urinib ko'ring." });
    }
  });

  router.get("/tokens", signedIn, (req, res) => res.json({ tokens: tokens.list(req.user.id) }));
  router.post("/tokens", signedIn, (req, res) => {
    try {
      res.json(tokens.create(req.user.id, req.body?.name, req.body?.scope === "device" ? "device" : "siri"));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  router.delete("/tokens/:id", signedIn, (req, res) => res.json({ ok: tokens.remove(req.user.id, req.params.id) }));

  router.get("/journal/:kind", signedIn, (req, res) => {
    const kind = KIND_BY_NAME[req.params.kind];
    if (!kind) return res.status(404).json({ error: "gaps | errors | actions" });
    res.set("Content-Type", "text/markdown; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="${JOURNAL_KINDS[kind]}"`);
    res.send(journalMarkdown(kind, journal.list(req.user.id, kind)));
  });

  router.post("/watches/:id/cancel", signedIn, (req, res) => {
    const ok = watches.cancel(req.user.id, req.params.id);
    res.status(ok ? 200 : 404).json({ ok });
  });

  router.post("/stop", signedIn, (req, res) => {
    const cancelled = watches.cancelAll(req.user.id);
    settings.update({ access: "safe" });
    journal.add(req.user.id, "action", "TO'XTA", { natija: `${cancelled} ta kuzatuv bekor qilindi, daraja — xavfsiz` });
    res.json({ ok: true, cancelled });
  });

  return router;
}
