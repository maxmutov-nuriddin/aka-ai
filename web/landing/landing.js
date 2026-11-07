// Landing: til (UZ/RU, ilova bilan umumiy sozlama), jonli robot — gapiradi, sichqoncha ortidan qaraydi,
// kayfiyat tugmalari va "Beparvo" kartochkasiga javob beradi.
import { createAvatar } from "/shared/avatar.js";

const PREFS_KEY = "jigar.prefs"; // ilova bilan bir xil — tanlangan til /app/ da ham saqlanadi
const TYPE_MS = 34;
const PAUSE_MS = 2300;

const DICT = {
  uz: {
    "nav.how": "Qanday ishlaydi", "nav.features": "Imkoniyatlar", "nav.extension": "Kengaytma",
    "nav.login": "Kirish", "nav.start": "Boshlash",
    "hero.eyebrow": "12–18 yoshdagi o'quvchilar uchun ovozli ustoz",
    "hero.title1": "Gapir.", "hero.title2": "Jigar", "hero.title3": "tushuntiradi.",
    "hero.lead": "Darslikdagi qiyin sahifani ko'rsat yoki savolingni ovoz bilan ayt — Jigar oddiy so'zlar, hayotiy misollar va hazil bilan tushuntiradi.",
    "hero.cta": "Bepul boshlash", "hero.more": "Qanday ishlaydi ↓",
    "moods.label": "Kayfiyatini sinab ko'r:",
    "how.title": "Uch qadam — va mavzu tushunarli",
    "how.s1.title": "Mikrofonni bos va so'ra",
    "how.s1.text": "O'zbekcha yoki ruscha, xohlagancha oddiy gapir. Jigar ikki tizim bilan eshitadi va savolingni aniq tushunadi.",
    "how.s2.title": "Jigar tushuntiradi",
    "how.s2.text": "Jonli ovoz, yuz ifodasi va ekranda yozilib boradigan matn bilan — misol va hazil qo'shib.",
    "how.s3.title": "O'zingni tekshir",
    "how.s3.text": "Kerak paytda Jigar savol beradi. Javobni aytasan — u maqtaydi yoki yana tushuntiradi.",
    "feat.title": "Oddiy chatbot emas — xarakterli ustoz",
    "feat.voice.title": "Jonli ovoz",
    "feat.voice.text": "Jigar gapiradi, kuladi, pichirlaydi. Ovozi bilan birga matn ham so‘zma-so‘z yoziladi.",
    "feat.faces.title": "His-tuyg'u",
    "feat.faces.text": "Ko'zlari, qoshlari, og'zi va qo'llari har bir gapga mos harakat qiladi.",
    "feat.wild.tag": "Faqat jur'atlilar uchun", "feat.wild.title": "Beparvo rejim",
    "feat.wild.text": "Jigar jahldor ko'cha yigitiga aylanadi: baqiradi, kesatadi, mavzu bo'yicha \"po'pisa\" qiladi — lekin baribir to'g'ri tushuntiradi.",
    "feat.lang.title": "O'zbekcha va ruscha",
    "feat.lang.text": "Bir tugma bilan til almashadi: interfeys ham, Jigarning ovozi ham.",
    "feat.short.title": "Qisqa va sodda",
    "feat.short.text": "2–3 gap, oddiy so'zlar. Batafsil kerak bo'lsa — \"batafsil\" de.",
    "feat.quiz.q": "Kasr nima?", "feat.quiz.a": "Butunning bo'lagi ✓",
    "feat.quiz.title": "Kerak paytda savol",
    "feat.quiz.text": "Har javobda test emas — yangi mavzudan keyin, tushunganingni tekshirish uchun.",
    "ext.title": "Istalgan saytda — yoningda",
    "ext.text": "Chrome kengaytmasi ochiq sahifani o'qiydi. Wikipedia, darslik yoki maqola — belgini bos, Jigar yon panelda tushuntiradi.",
    "ext.s1": "Kengaytmani o'rnat", "ext.s2": "Sozlamalarda hisobingga kir", "ext.s3": "Istalgan sahifada Jigar belgisini bos",
    "ext.mock": "Fotosintez — o'simlikning oshxonasi! 🌿",
    "final.title": "Birinchi darsni hozir boshla",
    "final.text": "Ro'yxatdan o'tish bir daqiqa. Keyin faqat gapirasan.",
    "final.cta": "Jigar bilan tanishish",
  },
  ru: {
    "nav.how": "Как это работает", "nav.features": "Возможности", "nav.extension": "Расширение",
    "nav.login": "Войти", "nav.start": "Начать",
    "hero.eyebrow": "Голосовой наставник для школьников 12–18 лет",
    "hero.title1": "Говори.", "hero.title2": "Джигар", "hero.title3": "объяснит.",
    "hero.lead": "Покажи сложную страницу учебника или задай вопрос голосом — Джигар объяснит простыми словами, на примерах и с юмором.",
    "hero.cta": "Начать бесплатно", "hero.more": "Как это работает ↓",
    "moods.label": "Поменяй ему настроение:",
    "how.title": "Три шага — и тема понятна",
    "how.s1.title": "Нажми на микрофон и спроси",
    "how.s1.text": "По-узбекски или по-русски, как удобно. Джигар слушает двумя системами и точно понимает вопрос.",
    "how.s2.title": "Джигар объясняет",
    "how.s2.text": "Живым голосом, мимикой и текстом, который пишется прямо на экране — с примерами и шутками.",
    "how.s3.title": "Проверь себя",
    "how.s3.text": "Когда нужно, Джигар задаёт вопрос. Ты отвечаешь — он хвалит или объясняет ещё раз.",
    "feat.title": "Не просто чат-бот — наставник с характером",
    "feat.voice.title": "Живой голос",
    "feat.voice.text": "Джигар говорит, смеётся, шепчет. Вместе с голосом слово за словом пишется текст.",
    "feat.faces.title": "Эмоции",
    "feat.faces.text": "Глаза, брови, рот и руки двигаются в такт каждой фразе.",
    "feat.wild.tag": "Только для смелых", "feat.wild.title": "Дерзкий режим",
    "feat.wild.text": "Джигар превращается в вспыльчивого пацана с района: кричит, язвит, «грозит» по теме — но всё равно объясняет правильно.",
    "feat.lang.title": "Узбекский и русский",
    "feat.lang.text": "Язык меняется одной кнопкой: и интерфейс, и голос Джигара.",
    "feat.short.title": "Коротко и просто",
    "feat.short.text": "2–3 фразы, простые слова. Нужно подробнее — скажи «подробнее».",
    "feat.quiz.q": "Что такое дробь?", "feat.quiz.a": "Часть целого ✓",
    "feat.quiz.title": "Вопрос, когда он нужен",
    "feat.quiz.text": "Не тест после каждого ответа — а проверка понимания после новой темы.",
    "ext.title": "На любом сайте — рядом",
    "ext.text": "Расширение для Chrome читает открытую страницу. Википедия, учебник или статья — нажми значок, и Джигар объяснит в боковой панели.",
    "ext.s1": "Установи расширение", "ext.s2": "Войди в аккаунт в настройках", "ext.s3": "На любой странице нажми значок Джигара",
    "ext.mock": "Фотосинтез — это кухня растения! 🌿",
    "final.title": "Начни первый урок прямо сейчас",
    "final.text": "Регистрация — минута. Дальше просто говоришь.",
    "final.cta": "Познакомиться с Джигаром",
  },
};

