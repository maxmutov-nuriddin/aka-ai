// Ovozli rejim uchun sof yordamchilar: javobni o'qiladigan matnga aylantirish,
// uni bo'laklarga bo'lish va ovoz bilan aytilgan quiz javobini topish.
// Brauzerda ham, Node testlarida ham ishlaydi (DOM yoki Web Speech API ishlatilmaydi).

const DEFAULT_CHUNK = 180;
const SHORT_ANSWER_WORDS = 4;
const MAX_ANSWER_WORDS = 10;

const LETTER_WORDS = new Map([
  ["a", "A"], ["b", "B"], ["c", "C"], ["d", "D"],
  ["а", "A"], ["б", "B"], ["с", "C"], ["ц", "C"], ["д", "D"],
  // ruscha talaffuzdagi lotin harflari
  ["эй", "A"], ["бэ", "B"], ["би", "B"], ["цэ", "C"], ["си", "C"], ["дэ", "D"], ["ди", "D"],
]);

const ORDINALS = [
  ["birinchi", "A"],
  ["ikkinchi", "B"],
  ["uchinchi", "C"],
  ["tortinchi", "D"],
  ["перв", "A"],
  ["втор", "B"],
  ["трет", "C"],
  ["четв", "D"],
];

const RU_ORDINALS = ["Первый", "Второй", "Третий", "Четвёртый", "Пятый", "Шестой"];

/** Markdown belgilarini olib tashlaydi (**qalin**, `kod`). */
function plain(text) {
  return String(text ?? "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*`#>]/g, "")
    .trim();
}

// ---------- O'zbekcha o'qiladigan matn ----------
// Ovoz modeli raqam, formula va KATTA HARFLI so'zlarni ba'zan inglizcha o'qiydi — oldindan so'zga aylantiramiz.

const ONES = ["nol", "bir", "ikki", "uch", "to'rt", "besh", "olti", "yetti", "sakkiz", "to'qqiz"];
const TENS = ["", "o'n", "yigirma", "o'ttiz", "qirq", "ellik", "oltmish", "yetmish", "sakson", "to'qson"];
const SCALES = [[1e9, "milliard"], [1e6, "million"], [1e3, "ming"]];
const MAX_SPOKEN_NUMBER = 1e12;
const LETTER_NAMES = {
  A: "a", B: "be", C: "se", D: "de", E: "e", F: "ef", G: "ge", H: "ash", I: "i", J: "je", K: "ka", L: "el", M: "em",
  N: "en", O: "o", P: "pe", Q: "qu", R: "er", S: "es", T: "te", U: "u", V: "ve", W: "dubl ve", X: "iks", Y: "igrek", Z: "zet",
};
// Baqiriq (KATTA HARF) ovozda harflab o'qilmasin. Faqat haqiqiy qisqartmalar katta qoladi.
const ACRONYMS = new Set(["DNK", "RNK", "AQSH", "BMT", "AES", "IIV", "MDH", "SSV", "YeI", "ATF", "IT", "SI"]);

function underThousand(n) {
  const hundreds = Math.floor(n / 100);
  const tens = Math.floor((n % 100) / 10);
  const ones = n % 10;
  return [
    hundreds ? (hundreds === 1 ? "yuz" : `${ONES[hundreds]} yuz`) : "",
    TENS[tens],
    ones ? ONES[ones] : "",
  ].filter(Boolean).join(" ");
}

/**
 * Butun sonni o'zbekcha so'z bilan yozadi: 2026 → "ikki ming yigirma olti".
 * @param {number} n 0 ≤ n < 10^12
 * @returns {string}
 */
export function numberToUzbek(n) {
  if (!Number.isInteger(n) || n < 0 || n >= MAX_SPOKEN_NUMBER) return String(n);
  if (n === 0) return ONES[0];
  const parts = [];
  let rest = n;
  for (const [size, word] of SCALES) {
    if (rest < size) continue;
    const count = Math.floor(rest / size);
    parts.push(count === 1 && word === "ming" ? word : `${underThousand(count)} ${word}`);
    rest %= size;
  }
  if (rest) parts.push(underThousand(rest));
  return parts.join(" ");
}

/** 5 → "beshinchi", 2026 → "ikki ming yigirma oltinchi". */
export function ordinalToUzbek(n) {
  const word = numberToUzbek(n);
  return /[aeiou]$/.test(word) ? `${word}nchi` : `${word}inchi`;
}

const UNITS = { kg: "kilogramm", g: "gramm", km: "kilometr", m: "metr", sm: "santimetr", mm: "millimetr", l: "litr", s: "soniya" };

const spellFormula = (formula) =>
  formula.match(/[A-Z][a-z]?|\d+/g)
    .map((part) => (/\d/.test(part) ? numberToUzbek(Number(part)) : LETTER_NAMES[part[0]] ?? part))
    .join(" ");

const FORMULA = "(?:[A-Z][a-z]?\\d*){1,6}";

const capitalize = (w) => w.charAt(0).toUpperCase() + w.slice(1);
const stripVariantLetter = (v) => String(v).replace(/^\s*[A-Za-zА-Яа-я]\s*[).:-]\s*/, "");

