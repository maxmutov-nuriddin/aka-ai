// Jigar EcoSystem — shaxsiy yordamchi ("Jarvis") serveri. Global (o'quvchilar) tizimidan to'liq alohida.
//   /login  kirish (egasi — faqat parol; shu kompyuterda — parolsiz, ECO_LOCAL_NOAUTH=1)      /app/  Jigar-yordamchi
//   /api/chat, /api/tts, /api/stt, /api/assistant (xotira, eslatmalar) — faqat kirganlarga
//   /api/devices (kompyuter — Jigarning qo'li), /api/actions (xavfli amalga ruxsat), /api/nudges (Jigar o'zi aytgan gaplar)
// Tarif, to'lov, kunlik limit va support panel yo'q: kirgan har kim — egasi, Jigar u bilan cheklovsiz gaplashadi.
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createJigar, normalizeLang, normalizePersona, ValidationError } from "./core/jigar.js";
import { TtsNotConfiguredError } from "./core/errors.js";
import { createTts } from "./voice/azure.js";
import { createElevenLabs } from "./voice/elevenlabs.js";
import { createGeminiTts } from "./voice/gemini-tts.js";
import { createGeminiLlm } from "./core/gemini-llm.js";
import { createOpenAiTts } from "./voice/openai-tts.js";
import { createOpenAiLlm } from "./core/openai-llm.js";
import { createFishAudio } from "./voice/fishaudio.js";
import { openDatabase } from "./db/database.js";
import { createAuthStore, OWNER_EMAIL } from "./auth/store.js";
import { createAssistantStore } from "./assistant/store.js";
import { createEcoSettings, LLM_CHOICES, TTS_CHOICES, EFFORT_CHOICES } from "./settings.js";
import { createAssistantRouter, tashkentNowNote } from "./assistant/routes.js";
import { createDeviceHub } from "./devices/hub.js";
import { createApprovals } from "./devices/approvals.js";
import { createPcToolbox } from "./devices/tools.js";
import { createDeviceRouter } from "./devices/routes.js";
import { createNudgeStore } from "./proactive/store.js";
import { createProactive } from "./proactive/scheduler.js";
import { authenticate, requireUser, requireUserPage } from "./auth/session.js";
import { createAuthRouter } from "./auth/routes.js";
import { cors } from "./http/cors.js";
import { rateLimiter } from "./http/rate-limit.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const webDir = path.join(root, "web");
const DEFAULT_RATE_WINDOW_MS = 5 * 60_000;
const ADULT_LEVEL = "student"; // ovoz — doim katta yoshli
const RECENT_NUDGE_MS = 60 * 60_000; // Jigar o'zi aytgan gaplar shuncha vaqt suhbatda eslanadi
const RECENT_NUDGE_COUNT = 2;
const NUDGE_NOTE_CHARS = 150;
const MOBILE_UA_RE = /Android|iPhone|iPad|Mobile/i;

/**
 * Oxirgi xabarga izoh: vaqt, kompyuter holati, qayerdan yozilgani, Jigar yaqinda o'zi aytgan gaplar.
 * @param {{ device: {name: string, platform: string} | null, mobile: boolean, recentNudges: string[] }} parts
 */
export function contextNote({ device, mobile, recentNudges }, now = new Date()) {
  const lines = [tashkentNowNote(now)];
  lines.push(device ? `Kompyuter ulangan: ${device.name} (${device.platform}), pc_* asboblari bor` : "Kompyuter ulanmagan");
  if (mobile) lines.push("Xabar telefondan yozildi");
  for (const text of recentNudges) lines.push(`Sen o'zing yaqinda aytgan eding: "${text.slice(0, NUDGE_NOTE_CHARS)}"`);
  return lines.join(". ");
}

function apiErrorResponse(err) {
  if (err instanceof ValidationError) return [400, err.message];
  if (err instanceof Anthropic.AuthenticationError) return [500, "Server sozlanmagan: API kalit noto'g'ri."];
  if (err instanceof Anthropic.RateLimitError) return [503, "Jigar hozir band. Bir daqiqadan keyin qayta urinib ko'ring."];
  if (err instanceof Anthropic.BadRequestError) return [400, "So'rovda xato bor. Yangi suhbat boshlab ko'ring."];
  if (err instanceof Anthropic.APIConnectionError) return [503, "Jigar bilan aloqa uzildi. Internetni tekshirib, qayta urining."];
  if (err instanceof Anthropic.APIError) return [502, "Jigar javob bera olmadi. Qayta urinib ko'ring."];
  return [500, "Kutilmagan xato yuz berdi."];
}

