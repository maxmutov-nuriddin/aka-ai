// "Aka" bilan gaplashish mantig'i: so'rovni tuzish, Claude'ga yuborish, javobni ajratish.
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseAkaResponse } from "./parse.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const SYSTEM_PROMPT = readFileSync(path.join(here, "..", "prompts", "system-prompt.md"), "utf8").trim();

export const LIMITS = {
  pageChars: 60_000, // sahifa matni (undan uzuni kesiladi va modelga aytiladi)
  messageChars: 4_000, // o'quvchining bitta xabari
  assistantChars: 12_000, // tarixdagi Aka javobi
  selectionChars: 4_000,
  historyTurns: 40, // jami xabarlar soni (user + assistant)
  summaryItems: 60,
};

export class ValidationError extends Error {}

export function getConfig(env = process.env) {
  return {
    model: env.AKA_MODEL || "claude-opus-5-5",
    effort: env.AKA_EFFORT || "medium",
    maxTokens: Number(env.AKA_MAX_TOKENS) || 16000,
    // Server tomonidagi zaxira model (refusal bo'lsa). Faqat Claude API'da ishlaydi.
    fallbacks: env.AKA_FALLBACKS !== "off",
  };
}

const str = (v) => (typeof v === "string" ? v : "");
const clip = (s, n) => (s.length > n ? s.slice(0, n) : s);

/** Sahifa ma'lumotini tekshiradi va tozalaydi. */
export function normalizePage(page) {
  if (page == null) return null;
  if (typeof page !== "object") throw new ValidationError("page obyekt bo'lishi kerak");
  const text = str(page.text).replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const title = clip(str(page.title).trim(), 300);
  const url = clip(str(page.url).trim(), 1000);
  if (!text && !title) return null;
  return {
    title,
    url,
    text: clip(text, LIMITS.pageChars),
    truncated: text.length > LIMITS.pageChars,
  };
}

/** Suhbat tarixini tekshiradi: user bilan boshlanadi, navbatma-navbat, user bilan tugaydi. */
export function normalizeHistory(history) {
  if (!Array.isArray(history) || history.length === 0) {
    throw new ValidationError("history bo'sh bo'lmasligi kerak");
  }
  if (history.length > LIMITS.historyTurns) {
    throw new ValidationError(`Suhbat juda uzun (ko'pi bilan ${LIMITS.historyTurns} ta xabar). Yangi suhbat boshlang.`);
  }
  if (history.length % 2 === 0) throw new ValidationError("Oxirgi xabar o'quvchidan bo'lishi kerak");
  return history.map((m, i) => {
    const expected = i % 2 === 0 ? "user" : "assistant";
    if (!m || m.role !== expected) throw new ValidationError(`history[${i}].role "${expected}" bo'lishi kerak`);
    const content = str(m.content).trim();
    const max = expected === "user" ? LIMITS.messageChars : LIMITS.assistantChars;
    if (content.length > max) throw new ValidationError(`history[${i}] juda uzun (ko'pi bilan ${max} belgi)`);
    // Faqat birinchi xabar bo'sh bo'lishi mumkin ("shu sahifani tushuntir" degani).
    if (!content && i !== 0) throw new ValidationError(`history[${i}] bo'sh`);
    return { role: expected, content };
  });
}

function pageBlock(page) {
  if (!page) {
    return "<sahifa>\n(Sahifa matni berilmagan. O'quvchi faqat savol berdi.)\n</sahifa>";
  }
  const lines = ["<sahifa>"];
  if (page.title) lines.push(`Sarlavha: ${page.title}`);
  if (page.url) lines.push(`Manzil: ${page.url}`);
  if (page.truncated) lines.push("(Eslatma: sahifa juda uzun, quyida faqat uning boshlang'ich qismi berilgan.)");
  lines.push("Matn:", page.text || "(matn yo'q)", "</sahifa>");
  return lines.join("\n");
}