// Pufakchadagi gaplar: Jigar ularni "aytadi" — kayfiyat bilan.
const LINES = {
  uz: [
    { text: "Salom, jigar! Qaysi mavzu boshingni qotiryapti? 👋", emotion: "happy" },
    { text: "Fotosintez — o'simlikning oshxonasi! 🌿", emotion: "excited" },
    { text: "Kasr nima? Pitsaning bir bo'lagi-da! 🍕", emotion: "happy" },
    { text: "Pifagor? Uchburchakning eng katta siri…", emotion: "curious" },
    { text: "Uy vazifasini o'rningga qilmayman. Birga yechamiz! 😉", emotion: "smirk" },
  ],
  ru: [
    { text: "Привет, братишка! Какая тема не даёт покоя? 👋", emotion: "happy" },
    { text: "Фотосинтез — это кухня растения! 🌿", emotion: "excited" },
    { text: "Что такое дробь? Кусок пиццы! 🍕", emotion: "happy" },
    { text: "Пифагор? Главная тайна треугольника…", emotion: "curious" },
    { text: "Домашку за тебя не сделаю. Решим вместе! 😉", emotion: "smirk" },
  ],
};

function readPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
  } catch {
    return {};
  }
}

function savePrefs(patch) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...patch }));
  } catch {
    /* saqlab bo'lmasa — faqat shu sahifada amal qiladi */
  }
}

