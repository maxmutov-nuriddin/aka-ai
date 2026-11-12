// Kirish va ro'yxatdan o'tish. Robot formaga javob beradi: ism — quvonadi, parol — ko'zini qisib boshqa
// tomonga qaraydi, xato — g'amgin, muvaffaqiyat — xursand bo'lib ilovaga o'tkazadi.
import { createAvatar } from "/shared/avatar.js";
import { loadProfile, saveProfile, saveLang, renderOnboarding, questionText } from "/auth/onboarding.js";

const PREFS_KEY = "jigar.prefs";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;
const REDIRECT_MS = 700;

const DICT = {
  uz: {
    back: "← Bosh sahifa",
    "nav.how": "Qanday ishlaydi", "nav.directions": "Yo'nalishlar", "nav.personas": "Xarakterlar", "nav.pricing": "Narxlar", "nav.faq": "Savollar",
    "nav.login": "Kirish", "nav.start": "Boshlash",
    "title.login": "Jigarga kirish", "title.register": "Jigar bilan tanishish", "title.onboard": "Keling, tanishamiz",
    "say.onboardDone": "Zo'r! Endi hisob ochamiz — bir daqiqa",
    "tab.login": "Kirish", "tab.register": "Ro'yxatdan o'tish",
    "field.name": "Ismingiz", "field.email": "Email", "field.password": "Parol", "field.passHint": "Kamida 8 belgi",
    "field.peek": "Parolni ko'rsatish",
    "submit.login": "Kirish", "submit.register": "Ro'yxatdan o'tish", "submit.wait": "Bir lahza…",
    "switch.toRegister": "Hisobing yo'qmi?", "switch.registerLink": "Ro'yxatdan o't",
    "switch.toLogin": "Hisobing bormi?", "switch.loginLink": "Kirish",
    "consent.text": "Ro'yxatdan o'tib, siz", "consent.offer": "ommaviy oferta", "consent.and": "va",
    "consent.privacy": "maxfiylik siyosati", "consent.end": "ga rozilik bildirasiz.",
    "say.hello": "Salom! Keling, tanishamiz",
    "say.welcomeBack": "Qaytganingdan xursandman!",
    "say.name": "Tanishganimdan xursandman, {name}!",
    "say.email": "Emailingni yoz — hech kimga bermayman",
    "say.password": "Ko'rmayapman, ko'rmayapman… yozaver!",
    "say.success": "Zo'r! Darsga ketdik!",
    "err.name": "Ismingni yoz (kamida 2 harf).",
    "err.email": "Email noto'g'ri ko'rinyapti.",
    "err.password": "Parol kamida 8 belgi bo'lsin.",
    "err.bad_credentials": "Email yoki parol noto'g'ri.",
    "err.duplicate_email": "Bu email bilan allaqachon ro'yxatdan o'tilgan. Kirib ko'r.",
    "err.network": "Server bilan aloqa yo'q. Internetni tekshir.",
    "err.blocked": "Hisob bloklangan. Support bilan bog'lan.",
    "err.rate": "Urinishlar juda ko'p. 15 daqiqadan keyin qayta urin.",
    "err.invalid": "Ma'lumot noto'g'ri. Tekshirib, qayta urin.",
    "err.server": "Serverda xato. Birozdan keyin qayta urin.",
  },
  ru: {
    back: "← На главную",
    "nav.how": "Как это работает", "nav.directions": "Направления", "nav.personas": "Характеры", "nav.pricing": "Цены", "nav.faq": "Вопросы",
    "nav.login": "Вход", "nav.start": "Начать",
    "title.login": "Вход в Джигар", "title.register": "Знакомство с Джигаром", "title.onboard": "Давай знакомиться",
    "say.onboardDone": "Отлично! Теперь создадим аккаунт — минутка",
    "tab.login": "Вход", "tab.register": "Регистрация",
    "field.name": "Твоё имя", "field.email": "Email", "field.password": "Пароль", "field.passHint": "Минимум 8 символов",
    "field.peek": "Показать пароль",
    "submit.login": "Войти", "submit.register": "Зарегистрироваться", "submit.wait": "Секунду…",
    "switch.toRegister": "Нет аккаунта?", "switch.registerLink": "Зарегистрируйся",
    "switch.toLogin": "Уже есть аккаунт?", "switch.loginLink": "Войти",
    "consent.text": "Регистрируясь, вы принимаете", "consent.offer": "публичную оферту", "consent.and": "и",
    "consent.privacy": "политику конфиденциальности", "consent.end": ".",
    "say.hello": "Привет! Давай знакомиться",
    "say.welcomeBack": "Рад, что ты вернулся!",
    "say.name": "Приятно познакомиться, {name}!",
    "say.email": "Напиши email — никому не скажу",
    "say.password": "Не смотрю, не смотрю… пиши!",
    "say.success": "Отлично! Погнали на урок!",
    "err.name": "Напиши имя (минимум 2 буквы).",
    "err.email": "Похоже, email неверный.",
    "err.password": "Пароль — минимум 8 символов.",
    "err.bad_credentials": "Неверный email или пароль.",
    "err.duplicate_email": "Этот email уже зарегистрирован. Попробуй войти.",
    "err.network": "Нет связи с сервером. Проверь интернет.",
    "err.blocked": "Аккаунт заблокирован. Свяжись с поддержкой.",
    "err.rate": "Слишком много попыток. Попробуй через 15 минут.",
    "err.invalid": "Данные неверные. Проверь и попробуй снова.",
    "err.server": "Ошибка на сервере. Попробуй чуть позже.",
  },
};

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(window.location.search);

