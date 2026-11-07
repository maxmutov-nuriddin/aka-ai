import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createAka, ValidationError } from "./aka.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

/** Oddiy xotiradagi so'rov cheklovchi (bir IP uchun). */
function rateLimiter({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    const entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
      }
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set("Retry-After", String(Math.ceil((entry.start + windowMs - now) / 1000)));
      return res.status(429).json({ error: "Juda ko'p so'rov yubordingiz, aka. Bir oz dam olib, keyinroq urinib ko'r." });
    }
    next();
  };
}

/** CORS: brauzer kengaytmasi va ruxsat berilgan saytlar uchun. */
function cors(allowed) {
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
        res.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
        res.set("Access-Control-Allow-Headers", "Content-Type");
      }
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  };
}

function apiErrorResponse(err) {
  if (err instanceof ValidationError) return [400, err.message];
  if (err instanceof Anthropic.AuthenticationError) return [500, "Server sozlanmagan: API kalit noto'g'ri."];
  if (err instanceof Anthropic.RateLimitError) return [503, "Aka hozir band. Bir daqiqadan keyin qayta urinib ko'r."];
  if (err instanceof Anthropic.BadRequestError) return [400, "So'rovda xato bor. Yangi suhbat boshlab ko'r."];
  if (err instanceof Anthropic.APIConnectionError) return [503, "Aka bilan aloqa uzildi. Internetni tekshirib, qayta urin."];
  if (err instanceof Anthropic.APIError) return [502, "Aka javob bera olmadi. Qayta urinib ko'r."];
  return [500, "Kutilmagan xato yuz berdi."];
}

export function createApp({ aka = createAka(), env = process.env } = {}) {
  const app = express();
  app.disable("x-powered-by");
  if (env.TRUST_PROXY) app.set("trust proxy", env.TRUST_PROXY);

  const allowed = (env.AKA_ALLOWED_ORIGINS || "chrome-extension://*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  app.use("/api", cors(allowed));
  app.use("/api", express.json({ limit: "1mb" }));
  const limiter = rateLimiter({
    windowMs: Number(env.AKA_RATE_WINDOW_MS) || 5 * 60_000,
    max: Number(env.AKA_RATE_MAX) || 40,
  });

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.post("/api/chat", limiter, async (req, res) => {
    try {
      const { page, history, selection } = req.body ?? {};
      const result = await aka.chat({ page, history, selection });
      res.json(result);
    } catch (err) {
      const [status, message] = apiErrorResponse(err);
      if (status >= 500) console.error("[/api/chat]", err);
      res.status(status).json({ error: message });
    }
  });

  app.post("/api/summary", limiter, async (req, res) => {
    try {
      const { pageTitle, items } = req.body ?? {};
      const result = await aka.summary({ pageTitle, items });
      res.json({ text: result.text, refused: result.refused, usage: result.usage });
    } catch (err) {
      const [status, message] = apiErrorResponse(err);
      if (status >= 500) console.error("[/api/summary]", err);
      res.status(status).json({ error: message });
    }
  });

  // Veb-ilova va umumiy fayllar
  app.get("/parse.js", (_req, res) => res.sendFile(path.join(here, "parse.js")));
  app.get("/vendor/mermaid.min.js", (_req, res) =>
    res.sendFile(path.join(root, "node_modules", "mermaid", "dist", "mermaid.min.js")),
  );
  app.use(express.static(path.join(root, "web")));

  // JSON xatolari (masalan, buzilgan body)
  app.use((err, _req, res, _next) => {
    if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "JSON noto'g'ri" });
    if (err?.type === "entity.too.large") return res.status(413).json({ error: "Sahifa juda katta" });
    console.error(err);
    res.status(500).json({ error: "Kutilmagan xato yuz berdi." });
  });

  return app;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.warn("Diqqat: ANTHROPIC_API_KEY o'rnatilmagan. Claude'ga so'rovlar ishlamaydi.");
  }
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => console.log(`Aka ishga tushdi: http://localhost:${port}`));
}