let lang = readPrefs().lang === "ru" ? "ru" : "uz";

function applyLang() {
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll("[data-l]")) {
    const value = DICT[lang][el.dataset.l];
    if (value) el.textContent = value;
  }
  for (const btn of document.querySelectorAll(".lang [data-lang]")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.lang === lang));
  }
}

for (const btn of document.querySelectorAll(".lang [data-lang]")) {
  btn.addEventListener("click", () => {
    lang = btn.dataset.lang;
    savePrefs({ lang });
    applyLang();
    restartTalk();
  });
}

// ---------- Robot ----------
const avatar = createAvatar(document.getElementById("heroAvatar"));
const bubbleText = document.getElementById("bubbleText");
const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
let talkTimer = 0;
let lineIndex = 0;
let pinnedEmotion = null; // kayfiyat tugmasi bosilsa, bir muddat shu turadi

function say({ text, emotion }) {
  clearTimeout(talkTimer);
  avatar.setEmotion(pinnedEmotion ?? emotion);
  if (calm) {
    bubbleText.textContent = text;
    talkTimer = setTimeout(nextLine, PAUSE_MS * 2);
    return;
  }
  avatar.setState("speaking");
  avatar.setLevel(null); // ovoz yo'q — og'iz o'zi qimirlaydi
  let i = 0;
  const type = () => {
    i += 1;
    bubbleText.textContent = text.slice(0, i);
    if (i < text.length) {
      talkTimer = setTimeout(type, TYPE_MS);
      return;
    }
    avatar.setState("idle");
    talkTimer = setTimeout(nextLine, PAUSE_MS);
  };
  type();
}

function nextLine() {
  const lines = LINES[lang];
  say(lines[lineIndex % lines.length]);
  lineIndex += 1;
}

function restartTalk() {
  lineIndex = 0;
  nextLine();
}

// Sichqoncha ortidan qaraydi.
const heroEl = document.getElementById("heroAvatar");
window.addEventListener("pointermove", (e) => {
  const box = heroEl.getBoundingClientRect();
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height * 0.35;
  avatar.lookAt((e.clientX - cx) / (window.innerWidth / 2), (e.clientY - cy) / (window.innerHeight / 2));
});
window.addEventListener("pointerleave", () => avatar.lookAt(null));

// Kayfiyat tugmalari: robot darrov shu kayfiyatga o'tadi.
for (const btn of document.querySelectorAll(".moods [data-emotion]")) {
  btn.addEventListener("click", () => {
    const same = pinnedEmotion === btn.dataset.emotion;
    pinnedEmotion = same ? null : btn.dataset.emotion;
    for (const b of document.querySelectorAll(".moods [data-emotion]")) {
      b.setAttribute("aria-pressed", String(b === btn && !same));
    }
    avatar.setEmotion(pinnedEmotion);
  });
}

// "Beparvo" kartochkasi: ustiga borilsa robot jahl qiladi.
const wildTile = document.getElementById("wildTile");
const goWild = (on) => {
  avatar.setMode(on ? "beparvo" : "oddiy");
  avatar.setEmotion(on ? "furious" : pinnedEmotion);
};
for (const [event, on] of [["pointerenter", true], ["pointerleave", false], ["focus", true], ["blur", false]]) {
  wildTile.addEventListener(event, () => goWild(on));
}

applyLang();
nextLine();
