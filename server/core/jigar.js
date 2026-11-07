// "Jigar" bilan gaplashish mantig'i: so'rovni tuzish, Claude'ga yuborish, javobni ajratish.
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseAkaResponse } from "./parse.js";

import { ValidationError } from "./errors.js";

export { ValidationError };

const here = path.dirname(fileURLToPath(import.meta.url));
const readPrompt = (name) => readFileSync(path.join(here, "..", "..", "prompts", name), "utf8").trim();
export const SYSTEM_PROMPT = readPrompt("system-prompt.md");
// "Beparvo" rejim: o'quvchi o'zi yoqadi — Jigar qo'pol, baqiradigan, so'kinadigan bo'lib qoladi.
const BEPARVO_PROMPT = readPrompt("beparvo-mode.md");
// Rus tili tanlansa — oxiriga qo'shiladi va til qoidalarini almashtiradi.
const RUSSIAN_PROMPT = readPrompt("lang-ru.md");
// Javob uslubi: qisqa (2-3 gap) va sodda (oddiy so'zlar). O'quvchi yuqoridagi sozlamalarda tanlaydi.
const SHORT_PROMPT = readPrompt("style-short.md");
const DETAILED_PROMPT = readPrompt("style-detailed.md");
const SIMPLE_PROMPT = readPrompt("style-simple.md");

// Xarakter: o'quvchi ro'yxatdan o'tishda tanlaydi. Har birining o'z prompti bor (ohang bo'yicha asosiydan ustun).
// Xarakter tanlanmagan bo'lsa — asosiy promptning o'zi.
export const PERSONAS = ["neytral", "mehribon", "kinoyali", "jahldor", "romantik"];
const PERSONA_PROMPTS = Object.fromEntries(PERSONAS.map((p) => [p, readPrompt(`persona-${p}.md`)]));

/** Xarakterni tekshiradi. Berilmasa — null (asosiy ohang). */
export function normalizePersona(persona) {
  if (persona == null || persona === "") return null;
  if (!PERSONAS.includes(persona)) throw new ValidationError(`persona: ${PERSONAS.join(" | ")} bo'lishi kerak`);
  return persona;
}

// O'quvchi profili (ro'yxatdan o'tishdagi savollar): maqsad va sinf — misollar va murakkablikni belgilaydi.
const GOAL_GUIDE = {
  study: "Maktab darslari. Maktab dasturiga mos tushuntir. Uy vazifasida javobni tayyor yozib berma — o'zi yechishiga yordam ber.",
  exam: "Imtihonga tayyorgarlik (DTM, test, nazorat ishlari). Mavzu testda qanday so'ralishini, tipik xatolarni va eslab qolish usullarini ko'rsat.",
  olympiad: "Olimpiada. Chuqurroq bor: nostandart yondashuv, murakkabroq misol, \"nega\" savoliga alohida e'tibor.",
  university: "Universitet yoki kurs. Akademik aniqlik: to'g'ri atamalar, ta'riflar, kerak bo'lsa formulalar.",
  language: "Chet tilini o'rganyapti. Yangi so'zlarni tarjimasi bilan ber, gaplarni sodda tuz, kerak joyda grammatika yoki talaffuz izohini qo'sh.",
  it: "Dasturlash va IT. Misollarni dasturlash va texnologiyadan ol; kerak bo'lsa algoritm qadamlarini yoki juda qisqa kodni ko'rsat.",
  curious: "Shunchaki qiziqish. Qiziqarli faktlar va hayotiy bog'lanishlarga urg'u ber, imtihon ohangisiz.",
};
const LEVEL_GUIDE = {
  "5-7": "5–7-sinf (taxminan 11–13 yosh). Eng oddiy so'zlar, kundalik misollar. Har bir atamani oddiy so'z bilan izohla.",
  "8-9": "8–9-sinf (taxminan 14–15 yosh). Maktab atamalarini ishlat, lekin har yangi atamani qisqa izohla.",
  "10-11": "10–11-sinf yoki litsey (taxminan 16–18 yosh). To'liq ilmiy atamalar, formulalar, chuqurroq sabab-oqibat.",
  student: "Talaba yoki katta yoshli. Akademik til, aniq ta'riflar, ortiqcha soddalashtirmasdan.",
};
export const GOALS = Object.keys(GOAL_GUIDE);
export const LEVELS = Object.keys(LEVEL_GUIDE);

