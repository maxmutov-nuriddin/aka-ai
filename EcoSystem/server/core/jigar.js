// Jigar EcoSystem — shaxsiy yordamchi mantig'i: so'rovni tuzish, Claude'ga (yoki Gemini/OpenAI'ga) yuborish,
// javobni ajratish. O'quvchi (dars, yo'nalish, sinf, quiz, beparvo) qoidalari yo'q — ular faqat Global'da.
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
const RUSSIAN_PROMPT = readPrompt("lang-ru.md"); // rus tili — oxiriga, til qoidalarini almashtiradi
const SHORT_PROMPT = readPrompt("style-short.md");
const DETAILED_PROMPT = readPrompt("style-detailed.md");

// Xarakter (ohang): ro'yxatdan o'tishda tanlanadi; har birining o'z prompti bor. Tanlanmagan — asosiy ohang.
export const PERSONAS = ["neytral", "mehribon", "kinoyali", "jahldor", "romantik", "moslashuvchan"];
const PERSONA_PROMPTS = Object.fromEntries(PERSONAS.map((p) => [p, readPrompt(`persona-${p}.md`)]));
const NAME_MAX = 40;

const str = (v) => (typeof v === "string" ? v : "");
const clip = (s, n) => (s.length > n ? s.slice(0, n) : s);

