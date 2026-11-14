// Tezkor buyruqlar: oddiy, aniq gaplar ("ovozni 40 qil", "Telegramni och", "YouTube'ni yop") AI'siz, algoritm bilan
// bajariladi — token ketmaydi, javob darrov. Tushunmasa (null) — odatdagidek AI javob beradi.
// Toza mantiq (testlanadi): matn → { steps: [{ name, input, optional? }], say? } | { say } | null. Bajaradigan: server/app.js (/api/chat).
// Faqat TO'LIQ mos gap (^...$, ≤ MAX_WORDS so'z): uzun gap yoki savol ichidagi so'z buyruq deb olinmaydi.

const MAX_WORDS = 9;

const CYR = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya", ў: "o'", қ: "q", ғ: "g'", ҳ: "h" };

// Tanish xizmati buyruq fe'lini buzadi: "och" → "yok/ook", "yop" → "nyop/yopp", "qo'y" → "koy/qoy" (faqat gap oxirida).
const VERB_FIXES = [[/\b(yok|ook|ochi|ochh|ochch)$/, "och"], [/\b(nyop|yopp|yob)$/, "yop"], [/\b(koy|qoy)$/, "qo'y"]];

const UNITS = { nol: 0, bir: 1, ikki: 2, uch: 3, "to'rt": 4, besh: 5, olti: 6, yetti: 7, sakkiz: 8, "to'qqiz": 9 };
const TENS = { "o'n": 10, yigirma: 20, "o'ttiz": 30, qirq: 40, ellik: 50, oltmish: 60, yetmish: 70, sakson: 80, "to'qson": 90 };

