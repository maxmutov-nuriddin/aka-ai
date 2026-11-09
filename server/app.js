// Express ilova: API yo'llari va sahifalar. Ishga tushirish — server/index.js.
//   /          landing      /login  kirish va ro'yxatdan o'tish      /app/  Jigar (faqat kirganlarga)
//   /api/auth  sessiyalar   /api/chat, /api/summary, /api/tts, /api/stt — faqat kirganlarga
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createJigar, normalizeLang, normalizeLevel, normalizePersona, targetLanguageOf, ValidationError } from "./core/jigar.js";
import { TtsNotConfiguredError } from "./core/errors.js";
import { createTts } from "./voice/azure.js";
import { createElevenLabs, AUTO_LANG } from "./voice/elevenlabs.js";
import { createAzurePronunciation } from "./voice/azure-pronunciation.js";
import { createGeminiTts } from "./voice/gemini-tts.js";
import { createGeminiLlm } from "./core/gemini-llm.js";
import { createOpenAiTts } from "./voice/openai-tts.js";
import { createOpenAiLlm } from "./core/openai-llm.js";
import { createPaygate } from "./payments/paygate.js";
import { createPaymentStore } from "./payments/store.js";
import { createPaymentRouter } from "./payments/routes.js";
import { createLocalPronunciation } from "./voice/local-pronunciation.js";
import { fromScribeWords } from "./core/pronunciation.js";
import { openDatabase } from "./db/database.js";
import { createAuthStore, parseSupportEmails } from "./auth/store.js";
import { createSettingsStore } from "./settings/store.js";
import { createUsageStore, minutesPerChatFrom } from "./usage/store.js";
import { TARIFFS, dailyMinutes, minutesPerSom, planDailyMinutes, tariffOf } from "./usage/tariffs.js";
import { createAdminRouter } from "./admin/routes.js";
import { createFishAudio } from "./voice/fishaudio.js";
import { authenticate, requireUser, requireUserPage } from "./auth/session.js";
import { createAuthRouter } from "./auth/routes.js";
import { cors } from "./http/cors.js";
import { rateLimiter } from "./http/rate-limit.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const webDir = path.join(root, "web");
const DEFAULT_RATE_WINDOW_MS = 5 * 60_000;

function apiErrorResponse(err) {
  if (err instanceof ValidationError) return [400, err.message];
  if (err instanceof Anthropic.AuthenticationError) return [500, "Server sozlanmagan: API kalit noto'g'ri."];
  if (err instanceof Anthropic.RateLimitError) return [503, "Jigar hozir band. Bir daqiqadan keyin qayta urinib ko'r."];
  if (err instanceof Anthropic.BadRequestError) return [400, "So'rovda xato bor. Yangi suhbat boshlab ko'r."];
  if (err instanceof Anthropic.APIConnectionError) return [503, "Jigar bilan aloqa uzildi. Internetni tekshirib, qayta urin."];
  if (err instanceof Anthropic.APIError) return [502, "Jigar javob bera olmadi. Qayta urinib ko'r."];
  return [500, "Kutilmagan xato yuz berdi."];
}

function voiceErrorResponse(err, failMessage) {
  if (err instanceof ValidationError) return [400, err.message];
  if (err instanceof TtsNotConfiguredError) return [503, "Ovoz xizmati sozlanmagan."];
  return [502, failMessage];
}

/**
 * Ovoz xizmatlari. Qaysi biri ishlatilishini support tanlaydi (settings: tts_provider), hamma uchun bir xil.
 *   elevenlabs — ElevenLabs (his-tuyg'u teglari, so'z vaqtlari); kaliti bo'lmasa — Azure.
 *                AKA_TTS=azure — Azure'ning tug'ma o'zbek ovozi (teglarsiz).
 *   fishaudio  — Fish Audio (arzonroq; FISH_API_KEY).
 * Matnga aylantirish faqat ElevenLabs.
 */
export function createVoiceServices(env) {
  const eleven = createElevenLabs({ env });
  const azure = createTts({ env });
  const preferAzure = env.AKA_TTS === "azure" && azure.configured;
  return {
    providers: {
      elevenlabs: eleven.configured && !preferAzure ? eleven : azure,
      fishaudio: createFishAudio({ env }),
      gemini: createGeminiTts({ env }),
      openai: createOpenAiTts({ env }),
    },
    stt: eleven,
  };
}