/** Ism promptga: faqat harf, bo'shliq, apostrof va chiziqcha (yangi qator — in'yeksiya emas). */
function cleanName(name) {
  return clip(str(name).replace(/[^\p{L}\p{M} 'ʻʼ‘’-]/gu, " ").replace(/\s+/g, " ").trim(), NAME_MAX);
}

/** Xarakterni tekshiradi. Berilmasa — null (asosiy ohang). */
export function normalizePersona(persona) {
  if (persona == null || persona === "") return null;
  if (!PERSONAS.includes(persona)) throw new ValidationError(`persona: ${PERSONAS.join(" | ")} bo'lishi kerak`);
  return persona;
}

export const LENGTHS = ["qisqa", "odatiy", "batafsil"];

/** Javob uzunligi. Berilmasa — "odatiy". */
export function normalizeLength(length) {
  if (length == null || length === "") return "odatiy";
  if (!LENGTHS.includes(length)) throw new ValidationError(`length: ${LENGTHS.join(" | ")} bo'lishi kerak`);
  return length;
}

export const LANGS = ["uz", "ru"];

/** Til. Berilmasa — "uz". */
export function normalizeLang(lang) {
  if (lang == null || lang === "") return "uz";
  if (!LANGS.includes(lang)) throw new ValidationError(`lang: ${LANGS.join(" | ")} bo'lishi kerak`);
  return lang;
}

/** Eslab qolingan faktlar (xotira) — tizim promptiga. Bo'sh — null. */
function memoryPromptFor(memories) {
  const facts = (Array.isArray(memories) ? memories : []).map((m) => clip(str(m).replace(/\s+/g, " ").trim(), 200)).filter(Boolean);
  if (!facts.length) return null;
  return ["# XOTIRA (foydalanuvchi haqida avval eslab qolganlaring — kerak bo'lsa ishlat, takror so'rama)", ...facts.map((f) => `- ${f}`)].join("\n");
}

/** Tizim prompti: asosiy + xarakter + uzunlik + ism + til + xotira. Xotira oxirida — kamdan-kam o'zgaradi (kesh). */
export function systemPromptFor(lang = "uz", { length = "odatiy", persona = null, name = null, memories = null } = {}) {
  const parts = [SYSTEM_PROMPT];
  if (PERSONA_PROMPTS[persona]) parts.push(PERSONA_PROMPTS[persona]);
  if (length === "qisqa") parts.push(SHORT_PROMPT);
  if (length === "batafsil") parts.push(DETAILED_PROMPT);
  const cleanedName = cleanName(name);
  if (cleanedName) parts.push(`# FOYDALANUVCHI\n- Ismi: ${cleanedName} — vaqti-vaqti bilan ismi bilan murojaat qil (har gapda emas).`);
  if (lang === "ru") parts.push(RUSSIAN_PROMPT);
  const memory = memoryPromptFor(memories);
  if (memory) parts.push(memory);
  return parts.join("\n\n");
}

// Internet qidiruvi (Claude): ob-havo, yangilik, kurs, narx. Haiku — oddiy variant.
const WEB_SEARCH_MAX_USES = 3;
const webSearchTool = (haiku) => ({
  type: haiku ? "web_search_20250305" : "web_search_20260209",
  name: "web_search",
  max_uses: WEB_SEARCH_MAX_USES,
  user_location: { type: "approximate", city: "Tashkent", timezone: "Asia/Tashkent" }, // "UZ" mamlakat kodi qo'llanmaydi (400)
});
const MAX_PAUSE_CONTINUES = 3; // qidiruv uzoq cho'zilsa server "pause_turn" qaytaradi — shuncha marta davom ettiramiz
const MAX_TOOL_ROUNDS = 8; // kompyuter asboblari (ekran, fayl, buyruq): bitta javobda shuncha qadamgacha
const NOW_NOTE_MAX = 400; // vaqt + qurilma izohi (oxirgi xabarga)
const THINK_MAX_TOKENS = 2000; // proaktiv fikr (ekranga o'zi qarash, kunlik xulosa) — qisqa

export const LIMITS = {
  pageChars: 60_000, // sahifa matni (undan uzuni kesiladi va modelga aytiladi)
  messageChars: 4_000, // foydalanuvchining bitta (yangi) xabari
  // Tarixdagi eski xabar: server unga izoh qo'shgan bo'lishi mumkin (eshitilgan variant, kamera, vaqt).
  storedMessageChars: 10_000,
  assistantChars: 12_000, // tarixdagi Jigar javobi
  selectionChars: 4_000,
  historyTurns: 40, // jami xabarlar soni (user + assistant)
  imageBase64Chars: 1_500_000, // rasm (~1.1 MB)
  pdfBase64Chars: 11_000_000, // PDF (~8 MB fayl)
};

const IMAGE_DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;
const PDF_DATA_URL_RE = /^data:application\/pdf;base64,([A-Za-z0-9+/]+={0,2})$/;

function normalizeImage(image, field = "page.image") {
  if (image == null || image === "") return null;
  const match = typeof image === "string" ? IMAGE_DATA_URL_RE.exec(image) : null;
  if (!match) throw new ValidationError(`${field}: data:image/(jpeg|png|webp);base64,... bo'lishi kerak`);
  if (match[2].length > LIMITS.imageBase64Chars) throw new ValidationError(`${field} juda katta`);
  return { mediaType: match[1], data: match[2] };
}

function normalizePdf(pdf) {
  if (pdf == null || pdf === "") return null;
  const match = typeof pdf === "string" ? PDF_DATA_URL_RE.exec(pdf) : null;
  if (!match) throw new ValidationError("page.pdf: data:application/pdf;base64,... bo'lishi kerak");
  if (match[1].length > LIMITS.pdfBase64Chars) throw new ValidationError("PDF juda katta (ko'pi bilan ~8 MB)");
  return { data: match[1] };
}

/** Xabarlarda PDF bormi — muqobil miyalar (Gemini, OpenAI) uni o'qimaydi, javobni Claude beradi. */
const hasDocument = (messages) =>
  messages.some((m) => Array.isArray(m.content) && m.content.some((b) => b?.type === "document"));

/** Kamera kadri (Jigarning "ko'zi"): oldi yoki orqa kameradan ko'rsatilgan narsa — faqat shu xabarga. */
export const normalizeCameraImage = (image) => normalizeImage(image, "image");

// Ovozli xabar: Jigar tushungan savolni [SAVOL] da to'g'ri yozib qaytaradi (chatda xom matn o'rniga).
export const VOICE_NOTE = "(Ovozli xabar: javob boshida [SAVOL] bo'limini yoz.)";
// Tarixda qoladi: keyingi javoblarda Jigar rasm ko'rsatilganini biladi (rasmning o'zi qayta yuborilmaydi).
export const CAMERA_NOTE = "(Foydalanuvchi kamerada narsa ko'rsatdi — rasm shu xabarga ilova qilingan.)";
const withCameraNote = (text) => `${CAMERA_NOTE}\n${text}`;
const imageBlock = (image) => ({ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } });

export function getConfig(env = process.env) {
  return {
    model: env.AKA_MODEL || "claude-opus-5-5",
    haikuModel: env.AKA_HAIKU_MODEL || "claude-haiku-5-5", // ECO_LLM=haiku — arzon Claude
    effort: env.AKA_EFFORT || "medium",
    maxTokens: Number(env.AKA_MAX_TOKENS) || 16000,
    fallbacks: env.AKA_FALLBACKS !== "off", // server tomonidagi zaxira model (refusal bo'lsa), faqat Claude API
  };
}

/** Sahifa yoki hujjat (matn, rasm, PDF) — tekshiradi va tozalaydi. */
export function normalizePage(page) {
  if (page == null) return null;
  if (typeof page !== "object") throw new ValidationError("page obyekt bo'lishi kerak");
  const text = str(page.text).replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const title = clip(str(page.title).trim(), 300);
  const url = clip(str(page.url).trim(), 1000);
  const image = normalizeImage(page.image);
  const pdf = normalizePdf(page.pdf);
  if (!text && !title && !image && !pdf) return null;
  return {
    title, url, text: clip(text, LIMITS.pageChars), truncated: text.length > LIMITS.pageChars,
    ...(image ? { image } : {}), ...(pdf ? { pdf } : {}),
  };
}

/** Suhbat tarixi: user bilan boshlanadi, navbatma-navbat, user bilan tugaydi. */
export function normalizeHistory(history) {
  if (!Array.isArray(history) || history.length === 0) throw new ValidationError("history bo'sh bo'lmasligi kerak");
  if (history.length > LIMITS.historyTurns) {
    throw new ValidationError(`Suhbat juda uzun (ko'pi bilan ${LIMITS.historyTurns} ta xabar). Yangi suhbat boshlang.`);
  }
  if (history.length % 2 === 0) throw new ValidationError("Oxirgi xabar foydalanuvchidan bo'lishi kerak");
  return history.map((m, i) => {
    const expected = i % 2 === 0 ? "user" : "assistant";
    if (!m || m.role !== expected) throw new ValidationError(`history[${i}].role "${expected}" bo'lishi kerak`);
    const content = str(m.content).trim();
    const userMax = i === history.length - 1 ? LIMITS.messageChars : LIMITS.storedMessageChars;
    const max = expected === "user" ? userMax : LIMITS.assistantChars;
    if (content.length > max) throw new ValidationError(`history[${i}] juda uzun (ko'pi bilan ${max} belgi)`);
    if (!content && i !== 0) throw new ValidationError(`history[${i}] bo'sh`);
    return { role: expected, content };
  });
}

function pageBlock(page) {
  if (!page) return ""; // sahifa yo'q — hech narsa qo'shilmaydi
  const lines = ["<sahifa>"];
  if (page.title) lines.push(`Sarlavha: ${page.title}`);
  if (page.url) lines.push(`Manzil: ${page.url}`);
  if (page.truncated) lines.push("(Eslatma: sahifa juda uzun, quyida faqat uning boshlang'ich qismi berilgan.)");
  if (page.pdf) lines.push("(Yuqorida — foydalanuvchi yuklagan hujjat (PDF). Savolga shunga tayanib javob ber; yo'q narsani undan deb to'qima.)");
  if (page.image) lines.push("(Yuqorida — foydalanuvchi bergan rasm yoki ekran surati. Matn bilan farq qilsa, rasm ustun.)");
  lines.push("Matn:", page.text || "(matn yo'q)", "</sahifa>");
  return lines.join("\n");
}

/**
 * Claude uchun messages massivi. Sahifa birinchi xabarga qo'shiladi (prefiks o'zgarmaydi — kesh ishlaydi);
 * tanlangan qism va kamera kadri — faqat oxirgi xabarga.
 */
export function buildMessages({ page, history, selection, image = null }) {
  const msgs = history.map((m) => ({ role: m.role, content: m.content }));
  const sel = clip(str(selection).trim(), LIMITS.selectionChars);
  const last = msgs[msgs.length - 1];
  const question = last.content || "Shu sahifani tushuntirib ber.";
  last.content = sel ? `Foydalanuvchi sahifadan shu qismni tanladi:\n"""\n${sel}\n"""\n\n${question}` : question;
  const block = pageBlock(page);
  const firstText = block ? `${block}\n\n${msgs[0].content || "Shu sahifani tushuntirib ber."}` : msgs[0].content;
  const pageBlocks = [
    ...(page?.pdf ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: page.pdf.data } }] : []),
    ...(page?.image ? [imageBlock(page.image)] : []),
  ];
  msgs[0].content = pageBlocks.length ? [...pageBlocks, { type: "text", text: firstText }] : firstText;
  if (image) {
    const lastMsg = msgs[msgs.length - 1];
    const blocks = Array.isArray(lastMsg.content) ? lastMsg.content : [{ type: "text", text: lastMsg.content }];
    msgs[msgs.length - 1] = { ...lastMsg, content: [imageBlock(image), ...blocks] };
  }
  return msgs;
}