/** Gapni solishtirishga tayyorlaydi: kichik harf, kirill → lotin, apostroflar, chaqiruv so'zlari va tinish olib tashlanadi. */
export function normalize(text) {
  let s = String(text ?? "").toLowerCase().replace(/[ʻ’‘`´]/g, "'");
  s = [...s].map((ch) => CYR[ch] ?? ch).join("");
  s = s.replace(/[^a-z0-9'%\s-]/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/^(?:hey |ey |hei )?(?:jigar|jigarjon|dijar|digar)\b[ ,]*/, "").replace(/^(?:iltimos|ilt)\b ?/, "").replace(/ ?\b(iltimos|ilt)$/, "");
  for (const [re, fix] of VERB_FIXES) s = s.replace(re, fix);
  return s.trim();
}

/** "qirq besh" → 45, "ellik" → 50, "yuz" → 100, "40" → 40; boshqa — null. */
export function parseLevel(text) {
  const s = String(text ?? "").trim().replace(/%$/, "");
  if (/^\d{1,3}$/.test(s)) return Math.min(100, Number(s));
  if (s === "yuz") return 100;
  const words = s.split(" ").filter(Boolean);
  if (!words.length || words.length > 2) return null;
  const [a, b] = words;
  if (words.length === 1) return a in TENS ? TENS[a] : a in UNITS ? UNITS[a] : null;
  return a in TENS && b in UNITS ? TENS[a] + UNITS[b] : null;
}

const titleCase = (name) => name.replace(/\b[a-z]/g, (c) => c.toUpperCase());
const stripSuffix = (name) => name.replace(/'?(ni|ga|dan)$/, "").trim();

const step = (name, input, optional = false) => ({ name, input, ...(optional ? { optional: true } : {}) });
const LEVEL_TAIL = "(?:\\s*(?:foiz|%|protsent))?(?:\\s*(?:ga|ta))?(?:\\s+(?:qil|qo'y|o'rnat|ol|bo'lsin|ko'tar|tushir))?";

/** Toshkent vaqti: "08:31". */
function tashkentTime(now = new Date()) {
  const t = new Date(now.getTime() + 5 * 3600_000);
  return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
}

// "X'ni yop/o'chir" — X ilova emas bo'lsa (ovoz, ekran, chiroq ...) — tezkor yopishga tushmaydi.
const CLOSE_NOT_APP = /\b(ovoz|ekran|monitor|kompyuter|mac|noutbuk|chiroq|svet|internet|wi-?fi|bluetooth|musiqa|qo'shiq|video|kamera|mikrofon|hammasi|barchasi|tab)/;

const RULES = [
  // Vaqt (asbobsiz)
  [/^soat (?:necha|nechchi|nechi)(?: bo'ldi)?$/, (_m, ctx) => ({ say: `Hozir ${tashkentTime(ctx.now)}.` })],
  // YouTube
  [new RegExp(`^youtube(?:'?(?:ning|ni))? ovozi(?:ni)? (.+?)${LEVEL_TAIL}$`), (m) => {
    const level = parseLevel(m[1]);
    return level === null ? null : { steps: [step("pc_youtube", { action: "volume", level })] };
  }],
  [/^youtube(?:'?ni)? (?:yop|o'chir)$/, () => ({ steps: [step("pc_youtube", { action: "close" }, true), step("pc_apps", { action: "close_tab", title: "YouTube" }, true)], say: "YouTube yopildi." })],
  [/^youtube(?:'?ni)? (?:to'xtat|pauza|pause)$/, () => ({ steps: [step("pc_youtube", { action: "pause" })] })],
  [/^youtube(?:'?ni)? (?:davom ettir|davom et|resume)$/, () => ({ steps: [step("pc_youtube", { action: "resume" })] })],
  [/^youtube'?(?:da|dan)? (.+?)(?:'?ni)? (?:qo'y|ijro et|top|och)$/, (m) => (m[1].split(" ").length <= 6 ? { steps: [step("pc_youtube", { action: "play", query: m[1] })] } : null)],
  // Brauzer tabi
  [/^(?:chrome'?(?:dagi)? |brauzerdagi )?(.+?) tab(?:ini| ni)? yop(?: yubor)?$/, (m) => ({ steps: [step("pc_apps", { action: "close_tab", title: titleCase(m[1]) })] })],
  // Tizim ovozi
  [new RegExp(`^(?:tizim )?ovoz(?:ni)? (.+?)${LEVEL_TAIL}$`), (m) => {
    const level = parseLevel(m[1]);
    return level === null ? null : { steps: [step("pc_media", { action: "volume_set", level })] };
  }],
  [/^ovoz(?:ni)? (?:oshir|ko'tar|baland qil|ko'paytir|balandla)$/, () => ({ steps: [step("pc_media", { action: "volume_up" })] })],
  [/^ovoz(?:ni)? (?:pasaytir|kamaytir|past qil|pasaytirib qo'y|pastlat)$/, () => ({ steps: [step("pc_media", { action: "volume_down" })] })],
  [/^ovoz(?:ni)? (?:o'chir|o'chirib qo'y|jim qil)$/, () => ({ steps: [step("pc_media", { action: "mute" })] })],
  [/^ovoz(?:ni)? (?:yoq|yoqib qo'y|qaytar)$/, () => ({ steps: [step("pc_media", { action: "unmute" })] })],
  // Musiqa
  [/^(?:musiqa|qo'shiq)(?:ni)? (?:to'xtat|pauza|pause|davom ettir|davom et)$/, () => ({ steps: [step("pc_media", { action: "play_pause" })] })],
  [/^keyingi (?:qo'shiq|musiqa|trek)$|^qo'shiqni keyingisiga o'tkaz$/, () => ({ steps: [step("pc_media", { action: "next" })] })],
  [/^oldingi (?:qo'shiq|musiqa|trek)$/, () => ({ steps: [step("pc_media", { action: "previous" })] })],
  // Tizim
  [/^(?:ekran(?:ni)?|kompyuter(?:ni)?) qulfla$|^qulfla$/, () => ({ steps: [step("pc_system", { action: "lock" })] })],
  [/^(?:ekran(?:ni)?|monitor(?:ni)?) (?:o'chir|o'chirib qo'y)$/, () => ({ steps: [step("pc_system", { action: "sleep_display" })], say: "Ekran o'chirildi." })],
  [/^(?:kompyuter(?:ni)?|mac(?:ni)?|noutbuk(?:ni)?) (?:uxlat|uyquga qo'y)$|^uxla$/, () => ({ steps: [step("pc_power", { action: "sleep" })], say: "Uxlatdim." })],
  // Holatni o'qish — javob asbob natijasining o'zi (AI'siz)
  [/^(?:batareya|zaryad|quvvat)(?: (?:necha(?: foiz)?|qancha|qoldi|holati))*$/, () => ({ steps: [step("pc_system", { action: "battery" })], report: true })],
  [/^(?:kompyuter|mac|tizim|noutbuk|pc)(?:ning)? (?:holati|ahvoli)(?: qanday)?$/, () => ({ steps: [step("pc_system", { action: "info" })], report: true })],
  // Oynalar
  [/^(?:hamma |barcha )?oynalar(?:ni)? (?:yashir|yig'ishtir)$|^hammasini yashir$/, () => ({ steps: [step("pc_apps", { action: "hide_all" })], say: "Oynalar yashirildi." })],
  [/^([a-z][a-z0-9' .-]{1,30}?)(?:'?ga)? o't$/, (m) => {
    const app = titleCase(stripSuffix(m[1]));
    return app.length < 2 ? null : { steps: [step("pc_apps", { action: "focus", app })], say: `${app} oldinda.` };
  }],
  // Ilova yopish ("Telegramni yop") — tab, YouTube va ovoz yuqoridagi qoidalarda
  [/^([a-z][a-z0-9' .-]{1,30}?) (?:yop|yopib qo'y|o'chir)$/, (m) => {
    const app = titleCase(stripSuffix(m[1]));
    return CLOSE_NOT_APP.test(m[1]) || app.length < 2 ? null : { steps: [step("pc_apps", { action: "quit", app })], say: `${app} yopildi.` };
  }],
  // Ilova ochish ("Telegramni och", "Yandex Musicni och") — topilmasa AI veb versiyasini ochadi
  [/^([a-z][a-z0-9' .-]{1,30}?) och$/, (m) => {
    const app = titleCase(stripSuffix(m[1]));
    return /\b(sayt|veb|google|http|com|uz|ru)\b/.test(m[1]) || app.length < 2 ? null : { steps: [step("pc_apps", { action: "open", app })], say: `Bajarildi, ${app} ochildi.` };
  }],
];

/** @returns {{ steps?: object[], say?: string, report?: boolean } | null} report — javob asbob natijasining o'zi. */
export function matchFastCommand(text, ctx = {}) {
  const s = normalize(text);
  if (!s || s.split(" ").length > MAX_WORDS) return null;
  for (const [re, build] of RULES) {
    const m = re.exec(s);
    if (!m) continue;
    const out = build(m, { now: ctx.now });
    if (out) return out;
  }
  return null;
}

/**
 * Qadamlarni bajaradi. Majburiy qadam xato bersa — null (AI davom ettiradi). Qaytaradi: javob matni.
 * @param {{ run: (name: string, input: object) => Promise<{ content: object[], isError: boolean }> } | null} toolbox
 */
export async function runFastCommand(command, toolbox) {
  if (!command) return null;
  if (!command.steps?.length) return command.say ?? null;
  if (!toolbox?.devices?.length) return null; // qurilma ulanmagan — AI tushuntiradi
  const texts = [];
  for (const { name, input, optional } of command.steps) {
    const result = await toolbox.run(name, input);
    if (result.isError) {
      if (optional) continue;
      return null;
    }
    texts.push(result.content?.find((c) => c.type === "text")?.text ?? "");
  }
  if (command.say) return command.say;
  const first = texts.find(Boolean);
  if (command.report && first) return first.slice(0, 300);
  return first ? `Bajarildi. ${first}`.slice(0, 200) : "Bajarildi.";
}