function readLang() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}").lang === "ru" ? "ru" : "uz";
  } catch {
    return "uz";
  }
}

let lang = readLang(); // birinchi savolda o'zgarishi mumkin
const t = (key, vars = {}) => (DICT[lang][key] ?? DICT.uz[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

/** Faqat shu saytdagi manzilga qaytaramiz (tashqi saytga yo'naltirib bo'lmaydi). */
function safeNext() {
  const next = params.get("next") || "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/app/";
}

// ---------- Robot ----------
const avatar = createAvatar($("authAvatar"));
const bubble = $("bubble");

function say(key, { emotion = null, vars } = {}) {
  bubble.textContent = t(key, vars);
  bubble.classList.remove("pop");
  void bubble.offsetWidth; // animatsiyani qayta boshlash
  bubble.classList.add("pop");
  avatar.setEmotion(emotion);
}

// ---------- Rejim: kirish yoki ro'yxatdan o'tish ----------
let mode = params.get("mode") === "register" ? "register" : "login";

function showError(message) {
  $("error").textContent = message;
  $("error").hidden = !message;
}

function render() {
  const register = mode === "register";
  translateStatic();
  document.title = `${t(register ? "tab.register" : "tab.login")} — Jigar`;
  $("authTitle").textContent = t(register ? "title.register" : "title.login");
  $("tabLogin").setAttribute("aria-selected", String(!register));
  $("tabRegister").setAttribute("aria-selected", String(register));
  $("nameField").hidden = !register;
  $("consent").hidden = !register;
  for (const [id, key] of [["consentText", "consent.text"], ["consentOffer", "consent.offer"], ["consentAnd", "consent.and"], ["consentPrivacy", "consent.privacy"], ["consentEnd", "consent.end"]]) {
    $(id).textContent = t(key);
  }
  $("passHint").hidden = !register;
  $("password").autocomplete = register ? "new-password" : "current-password";
  $("submit").textContent = t(register ? "submit.register" : "submit.login");
  $("switchText").textContent = t(register ? "switch.toLogin" : "switch.toRegister");
  $("switchBtn").textContent = t(register ? "switch.loginLink" : "switch.registerLink");
  $("peek").setAttribute("aria-label", t("field.peek"));
  showError("");
  syncOnboarding(register);
}

// Ro'yxatdan o'tishda avval savollar, keyin forma. Profil bor bo'lsa savollar o'tkazib yuboriladi.
// Har safar "Boshlash" (ro'yxatdan o'tish) bosilganda avval savollar — oldin javob berilgan bo'lsa ham.
let onboardingDone = false;

function syncOnboarding(register) {
  const needed = register && !onboardingDone;
  $("onboard").hidden = !needed;
  $("authForm").hidden = needed;
  document.querySelector(".tabs").hidden = needed;
  document.querySelector(".switch-note").hidden = needed;
  if (!needed) return;
  $("authTitle").textContent = t("title.onboard");
  renderOnboarding($("onboard"), {
    onStep: (question) => sayText(questionText(question, "bubble", lang), "happy"),
    onAnswer: (id, value) => {
      if (id === "persona") return avatar.setPersona(value); // robot tanlangan xarakterni darhol ko'rsatadi
      if (id !== "lang") return;
      lang = value;
      saveLang(value); // ilova (/app/) va landing ham shu tilni oladi
      translateStatic();
      $("authTitle").textContent = t("title.onboard");
    },
    onPick: () => avatar.setEmotion("excited"),
    onDone: (profile) => {
      onboardingDone = true;
      saveProfile(profile);
      render();
      sayText(t("say.onboardDone"), "happy");
      $("name").focus();
    },
  });
}

/** Sahifadagi doimiy yozuvlar va til tugmalari — joriy tilda. */
function translateStatic() {
  document.documentElement.lang = lang;
  for (const node of document.querySelectorAll("[data-l]")) node.textContent = t(node.dataset.l);
  for (const btn of document.querySelectorAll(".lang [data-lang]")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.lang === lang));
  }
}

