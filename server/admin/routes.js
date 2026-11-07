// /api/admin: faqat support (SUPPORT_EMAILS). Umumiy sozlamalar — hamma foydalanuvchiga ta'sir qiladi.
import express from "express";
import { ValidationError } from "../core/errors.js";
import { FISH_MODELS } from "../voice/fishaudio.js";

/**
 * @param {{ settings: ReturnType<import("../settings/store.js").createSettingsStore>,
 *           providers: Record<string, { configured: boolean }> }} options
 */
export function createAdminRouter({ settings, providers }) {
  const router = express.Router();

  router.use((req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Kirilmagan.", code: "auth_required" });
    if (req.user.role !== "support") return res.status(403).json({ error: "Faqat support uchun.", code: "forbidden" });
    next();
  });

  const view = () => ({
    ttsProvider: settings.ttsProvider(),
    fishModel: settings.fishModel(),
    fishModels: FISH_MODELS,
    providers: Object.fromEntries(Object.entries(providers).map(([name, p]) => [name, Boolean(p?.configured)])),
  });

  router.get("/settings", (_req, res) => res.json(view()));

  router.put("/settings", (req, res) => {
    try {
      // Faqat yuborilgan maydon o'zgaradi (ovoz xizmati yoki Fish modeli).
      const { ttsProvider, fishModel } = req.body ?? {};
      if (ttsProvider === undefined && fishModel === undefined) throw new ValidationError("ttsProvider yoki fishModel kerak");
      if (ttsProvider !== undefined) settings.setTtsProvider(ttsProvider);
      if (fishModel !== undefined) settings.setFishModel(fishModel);
      res.json(view());
    } catch (err) {
      if (err instanceof ValidationError) return res.status(400).json({ error: err.message, code: "invalid" });
      console.error("[/api/admin/settings]", err);
      res.status(500).json({ error: "Sozlamani saqlab bo'lmadi.", code: "server" });
    }
  });

  return router;
}