/**
 * Claude uchun messages massivini quradi.
 * Sahifa har doim birinchi user xabariga qo'shiladi — shu tufayli prefiks o'zgarmaydi va kesh ishlaydi.
 * Tanlangan qism (selection) faqat oxirgi xabarga qo'shiladi.
 */
export function buildMessages({ page, history, selection }) {
  const msgs = history.map((m) => ({ role: m.role, content: m.content }));
  const sel = clip(str(selection).trim(), LIMITS.selectionChars);
  const last = msgs[msgs.length - 1];
  const question = last.content || "Shu sahifani tushuntirib ber.";
  last.content = sel ? `O'quvchi sahifadan shu qismni tanladi:\n"""\n${sel}\n"""\n\n${question}` : question;
  msgs[0].content = `${pageBlock(page)}\n\n${msgs[0].content || "Shu sahifani tushuntirib ber."}`;
  return msgs;
}

/** XULOSA_SO'ROVI matnini tuzadi. */
export function buildSummaryMessage({ pageTitle, items }) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ValidationError("Xulosa uchun kamida bitta savol-javob kerak");
  }
  const list = items.slice(0, LIMITS.summaryItems).map((it, i) => {
    const lines = [`${i + 1}. Savol: ${clip(str(it?.savol).trim() || "(sahifani tushuntirish)", 1000)}`];
    const javob = clip(str(it?.javob).trim(), 1500);
    if (javob) lines.push(`   Aka javobi: ${javob}`);
    const q = it?.quiz;
    if (q && typeof q === "object" && str(q.savol)) {
      const natija = q.tanlangan
        ? q.tanlangan === q.togri ? "TO'G'RI" : "XATO"
        : "javob bermadi";
      lines.push(
        `   Quiz: ${clip(str(q.savol), 500)} | O'quvchi tanladi: ${str(q.tanlangan) || "-"} | To'g'ri javob: ${str(q.togri)} | Natija: ${natija}`,
      );
    }
    return lines.join("\n");
  });
  const head = ["XULOSA_SO'ROVI"];
  if (str(pageTitle).trim()) head.push(`Sahifa: ${clip(str(pageTitle).trim(), 300)}`);
  return `${head.join("\n")}\n\nDars davomidagi savol-javoblar:\n${list.join("\n")}`;
}

function extractText(message) {
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

const REFUSAL_TEXT =
  "Ha-ha, bu savolga men javob bera olmayman, aka. Keling, darsga qaytamiz: sahifadagi mavzu bo'yicha nima tushunarsiz bo'ldi?";

export function createAka({ client = new Anthropic(), config = getConfig() } = {}) {
  async function call(messages) {
    const params = {
      model: config.model,
      max_tokens: config.maxTokens,
      system: SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" }, // tizim prompti + sahifa keshlanadi
      output_config: { effort: config.effort },
      messages,
    };
    let message;
    if (config.fallbacks) {
      message = await client.beta.messages.create({
        ...params,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
    } else {
      message = await client.messages.create(params);
    }

    const text = extractText(message);
    const refused = message.stop_reason === "refusal";
    return {
      text: refused ? REFUSAL_TEXT : text,
      stopReason: message.stop_reason,
      refused,
      truncated: message.stop_reason === "max_tokens",
      model: message.model,
      usage: message.usage
        ? {
            input: message.usage.input_tokens,
            output: message.usage.output_tokens,
            cacheRead: message.usage.cache_read_input_tokens ?? 0,
            cacheWrite: message.usage.cache_creation_input_tokens ?? 0,
          }
        : undefined,
    };
  }

  return {
    async chat({ page, history, selection }) {
      const normPage = normalizePage(page);
      const normHistory = normalizeHistory(history);
      const result = await call(buildMessages({ page: normPage, history: normHistory, selection }));
      return { ...result, pageTruncated: Boolean(normPage?.truncated), parsed: parseAkaResponse(result.text) };
    },
    async summary({ pageTitle, items }) {
      const content = buildSummaryMessage({ pageTitle, items });
      return call([{ role: "user", content }]);
    },
  };
}
