// "Jigar" bilan gaplashish mantig'i: so'rovni tuzish, Claude'ga yuborish, javobni ajratish.
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseAkaResponse } from "./parse.js";

import { ValidationError } from "./errors.js";
import { normalizePronunciation, withPronunciation } from "./pronunciation.js";

export { ValidationError };

const here = path.dirname(fileURLToPath(import.meta.url));
const readPrompt = (name) => readFileSync(path.join(here, "..", "..", "prompts", name), "utf8").trim();
export const SYSTEM_PROMPT = readPrompt("system-prompt.md");
// "Beparvo" rejim: o'quvchi o'zi yoqadi — Jigar qo'pol, baqiradigan, so'kinadigan bo'lib qoladi.
const BEPARVO_PROMPT = readPrompt("beparvo-mode.md");
// Rus tili tanlansa — oxiriga qo'shiladi va til qoidalarini almashtiradi.
const RUSSIAN_PROMPT = readPrompt("lang-ru.md");
const LANGUAGE_MODE_PROMPT = readPrompt("mode-language.md");
const INTERVIEW_MODE_PROMPT = readPrompt("mode-interview.md"); // Suhbatga tayyorgarlik (paket)
// Support (jamoa): mavzu doirasi yo'q — har qanday savolga to'liq yordam. Faqat serverda, rolga qarab yoqiladi.
const SUPPORT_MODE_PROMPT = readPrompt("mode-support.md");
const LANGUAGE_NAMES = { uz: "o'zbek tili", ru: "rus tili" };

/** Til o'rganish yo'nalishi: ona tili (interfeys) va o'rganiladigan til — o'zbek <-> rus. */
export const targetLanguageOf = (lang) => (lang === "ru" ? "uz" : "ru");
function languageModePrompt(lang) {
  return LANGUAGE_MODE_PROMPT.replaceAll("{NATIVE}", LANGUAGE_NAMES[lang] ?? LANGUAGE_NAMES.uz)
    .replaceAll("{TARGET}", LANGUAGE_NAMES[targetLanguageOf(lang)]);
}
// Javob uslubi: qisqa (2-3 gap) va sodda (oddiy so'zlar). O'quvchi yuqoridagi sozlamalarda tanlaydi.
const SHORT_PROMPT = readPrompt("style-short.md");
const DETAILED_PROMPT = readPrompt("style-detailed.md");
const SIMPLE_PROMPT = readPrompt("style-simple.md");

// Xarakter: o'quvchi ro'yxatdan o'tishda tanlaydi. Har birining o'z prompti bor (ohang bo'yicha asosiydan ustun).
// Xarakter tanlanmagan bo'lsa — asosiy promptning o'zi.
export const PERSONAS = ["neytral", "mehribon", "kinoyali", "jahldor", "romantik", "moslashuvchan"];
const PERSONA_PROMPTS = Object.fromEntries(PERSONAS.map((p) => [p, readPrompt(`persona-${p}.md`)]));
// Romantik + talaba (katta) — noz-karashmali iliq uslub ("jonim", "go'zalim"). Maktab o'quvchilariga — flirtsiz.
const ROMANTIC_ADULT_PROMPT = readPrompt("persona-romantik-adult.md");
const NAME_MAX = 40;