/**
 * Oqimli javob (NDJSON): {"type":"delta","text"} bo'laklari, oxirida {"type":"done", ...javob} yoki {"type":"error"}.
 * Sarlavha birinchi bo'lak kelganda yuboriladi — undan oldingi xato odatdagi JSON va HTTP holati bilan qaytadi.
 */
function createNdjsonWriter(res) {
  let open = false;
  const start = () => {
    if (open) return;
    open = true;
    res.status(200);
    res.set({ "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
    res.flushHeaders();
  };
  return {
    get open() {
      return open;
    },
    write(obj) {
      start();
      res.write(`${JSON.stringify(obj)}\n`);
    },
    end(obj) {
      this.write(obj);
      res.end();
    },
  };
}

function voiceErrorResponse(err, failMessage) {
  if (err instanceof ValidationError) return [400, err.message];
  if (err instanceof TtsNotConfiguredError) return [503, "Ovoz xizmati sozlanmagan."];
  return [502, failMessage];
}

/** Ovoz xizmatlari; qaysi biri ishlashi — .env ECO_TTS (standart: gemini). Nutqni tanish — ElevenLabs Scribe. */
export function createVoiceServices(env) {
  const eleven = createElevenLabs({ env });
  const azure = createTts({ env });
  return {
    providers: {
      elevenlabs: eleven.configured ? eleven : azure,
      fishaudio: createFishAudio({ env }),
      gemini: createGeminiTts({ env }),
      openai: createOpenAiTts({ env }),
    },
    stt: eleven,
  };
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/** So'rov aynan shu kompyuterdan (proksisiz, localhost manzil bilan) keldimi. */
export function isLocalRequest(req) {
  return LOOPBACK.has(req.socket?.remoteAddress) && !req.get("x-forwarded-for") && LOCAL_HOST_RE.test(req.get("host") || "");
}

/** Standart baza fayli: data/eco.db (ECO_DB_FILE bilan o'zgartiriladi). Global bazasidan alohida. */
export function defaultDbFile(env) {
  return env.ECO_DB_FILE?.trim() || path.join(root, "data", "eco.db");
}

/**
 * @param {{ jigar?: object, env?: Record<string, string | undefined>, tts?: object, stt?: object, ttsProviders?: object,
 *           db?: import("node:sqlite").DatabaseSync }} [options]
 */
export function createApp({
  env = process.env, geminiLlm = createGeminiLlm({ env }), openaiLlm = createOpenAiLlm({ env }),
  jigar = createJigar({ gemini: geminiLlm, openai: openaiLlm }), tts, stt, ttsProviders, db,
} = {}) {
  const defaults = (tts || ttsProviders) && stt ? null : createVoiceServices(env);
  const providers = ttsProviders ?? (tts ? { gemini: tts } : defaults.providers);
  const database = db ?? openDatabase(defaultDbFile(env));
  // Miya, ovoz va chuqurlik — egasi ilovadagi sozlamalardan tanlaydi (standart — .env).
  const settings = createEcoSettings(database, env);
  // Tanlangan xizmat sozlanmagan bo'lsa — birinchi sozlangani.
  const currentTts = () => {
    const chosen = providers[settings.all().tts];
    return chosen?.configured ? chosen : Object.values(providers).find((p) => p?.configured) ?? chosen ?? providers.gemini;
  };
  const voice = { get tts() { return currentTts(); }, stt: stt ?? defaults.stt };

  /** Ovoz (+ bo'lsa so'z vaqtlari). Tanlangan xizmat xato bersa — keyingi sozlangan xizmat. */
  async function speakWith(service, text, options) {
    const run = (s) => (s.synthesizeTimed
      ? s.synthesizeTimed(text, options)
      : s.synthesize(text, options).then((audio) => ({ audio, wordStarts: null })))
      .then((r) => ({ ...r, contentType: s.contentType ?? "audio/mpeg" }));
    try {
      return await run(service);
    } catch (err) {
      const backup = Object.values(providers).find((p) => p?.configured && p !== service);
      if (err instanceof ValidationError || !backup) throw err;
      console.warn(`[/api/tts] tanlangan xizmat ishlamadi — zaxiraga o'tildi: ${err.message}`);
      return run(backup);
    }
  }

  const store = createAuthStore(database, { supportEmails: new Set() });
  const assistant = createAssistantStore(database);
  // Kompyuter (desktop ilova) — Jigarning qo'li; xavfli amallar egasining "Ha"si bilan; Jigarning o'z tashabbusi.
  const hub = createDeviceHub();
  const approvals = createApprovals();
  const nudges = createNudgeStore(database);
  const proactive = createProactive({ jigar, hub, nudges, assistant, settings, store });
  // Shu kompyuterda parolsiz (ECO_LOCAL_NOAUTH=1). Internet rejimida (production yoki proksi orqasida) — hech qachon.
  const localNoAuth = env.ECO_LOCAL_NOAUTH === "1" && env.NODE_ENV !== "production" && !env.TRUST_PROXY;

  const app = express();
  app.disable("x-powered-by");
  if (env.TRUST_PROXY) app.set("trust proxy", env.TRUST_PROXY);
  // Ilovalar (desktop/mobil) o'z manzilidan so'rov yuboradi — ruxsat etilganlar .env ECO_ALLOWED_ORIGINS da.
  const allowed = (env.ECO_ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const windowMs = Number(env.ECO_RATE_WINDOW_MS) || DEFAULT_RATE_WINDOW_MS;
  const limiter = rateLimiter({ windowMs, max: Number(env.ECO_RATE_MAX) || 60 });
  const ttsLimiter = rateLimiter({ windowMs, max: Number(env.ECO_TTS_RATE_MAX) || 400 });

  app.use(authenticate(store));
  app.use("/api", cors(allowed));
  app.use("/api", express.json({ limit: "16mb" })); // kamera kadri va PDF
  // Lokal parolsiz kirish: egasi hali yo'q bo'lsa — yaratiladi (tasodifiy parol; boshqa qurilma uchun Sozlamalarda qo'yiladi).
  app.use(async (req, _res, next) => {
    if (req.user || !localNoAuth || !isLocalRequest(req)) return next();
    try {
      req.user = store.ownerUser() ?? await store.createUser({ name: "Egasi", email: OWNER_EMAIL, password: randomBytes(18).toString("base64url") });
    } catch {
      req.user = store.ownerUser(); // bir vaqtda ikki so'rov — ikkinchisi tayyor egasini oladi
    }
    next();
  });
  // Kirish sahifasi uchun: parol qo'yilganmi va shu kompyuterdan parolsiz kirish mumkinmi.
  app.get("/api/auth/status", (req, res) => {
    res.json({ setup: Boolean(store.ownerUser()), local: localNoAuth && isLocalRequest(req), user: Boolean(req.user) });
  });
  app.use(
    "/api/auth",
    createAuthRouter({
      store,
      secureCookies: env.NODE_ENV === "production" || env.COOKIE_SECURE === "1",
      authMax: Number(env.ECO_AUTH_RATE_MAX) || undefined,
    }),
  );
  app.use("/api/assistant", createAssistantRouter({ assistant }));
  app.use("/api", createDeviceRouter({ hub, approvals, nudges }));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // Sozlamalar (egasi): miya, ovoz xizmati, chuqurlik + qaysilari sozlangan (kaliti bor).
  const llmReady = {
    claude: Boolean(env.ANTHROPIC_API_KEY?.trim()), haiku: Boolean(env.ANTHROPIC_API_KEY?.trim()),
    gemini: Boolean(geminiLlm?.configured), openai: Boolean(openaiLlm?.configured),
  };
  const settingsView = () => ({
    ...settings.all(),
    choices: { llm: LLM_CHOICES, tts: TTS_CHOICES, effort: EFFORT_CHOICES },
    ready: { llm: llmReady, tts: Object.fromEntries(TTS_CHOICES.map((k) => [k, Boolean(providers[k]?.configured)])) },
  });
  app.get("/api/settings", requireUser, (_req, res) => res.json(settingsView()));
  app.put("/api/settings", requireUser, (req, res) => {
    try {
      settings.update(req.body);
      res.json(settingsView());
    } catch (err) {
      const [status, message] = apiErrorResponse(err);
      res.status(status).json({ error: message });
    }
  });
  app.get("/api/voice-config", (_req, res) =>
    res.json({
      tts: Boolean(voice.tts?.configured),
      stt: Boolean(voice.stt?.configured),
      preferServerStt: env.ECO_STT === "elevenlabs",
      doubleCheck: Boolean(voice.stt?.configured) && env.ECO_STT !== "chrome",
    }),
  );

  app.post("/api/tts", requireUser, ttsLimiter, async (req, res) => {
    try {
      const options = { lang: normalizeLang(req.body?.lang), persona: normalizePersona(req.body?.persona), level: ADULT_LEVEL };
      const { audio, wordStarts, contentType } = await speakWith(voice.tts, req.body?.text, options);
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

  app.post("/api/stt", requireUser, ttsLimiter, express.raw({ type: "audio/*", limit: "10mb" }), async (req, res) => {
    try {
      const text = await voice.stt.transcribe(req.body, req.get("Content-Type"), { lang: normalizeLang(req.query.lang) });
      res.json({ text });
    } catch (err) {
      const [status, message] = voiceErrorResponse(err, "Ovozni tanib bo'lmadi. Qayta urinib ko'ring.");
      if (status === 502) console.error("[/api/stt]", err);
      res.status(status).json({ error: message });
    }
  });

  /** Javobdagi yashirin bo'limlar: yangi faktlar xotiraga, eslatmalar jadvalga. */
  function saveAssistantParts(user, parsed) {
    if (!parsed) return null;
    return { remembered: assistant.addMemories(user.id, parsed.xotira), reminders: assistant.addReminders(user.id, parsed.eslatmalar) };
  }

  /**
   * Kompyuter asboblari: xavfli amalda oqimga {"type":"confirm"} yuboriladi va egasining javobi kutiladi.
   * Oqimsiz so'rovda ruxsat so'rab bo'lmaydi — xavfli amal bajarilmaydi.
   */
  function toolboxFor(req, res, stream) {
    const asked = [];
    res.on("close", () => asked.forEach((id) => approvals.cancel(id)));
    return createPcToolbox({
      hub,
      userId: req.user.id,
      onStatus: (text) => stream?.write({ type: "status", text }),
      async confirm(action) {
        if (!stream) return false;
        const { id, decision } = approvals.request(req.user.id);
        asked.push(id);
        stream.write({ type: "confirm", id, ...action });
        return decision;
      },
    });
  }

  app.post("/api/chat", requireUser, limiter, async (req, res) => {
    let stream = null;
    try {
      const { page, history, selection, heardAlt, lang, length, persona, image, voice: fromVoice } = req.body ?? {};
      if (req.body?.stream === true) stream = createNdjsonWriter(res);
      const toolbox = toolboxFor(req, res, stream);
      const recentNudges = nudges.since(req.user.id, RECENT_NUDGE_MS)
        .filter((n) => n.text !== "—").slice(-RECENT_NUDGE_COUNT).map((n) => n.text);
      const result = await jigar.chat({
        page, history, selection, heardAlt, lang, length, persona, image, voice: fromVoice,
        userName: req.user?.name, llm: settings.all().llm, effort: settings.all().effort,
        memories: assistant.listMemories(req.user.id).map((m) => m.text),
        nowNote: contextNote({ device: toolbox?.device ?? null, mobile: MOBILE_UA_RE.test(req.get("User-Agent") || ""), recentNudges }),
        toolbox,
        onDelta: stream ? (text) => stream.write({ type: "delta", text }) : null,
      });
      const parts = saveAssistantParts(req.user, result.parsed);
      const body = { ...result, ...(parts ? { assistant: parts } : {}) };
      if (stream) stream.end({ type: "done", ...body });
      else res.json(body);
    } catch (err) {
      const [status, message] = apiErrorResponse(err);
      if (status >= 500) console.error("[/api/chat]", err);
      if (stream?.open) stream.end({ type: "error", status, error: message });
      else res.status(status).json({ error: message });
    }
  });

  // ---------- Sahifalar ----------
  const page = (...parts) => (_req, res) => res.sendFile(path.join(webDir, ...parts));
  app.get("/", (req, res) => res.redirect(302, req.user ? "/app/" : "/login"));
  app.get("/login", (req, res, next) => (req.user ? res.redirect(302, "/app/") : next()), page("auth", "index.html"));
  app.get("/app", (req, res, next) => (req.path === "/app" ? res.redirect(301, "/app/") : next()));
  app.get(["/app/", "/app/index.html"], requireUserPage, page("app", "index.html"));

  app.get("/shared/parse.js", (_req, res) => res.sendFile(path.join(here, "core", "parse.js")));
  app.get("/vendor/mermaid.min.js", (_req, res) =>
    res.sendFile(path.join(root, "node_modules", "mermaid", "dist", "mermaid.min.js")),
  );
  app.use(express.static(webDir, { index: false }));

  app.use((err, _req, res, _next) => {
    if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "JSON noto'g'ri" });
    if (err?.type === "entity.too.large") return res.status(413).json({ error: "So'rov juda katta" });
    console.error(err);
    res.status(500).json({ error: "Kutilmagan xato yuz berdi." });
  });

  return Object.assign(app, { store, hub, proactive });
}