/** Ro'yxatdagi qiymatni tekshiradi. Berilmasa — null. */
function oneOf(field, list) {
  return (value) => {
    if (value == null || value === "") return null;
    if (!list.includes(value)) throw new ValidationError(`${field}: ${list.join(" | ")} bo'lishi kerak`);
    return value;
  };
}
export const normalizeGoal = oneOf("goal", GOALS);
export const normalizeLevel = oneOf("level", LEVELS);

// "Beparvo" (so'kinadigan) rejim faqat kattalar uchun: sinf maktab o'quvchisi bo'lsa — oddiyga tushiriladi.
// Sinf berilmagan eski mijozlar (kengaytma) uchun avvalgidek ishlaydi.
const ADULT_LEVELS = new Set(["student"]);
const effectiveMode = (mode, level) => (mode === "beparvo" && level && !ADULT_LEVELS.has(level) ? "oddiy" : mode);

/** Maqsad va sinfdan tizim promptiga qo'shimcha. Ikkalasi ham yo'q bo'lsa — null. */
function profilePromptFor(goal, level) {
  if (!goal && !level) return null;
  const lines = ["# O'QUVCHI PROFILI (ro'yxatdan o'tishda o'zi tanladi)", "Tushuntirish, misollar va so'zlarni shu o'quvchiga moslab tanla:"];
  if (goal) lines.push(`- Maqsad: ${GOAL_GUIDE[goal]}`);
  if (level) lines.push(`- Sinf: ${LEVEL_GUIDE[level]}`);
  return lines.join("\n");
}

export const LENGTHS = ["qisqa", "odatiy", "batafsil"];

/** Javob uzunligini tekshiradi. Berilmasa — "odatiy". */
export function normalizeLength(length) {
  if (length == null || length === "") return "odatiy";
  if (!LENGTHS.includes(length)) throw new ValidationError(`length: ${LENGTHS.join(" | ")} bo'lishi kerak`);
  return length;
}

export const LANGS = ["uz", "ru"];

/** Tilni tekshiradi. Berilmasa — "uz". */
export function normalizeLang(lang) {
  if (lang == null || lang === "") return "uz";
  if (!LANGS.includes(lang)) throw new ValidationError(`lang: ${LANGS.join(" | ")} bo'lishi kerak`);
  return lang;
}

export const MODES = ["oddiy", "beparvo"];

/** Rejimni tekshiradi. Berilmasa — "oddiy". */
export function normalizeMode(mode) {
  if (mode == null || mode === "") return "oddiy";
  if (!MODES.includes(mode)) throw new ValidationError(`mode: ${MODES.join(" | ")} bo'lishi kerak`);
  return mode;
}

/** Rejim, til va uslubga mos tizim prompti. Har birikma alohida keshlanadi. Til qo'shimchasi doim oxirida. */
export function systemPromptFor(
  mode, lang = "uz", { length = "odatiy", simple = false, persona = null, goal = null, level = null } = {},
) {
  const parts = [SYSTEM_PROMPT];
  if (mode === "beparvo") parts.push(BEPARVO_PROMPT);
  else if (PERSONA_PROMPTS[persona]) parts.push(PERSONA_PROMPTS[persona]); // beparvo o'zi kuchli xarakter — ustma-ust qo'yilmaydi
  if (length === "qisqa") parts.push(SHORT_PROMPT);
  if (length === "batafsil") parts.push(DETAILED_PROMPT);
  if (simple) parts.push(SIMPLE_PROMPT);
  const profile = profilePromptFor(goal, level);
  if (profile) parts.push(profile);
  if (lang === "ru") parts.push(RUSSIAN_PROMPT);
  return parts.join("\n\n");
}

export const LIMITS = {
  pageChars: 60_000, // sahifa matni (undan uzuni kesiladi va modelga aytiladi)
  messageChars: 4_000, // o'quvchining bitta xabari
  assistantChars: 12_000, // tarixdagi Jigar javobi
  selectionChars: 4_000,
  historyTurns: 40, // jami xabarlar soni (user + assistant)
  summaryItems: 60,
};


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

/**
 * Ovozli xabarga ikkinchi tanish tizimi (ElevenLabs Scribe) eshitgan variantni qo'shadi —
 * model ikkalasini solishtirib, o'quvchi aslida nima deganini topadi.
 * Variant bo'sh yoki asosiysi bilan bir xil bo'lsa, matn o'zgarmaydi.
 */
export function withHeardAlternative(text, alternative) {
  const main = str(text).trim();
  const alt = clip(str(alternative).replace(/\s+/g, " ").trim(), LIMITS.messageChars);
  const same = (a, b) => a.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "") === b.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  if (!main || !alt || same(main, alt)) return main;
  return `${main}\n\n(Ovozdan tanilgan matn. Ikkinchi tanish tizimi shunday eshitdi: "${alt}")`;
}