function sayText(text, emotion = null) {
  bubble.textContent = text;
  bubble.classList.remove("pop");
  void bubble.offsetWidth; // animatsiyani qayta boshlash
  bubble.classList.add("pop");
  avatar.setEmotion(emotion);
}

function setMode(next) {
  mode = next;
  render();
  greet();
}

// Navbar: shu sahifada "Kirish"/"Boshlash" sahifani qayta yuklamasdan rejimni almashtiradi.
for (const [id, next] of [["navLogin", "login"], ["navStart", "register"]]) {
  $(id).addEventListener("click", (event) => {
    event.preventDefault();
    history.replaceState(null, "", next === "register" ? "?mode=register" : window.location.pathname);
    setMode(next);
  });
}

// Til almashtirgich — landing va ilova bilan bir xil sozlama (jigar.prefs).
for (const btn of document.querySelectorAll(".lang [data-lang]")) {
  btn.setAttribute("aria-pressed", String(btn.dataset.lang === lang));
  btn.addEventListener("click", () => {
    if (btn.dataset.lang === lang) return;
    try {
      const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
      localStorage.setItem(PREFS_KEY, JSON.stringify({ ...prefs, lang: btn.dataset.lang }));
    } catch {
      // Saqlab bo'lmasa ham sahifa ishlayveradi.
    }
    window.location.reload();
  });
}

$("tabLogin").addEventListener("click", () => setMode("login"));
$("tabRegister").addEventListener("click", () => setMode("register"));
$("switchBtn").addEventListener("click", () => setMode(mode === "register" ? "login" : "register"));

// ---------- Robot formaga javob beradi ----------
$("name").addEventListener("input", () => {
  const name = $("name").value.trim().split(/\s+/)[0];
  if (name.length >= 2) say("say.name", { emotion: "excited", vars: { name } });
});
$("email").addEventListener("focus", () => {
  avatar.lookAt(0.4, 0.2);
  say("say.email", { emotion: "curious" });
});
$("password").addEventListener("focus", () => {
  avatar.lookAt(-1, -1); // boshqa tomonga qaraydi
  say("say.password", { emotion: "whisper" });
});
$("password").addEventListener("blur", () => avatar.lookAt(null));
$("email").addEventListener("blur", () => {
  avatar.lookAt(null);
  $("email").value = normalizeEmail($("email").value); // "ali" -> "ali@gmail.com" (ko'rinib tursin)
});

