// /api/admin: faqat support (SUPPORT_EMAILS). Umumiy sozlamalar — hamma foydalanuvchiga ta'sir qiladi.
import express from "express";
import { ValidationError } from "../core/errors.js";
import { FISH_MODELS } from "../voice/fishaudio.js";
import { LLM_COST_SOM, TARIFFS, TTS_COST_SOM, comboKeys, costPerMinute, dailyMinutes, tariffFor } from "../usage/tariffs.js";

/**
 * @param {{ settings: ReturnType<import("../settings/store.js").createSettingsStore>,
 *           providers: Record<string, { configured: boolean }>,
 *           llms?: Record<string, { configured: boolean }>,
 *           store: ReturnType<import("../auth/store.js").createAuthStore>,
 *           usage: ReturnType<import("../usage/store.js").createUsageStore> }} options
 */
export function createAdminRouter({ settings, providers, store, usage, llms = {} }) {
  const router = express.Router();

  router.use((req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Kirilmagan.", code: "auth_required" });
    if (req.user.role !== "support") return res.status(403).json({ error: "Faqat support uchun.", code: "forbidden" });
    next();
  });

  const configuredMap = (services) => Object.fromEntries(Object.entries(services).map(([name, p]) => [name, Boolean(p?.configured)]));
  const view = () => ({
    llmProvider: settings.llmProvider(),
    llms: configuredMap(llms),
    ttsProvider: settings.ttsProvider(),
    fishModel: settings.fishModel(),
    fishModels: FISH_MODELS,
    providers: configuredMap(providers),
    // Narx (so'm / daqiqa): miya + ovoz — panel har juftlikni ko'rsatadi.
    costs: { llm: LLM_COST_SOM, tts: TTS_COST_SOM },
  });

  router.get("/settings", (_req, res) => res.json(view()));

  router.put("/settings", (req, res) => {
    try {
      // Faqat yuborilgan maydon o'zgaradi (miya, ovoz xizmati yoki Fish modeli).
      const { llmProvider, ttsProvider, fishModel } = req.body ?? {};
      if (llmProvider === undefined && ttsProvider === undefined && fishModel === undefined) {
        throw new ValidationError("llmProvider, ttsProvider yoki fishModel kerak");
      }
      if (llmProvider !== undefined) settings.setLlmProvider(llmProvider);
      if (ttsProvider !== undefined) settings.setTtsProvider(ttsProvider);
      if (fishModel !== undefined) settings.setFishModel(fishModel);
      res.json(view());
    } catch (err) {
      if (err instanceof ValidationError) return res.status(400).json({ error: err.message, code: "invalid" });
      console.error("[/api/admin/settings]", err);
      res.status(500).json({ error: "Sozlamani saqlab bo'lmadi.", code: "server" });
    }
  });

  // ---------- Foydalanuvchilar ----------
  const STATS_DAYS = 30;
  const withUsage = (user, lastActive) => {
    const tariff = tariffFor(user.profile?.goal);
    const limitMinutes = user.role === "support" ? null : dailyMinutes(tariff.goal, settings.ttsProvider(), settings.llmProvider());
    return { ...user, usedMinutes: usage.minutesToday(user.id), limitMinutes, tariff, lastActiveDay: lastActive.get(user.id) ?? null };
  };
  const tariffTable = () =>
    Object.entries(TARIFFS).map(([goal, t]) => ({
      goal,
      price: t.price,
      // Har juftlik (miya + ovoz) uchun kunlik limit — teng xarajat qoidasi.
      minutes: Object.fromEntries(comboKeys().map(({ key, llm, tts }) => [key, dailyMinutes(goal, tts, llm)])),
    }));
  const fail = (res, status, error, code) => res.status(status).json({ error, code });
  const userId = (req) => Number.parseInt(req.params.id, 10);
  const isSelf = (req) => userId(req) === req.user.id;

  router.get("/users", (_req, res) => {
    const lastActive = usage.lastActiveDays();
    res.json({ users: store.listUsers().map((u) => withUsage(u, lastActive)) });
  });

  router.get("/stats", (_req, res) => {
    const days = usage.dailyTotals(STATS_DAYS);
    const today = days.at(-1);
    const provider = settings.ttsProvider();
    const llmProvider = settings.llmProvider();
    const perMinute = costPerMinute(llmProvider, provider);
    res.json({
      users: store.listUsers().length,
      activeToday: today.users,
      minutesToday: today.minutes,
      costTodaySom: Math.round(today.minutes * perMinute),
      costPerMinuteSom: perMinute,
      provider,
      llmProvider,
      tariffs: tariffTable(),
      days,
    });
  });

  // Profil (yo'nalish/tarif, xarakter, sinf) va/yoki bloklash.
  router.put("/users/:id", (req, res) => {
    const { profile, blocked } = req.body ?? {};
    if (profile === undefined && blocked === undefined) return fail(res, 400, "profile yoki blocked kerak", "invalid");
    if (blocked !== undefined && typeof blocked !== "boolean") return fail(res, 400, "blocked true/false bo'lsin", "invalid");
    if (blocked !== undefined && isSelf(req)) return fail(res, 400, "O'zingizni bloklab bo'lmaydi.", "self");
    try {
      let user = profile !== undefined ? store.updateProfile(userId(req), profile) : null;
      if (blocked !== undefined) user = store.setBlocked(userId(req), blocked);
      if (!user) return fail(res, 404, "Foydalanuvchi topilmadi.", "not_found");
      res.json({ user });
    } catch (err) {
      if (err instanceof ValidationError) return fail(res, 400, err.message, "invalid");
      console.error("[/api/admin/users/:id]", err);
      fail(res, 500, "Saqlab bo'lmadi.", "server");
    }
  });

  router.post("/users/:id/reset-usage", (req, res) => {
    usage.resetToday(userId(req));
    res.json({ ok: true });
  });

  router.delete("/users/:id", (req, res) => {
    if (isSelf(req)) return fail(res, 400, "O'zingizni o'chirib bo'lmaydi.", "self");
    if (!store.deleteUser(userId(req))) return fail(res, 404, "Foydalanuvchi topilmadi.", "not_found");
    res.json({ ok: true });
  });

  return router;
}