// Beparvo rejimda javob boshlanishi takrorlanmasin — har so'rovga tasodifiy uslub beriladi.
export const BEPARVO_OPENERS = [
  "so'ralgan mavzudagi odam yoki narsani 'qurol' qilib, hazil-po'pisa bilan",
  "achchiq kesatiq bilan (o'quvchini 'akademik', 'professor', 'daho' deb masxara qilib)",
  "ketma-ket ritorik savollar bilan",
  "dramatik xo'rsinish va shikoyat bilan (nega aynan menga shunday o'quvchi tushdi?)",
  "hisob-kitob bilan (bu savolni nechanchi marta eshitayotganingni sanab)",
  "mavzudagi mashhur shaxs nomidan jahl qilib (u buni eshitsa nima derdi)",
  "kutilmagan qiyos bilan (o'quvchini mavzudagi biror narsaga o'xshatib)",
  "qisqa, keskin baqiriq bilan, keyin darrov mavzuga",
];

/** Beparvo rejimda oxirgi xabarga boshlanish uslubi haqida izoh qo'shadi. */
export function withBeparvoOpener(text, random = Math.random) {
  const style = BEPARVO_OPENERS[Math.floor(random() * BEPARVO_OPENERS.length)];
  return `${text}\n\n(Beparvo rejim: bu javobni ${style} boshla. "Jin ursin" bilan boshlama.)`;
}

/** XULOSA_SO'ROVI matnini tuzadi. */
export function buildSummaryMessage({ pageTitle, items }) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ValidationError("Xulosa uchun kamida bitta savol-javob kerak");
  }
  const list = items.slice(0, LIMITS.summaryItems).map((it, i) => {
    const lines = [`${i + 1}. Savol: ${clip(str(it?.savol).trim() || "(sahifani tushuntirish)", 1000)}`];
    const javob = clip(str(it?.javob).trim(), 1500);
    if (javob) lines.push(`   Jigar javobi: ${javob}`);
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
  "Ha-ha, bu savolga men javob bera olmayman, jigar. Keling, darsga qaytamiz: sahifadagi mavzu bo'yicha nima tushunarsiz bo'ldi?";

export function createJigar({ client = new Anthropic(), config = getConfig(), random = Math.random } = {}) {
  function lastUserContent(content, heardAlt, mode) {
    const heard = withHeardAlternative(content, heardAlt);
    return mode === "beparvo" ? withBeparvoOpener(heard || "Shu sahifani tushuntirib ber.", random) : heard;
  }

  async function call(messages, mode = "oddiy", lang = "uz", style = {}) {
    const params = {
      model: config.model,
      max_tokens: config.maxTokens,
      system: systemPromptFor(mode, lang, style),
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
    async chat({ page, history, selection, mode, heardAlt, lang, length, simple, persona, goal, level }) {
      const normLevel = normalizeLevel(level);
      const normMode = effectiveMode(normalizeMode(mode), normLevel);
      const normLang = normalizeLang(lang);
      const style = {
        length: normalizeLength(length),
        simple: simple === true,
        persona: normalizePersona(persona),
        goal: normalizeGoal(goal),
        level: normLevel,
      };
      const normPage = normalizePage(page);
      const lastIndex = Array.isArray(history) ? history.length - 1 : -1;
      const normHistory = normalizeHistory(history).map((m, i) =>
        i === lastIndex ? { ...m, content: lastUserContent(m.content, heardAlt, normMode) } : m,
      );
      const userContent = normHistory[normHistory.length - 1].content;
      const result = await call(buildMessages({ page: normPage, history: normHistory, selection }), normMode, normLang, style);
      // userContent: mijoz tarixga aynan shuni yozadi — keyingi so'rovlarda prefiks o'zgarmaydi (kesh ishlaydi).
      return { ...result, userContent, pageTruncated: Boolean(normPage?.truncated), parsed: parseAkaResponse(result.text) };
    },
    async summary({ pageTitle, items, mode, lang, simple, persona, goal, level }) {
      const normLevel = normalizeLevel(level);
      const normMode = effectiveMode(normalizeMode(mode), normLevel);
      const normLang = normalizeLang(lang);
      const content = buildSummaryMessage({ pageTitle, items });
      const style = { simple: simple === true, persona: normalizePersona(persona), goal: normalizeGoal(goal), level: normLevel };
      return call([{ role: "user", content }], normMode, normLang, style);
    },
  };
}
