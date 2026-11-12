// Jigarning o'z tashabbusi: (1) vaqti-vaqti bilan kompyuter ekraniga qaraydi va foydali gap bo'lsa — o'zi aytadi;
// (2) ertalab reja, kechqurun kun xulosasi. Natija — nudges jadvaliga; ilova uni ko'rsatadi va ovoz chiqarib o'qiydi.
// Sozlamalarda o'chiriladi: proactive (ekranga qarash), briefs (kunlik xulosa).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tashkentNowNote } from "../assistant/routes.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const readPrompt = (name) => readFileSync(path.join(here, "..", "..", "prompts", name), "utf8").trim();
const WATCH_PROMPT = readPrompt("proactive-watch.md");
const BRIEF_PROMPT = readPrompt("proactive-brief.md");

export const TICK_MS = 60_000; // har daqiqada tekshiradi
export const WATCH_EVERY_MS = 10 * 60_000; // ekranga 10 daqiqada bir qaraydi
export const WATCH_COOLDOWN_MS = 30 * 60_000; // ekran haqida ketma-ket gaplar orasida kamida 30 daqiqa
const TASHKENT_OFFSET_MS = 5 * 60 * 60_000;
const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
const QUIET = { from: 23, to: 8 }; // tunda ekranga qaralmaydi
// Xulosa oynasi (Toshkent soati): server shu vaqt ichida yoqilgan bo'lsa ham kunda bir marta yuboradi.
export const BRIEF_WINDOWS = { morning: { from: 8, to: 12 }, evening: { from: 21, to: 24 } };
const SILENT_RE = /^\s*JIM\b/i; // model "aytadigan gapim yo'q" degani
const MEMORY_LINES = 30;
const REMINDER_LINES = 10;

/** Toshkent soati (0-23) va shu kunning boshi (UTC ms). */
export function tashkentClock(ms) {
  const t = new Date(ms + TASHKENT_OFFSET_MS);
  const dayStart = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - TASHKENT_OFFSET_MS;
  return { hour: t.getUTCHours(), dayStart };
}

/** Hozir qaysi xulosa vaqti (va bugun hali yuborilmagan bo'lsa): "morning" | "evening" | null. */
export function dueBrief(nowMs, lastAt) {
  const { hour, dayStart } = tashkentClock(nowMs);
  for (const [kind, w] of Object.entries(BRIEF_WINDOWS)) {
    const inWindow = hour >= w.from && hour < w.to;
    const sentToday = (lastAt(kind) ?? 0) >= dayStart;
    if (inWindow && !sentToday) return kind;
  }
  return null;
}

const isQuiet = (nowMs) => {
  const { hour } = tashkentClock(nowMs);
  return hour >= QUIET.from || hour < QUIET.to;
};

/** Model javobi: "JIM" yoki bo'sh — gap yo'q (null). */
export function nudgeText(raw) {
  const text = String(raw ?? "").replace(/\[[a-z]+\]/g, "").trim(); // ovoz/yuz teglari kerak emas
  return !text || SILENT_RE.test(text) ? null : text;
}

/**
 * @param {{ jigar: { think: Function }, hub: object, nudges: ReturnType<import("./store.js").createNudgeStore>,
 *           assistant: object, settings: object, store: object, now?: () => number,
 *           log?: (msg: string) => void }} deps
 */
export function createProactive({ jigar, hub, nudges, assistant, settings, store, now = Date.now, log = console.warn }) {
  let lastWatch = 0;
  let running = false;

  /** Jigarga kontekst: vaqt, ism, xotira, eslatmalar, bugun allaqachon aytilganlar (takrorlamasin). */
  function context(owner) {
    const memories = assistant.listMemories(owner.id).slice(-MEMORY_LINES).map((m) => `- ${m.text}`);
    const reminders = assistant.pendingReminders(owner.id).slice(0, REMINDER_LINES).map((r) => `- ${r.dueAt}: ${r.text}`);
    const said = nudges.since(owner.id, DAY_MS).map((n) => `- (${n.createdAt}) ${n.text.slice(0, 200)}`);
    return [
      tashkentNowNote(new Date(now())),
      `Egasining ismi: ${owner.name || "noma'lum"}`,
      `Xotira:\n${memories.join("\n") || "- yo'q"}`,
      `Kutilayotgan eslatmalar:\n${reminders.join("\n") || "- yo'q"}`,
      `Bugun o'zing allaqachon aytganlaring (takrorlama):\n${said.join("\n") || "- yo'q"}`,
    ].join("\n\n");
  }

  async function brief(owner, kind) {
    const label = kind === "morning" ? "ERTALABKI REJA" : "KECHKI XULOSA";
    const text = nudgeText(await jigar.think({ system: BRIEF_PROMPT, content: `${label}\n\n${context(owner)}`, search: kind === "morning" }));
    // Gap bo'lmasa ham belgi qo'yiladi (ko'rilgan holda — ilovada chiqmaydi): bugun qayta urinilmaydi.
    const saved = nudges.add(owner.id, kind, text ?? "—");
    if (!text && saved) nudges.markSeen(owner.id, saved.id);
  }

  async function watch(owner) {
    const shot = await hub.call(owner.id, { tool: "pc_screenshot" });
    if (typeof shot?.image !== "string") return; // ruxsat yo'q yoki xato
    const content = [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: shot.image } },
      { type: "text", text: context(owner) },
    ];
    const text = nudgeText(await jigar.think({ system: WATCH_PROMPT, content }));
    if (text) nudges.add(owner.id, "watch", text);
  }

  /** Bir qadam: kerak bo'lsa xulosa, kerak bo'lsa ekranga qarash. Xatolar — logga (ilova ishlashda davom etadi). */
  async function tick() {
    if (running) return;
    running = true;
    try {
      const owner = store.ownerUser();
      if (!owner) return;
      const { proactive, briefs } = settings.all();
      const kind = briefs === "on" ? dueBrief(now(), (k) => nudges.lastAt(owner.id, k)) : null;
      if (kind) await brief(owner, kind);
      const watchDue = now() - lastWatch >= WATCH_EVERY_MS;
      const cooled = now() - (nudges.lastAt(owner.id, "watch") ?? 0) >= WATCH_COOLDOWN_MS;
      if (proactive === "on" && watchDue && cooled && !isQuiet(now()) && hub.status(owner.id).online) {
        lastWatch = now();
        await watch(owner);
      }
    } catch (err) {
      log(`[proactive] ${err.message}`);
    } finally {
      running = false;
    }
  }

  return {
    tick,
    start() {
      setInterval(tick, TICK_MS).unref();
    },
  };
}