// Model ba'zan qo'shib yuboradigan inglizcha so'zlar — ovozda begona eshitiladi.
const ENGLISH_WORDS = new Map([
  ["okay", "xo'p"], ["ok", "xo'p"], ["cool", "zo'r"], ["nice", "zo'r"], ["super", "zo'r"], ["wow", "voy"],
  ["yes", "ha"], ["no", "yo'q"], ["bro", "jigar"], ["level", "daraja"], ["skill", "mahorat"], ["random", "tasodifiy"],
  ["basically", "aslida"], ["actually", "aslida"], ["sorry", "kechirasan"], ["please", "iltimos"], ["thanks", "rahmat"],
]);
const ENGLISH_RE = new RegExp(`\\b(${[...ENGLISH_WORDS.keys()].join("|")})\\b`, "gi");

/**
 * Matnni o'zbekcha ovoz uchun tayyorlaydi: raqam → so'z, formula → harflab, emoji yo'q,
 * baqiriq (KATTA HARF) → oddiy yozuv. [laughs] kabi teglar o'zgarmaydi.
 * @param {string} text
 * @returns {string}
 */
export function toSpokenUzbek(text) {
  return String(text ?? "")
    .replace(/\p{Extended_Pictographic}\uFE0F?/gu, "")
    .replace(ENGLISH_RE, (w) => ENGLISH_WORDS.get(w.toLowerCase()))
    // "karbonat angidrid (CO2)" — so'z bilan aytilgan, formulani o'qimaymiz
    .replace(new RegExp(`\\s*\\((?=[^)]*\\d)${FORMULA}\\)`, "g"), "")
    .replace(new RegExp(`\\b(?=[A-Za-z]*\\d)${FORMULA}\\b`, "g"), (m) => (/[A-Z]/.test(m) ? spellFormula(m) : m))
    .replace(/(\d)\s*(kg|km|sm|mm|g|m|l|s)\b/g, (_, d, unit) => `${d} ${UNITS[unit]}`)
    .replace(/(\d)\s*\+\s*(?=\d)/g, "$1 qo'shuv ")
    .replace(/(\d)\s*=\s*(?=\d)/g, "$1 teng ")
    .replace(/\s+\+\s+/g, " va ")
    .replace(/\s+=\s+/g, ", natijada ")
    .replace(/\s*(?:→|->|=>)\s*/g, ", keyin ")
    .replace(/(\d+)[.,](\d+)/g, (_, a, b) => `${numberToUzbek(Number(a))} butun ${numberToUzbek(Number(b))}`)
    .replace(/(\d+)-(?=\p{L})/gu, (_, d) => `${ordinalToUzbek(Number(d))} `)
    .replace(/(\d+)\s*%/g, (_, d) => `${numberToUzbek(Number(d))} foiz`)
    .replace(/\d+/g, (d) => numberToUzbek(Number(d)))
    .replace(/(?<![\p{L}'ʻʼ])[A-Z][A-Z'ʻʼ]{1,}(?![\p{L}'ʻʼ])/gu, (w) => (ACRONYMS.has(w) ? w : w[0] + w.slice(1).toLowerCase()))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

// ---------- His-tuyg'u ----------
const EMOTION_BY_TAG = {
  laughs: "happy",
  chuckles: "happy",
  excited: "excited",
  curious: "curious",
  whispers: "whisper",
  sighs: "sad",
  angry: "angry",
  shouts: "furious",
  frustrated: "angry",
  sarcastic: "smirk",
};

/**
 * Bo'lakdagi birinchi tanish ovoz tegidan personaj kayfiyatini topadi.
 * @param {string} text
 * @returns {string | null} happy | excited | curious | whisper | sad | angry | smirk
 */
export function detectEmotion(text) {
  for (const [, tag] of String(text ?? "").matchAll(/\[([a-z]+)[a-z ,'-]*\]/g)) {
    if (EMOTION_BY_TAG[tag]) return EMOTION_BY_TAG[tag];
  }
  return null;
}

// Teg bo'lmasa, kayfiyat gapning o'zidan taxmin qilinadi (robot qotib qolmasin). O'zbekcha va ruscha.
const words = (list) => new RegExp(`(?<![\\p{L}'])(${list})`, "iu");
const EMOTION_WORDS = [
  ["angry", words("jin ursin|la'nat|padarqusur|go'rso'xta|o'lgur|yer yutgur|ablah|badbaxt|itvachcha|eshak|ahmoq|tentak|kallavaram|miyasiz|xumpar|dangasa|bekorchi|чёрт|черт|чтоб тебя|балбес|дубин|болван|олух|бестолоч|тупиц|лентяй|бездельник|голова садовая")],
  ["happy", words("ha-ha|xa-xa|kulgili|zo'r|ofarin|barakalla|ajoyib|a'lo|qoyil|mana shunaqa|ana shunaqa|to'g'ri topding|yasha|ха-ха|класс|супер|отлично|молодец|красавчик|здорово|круто|вот так")],
  ["sad", words("afsus|attang|achinarli|xafa|qiyin|og'ir|жаль|увы|грустно|сложно|тяжело")],
  ["smirk", words("albatta|akademik|professor|daho|tabriklayman|конечно|академик|профессор|гений|поздравляю")],
  ["whisper", words("sir|pichirlab|sekin aytaman|секрет|по секрету|шёпотом")],
];
// Baqiriq: kamida 3 harfli KATTA HARFLI so'z (beparvo rejimda g'azab).
const SHOUT_RE = /(?<!\p{L})\p{Lu}[\p{Lu}']{2,}(?!\p{Ll})/u;

/**
 * Gapdan kayfiyat taxmin qiladi: avval so'zlar, keyin baqiriq va tinish belgisi.
 * Beparvo rejimda undov va baqiriq — g'azab, savol — kesatiq.
 * @param {string} sentence
 * @param {{ mode?: string }} [options]
 * @returns {string | null}
 */
export function inferEmotion(sentence, { mode = "oddiy" } = {}) {
  const text = String(sentence ?? "").replace(/[ʻʼ‘’`´]/g, "'");
  const wild = mode === "beparvo";
  for (const [emotion, re] of EMOTION_WORDS) {
    if (!re.test(text)) continue;
    return wild && emotion === "angry" && SHOUT_RE.test(text) ? "furious" : emotion;
  }
  const trimmed = text.trim();
  const exclaims = /!["»”)]*$/.test(trimmed);
  if (wild && (exclaims || SHOUT_RE.test(text))) return "furious";
  if (/\?["»”)]*$/.test(trimmed)) return wild ? "smirk" : "curious";
  if (exclaims) return "excited";
  return null;
}

/**
 * Bo'lakni gaplarga bo'lib, har gap qaysi belgidan boshlanishi va kayfiyatini topadi.
 * Kayfiyat: teg > gapdan taxmin > shu bo'lakdagi oldingi teg.
 * @param {string} rawChunk teglar bilan
 * @returns {{ text: string, marks: { at: number, emotion: string | null }[] }}
 */
export function planEmotions(rawChunk, { mode = "oddiy" } = {}) {
  const sentences = String(rawChunk ?? "").split(/(?<=[.!?…])\s+/).filter((x) => x.trim());
  const marks = [];
  let text = "";
  let carried = null;
  for (const raw of sentences) {
    const tagged = detectEmotion(raw);
    if (tagged) carried = tagged;
    const plainSentence = raw.replace(/\s*\[[a-z]+(?:[ ,'-]+[a-z]+){0,4}\]\s*/g, " ").replace(/\s{2,}/g, " ").trim();
    if (!plainSentence) continue;
    const at = text ? text.length + 1 : 0;
    text = text ? `${text} ${plainSentence}` : plainSentence;
    marks.push({ at, emotion: tagged || inferEmotion(plainSentence, { mode }) || carried });
  }
  return { text, marks };
}

/** Aytilgan belgiga qarab hozirgi gapning kayfiyati. */
export function emotionAt(marks, spoken) {
  let current = null;
  for (const mark of marks) if (spoken >= mark.at) current = mark.emotion;
  return current;
}

/**
 * Jigar javobini ovoz bilan o'qish uchun matnga aylantiradi. Chizma o'qilmaydi.
 * @param {{tushuntirish?: string, esdaQolsin?: string, quiz?: {savol: string, variantlar: string[]} | null} | null} parsed
 * @returns {string}
 */
export function toSpeechText(parsed, lang = "uz") {
  if (!parsed) return "";
  const ru = lang === "ru";
  const parts = [];
  if (parsed.tushuntirish) parts.push(plain(parsed.tushuntirish));
  if (parsed.esdaQolsin) parts.push(`${ru ? "Запомни" : "Esda qolsin"}: ${plain(parsed.esdaQolsin)}`);
  if (parsed.quiz) {
    const q = parsed.quiz;
    // "A) B) C)" harflarini ovoz inglizcha o'qiydi ("C" o'zbek alifbosida yo'q) — tartib so'zi bilan aytamiz.
    const options = q.variantlar.map((v, i) => {
      const label = ru ? `${RU_ORDINALS[i] ?? i + 1} вариант` : `${capitalize(ordinalToUzbek(i + 1))} variant`;
      return `${label}: ${plain(stripVariantLetter(v))}.`;
    });
    parts.push(`${ru ? "Теперь вопрос." : "Endi savol."} ${plain(q.savol)}`, ...options);
  }
  const text = parts.filter(Boolean).join("\n");
  return ru ? toSpokenRussian(text) : toSpokenUzbek(text);
}

const RU_ACRONYMS = new Set(["СССР", "США", "ДНК", "РНК", "ООН", "ЕГЭ", "МГУ", "ВВП"]);

/** Ruscha ovoz uchun: emoji yo'q, formulalar qavsda bo'lsa olinadi, baqiriq harflab o'qilmaydi. */
export function toSpokenRussian(text) {
  return String(text ?? "")
    .replace(/\p{Extended_Pictographic}️?/gu, "")
    .replace(/\s*\((?=[^)]*\d)(?:[A-Z][a-z]?\d*){1,6}\)/g, "")
    .replace(/\s*(?:→|->|=>)\s*/g, ", затем ")
    .replace(/(?<!\p{L})\p{Lu}{2,}(?!\p{Ll})/gu, (w) => (RU_ACRONYMS.has(w) || /^[A-Z]+$/.test(w) ? w : w[0] + w.slice(1).toLowerCase()))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

/**
 * Matnni nutq sintezi uchun bo'laklarga bo'ladi. Birinchi bo'lak alohida va qisqa —
 * shunda ovoz tezroq boshlanadi, qolganlari u o'qilayotganda yuklanadi.
 * @param {string} text
 * @param {number} [max] keyingi bo'laklar uchun eng ko'p belgi
 * @param {number} [firstMax] birinchi bo'lak uchun eng ko'p belgi
 * @returns {string[]}
 */
export function splitForSpeech(text, max = DEFAULT_CHUNK, firstMax = max) {
  const sentences = String(text ?? "").trim().split(/(?<=[.!?…:])\s+|\n+/).filter(Boolean);
  const pieces = sentences.flatMap((s) => (s.length <= max ? [s] : splitLong(s, max)));
  if (pieces.length === 0) return [];
  const [head, ...tail] = pieces;
  const headParts = head.length <= firstMax ? [head] : splitLong(head, firstMax);
  const rest = [headParts.slice(1).join(" "), ...tail].filter(Boolean);
  return [headParts[0], ...joinUpTo(rest, max)];
}

function splitLong(sentence, max) {
  return joinUpTo(sentence.split(/\s+/).flatMap((w) => hardCut(w, max)), max);
}

function joinUpTo(pieces, max) {
  return pieces.reduce((chunks, piece) => {
    const last = chunks[chunks.length - 1];
    if (last && last.length + 1 + piece.length <= max) {
      return [...chunks.slice(0, -1), `${last} ${piece}`];
    }
    return [...chunks, piece];
  }, []);
}

function hardCut(word, max) {
  const out = [];
  for (let i = 0; i < word.length; i += max) out.push(word.slice(i, i + max));
  return out;
}

function normalize(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[ʻʼ‘’`'´]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function variantBody(variant) {
  return normalize(String(variant).replace(/^\s*[A-Za-zА-Яа-я]\s*[).:-]\s*/, ""));
}

function defaultLetter(variant, index) {
  const m = String(variant).match(/^\s*([A-Za-zА-Яа-я])\s*[).:-]/);
  return m ? m[1].toUpperCase() : String.fromCharCode(65 + index);
}

/**
 * Ovoz bilan aytilgan gapdan quiz javobini topadi ("B", "ikkinchisi", "quyosh nuri").
 * Topilmasa null — demak bu oddiy savol.
 * @param {string} transcript
 * @param {{variantlar: string[]} | null} quiz
 * @param {(variant: string, index: number) => string} [letterOf]
 * @returns {string | null}
 */
export function matchQuizAnswer(transcript, quiz, letterOf = defaultLetter) {
  if (!quiz?.variantlar?.length) return null;
  const said = normalize(transcript);
  if (!said) return null;
  const words = said.split(" ");
  if (words.length > MAX_ANSWER_WORDS) return null;
  const letters = quiz.variantlar.map((v, i) => letterOf(v, i));
  const valid = (letter) => (letters.includes(letter) ? letter : null);

  if (words.length <= SHORT_ANSWER_WORDS) {
    const letterWord = words.find((w) => LETTER_WORDS.has(w));
    if (letterWord) return valid(LETTER_WORDS.get(letterWord));
    const ordinal = ORDINALS.find(([stem]) => words.some((w) => w.startsWith(stem)));
    if (ordinal) return valid(ordinal[1]);
  }

  const padded = ` ${said} `;
  const index = quiz.variantlar.findIndex((v) => {
    const body = variantBody(v);
    return body.length >= 3 && padded.includes(` ${body} `);
  });
  return index === -1 ? null : letters[index];
}
