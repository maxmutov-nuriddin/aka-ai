// "Hey Jigar" (faqat support): mikrofon fonda tinglaydi, "Jigar" so'zini eshitsa — savolni tinglashni boshlaydi.
// Brauzerning nutqni tanish xizmati (Chrome) ishlatiladi; Jigar gapirayotganda yoki savol tinglanayotganda to'xtaydi.

// Tanish xizmatlari ismni har xil yozadi: "Джигр", "jigr", "чигар", "dzhiger"... — unli tushib qolishi ham mumkin.
const WAKE_RE = /(^|[^\p{L}])((dzh|dj|zh|j|ch)i[gk]{1,2}[aeə]?r{1,2}|digar|jigah|(дж|ж|ч)и[гк]{1,2}[аеэя]?рь?)(?![\p{L}])/iu;
const RESTART_MS = 400; // uzoq ishlagan tinglash o'zi tugasa — qayta yoqish oralig'i
const HEALTHY_SESSION_MS = 3000; // bundan qisqa tugagan tinglash — muvaffaqiyatsiz (mikrofon yonib-o'chmasin)
const MAX_BACKOFF_MS = 30_000;
// Tuzalmaydigan xatolar: ruxsat yoki til yo'q. "network" — faqat desktop ilovada (Electron'da Google nutq xizmati
// umuman yo'q); brauzerda u vaqtinchalik — tashlab ketmaymiz, kutib qayta urinamiz (aks holda "eshitmay qoladi").
const FATAL_ERRORS = new Set(["not-allowed", "service-not-allowed", "language-not-supported"]);
const IS_DESKTOP_APP = /\bElectron\/|JigarDesktop\//.test(globalThis.navigator?.userAgent ?? "");
const isFatal = (error) => FATAL_ERRORS.has(error) || (IS_DESKTOP_APP && error === "network");
const LOCALES = { uz: "uz-UZ", ru: "ru-RU" };

/** Ketma-ket tez uzilishlardan keyingi kutish: 1 s, 2 s, 4 s ... 30 s gacha. */
export const backoffDelay = (quickFails) => (quickFails <= 0 ? RESTART_MS : Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (quickFails - 1)));

/**
 * @param {{ onWake: () => void, onUnavailable?: (reason: string) => void }} deps
 *   onUnavailable — fonda tinglash bu qurilmada ishlamaydi (ruxsat yoki xizmat yo'q), avtomatik o'chirildi.
 */
export function createWake({ onWake, onUnavailable = () => {} }) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let wanted = false; // foydalanuvchi yoqqan
  let paused = false; // Jigar band (gapiryapti yoki savolni tinglayapti)
  let lang = "uz";
  let quickFails = 0;
  let timer = null;

  /** Tinglashni butunlay o'chiradi va sababini aytadi (qayta urinilmaydi). */
  function giveUp(reason) {
    wanted = false;
    clearTimeout(timer);
    halt();
    onUnavailable(reason);
  }

  function begin() {
    clearTimeout(timer);
    if (!Recognition || !wanted || paused || recognition) return;
    const r = new Recognition();
    r.lang = LOCALES[lang] ?? LOCALES.uz;
    r.continuous = true;
    r.interimResults = true;
    const startedAt = Date.now();
    let fatal = null;
    r.onresult = (event) => {
      quickFails = 0; // eshityapti — tinglash sog'lom
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (!WAKE_RE.test(event.results[i][0].transcript)) continue;
        const heard = event.results[i][0].transcript;
        halt();
        onWake(wakeRemainder(heard), heard);
        return;
      }
    };
    r.onerror = (event) => {
      if (isFatal(event.error)) fatal = event.error;
    };
    r.onend = () => {
      if (recognition === r) recognition = null;
      if (!wanted || paused) return;
      if (fatal) return giveUp(fatal);
      quickFails = Date.now() - startedAt < HEALTHY_SESSION_MS ? quickFails + 1 : 0;
      timer = setTimeout(begin, backoffDelay(quickFails)); // tez uzilsa — kutish oshadi (≤ 30 s), lekin to'xtamaydi
    };
    recognition = r;
    try {
      r.start();
    } catch {
      recognition = null;
    }
  }

  function halt() {
    const r = recognition;
    recognition = null;
    try {
      r?.abort();
    } catch {
      /* allaqachon to'xtagan */
    }
  }

  // Sahifaga qaytilganda (fon tabdan) — kutmasdan qayta tinglash.
  globalThis.document?.addEventListener?.("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !wanted || paused || recognition) return;
    quickFails = 0;
    begin();
  });

  return {
    supported: Boolean(Recognition),
    get enabled() {
      return wanted;
    },
    /** Yoqish / o'chirish (sozlamalardagi tugma). */
    setEnabled(on, nextLang = lang) {
      wanted = Boolean(on) && Boolean(Recognition);
      lang = nextLang;
      quickFails = 0;
      if (wanted) begin();
      else {
        clearTimeout(timer);
        halt();
      }
    },
    /** Jigar band bo'lganda — mikrofon bitta, tinglash to'qnashmasin. */
    pause() {
      paused = true;
      clearTimeout(timer);
      halt();
    },
    resume() {
      paused = false;
      quickFails = 0;
      begin();
    },
  };
}

