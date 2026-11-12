// "Hey Jigar" (faqat support): mikrofon fonda tinglaydi, "Jigar" so'zini eshitsa — savolni tinglashni boshlaydi.
// Brauzerning nutqni tanish xizmati (Chrome) ishlatiladi; Jigar gapirayotganda yoki savol tinglanayotganda to'xtaydi.

const WAKE_RE = /(^|[^\p{L}])(jigar|jigarr|jiger|djigar|digar|джигар|жигар|джигарь)(?![\p{L}])/iu;
const RESTART_MS = 400; // uzoq ishlagan tinglash o'zi tugasa — qayta yoqish oralig'i
const HEALTHY_SESSION_MS = 3000; // bundan qisqa tugagan tinglash — muvaffaqiyatsiz (mikrofon yonib-o'chmasin)
const MAX_BACKOFF_MS = 30_000;
const MAX_QUICK_FAILS = 5; // ketma-ket shuncha tez uzilish — bu qurilmada ishlamaydi, to'xtatamiz
// Tuzalmaydigan xatolar: ruxsat yo'q, til yoki xizmat yo'q (Electron'da Google nutq xizmati yo'q — "network").
const FATAL_ERRORS = new Set(["not-allowed", "service-not-allowed", "language-not-supported", "network", "audio-capture"]);
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
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (!WAKE_RE.test(event.results[i][0].transcript)) continue;
        halt();
        onWake();
        return;
      }
    };
    r.onerror = (event) => {
      if (FATAL_ERRORS.has(event.error)) fatal = event.error;
    };
    r.onend = () => {
      if (recognition === r) recognition = null;
      if (!wanted || paused) return;
      if (fatal) return giveUp(fatal);
      quickFails = Date.now() - startedAt < HEALTHY_SESSION_MS ? quickFails + 1 : 0;
      if (quickFails >= MAX_QUICK_FAILS) return giveUp("unstable");
      timer = setTimeout(begin, backoffDelay(quickFails));
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
      begin();
    },
  };
}

/** Test uchun: matnda uyg'otish so'zi bormi. */
export const hasWakeWord = (text) => WAKE_RE.test(String(text ?? ""));
