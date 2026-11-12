// "Hey Jigar" (faqat support): mikrofon fonda tinglaydi, "Jigar" so'zini eshitsa — savolni tinglashni boshlaydi.
// Brauzerning nutqni tanish xizmati (Chrome) ishlatiladi; Jigar gapirayotganda yoki savol tinglanayotganda to'xtaydi.

const WAKE_RE = /(^|[^\p{L}])(jigar|jigarr|jiger|djigar|digar|джигар|жигар|джигарь)(?![\p{L}])/iu;
const RESTART_MS = 400; // brauzer tinglashni o'zi to'xtatsa — qayta yoqish oralig'i
const LOCALES = { uz: "uz-UZ", ru: "ru-RU" };

/**
 * @param {{ onWake: () => void }} deps
 */
export function createWake({ onWake }) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let wanted = false; // foydalanuvchi yoqqan
  let paused = false; // Jigar band (gapiryapti yoki savolni tinglayapti)
  let lang = "uz";

  function begin() {
    if (!Recognition || !wanted || paused || recognition) return;
    const r = new Recognition();
    r.lang = LOCALES[lang] ?? LOCALES.uz;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (!WAKE_RE.test(event.results[i][0].transcript)) continue;
        halt();
        onWake();
        return;
      }
    };
    r.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") wanted = false; // ruxsat yo'q
    };
    r.onend = () => {
      if (recognition === r) recognition = null;
      if (wanted && !paused) setTimeout(begin, RESTART_MS);
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
      if (wanted) begin();
      else halt();
    },
    /** Jigar band bo'lganda — mikrofon bitta, tinglash to'qnashmasin. */
    pause() {
      paused = true;
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
