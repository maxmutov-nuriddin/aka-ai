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
export const hasWakeWord = (text) => WAKE_RE.test(String(text ?? "")) || HEY_WAKE_RE.test(String(text ?? ""));

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
  if (!match) return "";
  const rest = value.slice(match.index + match[0].length).replace(/^[\s,!.?:;-]+/u, "").trim();
  return (rest.match(/\p{L}/gu) ?? []).length >= MIN_COMMAND_LETTERS ? rest : "";
}