/**
 * Ovozli xabarga ikkinchi tanish tizimi (ElevenLabs Scribe) eshitgan variantni qo'shadi —
 * model ikkalasini solishtirib, foydalanuvchi aslida nima deganini topadi.
 */
export function withHeardAlternative(text, alternative) {
  const main = str(text).trim();
  const alt = clip(str(alternative).replace(/\s+/g, " ").trim(), LIMITS.messageChars);
  const same = (a, b) => a.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "") === b.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  if (!main || !alt || same(main, alt)) return main;
  return `${main}\n\n(Ovozdan tanilgan matn. Ikkinchi tanish tizimi shunday eshitdi: "${alt}")`;
}

function extractText(message) {
  return message.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

/** Oxirgi qidiruv natijasidan keyingi matn ("tekshirib ko'raman" kabi oraliq gaplar kirmaydi). */
function finalText(message) {
  const lastResult = message.content.findLastIndex((b) => b.type.endsWith("_tool_result"));
  return extractText({ content: message.content.slice(lastResult + 1) });
}

const REFUSAL_TEXT = "Kechirasiz, bu savolga javob bera olmayman. Boshqa narsada yordam beraymi?";

export function createJigar({ client = new Anthropic(), config = getConfig(), gemini = null, openai = null } = {}) {
  // Muqobil miyalar (.env ECO_LLM). Claude — asosiy va zaxira: muqobili xato bersa, javobni Claude beradi.
  const alternatives = { gemini, openai };

  /** Muqobil miya bilan javob (Gemini yoki OpenAI). Xato bo'lsa — null: chaqiruvchi Claude'ga o'tadi. */
  async function callAlternative(name, messages, system) {
    try {
      const { text, model } = await alternatives[name].generate({ system, messages, maxTokens: config.maxTokens });
      return { text, stopReason: "end_turn", refused: false, truncated: false, model, usage: null };
    } catch (err) {
      console.warn(`[jigar] ${name} ishlamadi — Claude'ga o'tildi: ${err.message}`);
      return null;
    }
  }

  /** Claude so'rovi. onDelta berilsa — oqim: matn bo'laklari kelishi bilan uzatiladi. */
  async function requestClaude(params, useFallbacks, onDelta) {
    const fallbackParams = useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : null;
    if (!onDelta) {
      return fallbackParams ? client.beta.messages.create({ ...params, ...fallbackParams }) : client.messages.create(params);
    }
    const stream = fallbackParams ? client.beta.messages.stream({ ...params, ...fallbackParams }) : client.messages.stream(params);
    stream.on("text", (delta) => onDelta(delta));
    return stream.finalMessage();
  }

  /** Asbob chaqiruvlarini bajaradi: tool_result'lar bitta user xabarida (Claude talabi). */
  async function runTools(message, toolbox) {
    const results = [];
    for (const use of message.content.filter((b) => b.type === "tool_use")) {
      const { content, isError } = await toolbox.run(use.name, use.input);
      results.push({ type: "tool_result", tool_use_id: use.id, content, ...(isError ? { is_error: true } : {}) });
    }
    return results;
  }

  /**
   * @param {{ definitions: object[], run: (name: string, input: object) => Promise<{content: object[], isError: boolean}> } | null} toolbox
   *   kompyuter asboblari (ulangan bo'lsa); muqobil miyalarda (Gemini, OpenAI) asbob yo'q — javobni Claude beradi.
   */
  async function call(messages, lang, style, llm = "claude", onDelta = null, toolbox = null) {
    const system = systemPromptFor(lang, style);
    if (alternatives[llm]?.configured && !hasDocument(messages) && !toolbox) {
      const viaAlternative = await callAlternative(llm, messages, system);
      if (viaAlternative) {
        onDelta?.(viaAlternative.text); // muqobil miya oqimsiz — javob bir bo'lakda
        return viaAlternative;
      }
    }
    const haiku = llm === "haiku";
    const params = {
      model: haiku ? config.haikuModel : config.model,
      max_tokens: config.maxTokens,
      system,
      cache_control: { type: "ephemeral" }, // tizim prompti + sahifa keshlanadi
      output_config: { effort: style.effort || config.effort }, // egasi sozlamalarda tanlaydi
      ...(haiku ? { thinking: { type: "disabled" } } : {}),
      tools: [webSearchTool(haiku), ...(toolbox?.definitions ?? [])], // internet qidiruvi + kompyuter (ulangan bo'lsa)
      messages,
    };
    const useFallbacks = config.fallbacks && !haiku;
    let message = await requestClaude(params, useFallbacks, onDelta);
    let text = extractText(message);
    let conversation = params.messages;
    let pauses = 0;
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const paused = message.stop_reason === "pause_turn" && pauses < MAX_PAUSE_CONTINUES;
      const wantsTools = message.stop_reason === "tool_use" && toolbox;
      if (!paused && !wantsTools) break;
      if (paused) pauses++;
      const toolResults = wantsTools ? await runTools(message, toolbox) : null;
      conversation = [
        ...conversation,
        { role: "assistant", content: message.content },
        ...(toolResults ? [{ role: "user", content: toolResults }] : []),
      ];
      // Asbobdan oldingi va keyingi matn orasida bo'sh qator — oqim va yakuniy matn bir xil bo'lsin.
      const gap = wantsTools && text ? "\n\n" : "";
      if (gap) onDelta?.(gap);
      message = await requestClaude({ ...params, messages: conversation }, useFallbacks, onDelta);
      const more = extractText(message);
      text = more ? `${text}${gap}${more}` : text;
    }
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
    async chat({
      page, history, selection, heardAlt, lang, length, persona, userName, studentName, llm, image,
      voice = false, onDelta = null, memories = null, nowNote = null, effort = null, toolbox = null,
    }) {
      const normLang = normalizeLang(lang);
      const style = {
        length: normalizeLength(length),
        persona: normalizePersona(persona),
        name: userName ?? studentName, // promptga tozalanib yoziladi (cleanName)
        memories,
        effort: ["low", "medium", "high"].includes(effort) ? effort : null,
      };
      const normPage = normalizePage(page);
      const camera = normalizeCameraImage(image);
      const lastIndex = Array.isArray(history) ? history.length - 1 : -1;
      const lastContent = (m) => {
        const heardText = withHeardAlternative(m.content, heardAlt);
        const withVoice = voice === true && m.content ? `${heardText}\n\n${VOICE_NOTE}` : heardText;
        // Hozirgi vaqt (eslatma va "bugun/ertaga" uchun) — faqat oxirgi xabarga, kesh buzilmaydi.
        const timed = nowNote ? `${withVoice}\n\n(${clip(str(nowNote), NOW_NOTE_MAX)})` : withVoice;
        return camera ? withCameraNote(timed) : timed;
      };
      const normHistory = normalizeHistory(history).map((m, i) => (i === lastIndex ? { ...m, content: lastContent(m) } : m));
      const userContent = normHistory[normHistory.length - 1].content;
      const messages = buildMessages({ page: normPage, history: normHistory, selection, image: camera });
      const result = await call(messages, normLang, style, llm, typeof onDelta === "function" ? onDelta : null, toolbox);
      // userContent: mijoz tarixga aynan shuni yozadi — keyingi so'rovlarda prefiks o'zgarmaydi (kesh ishlaydi).
      return { ...result, userContent, pageTruncated: Boolean(normPage?.truncated), parsed: parseAkaResponse(result.text) };
    },

    /**
     * Proaktiv fikr (foydalanuvchi so'ramagan): ekranga o'zi qarash, kunlik xulosa. Bitta so'rov, oqimsiz.
     * @param {{ system: string, content: string | object[], haiku?: boolean, search?: boolean }} request
     * @returns {Promise<string>} modelning matni
     */
    async think({ system, content, haiku = true, search = false }) {
      const params = {
        model: haiku ? config.haikuModel : config.model,
        max_tokens: THINK_MAX_TOKENS,
        system,
        ...(haiku ? { thinking: { type: "disabled" } } : { output_config: { effort: "low" } }),
        ...(search ? { tools: [webSearchTool(haiku)] } : {}),
        messages: [{ role: "user", content }],
      };
      let message = await client.messages.create(params);
      for (let i = 0; message.stop_reason === "pause_turn" && i < MAX_PAUSE_CONTINUES; i++) {
        message = await client.messages.create({ ...params, messages: [...params.messages, { role: "assistant", content: message.content }] });
      }
      return message.stop_reason === "refusal" ? "" : finalText(message);
    },
  };
}