/** Test uchun: matnda uyg'otish so'zi bormi. */
// "Hey" bilan aytilsa, ism oxiri yo'qolsa ham yetadi: "Hey, Jigga!", "Эй, джиги".
const HEY_WAKE_RE = /(^|[^\p{L}])(hey|hei|ey|эй|хей|хэй|гей)[\s,!.-]+((dzh|dj|j|zh|ch)i[gk]|(дж|ж|ч)и[гк])\p{L}*/iu;

// Qisqa gapda (≤3 so'z) ism biroz buzilib yozilgan bo'lsa ham ("Дигар", "жигир", "jigga", "gigar") — chaqiruv.
// Uzun gapda faqat aniq imlo: boshqa so'zlar "jigar"ga tasodifan o'xshab qolmasin.
const CYR = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "j", з: "z", и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "c", ш: "s", щ: "s", ъ: "", ы: "i", ь: "", э: "e", ю: "u", я: "a", ў: "u", қ: "k", ғ: "g", ҳ: "h" };
const SHORT_UTTERANCE_WORDS = 3;
const NAME = "jigar";

/** Kirill → lotin (taxminiy), faqat harflar. "Джигар" → "djigar". */
const skeleton = (word) => [...word.toLowerCase()].map((ch) => CYR[ch] ?? ch).join("").replace(/[^a-z]/g, "");

function distance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return prev[b.length];
}

/** Bitta so'z "Jigar" ismiga yetarlicha o'xshashmi (j/g/d/z/c bilan boshlanib, ≤2 harf farq; yoki ≤1 farq). */
function looksLikeName(word) {
  const s = skeleton(word).replace(/^(dj|zj|dz|zh|ch)/, "j");
  if (s.length < 4 || s.length > 7) return false;
  const d = distance(s, NAME);
  return d <= 1 || (d <= 2 && /^[jgdzc]/.test(s));
}

/** Matnni so'zlarga ajratadi: [{ word, end }] — end: so'z oxirining indeksi. */
const words = (text) => [...text.matchAll(/[\p{L}']+/gu)].map((m) => ({ word: m[0], end: m.index + m[0].length }));

/** Qisqa gapda buzilgan ism topilsa — shu so'zning oxiri (indeks); aks holda -1. */
function fuzzyNameEnd(text) {
  const list = words(text);
  if (list.length === 0 || list.length > SHORT_UTTERANCE_WORDS) return -1;
  const hit = list.find((w) => looksLikeName(w.word));
  return hit ? hit.end : -1;
}

export const hasWakeWord = (text) => {
  const value = String(text ?? "");
  return WAKE_RE.test(value) || HEY_WAKE_RE.test(value) || fuzzyNameEnd(value) >= 0;
};

// "Jigar, stop" / "Jigar, to'xta" / "Jigar, bas" — gapirishni va tinglashni to'xtatadi (keyingi chaqiruvgacha).
const STOP_RE = /^(?:(?:iltimos|ilt|please|пожалуйста)[\s,]+)?(stop|стоп|ст[оа]п|to['ʻ’`]?xta|тў?хта|тохта|bas|бас|jim|жим|хватит|hvatit|yetar|етар|bo['ʻ’`]?ldi|болди|enough|hush|tinch)(?![\p{L}])/iu;
/** Ismdan keyingi gap — to'xtatish buyrug'imi ("stop", "to'xta", "bas", "хватит"...). */
export const isStopCommand = (command) => STOP_RE.test(String(command ?? "").trim());
/** Jigar gapirayotganda — faqat aniq chaqiruv ("Hey Jigar ..." yoki "Jigar, stop"): o'z ovozidagi "Jigar" so'zi uni to'xtatmasin. */
export const isDeliberateWake = (heard, command) => HEY_WAKE_RE.test(String(heard ?? "")) || isStopCommand(command);

const MIN_COMMAND_LETTERS = 3; // "Hey Jigar!" dan keyin qolgan "ha" — buyruq emas
/**
 * "Hey Jigar, ovozni 40 qil" — ismdan keyingi buyruq ("ovozni 40 qil"). Buyruq yo'q bo'lsa — "".
 * Bir nafasda aytilgan buyruq qayta so'ralmasdan darhol bajariladi.
 */
export function wakeRemainder(text) {
  const value = String(text ?? "");
  const match = HEY_WAKE_RE.exec(value) ?? WAKE_RE.exec(value);
  const end = match ? match.index + match[0].length : fuzzyNameEnd(value);
  if (end < 0) return "";
  const rest = value.slice(end).replace(/^[\s,!.?:;-]+/u, "").trim();
  return (rest.match(/\p{L}/gu) ?? []).length >= MIN_COMMAND_LETTERS ? rest : "";
}