// Server bilan bir xil qoida (server/auth/store.js: normalizeEmail — asosiysi o'sha):
// "@" yo'q bo'lsa — "@gmail.com" qo'shiladi, gmail xatolari tuzatiladi, boshqa domen tegilmaydi.
const GMAIL_TYPOS = new Set(["gmail.ocm", "gmail.cmo", "gmail.co", "gmail.cm", "gmail.con", "gmail.om", "gmial.com", "gmal.com", "gamil.com", "gmaill.com", "gnail.com"]);
function normalizeEmail(value) {
  const clean = String(value ?? "").trim().toLowerCase();
  if (!clean.includes("@")) return /^[a-z0-9._+-]+$/.test(clean) ? `${clean}@gmail.com` : clean;
  const at = clean.lastIndexOf("@");
  return GMAIL_TYPOS.has(clean.slice(at + 1)) ? `${clean.slice(0, at)}@gmail.com` : clean;
}

$("peek").addEventListener("click", () => {
  const show = $("password").type === "password";
  $("password").type = show ? "text" : "password";
  $("peek").setAttribute("aria-pressed", String(show));
});

// ---------- Yuborish ----------
/** Brauzerda oldindan tekshirish (server ham tekshiradi). Qaytaradi: birinchi xato kaliti yoki "". */
function validate({ name, email, password }) {
  const checks = [
    ["name", mode === "register" && name.length < 2, "err.name"],
    ["email", !EMAIL_RE.test(email), "err.email"],
    ["password", password.length < MIN_PASSWORD, "err.password"],
  ];
  let first = "";
  for (const [id, bad, key] of checks) {
    $(id).setAttribute("aria-invalid", String(bad));
    if (bad && !first) first = key;
  }
  return first;
}

function resetSubmit() {
  $("submit").disabled = false;
  $("submit").textContent = t(mode === "register" ? "submit.register" : "submit.login");
}

$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("email").value = normalizeEmail($("email").value);
  const data = { name: $("name").value.trim(), email: $("email").value, password: $("password").value };
  const invalid = validate(data);
  if (invalid) {
    showError(t(invalid));
    say(invalid, { emotion: "sad" });
    return;
  }
  showError("");
  $("submit").disabled = true;
  $("submit").textContent = t("submit.wait");
  avatar.setState("thinking");
  try {
    // Ro'yxatdan o'tishda savollar javobi ham hisobga saqlanadi (boshqa qurilmada ham shu sozlamalar).
    const body = mode === "register"
      ? { ...data, profile: loadProfile() ?? undefined }
      : { email: data.email, password: data.password };
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    // Kod bo'lmasa (limit, server xatosi) — holat bo'yicha; matn tanlangan tilda chiqadi.
    const code = json.code ?? (res.status === 429 ? "rate" : res.status >= 500 ? "server" : undefined);
    if (!res.ok) throw Object.assign(new Error(json.error || ""), { code });
    avatar.setState("idle");
    say("say.success", { emotion: "happy" });
    setTimeout(() => window.location.assign(safeNext()), REDIRECT_MS);
  } catch (err) {
    avatar.setState("idle");
    const key = `err.${err.code}`;
    const message = DICT[lang][key] ? t(key) : err.message || t("err.network");
    showError(message);
    bubble.textContent = message;
    avatar.setEmotion("sad");
    resetSubmit();
  }
});

avatar.setPersona(loadProfile()?.persona);
render();
greet();

/** Savollar ochiq bo'lsa, robot savolga mos gapiradi — salomlashuv uni bosib ketmasin. */
function greet() {
  if (!$("onboard").hidden) return;
  say(mode === "register" ? "say.hello" : "say.welcomeBack", { emotion: "happy" });
}