/** O'quvchi ismi promptga: faqat harf, bo'shliq, apostrof va chiziqcha (yangi qator — in'yeksiya emas). */
function cleanName(name) {
  return clip(str(name).replace(/[^\p{L}\p{M} 'ʻʼ‘’-]/gu, " ").replace(/\s+/g, " ").trim(), NAME_MAX);
}

/** Xarakterni tekshiradi. Berilmasa — null (asosiy ohang). */
export function normalizePersona(persona) {
  if (persona == null || persona === "") return null;
  if (!PERSONAS.includes(persona)) throw new ValidationError(`persona: ${PERSONAS.join(" | ")} bo'lishi kerak`);
  return persona;
}

// O'quvchi profili (ro'yxatdan o'tishdagi savollar): maqsad va sinf — misollar va murakkablikni belgilaydi.
const OFF_SCOPE = "Doiradan tashqari savol bo'lsa: 1-2 gapda qisqa javob ber va o'quvchini muloyimlik bilan o'z yo'nalishiga qaytar (\"Qiziq savol! Lekin keling, darsimizga qaytamiz...\"). Tashqi mavzuni uzoq tushuntirma.";
// Yo'nalish (tarif) — Jigar shu doirada ishlaydi. Har tarifning narxi va daqiqasi: server/usage/tariffs.js.
const GOAL_GUIDE = {
  study: `Maktab darslari. DOIRA: 5–11-sinf maktab dasturi fanlari — matematika, algebra, geometriya, fizika, kimyo, biologiya, tarix, geografiya, ona tili va adabiyot, informatika asoslari, chet tili grammatikasi. Darslik darajasida tushuntir. Uy vazifasida javobni tayyor yozib berma — o'zi yechishiga yo'l ko'rsat. ${OFF_SCOPE}`,
  exam: `Imtihonga tayyorgarlik. DOIRA: DTM (abituriyent testlari), attestatsiya, maktab nazorat va choraklik ishlari. Mavzu testda qanday so'ralishini, tipik xatolar va tuzoqlarni, tez yechish usullarini va eslab qolish usullarini ko'rsat; imkon bo'lsa test shaklidagi misol ber. ${OFF_SCOPE}`,
  olympiad: `Olimpiada. DOIRA: fan olimpiadalari (maktab, tuman, viloyat, respublika) darajasidagi masalalar — chuqur tushuncha, isbot, nostandart yondashuv, "nega" savoli. Yechimni qadamma-qadam ber, avval o'zi o'ylab ko'rishiga imkon qoldir. ${OFF_SCOPE}`,
  university: `Universitet yoki kurs. DOIRA: oliy ta'lim fanlari va kurslar — ma'ruza mavzulari, seminar, kurs ishi, referat. Akademik aniqlik: to'g'ri atamalar, ta'riflar, formulalar. Kurs ishi yoki referatni tayyor yozib berma — reja, manba turi va tushuntirish bilan yordam ber. ${OFF_SCOPE}`,
  // Eng arzon tarif — dars va imtihon tayyorgarligi uchun "aylanib o'tish" yo'li bo'lmasin.
  curious: "Qiziqish, umumiy bilim. DOIRA: umumiy dunyoqarash — ilm-fan qiziqarli faktlari, tarix, texnika, tabiat, dunyo voqealari. Qiziqarli faktlar va hayotiy bog'lanishlarga urg'u ber, imtihon ohangisiz. "
    + "Bu tarifga KIRMAYDI: maktab darsi va uy vazifasi, darslik mashqlari, DTM/test tayyorgarligi, olimpiada masalalari, kurs ishi va referat. "
    + "Bunday so'rov bo'lsa: 1-2 gapda umumiy tushuncha ber, misol yoki masalani yechib berma va muloyim ayt: \"Buni chuqur o'rganish uchun Maktab darslari yoki Imtihon tarifi kerak — u yerda qadamma-qadam o'rgatamiz.\"",
  // Til o'rganish (gapirish mashqi): o'zbek o'quvchi — rus tili, rus o'quvchi — o'zbek tili. Batafsil: prompts/mode-language.md.
  language: "Til o'rganish, gapirish mashqi. DOIRA va qoidalar — pastdagi \"TIL O'RGANISH\" bo'limida.",
  // Suhbatga tayyorgarlik (paket): ish, OTM yoki grant suhbati, ommaviy chiqish. Batafsil: prompts/mode-interview.md.
  interview: "Suhbatga tayyorgarlik. DOIRA va qoidalar — pastdagi \"SUHBATGA TAYYORGARLIK\" bo'limida.",
  // Eski (olib tashlangan) yo'nalish — mavjud profillar buzilmasin; tarif: qiziqish.
  it: "Qiziqish, umumiy bilim. DOIRA: har qanday ta'limiy mavzu. Misollarni texnologiyadan olsang bo'ladi.",
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

/** Konstruktor yo'nalishlari: ma'lumlari (takrorsiz); bo'sh yoki noto'g'ri — null. */
export function normalizeGoals(goals) {
  if (!Array.isArray(goals)) return null;
  const list = GOALS.filter((g) => goals.includes(g));
  return list.length ? list : null;
}
export const normalizeLevel = oneOf("level", LEVELS);

// "Beparvo" (so'kinadigan) rejim faqat kattalar uchun: sinf maktab o'quvchisi bo'lsa — oddiyga tushiriladi.
// Sinf berilmagan eski mijozlar (kengaytma) uchun avvalgidek ishlaydi.
const ADULT_LEVELS = new Set(["student"]);
const effectiveMode = (mode, level, adult = false) =>
  (mode === "beparvo" && !adult && level && !ADULT_LEVELS.has(level) ? "oddiy" : mode);
// Support (jamoa) — sinfsiz, erkin: sinf qatori va "sodda" rejim yo'q, kattalar ohangi (beparvo, romantik).
const levelFor = (level, unrestricted) => (unrestricted ? null : normalizeLevel(level));

// Konstruktor (bir nechta yo'nalish): har birining qisqa doirasi — "faqat shu tarif" cheklovlarisiz.
const GOAL_SCOPE = {
  study: "Maktab darslari — 5–11-sinf fanlari; uy vazifasida tayyor javob emas, yo'l ko'rsat.",
  exam: "Imtihonga tayyorgarlik — DTM, attestatsiya, nazorat ishlari; test tuzoqlari va tez yechish usullari.",
  olympiad: "Olimpiada — chuqur tushuncha, isbot, nostandart masalalar.",
  university: "Universitet yoki kurs — oliy ta'lim fanlari, ma'ruza, seminar, kurs ishi.",
  language: "Til o'rganish — gapirish mashqi (pastdagi \"TIL O'RGANISH\" bo'limi).",
  curious: "Qiziqish — ilm-fan, tarix, texnika, tabiat haqida qiziqarli faktlar.",
  interview: "Suhbatga tayyorgarlik — ish, OTM yoki grant suhbati mashqi (pastdagi \"SUHBATGA TAYYORGARLIK\" bo'limi).",
};
const MULTI_OFF_SCOPE = "Bu yo'nalishlardan tashqaridagi savolga 1-2 gapda qisqa javob ber va o'quvchini muloyimlik bilan o'z yo'nalishlariga qaytar.";

/** Yo'nalish(lar) qatori: bitta — to'liq doira qoidasi; bir nechta (konstruktor) — hammasi doirada. */
function goalLines(goals) {
  if (goals.length === 1) return [`- Maqsad: ${GOAL_GUIDE[goals[0]]}`];
  return [
    "- Maqsad: o'quvchi bir nechta yo'nalishni tanlagan (konstruktor tarifi). DOIRA — shularning hammasi:",
    ...goals.map((g) => `  - ${GOAL_SCOPE[g]}`),
    `  ${MULTI_OFF_SCOPE}`,
    ...(goals.includes("language")
      ? ["  Til mashqi rejimi faqat o'quvchi til mashq qilmoqchi bo'lganda (o'rganilayotgan tilda gapirsa yoki mashq so'rasa); fan savoliga — odatdagidek tushuntir."]
      : []),
  ];
}

/** Maqsad(lar), sinf va ismdan tizim promptiga qo'shimcha. Hech biri yo'q bo'lsa — null. */
function profilePromptFor(goals, level, name) {
  const cleanedName = cleanName(name);
  if (!goals.length && !level && !cleanedName) return null;
  const lines = ["# O'QUVCHI PROFILI (ro'yxatdan o'tishda o'zi tanladi)", "Tushuntirish, misollar va so'zlarni shu o'quvchiga moslab tanla:"];
  if (cleanedName) lines.push(`- Ismi: ${cleanedName} — vaqti-vaqti bilan ismi bilan murojaat qil (har gapda emas).`);
  if (goals.length) lines.push(...goalLines(goals));
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
  mode, lang = "uz",
  {
    length = "odatiy", simple = false, persona = null, goal = null, goals = null, level = null, name = null, unrestricted = false,
    memories = null,
  } = {},
) {
  // goals — konstruktor rejasi (bir nechta yo'nalish); bo'lmasa — bitta goal. Support — doirasiz.
  const allGoals = unrestricted ? [] : goals?.length ? goals : goal ? [goal] : [];
  const adult = unrestricted || ADULT_LEVELS.has(level); // support — doim katta yoshli
  const parts = [SYSTEM_PROMPT];
  if (mode === "beparvo") parts.push(BEPARVO_PROMPT);
  else if (persona === "romantik" && adult) parts.push(ROMANTIC_ADULT_PROMPT);
  else if (PERSONA_PROMPTS[persona]) parts.push(PERSONA_PROMPTS[persona]); // beparvo o'zi kuchli xarakter — ustma-ust qo'yilmaydi
  if (length === "qisqa") parts.push(SHORT_PROMPT);
  if (length === "batafsil") parts.push(DETAILED_PROMPT);
  if (simple && !unrestricted) parts.push(SIMPLE_PROMPT);
  const profile = profilePromptFor(allGoals, unrestricted ? null : level, name);
  if (profile) parts.push(profile);
  if (lang === "ru") parts.push(RUSSIAN_PROMPT);
  if (allGoals.includes("language")) parts.push(languageModePrompt(lang)); // ikki tilda gapirish — til qoidasidan keyin, ustun
  if (allGoals.includes("interview")) parts.push(INTERVIEW_MODE_PROMPT); // suhbat mashqi — uzunlik va quiz qoidalaridan ustun
  if (unrestricted) parts.push(SUPPORT_MODE_PROMPT); // oxirida — doira va "darsga qaytar" qoidalaridan ustun
  const memory = unrestricted ? memoryPromptFor(memories) : null;
  if (memory) parts.push(memory); // kamdan-kam o'zgaradi — kesh deyarli buzilmaydi
  return parts.join("\n\n");
}

/** Support xotirasi (Jigar eslab qolgan faktlar) — tizim promptiga. Bo'sh — null. */
function memoryPromptFor(memories) {
  const facts = (Array.isArray(memories) ? memories : []).map((m) => clip(str(m).replace(/\s+/g, " ").trim(), 200)).filter(Boolean);
  if (!facts.length) return null;
  return ["# XOTIRA (foydalanuvchi haqida avval eslab qolganlaring — kerak bo'lsa ishlat, takror so'rama)", ...facts.map((f) => `- ${f}`)].join("\n");
}

// Internet qidiruvi (faqat support, Claude): ob-havo, yangilik, kurs, narx. Haiku — oddiy variant.
const WEB_SEARCH_MAX_USES = 3;
const webSearchTool = (haiku) => ({
  type: haiku ? "web_search_20250305" : "web_search_20260209",
  name: "web_search",
  max_uses: WEB_SEARCH_MAX_USES,
  user_location: { type: "approximate", city: "Tashkent", timezone: "Asia/Tashkent" }, // "UZ" mamlakat kodi qo'llanmaydi (400)
});
const MAX_PAUSE_CONTINUES = 3; // qidiruv uzoq cho'zilsa server "pause_turn" qaytaradi — shuncha marta davom ettiramiz

export const LIMITS = {
  pageChars: 60_000, // sahifa matni (undan uzuni kesiladi va modelga aytiladi)
  messageChars: 4_000, // o'quvchining bitta (yangi) xabari
  // Tarixdagi eski xabar: server unga izoh qo'shgan bo'lishi mumkin (ikkinchi eshitilgan variant, talaffuz tahlili,
  // kamera izohi) — mijoz aynan o'shani qaytaradi. Chegara kengroq bo'lmasa, uzun xabardan keyingi so'rov rad etilardi.
  storedMessageChars: 10_000,
  assistantChars: 12_000, // tarixdagi Jigar javobi
  selectionChars: 4_000,
  historyTurns: 40, // jami xabarlar soni (user + assistant)
  summaryItems: 60,
  imageBase64Chars: 1_500_000, // sahifa skrinshoti (~1.1 MB) — kengaytma 1568 px JPEG yuboradi (~200-400 KB)
  pdfBase64Chars: 11_000_000, // yuklangan darslik PDF (~8 MB fayl)
};

// Sahifa skrinshoti (kengaytma) yoki kamera kadri: Figma, rasm, daftar, buyum — Claude ko'radi.
const IMAGE_DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

function normalizeImage(image, field = "page.image") {
  if (image == null || image === "") return null;
  const match = typeof image === "string" ? IMAGE_DATA_URL_RE.exec(image) : null;
  if (!match) throw new ValidationError(`${field}: data:image/(jpeg|png|webp);base64,... bo'lishi kerak`);
  if (match[2].length > LIMITS.imageBase64Chars) throw new ValidationError(`${field} juda katta`);
  return { mediaType: match[1], data: match[2] };
}

// Yuklangan darslik (PDF): Claude uni sahifalari, rasm va jadvallari bilan o'qiydi.
const PDF_DATA_URL_RE = /^data:application\/pdf;base64,([A-Za-z0-9+/]+={0,2})$/;

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

/** Kamera kadri (Jigarning "ko'zi"): o'quvchi oldi yoki orqa kameradan ko'rsatgan narsa — faqat shu xabarga. */
export const normalizeCameraImage = (image) => normalizeImage(image, "image");

// Ovozli xabar: brauzer eshitgan matnda xato bo'ladi — Jigar tushungan savolni [SAVOL] da to'g'ri yozib qaytaradi,
// chatda xom matn o'rniga o'sha ko'rinadi.
export const VOICE_NOTE = "(Ovozli xabar: javob boshida [SAVOL] bo'limini yoz.)";

// Tarixda qoladi: keyingi javoblarda Jigar rasm ko'rsatilganini biladi (rasmning o'zi qayta yuborilmaydi).
export const CAMERA_NOTE = "(O'quvchi kamerada narsa ko'rsatdi — rasm shu xabarga ilova qilingan.)";
const withCameraNote = (text) => `${CAMERA_NOTE}\n${text}`;
const imageBlock = (image) => ({ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } });


export function getConfig(env = process.env) {
  return {
    model: env.AKA_MODEL || "claude-opus-5-5",
    // Arzon Claude (support panelida "Claude Haiku" tanlansa). Server zaxirasini qo'llamaydi — u o'chiq yuboriladi.
    haikuModel: env.AKA_HAIKU_MODEL || "claude-haiku-5-5",
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
  const image = normalizeImage(page.image);
  const pdf = normalizePdf(page.pdf);
  if (!text && !title && !image && !pdf) return null;
  return {
    title,
    url,
    text: clip(text, LIMITS.pageChars),
    truncated: text.length > LIMITS.pageChars,
    ...(image ? { image } : {}),
    ...(pdf ? { pdf } : {}),
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
    const isNewMessage = i === history.length - 1;
    const userMax = isNewMessage ? LIMITS.messageChars : LIMITS.storedMessageChars;
    const max = expected === "user" ? userMax : LIMITS.assistantChars;
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
  if (page.pdf) {
    lines.push("(Yuqorida — o'quvchi yuklagan darslik yoki hujjat (PDF). Savolga shu hujjatga tayanib javob ber; kerak bo'lsa "
      + "qaysi sahifa yoki bo'limdan olganingni ayt. Hujjatda yo'q narsani undan deb to'qima.)");
  }
  if (page.image) {
    lines.push("(Yuqorida — o'quvchi ekranida ko'rinib turgan sahifaning skrinshoti. Rasm, dizayn (Figma), diagramma, formula yoki "
      + "jadval bo'lsa — skrinshotga qarab tushuntir. Matn bilan farq qilsa, skrinshot ustun.)");
  }
  lines.push("Matn:", page.text || "(matn yo'q)", "</sahifa>");
  return lines.join("\n");
}

/**
 * Claude uchun messages massivini quradi.
 * Sahifa har doim birinchi user xabariga qo'shiladi — shu tufayli prefiks o'zgarmaydi va kesh ishlaydi.
 * Tanlangan qism (selection) faqat oxirgi xabarga qo'shiladi.
 */
export function buildMessages({ page, history, selection, image = null }) {
  const msgs = history.map((m) => ({ role: m.role, content: m.content }));
  const sel = clip(str(selection).trim(), LIMITS.selectionChars);
  const last = msgs[msgs.length - 1];
  const question = last.content || "Shu sahifani tushuntirib ber.";
  last.content = sel ? `O'quvchi sahifadan shu qismni tanladi:\n"""\n${sel}\n"""\n\n${question}` : question;
  const firstText = `${pageBlock(page)}\n\n${msgs[0].content || "Shu sahifani tushuntirib ber."}`;
  // Skrinshot bo'lsa — birinchi xabar: rasm + matn (Claude ko'radi). Har so'rovda bir xil — kesh buzilmaydi.
  const pageBlocks = [
    ...(page?.pdf ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: page.pdf.data } }] : []),
    ...(page?.image ? [imageBlock(page.image)] : []),
  ];
  msgs[0].content = pageBlocks.length ? [...pageBlocks, { type: "text", text: firstText }] : firstText;
  // Kamera kadri — faqat oxirgi xabarga (oldingi xabarlar o'zgarmaydi, kesh ishlaydi).
  if (image) {
    const lastMsg = msgs[msgs.length - 1];
    const blocks = Array.isArray(lastMsg.content) ? lastMsg.content : [{ type: "text", text: lastMsg.content }];
    msgs[msgs.length - 1] = { ...lastMsg, content: [imageBlock(image), ...blocks] };
  }
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

export function createJigar({ client = new Anthropic(), config = getConfig(), random = Math.random, gemini = null, openai = null } = {}) {
  // Muqobil miyalar (support tanlaydi). Claude — asosiy va zaxira: muqobili xato bersa, javobni Claude beradi.
  const alternatives = { gemini, openai };
  function lastUserContent(content, heardAlt, mode, pronunciation = null) {
    // Til o'rganishda ovozli javobga talaffuz tahlili qo'shiladi (Azure yoki Scribe — server/core/pronunciation.js).
    const heard = withPronunciation(withHeardAlternative(content, heardAlt), normalizePronunciation(pronunciation));
    return mode === "beparvo" ? withBeparvoOpener(heard || "Shu sahifani tushuntirib ber.", random) : heard;
  }

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

  /**
   * Claude so'rovi. onDelta berilsa — oqim (stream): matn bo'laklari kelishi bilan uzatiladi (Jigar tezroq gapira
   * boshlaydi). Yakuniy xabar ikkala holatda ham bir xil shaklda qaytadi.
   */
  async function requestClaude(params, useFallbacks, onDelta) {
    const fallbackParams = useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : null;
    if (!onDelta) {
      return fallbackParams
        ? client.beta.messages.create({ ...params, ...fallbackParams })
        : client.messages.create(params);
    }
    const stream = fallbackParams
      ? client.beta.messages.stream({ ...params, ...fallbackParams })
      : client.messages.stream(params);
    stream.on("text", (delta) => onDelta(delta));
    return stream.finalMessage();
  }

  async function call(messages, mode = "oddiy", lang = "uz", style = {}, llm = "claude", onDelta = null) {
    if (alternatives[llm]?.configured && !hasDocument(messages)) {
      const viaAlternative = await callAlternative(llm, messages, systemPromptFor(mode, lang, style));
      if (viaAlternative) {
        onDelta?.(viaAlternative.text); // muqobil miya oqimsiz — javob bir bo'lakda
        return viaAlternative;
      }
    }
    const haiku = llm === "haiku";
    const params = {
      model: haiku ? config.haikuModel : config.model,
      max_tokens: config.maxTokens,
      system: systemPromptFor(mode, lang, style),
      cache_control: { type: "ephemeral" }, // tizim prompti + sahifa keshlanadi
      output_config: { effort: config.effort },
      // Haiku: ichki o'ylash o'chiq — javob ~2 baravar tez va arzon (tushuntirish uchun o'ylash shart emas).
      ...(haiku ? { thinking: { type: "disabled" } } : {}),
      ...(style.unrestricted ? { tools: [webSearchTool(haiku)] } : {}), // support — internet qidiruvi
      messages,
    };
    let message = await requestClaude(params, config.fallbacks && !haiku, onDelta);
    let text = extractText(message);
    for (let i = 0; message.stop_reason === "pause_turn" && i < MAX_PAUSE_CONTINUES; i++) {
      const next = { ...params, messages: [...params.messages, { role: "assistant", content: message.content }] };
      message = await requestClaude(next, config.fallbacks && !haiku, onDelta);
      text = `${text}${extractText(message)}`;
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
      page, history, selection, mode, heardAlt, pronunciation, lang, length, simple, persona, goal, goals, level, studentName, llm,
      image, unrestricted = false, voice = false, onDelta = null, memories = null, nowNote = null,
    }) {
      const normLevel = levelFor(level, unrestricted === true);
      const normMode = effectiveMode(normalizeMode(mode), normLevel, unrestricted === true);
      const normLang = normalizeLang(lang);
      const style = {
        length: normalizeLength(length),
        simple: simple === true,
        persona: normalizePersona(persona),
        goal: normalizeGoal(goal),
        goals: normalizeGoals(goals),
        level: normLevel,
        name: studentName, // promptga tozalanib yoziladi (cleanName)
        unrestricted: unrestricted === true,
        memories: unrestricted === true ? memories : null,
      };
      const normPage = normalizePage(page);
      const camera = normalizeCameraImage(image);
      const lastIndex = Array.isArray(history) ? history.length - 1 : -1;
      const lastContent = (m) => {
        const content = lastUserContent(m.content, heardAlt, normMode, pronunciation);
        const heard = voice === true && m.content ? `${content}\n\n${VOICE_NOTE}` : content;
        // Support: hozirgi vaqt (eslatma va "bugun/ertaga" uchun) — faqat oxirgi xabarga, kesh buzilmaydi.
        const timed = unrestricted === true && nowNote ? `${heard}\n\n(${clip(str(nowNote), 120)})` : heard;
        return camera ? withCameraNote(timed) : timed;
      };
      const normHistory = normalizeHistory(history).map((m, i) => (i === lastIndex ? { ...m, content: lastContent(m) } : m));
      const userContent = normHistory[normHistory.length - 1].content;
      const messages = buildMessages({ page: normPage, history: normHistory, selection, image: camera });
      const result = await call(messages, normMode, normLang, style, llm, typeof onDelta === "function" ? onDelta : null);
      // userContent: mijoz tarixga aynan shuni yozadi — keyingi so'rovlarda prefiks o'zgarmaydi (kesh ishlaydi).
      return { ...result, userContent, pageTruncated: Boolean(normPage?.truncated), parsed: parseAkaResponse(result.text) };
    },
    async summary({ pageTitle, items, mode, lang, simple, persona, goal, goals, level, llm, unrestricted = false }) {
      const normLevel = levelFor(level, unrestricted === true);
      const normMode = effectiveMode(normalizeMode(mode), normLevel, unrestricted === true);
      const normLang = normalizeLang(lang);
      const content = buildSummaryMessage({ pageTitle, items });
      const style = {
        simple: simple === true, persona: normalizePersona(persona), goal: normalizeGoal(goal), goals: normalizeGoals(goals), level: normLevel,
        unrestricted: unrestricted === true,
      };
      return call([{ role: "user", content }], normMode, normLang, style, llm);
    },
  };
}