/** O'quvchi til o'rganadimi: yo'nalishi yoki to'langan rejasida (konstruktor) "language" bor. */
function learnsLanguage(user) {
  return user?.profile?.goal === "language" || Boolean(user?.plan?.goals?.includes("language"));
}

/** Til o'rganish yo'nalishida nutq ikki tilda aralash — ovoz xizmati tilni o'zi aniqlaydi. */
function voiceLang(user, lang) {
  return learnsLanguage(user) ? AUTO_LANG : lang;
}

/** Standart baza fayli: data/jigar.db (AKA_DB_FILE bilan o'zgartiriladi). */
export function defaultDbFile(env) {
  return env.AKA_DB_FILE?.trim() || path.join(root, "data", "jigar.db");
}

/**
 * @param {{ jigar?: object, env?: Record<string, string | undefined>, tts?: object, stt?: object,
 *           db?: import("node:sqlite").DatabaseSync }} [options]
 */
export function createApp({ env = process.env, geminiLlm = createGeminiLlm({ env }), openaiLlm = createOpenAiLlm({ env }), jigar = createJigar({ gemini: geminiLlm, openai: openaiLlm }), tts, stt, ttsProviders, db, pronunciation = [createLocalPronunciation({ env }), createAzurePronunciation({ env })], paygate = createPaygate({ env }) } = {}) {
  const defaults = (tts || ttsProviders) && stt ? null : createVoiceServices(env);
  const providers = ttsProviders ?? (tts ? { elevenlabs: tts } : defaults.providers);
  const database = db ?? openDatabase(defaultDbFile(env));
  const settings = createSettingsStore(database);
  // Support tanlagan xizmat; sozlanmagan bo'lsa — ElevenLabs (yoki Azure).
  const currentTts = () => {
    const chosen = providers[settings.ttsProvider()];
    return chosen?.configured ? chosen : providers.elevenlabs;
  };
  const voice = { get tts() { return currentTts(); }, stt: stt ?? defaults.stt };

  /** Ovoz (+ bo'lsa so'z vaqtlari). Tanlangan xizmat xato bersa — o'sha so'rov ElevenLabs'ga o'tadi. */
  async function speakWith(service, text, options) {
    // contentType: Gemini — WAV, qolganlari — MP3.
    const run = (s) => (s.synthesizeTimed
      ? s.synthesizeTimed(text, options)
      : s.synthesize(text, options).then((audio) => ({ audio, wordStarts: null })))
      .then((r) => ({ ...r, contentType: s.contentType ?? "audio/mpeg" }));
    try {
      return await run(service);
    } catch (err) {
      const backup = providers.elevenlabs;
      if (err instanceof ValidationError || service === backup || !backup?.configured) throw err;
      console.warn(`[/api/tts] tanlangan xizmat ishlamadi — ElevenLabs'ga o'tildi: ${err.message}`);
      return run(backup);
    }
  }
  const store = createAuthStore(database, { supportEmails: parseSupportEmails(env.SUPPORT_EMAILS) });
  const usage = createUsageStore(database, { minutesPerChat: minutesPerChatFrom(env) });
  const payments = createPaymentStore(database);
  /** Foydalanuvchining bugungi sarfi (daqiqa) va tarif limiti. Support — limit yo'q. */
  /** Faol paket (Suhbatga tayyorgarlik): { key, minutes, used, remaining, until } yoki null. */
  const packageOf = (user) => usage.packageStatus(user.id, user.package);

  /** Jigar doirasi: to'langan reja yoki profil yo'nalishi; faol paket bo'lsa — suhbat mashqi ham qo'shiladi. */
  function goalsOf(user) {
    const base = user?.plan?.goals ?? (user?.profile?.goal ? [user.profile.goal] : []);
    if (!user || !packageOf(user)) return user?.plan?.goals;
    return base.includes("interview") ? base : [...base, "interview"];
  }

  function dailyUsage(user) {
    const provider = settings.ttsProvider();
    const usedMinutes = usage.minutesToday(user.id);
    const tariff = tariffOf(user.profile?.goal, user.plan); // konstruktor rejasi yoki tayyor tarif
    if (user.role === "support") return { usedMinutes, limitMinutes: null, remainingMinutes: null, provider, tariff };
    // Paket faol bo'lsa — kunlik limit o'rniga paket qoldig'i (daqiqalar o'quvchiga va'da qilingan — juftlikka bog'liq emas).
    const pkg = packageOf(user);
    if (pkg) {
      const limitMinutes = Math.round((usedMinutes + pkg.remaining) * 10) / 10;
      return { usedMinutes, limitMinutes, remainingMinutes: pkg.remaining, provider, tariff, package: pkg };
    }
    const limitMinutes = planDailyMinutes(tariff, provider, settings.llmProvider());
    const remainingMinutes = Math.max(0, Math.round((limitMinutes - usedMinutes) * 10) / 10);
    return { usedMinutes, limitMinutes, remainingMinutes, provider, tariff };
  }
  const app = express();
  app.disable("x-powered-by");
  if (env.TRUST_PROXY) app.set("trust proxy", env.TRUST_PROXY);

  const allowed = (env.AKA_ALLOWED_ORIGINS || "chrome-extension://*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const windowMs = Number(env.AKA_RATE_WINDOW_MS) || DEFAULT_RATE_WINDOW_MS;
  const limiter = rateLimiter({ windowMs, max: Number(env.AKA_RATE_MAX) || 40 });
  // Bitta javob bir nechta ovoz bo'lagiga bo'linadi, shuning uchun limit alohida va kattaroq.
  const ttsLimiter = rateLimiter({ windowMs, max: Number(env.AKA_TTS_RATE_MAX) || 300 });

  app.use(authenticate(store));
  app.use("/api", cors(allowed));
  app.use("/api", express.json({ limit: "3mb" })); // sahifa skrinshoti (kengaytma) uchun
  app.use(
    "/api/auth",
    createAuthRouter({
      store,
      secureCookies: env.NODE_ENV === "production" || env.COOKIE_SECURE === "1",
      authMax: Number(env.AKA_AUTH_RATE_MAX) || undefined,
    }),
  );

  // Miya: Claude (kalit bo'lsa), Gemini yoki OpenAI — support panelida tanlanadi.
  const claude = { configured: Boolean(env.ANTHROPIC_API_KEY?.trim()) };
  const llms = { claude, haiku: claude, gemini: geminiLlm, openai: openaiLlm }; // Haiku — o'sha Anthropic kaliti
  app.use("/api/admin", createAdminRouter({ settings, providers, store, usage, llms }));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.get("/api/voice-config", (_req, res) =>
    res.json({
      tts: Boolean(voice.tts.configured),
      stt: Boolean(voice.stt.configured),
      // Chrome (Google) jonli o'zbekchani Scribe'dan yaxshiroq taniydi — server tanishi faqat so'ralganda.
      preferServerStt: env.AKA_STT === "elevenlabs",
      // Chrome tanishiga qo'shimcha: Scribe ham eshitadi, Jigar ikkalasini solishtiradi. AKA_STT=chrome — o'chiq.
      doubleCheck: Boolean(voice.stt.configured) && env.AKA_STT !== "chrome",
    }),
  );

  app.post("/api/tts", requireUser, ttsLimiter, async (req, res) => {
    try {
      const lang = voiceLang(req.user, normalizeLang(req.body?.lang));
      const persona = normalizePersona(req.body?.persona); // ovoz va ohang xarakterga mos
      const level = normalizeLevel(req.body?.level); // ovoz o'quvchi yoshiga mos (yosh / katta)
      // model — support tanlagan Fish modeli (ElevenLabs uni e'tiborsiz qoldiradi).
      const options = { lang, persona, level, model: settings.fishModel() };
      const { audio, wordStarts, contentType } = await speakWith(voice.tts, req.body?.text, options);
      usage.addSpeech(req.user.id, String(req.body?.text ?? "").length); // daqiqa limiti — Jigarning ovozi
      // Har so'z boshlanish vaqti (soniya) — brauzer yozuv va robot yuzini ovozga aniq moslaydi.
      if (wordStarts?.length) res.set("X-Word-Starts", wordStarts.map((t) => t.toFixed(2)).join(","));
      res.set("Content-Type", contentType);
      res.set("Cache-Control", "no-store");
      res.send(audio);
    } catch (err) {
      const [status, message] = voiceErrorResponse(err, "Ovozni yaratib bo'lmadi.");
      if (status === 502) console.error("[/api/tts]", err);
      res.status(status).json({ error: message });
    }
  });

  // Til o'rganish: matn + talaffuz tahlili. Navbat: o'z modelimiz (ru, uz) -> Azure (faqat ru) -> Scribe so'z ishonchi (taxminiy).
  const SCRIBE_LANG = { ru: "rus", uz: "uzb" };
  /** Scribe qisqa o'zbekchani ba'zan boshqa til deb aniqlaydi ("dan") — til kodi bilan birga yozuvga ham qaraladi. */
  function spokeTargetLanguage({ text, languageCode }, target) {
    const letters = text.match(/\p{L}/gu) ?? [];
    const cyrillic = letters.filter((c) => /\p{Script=Cyrillic}/u.test(c)).length / (letters.length || 1);
    if (target === "ru") return cyrillic >= 0.5 && languageCode !== SCRIBE_LANG.uz;
    return languageCode === SCRIBE_LANG.uz || (cyrillic < 0.5 && languageCode !== SCRIBE_LANG.ru);
  }
  const assessors = [pronunciation].flat().filter(Boolean);
  async function languageStt(audio, type, profile) {
    const target = targetLanguageOf(profile?.lang);
    const detail = await voice.stt.transcribeDetailed(audio, type, { lang: AUTO_LANG });
    // O'quvchi ona tilida gapirgan bo'lsa — talaffuz baholanmaydi.
    if (!detail.text || !spokeTargetLanguage(detail, target)) return { text: detail.text, pronunciation: null };
    for (const assessor of assessors) {
      if (!assessor.configured || !/wav/.test(type) || !(assessor.supports?.(target) ?? target === "ru")) continue;
      try {
        const assessed = await assessor.assess(audio, { referenceText: detail.text, lang: target });
        if (assessed?.words?.length) return { text: detail.text, pronunciation: assessed };
      } catch (err) {
        console.warn(`[/api/stt] talaffuz bahosi ishlamadi — keyingisiga o'tiladi: ${err.message}`);
      }
    }
    return { text: detail.text, pronunciation: fromScribeWords(detail.words) };
  }

  app.post("/api/stt", requireUser, ttsLimiter, express.raw({ type: "audio/*", limit: "10mb" }), async (req, res) => {
    try {
      if (learnsLanguage(req.user) && voice.stt.transcribeDetailed) {
        return res.json(await languageStt(req.body, req.get("Content-Type"), req.user.profile));
      }
      const lang = voiceLang(req.user, normalizeLang(req.query.lang));
      const text = await voice.stt.transcribe(req.body, req.get("Content-Type"), { lang });
      res.json({ text });
    } catch (err) {
      const [status, message] = voiceErrorResponse(err, "Ovozni tanib bo'lmadi. Qayta urinib ko'r.");
      if (status === 502) console.error("[/api/stt]", err);
      res.status(status).json({ error: message });
    }
  });

  app.get("/api/usage", requireUser, (req, res) => res.json(dailyUsage(req.user)));
  // Ochiq: landing narxlar bo'limi — kunlik daqiqa joriy ovoz xizmatiga bog'liq (ElevenLabs — 40%).
  app.get("/api/tariffs", (_req, res) => {
    const provider = settings.ttsProvider();
    const llm = settings.llmProvider();
    const tariffs = Object.entries(TARIFFS).map(([goal, t]) => ({ goal, price: t.price, minutes: dailyMinutes(goal, provider, llm) }));
    res.set("Cache-Control", "public, max-age=300");
    // minutesPerSom — konstruktor daqiqani kartalar va haqiqiy limit bilan bir xil hisoblashi uchun (plan-pricing.js).
    res.json({ provider, tariffs, minutesPerSom: minutesPerSom(llm, provider) });
  });

  // Obuna to'lovi (PayGate) — /api/payments, /api/subscription; PAYWALL=1 bo'lsa chat obuna/sinov talab qiladi.
  const billing = createPaymentRouter({ paygate, payments, env, limiter, packageOf });
  app.use("/api", billing.router);

  app.post("/api/chat", requireUser, limiter, async (req, res) => {
    // Obuna yo'q ko'rinsa — avval callback kelmagan to'lovlar qayta tekshiriladi (to'lagan o'quvchi to'xtatilmasin).
    if (!billing.canUse(req.user) && (await billing.reconcile(req.user.id), !billing.canUse(req.user))) {
      return res.status(402).json({ error: "Bepul sinov tugadi. Davom etish uchun obunani to'lang.", code: "payment_required" });
    }
    try {
      // Tarif: kunlik savol limiti (support — cheksiz). Xato bergan so'rov hisobga olinmaydi.
      const before = dailyUsage(req.user);
      if (before.limitMinutes !== null && before.remainingMinutes <= 0) {
        return res.status(429).json({
          error: `Bugungi limit tugadi (${before.limitMinutes} daqiqa). Ertaga yana davom etamiz!`,
          code: "daily_limit",
          dailyUsage: before,
        });
      }
      const { page, history, selection, mode, heardAlt, pronunciation, lang, length, simple, persona, goal, level } = req.body ?? {};
      // studentName — hisobdagi ism: Jigar o'quvchini ismi bilan chaqiradi.
      const result = await jigar.chat({
        page, history, selection, mode, heardAlt, pronunciation, lang, length, simple, persona, goal, level,
        studentName: req.user?.name, llm: settings.llmProvider(),
        goals: goalsOf(req.user), // konstruktor rejasi; faol paketda — suhbat mashqi ham
      });
      usage.addChat(req.user.id);
      res.json({ ...result, dailyUsage: dailyUsage(req.user) });
    } catch (err) {
      const [status, message] = apiErrorResponse(err);
      if (status >= 500) console.error("[/api/chat]", err);
      res.status(status).json({ error: message });
    }
  });

  app.post("/api/summary", requireUser, limiter, async (req, res) => {
    try {
      const { pageTitle, items, mode, lang, simple, persona, goal, level } = req.body ?? {};
      const result = await jigar.summary({ pageTitle, items, mode, lang, simple, persona, goal, level, llm: settings.llmProvider(), goals: goalsOf(req.user) });
      res.json({ text: result.text, refused: result.refused, usage: result.usage });
    } catch (err) {
      const [status, message] = apiErrorResponse(err);
      if (status >= 500) console.error("[/api/summary]", err);
      res.status(status).json({ error: message });
    }
  });

  // ---------- Sahifalar ----------
  const page = (...parts) => (_req, res) => res.sendFile(path.join(webDir, ...parts));
  app.get("/", page("landing", "index.html"));
  // Huquqiy sahifalar: ommaviy oferta va maxfiylik siyosati (UZ/RU).
  app.get("/oferta", page("legal", "oferta.html"));
  app.get("/maxfiylik", page("legal", "maxfiylik.html"));
  app.get("/login", (req, res, next) => (req.user ? res.redirect(302, "/app/") : next()), page("auth", "index.html"));
  // Express "/app" ni "/app/" bilan ham moslaydi — faqat oxirida "/" bo'lmasa yo'naltiramiz (aks holda cheksiz aylanadi).
  app.get("/app", (req, res, next) => (req.path === "/app" ? res.redirect(301, "/app/") : next()));
  app.get(["/app/", "/app/index.html"], requireUserPage, page("app", "index.html"));
  // Support paneli: boshqalar ilovaga qaytariladi.
  const requireSupportPage = (req, res, next) => (req.user?.role === "support" ? next() : res.redirect(302, "/app/"));
  app.get(["/admin", "/admin/", "/admin/index.html"], requireUserPage, requireSupportPage, page("admin", "index.html"));

  // Umumiy fayllar: javobni ajratish brauzerda ham ishlatiladi, chizma kutubxonasi node_modules'dan.
  app.get("/shared/parse.js", (_req, res) => res.sendFile(path.join(here, "core", "parse.js")));
  app.get("/shared/plan-pricing.js", (_req, res) => res.sendFile(path.join(here, "usage", "plan-pricing.js"))); // konstruktor narxi (tannarxsiz)
  app.get("/shared/levels.js", (_req, res) => res.sendFile(path.join(here, "core", "levels.js"))); // yo'nalish -> sinflar
  app.get("/vendor/mermaid.min.js", (_req, res) =>
    res.sendFile(path.join(root, "node_modules", "mermaid", "dist", "mermaid.min.js")),
  );
  app.use(express.static(webDir, { index: false }));

  // JSON xatolari (masalan, buzilgan body)
  app.use((err, _req, res, _next) => {
    if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "JSON noto'g'ri" });
    if (err?.type === "entity.too.large") return res.status(413).json({ error: "Sahifa juda katta" });
    console.error(err);
    res.status(500).json({ error: "Kutilmagan xato yuz berdi." });
  });

  return Object.assign(app, { store, paymentsForTest: { expire: payments.expireForTest } });
}
