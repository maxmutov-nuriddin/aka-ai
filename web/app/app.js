import { iconSvg } from "../shared/icons.js";
import { parseAkaResponse, variantLetter, stripAudioTags } from "../shared/parse.js";
import { toSpeechText, toSpokenUzbek, toSpokenRussian, matchQuizAnswer } from "./speech.js";
import { createVoice } from "./voice.js";
import { createAvatar } from "../shared/avatar.js";
import { createCaption } from "./caption.js";
import { LANGS, getLang, t, setLang, translatePage } from "./i18n.js";
import { createBilling } from "./billing.js";

const host = window.JIGAR_HOST;
const $ = (id) => document.getElementById(id);

const el = {
  chat: $("chat"),
  empty: $("empty"),
  form: $("composer"),
  input: $("input"),
  send: $("send"),
  error: $("error"),
  newChat: $("newChat"),
  endLesson: $("endLesson"),
  pagePanel: $("pagePanel"),
  pageStatus: $("pageStatus"),
  pageChip: $("pageChip"),
  selectionBox: $("selectionBox"),
  selectionText: $("selectionText"),
  clearSelection: $("clearSelection"),
  mic: $("mic"),
  explain: $("explain"),
  typeToggle: $("typeToggle"),
  mute: $("mute"),
  voiceStatus: $("voiceStatus"),
  textRow: $("textRow"),
  emptyHint: $("emptyHint"),
  app: $("app"),
  modeToggle: $("modeToggle"),
  pageBtn: $("pageBtn"),
  pageBtnLabel: $("pageBtnLabel"),
  chatToggle: $("chatToggle"),
  chatClose: $("chatClose"),
  chatCount: $("chatCount"),
  quizSlot: $("quizSlot"),
  chatPanel: $("chatPanel"),
  settingsBtn: $("settingsBtn"),
  pauseBtn: $("pauseBtn"),
  settingsPop: $("settingsPop"),
  simpleToggle: $("simpleToggle"),
  stage: $("stage"),
};

const avatar = createAvatar($("avatar"));
const caption = createCaption($("caption"));

let state = freshState();

function freshState() {
  return {
    page: null, // suhbat boshida olingan sahifa (keyin o'zgarmaydi — kesh uchun)
    history: [], // [{role, content}]
    items: [], // xulosa uchun: [{savol, javob, quiz}]
    busy: false,
    finished: false,
    selection: "",
    pendingQuiz: null, // {quiz, answer(letter)} — ovoz bilan javob berish uchun
    lastInput: "voice", // "voice" | "text" — javobdan keyin yana tinglash kerakmi
  };
}

// ---------- Mermaid ----------
let mermaidCounter = 0;
const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
if (window.mermaid) {
  window.mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: prefersDark ? "dark" : "default" });
}

async function renderMermaid(container, code) {
  if (!window.mermaid) return showCode(container, code);
  try {
    const { svg } = await window.mermaid.render(`jigar-mmd-${++mermaidCounter}`, code);
    container.innerHTML = svg; // securityLevel: "strict" — mermaid o'zi tozalaydi
  } catch {
    showCode(container, code);
  }
}

function showCode(container, code) {
  const pre = document.createElement("pre");
  pre.className = "code";
  pre.textContent = code;
  container.replaceChildren(pre);
}

// ---------- Matnni xavfsiz chiqarish ----------
function renderRichText(text) {
  const frag = document.createDocumentFragment();
  const paragraphs = String(text).trim().split(/\n{2,}/);
  for (const para of paragraphs) {
    const p = document.createElement("p");
    const lines = para.split("\n");
    lines.forEach((line, i) => {
      appendInline(p, line);
      if (i < lines.length - 1) p.appendChild(document.createElement("br"));
    });
    frag.appendChild(p);
  }
  return frag;
}

function appendInline(parent, line) {
  // **qalin** va `kod` ni qo'llab-quvvatlaydi, qolgani oddiy matn.
  const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      const b = document.createElement("strong");
      b.textContent = part.slice(2, -2);
      parent.appendChild(b);
    } else if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      const c = document.createElement("code");
      c.textContent = part.slice(1, -1);
      parent.appendChild(c);
    } else {
      parent.appendChild(document.createTextNode(part));
    }
  }
}

function node(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

function scrollDown() {
  el.chat.scrollTop = el.chat.scrollHeight;
}

// ---------- Xabarlarni chizish ----------
function addUserBubble(text, selection) {
  el.empty.hidden = true;
  const b = node("div", "msg user");
  if (selection) b.appendChild(node("div", "quote", selection.length > 200 ? selection.slice(0, 200) + "…" : selection));
  b.appendChild(node("div", null, text || t("msg.explainPage")));
  el.chat.appendChild(b);
  scrollDown();
}

function addTyping() {
  const dots = node("div", "msg jigar typing");
  dots.append(node("span"), node("span"), node("span"));
  dots.setAttribute("aria-label", t("status.busy"));
  el.chat.appendChild(dots);
  scrollDown();
  return dots;
}

function addNotice(text, kind = "info") {
  const n = node("div", `notice ${kind}`, text);
  el.chat.appendChild(n);
  scrollDown();
}

/** Savol sahnaga qo'yiladi, lekin Jigar gapirib bo'lguncha yashirin turadi — gap yozuvi bilan to'qnashmaydi. */
function setQuiz(section) {
  el.quizSlot.replaceChildren(...(section ? [section] : []));
  el.quizSlot.hidden = true;
  el.stage.classList.remove("quiz-open");
}

function revealQuiz() {
  if (!el.quizSlot.hidden || !el.quizSlot.firstElementChild) return;
  el.quizSlot.hidden = false;
  el.stage.classList.add("quiz-open");
}

function addAkaCard(parsed, itemIndex) {
  const card = node("article", "msg jigar card");

  if (parsed.tushuntirish) {
    const sec = node("section", "sec explain");
    sec.appendChild(renderRichText(parsed.tushuntirish));
    card.appendChild(sec);
  }

  if (parsed.esdaQolsin) {
    const sec = node("section", "sec remember");
    sec.appendChild(node("h3", null, t("card.remember")));
    sec.appendChild(renderRichText(parsed.esdaQolsin));
    card.appendChild(sec);
  }

  if (parsed.vizual) {
    const sec = node("section", "sec visual");
    sec.appendChild(node("h3", null, t("card.diagram")));
    const box = node("div", "diagram");
    sec.appendChild(box);
    card.appendChild(sec);
    renderMermaid(box, parsed.vizual);
  }

  if (parsed.quiz) {
    // Savol sahnada — o'quvchi uni Jigar bilan yuzma-yuz yechadi; tarixda faqat eslatma.
    setQuiz(renderQuiz(parsed.quiz, itemIndex)); // Jigar gapirib bo'lgach ko'rinadi
    const ref = node("p", "quiz-ref");
    ref.append(node("strong", null, t("card.quizRef")), document.createTextNode(parsed.quiz.savol));
    card.appendChild(ref);
  }

  el.chat.appendChild(card);
  scrollDown();
}

function renderQuiz(quiz, itemIndex) {
  const sec = node("section", "sec quiz");
  sec.appendChild(node("h3", null, t("quiz.title")));
  sec.appendChild(node("p", "quiz-q", quiz.savol));
  const list = node("div", "options");
  const feedback = node("div", "quiz-feedback");
  feedback.hidden = true;

  const buttons = quiz.variantlar.map((v, i) => {
    const letter = variantLetter(v, i);
    const btn = node("button", "option", v);
    btn.type = "button";
    btn.dataset.letter = letter;
    btn.addEventListener("click", () => answerQuiz(letter, v));
    list.appendChild(btn);
    return btn;
  });

  function answerQuiz(letter, variantText) {
    if (state.busy || state.finished) return;
    if (buttons.some((b) => b.disabled)) return; // allaqachon javob berilgan
    if (state.pendingQuiz?.quiz === quiz) state.pendingQuiz = null;
    const correct = letter === quiz.togri;
    for (const b of buttons) {
      b.disabled = true;
      if (b.dataset.letter === quiz.togri) b.classList.add("right");
      if (b.dataset.letter === letter && !correct) b.classList.add("wrong");
    }
    hint.hidden = true;
    feedback.hidden = false;
    feedback.className = `quiz-feedback ${correct ? "ok" : "bad"}`;
    feedback.replaceChildren(
      node("strong", null, correct ? t("quiz.right") : t("quiz.wrong")),
      document.createTextNode(quiz.izoh || ""),
    );
    const item = state.items[itemIndex];
    if (item?.quiz) item.quiz.tanlangan = letter;
    // Jigar maqtaydi yoki ruhlantiradi va yangi savol beradi.
    sendMessage(`${t("quiz.answer")}${variantText}`, { fromQuiz: true });
  }

  state.pendingQuiz = {
    quiz,
    answer(letter) {
      const btn = buttons.find((b) => b.dataset.letter === letter);
      if (btn) answerQuiz(letter, btn.textContent);
    },
  };

  const hint = node("p", "quiz-hint", t("quiz.hint"));
  sec.append(list, feedback, hint);
  return sec;
}

// ---------- Tarmoq ----------
const authHeaders = () => host.authHeaders?.() ?? {};

/** Sessiya tugagan: veb — kirish sahifasiga, kengaytma — sozlamalardagi kirish oynasiga. */
function handleUnauthorized() {
  if (host.onUnauthorized) return host.onUnauthorized();
  window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
}

async function api(pathname, body) {
  await host.ready;
  const res = await fetch(`${host.apiBase}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error(t("err.authRequired"));
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* bo'sh javob */
  }
  if (!res.ok) throw new Error(serverErrorText(res.status, data));
  return data;
}

/** Server xatosi tanlangan tilda. Server matni o'zbekcha — ruschada kod/holat bo'yicha tarjima olinadi. */
function serverErrorText(status, data) {
  if (data?.code === "payment_required") billing.open(); // sinov tugagan — to'lov oynasi
  const byCode = { daily_limit: "err.dailyLimit", blocked: "err.blocked", payment_required: "err.paymentRequired" }[data?.code];
  if (byCode) return t(byCode);
  if (getLang() === "uz" && data?.error) return data.error;
  if (status === 429) return t("err.rateLimit");
  if (status === 413) return t("err.tooLarge");
  return t(status >= 500 ? "err.server" : "err.generic");
}

function setBusy(busy) {
  state.busy = busy;
  el.send.disabled = busy || state.finished;
  el.input.disabled = busy || state.finished;
  el.endLesson.disabled = busy || state.finished || state.items.length === 0;
  el.mic.disabled = busy || state.finished;
  el.explain.disabled = busy || state.finished;
  el.form.classList.toggle("busy", busy);
  renderVoiceStatus();
}

function showError(msg) {
  el.error.textContent = msg;
  el.error.hidden = !msg;
}

// ---------- Asosiy oqim ----------
async function ensurePage() {
  if (state.page) return state.page;
  const page = await host.getPage();
  // Kengaytma skrinshot ham yuboradi (Figma, rasm, diagramma — matnsiz sahifalarni Jigar ko'radi).
  const hasContent = page && (page.text?.trim() || page.title?.trim() || page.image);
  state.page = hasContent
    ? { title: page.title || "", url: page.url || "", text: page.text || "", ...(page.image ? { image: page.image } : {}) }
    : null;
  if (!state.selection && page?.selection) setSelection(page.selection);
  updatePageUi();
  return state.page;
}

function updatePageUi() {
  if (host.mode === "web") {
    const locked = state.history.length > 0;
    $("pageText").readOnly = locked;
    $("pageTitle").readOnly = locked;
    el.pageStatus.textContent = locked
      ? t("page.locked")
      : t("page.hint");
    const title = $("pageTitle").value.trim();
    const hasText = Boolean($("pageText").value.trim());
    el.pageBtnLabel.textContent = hasText ? title || t("page.done") : t("top.page");
  } else {
    el.pageBtn.hidden = true;
    const p = state.page;
    el.pageChip.hidden = !p;
    if (p) {
      // Belgi — brend ikonkasi (rasm yoki sahifa), matn — xavfsiz textContent.
      el.pageChip.innerHTML = iconSvg(p.image ? "image" : "page", 16);
      el.pageChip.append(` ${p.title || p.url || t("page.current")}`);
    }
  }
}

function setSelection(text) {
  state.selection = (text || "").trim();
  el.selectionBox.hidden = !state.selection;
  el.selectionText.textContent =
    state.selection.length > 160 ? state.selection.slice(0, 160) + "…" : state.selection;
}

async function sendMessage(text, { fromQuiz = false, fromVoice = false, heardAlt = "", pronunciation = null } = {}) {
  if (state.busy || state.finished) return;
  showError("");
  const message = (text ?? "").trim();
  setBusy(true);

  let page;
  try {
    page = await ensurePage();
  } catch (e) {
    setBusy(false);
    return showError(e.message || t("err.pageRead"));
  }
  if (!page && !message) {
    setBusy(false);
    return showError(
      host.mode === "web"
        ? t("err.needPageWeb")
        : t("err.needPageExt"),
    );
  }

  let selection = fromQuiz ? "" : state.selection;
  if (!fromQuiz && !selection && host.getSelection) {
    selection = ((await host.getSelection().catch(() => "")) || "").trim().slice(0, 4000);
  }
  addUserBubble(message, selection);
  state.history.push({ role: "user", content: message });
  if (!fromQuiz) setSelection("");
  if (!fromQuiz && !fromVoice) {
    el.input.value = "";
    autoGrow();
  }
  updatePageUi();
  const typing = addTyping();

  try {
    const data = await api("/api/chat", { page, history: state.history, selection, mode: prefs.mode, lang: prefs.lang, length: prefs.length, simple: prefs.simple, ...profileFields(), heardAlt, ...(pronunciation ? { pronunciation } : {}) });
    typing.remove();
    // Tarif: kunlik limit tugashiga oz qolganda oldindan ogohlantiramiz.
    renderUsage(data.dailyUsage);
    const left = data.dailyUsage?.remainingMinutes;
    if (typeof left === "number" && left <= 2) {
      showError(left === 0 ? t("err.dailyLimit") : t("err.minutesLeft").replace("{n}", left));
    }
    // Server ovozli xabarga ikkinchi tanish variantini qo'shgan bo'lishi mumkin — tarixga aynan o'shani yozamiz.
    if (typeof data.userContent === "string" && data.userContent) {
      state.history = [...state.history.slice(0, -1), { role: "user", content: data.userContent }];
    }
    state.history.push({ role: "assistant", content: data.text });
    const parsed = data.parsed ?? parseAkaResponse(data.text);
    // [laughs] kabi ovoz teglari faqat ovozga boradi, ekranda ko'rinmaydi.
    const shown = {
      ...parsed,
      tushuntirish: stripAudioTags(parsed.tushuntirish),
      esdaQolsin: stripAudioTags(parsed.esdaQolsin),
    };
    const itemIndex = state.items.length;
    state.items.push({
      savol: message || t("msg.explainPage"),
      javob: [shown.tushuntirish, shown.esdaQolsin].filter(Boolean).join(" ").slice(0, 1200),
      quiz: parsed.quiz ? { savol: parsed.quiz.savol, togri: parsed.quiz.togri, tanlangan: "" } : null,
    });
    if (data.pageTruncated && state.history.length === 2) {
      addNotice(t("notice.pageTruncated"));
    }
    state.pendingQuiz = null; // yangi kartada quiz bo'lsa, renderQuiz qayta o'rnatadi
    setQuiz(null);
    addAkaCard(shown, itemIndex);
    renderChatCount();
    if (data.truncated) addNotice(t("notice.answerTruncated"));
    speakReply(toSpeechText(parsed, prefs.lang), {
      listenAfter: state.lastInput === "voice",
      shownText: [shown.tushuntirish, shown.esdaQolsin && `Esda qolsin: ${shown.esdaQolsin}`].filter(Boolean).join("\n\n"),
    });
  } catch (e) {
    typing.remove();
    state.history.pop(); // muvaffaqiyatsiz xabarni tarixdan olib tashlaymiz
    el.chat.lastElementChild?.classList.contains("user") && el.chat.lastElementChild.remove();
    if (!fromQuiz && !fromVoice) el.input.value = message;
    showError(e.message || t("err.generic"));
  } finally {
    setBusy(false);
    if (!fromQuiz && !fromVoice && !el.textRow.hidden) el.input.focus();
  }
}

async function endLesson() {
  if (state.busy || state.finished || state.items.length === 0) return;
  showError("");
  setBusy(true);
  const typing = addTyping();
  try {
    const data = await api("/api/summary", { pageTitle: state.page?.title || "", items: state.items, mode: prefs.mode, lang: prefs.lang, simple: prefs.simple, ...profileFields() });
    typing.remove();
    const card = node("article", "msg jigar card summary");
    card.appendChild(node("h3", null, t("card.summary")));
    card.appendChild(renderRichText(stripAudioTags(data.text)));
    el.chat.appendChild(card);
    speakReply(prefs.lang === "ru" ? toSpokenRussian(data.text) : toSpokenUzbek(data.text), { listenAfter: false, shownText: stripAudioTags(data.text) });
    state.finished = true;
    addNotice(t("notice.lessonEnd"));
  } catch (e) {
    typing.remove();
    showError(e.message || t("err.summary"));
  } finally {
    setBusy(false);
  }
}

function resetChat() {
  if (state.busy) return;
  voice.stopAll();
  state = freshState();
  el.chat.replaceChildren(el.empty);
  el.empty.hidden = false;
  showError("");
  setSelection("");
  if (host.mode === "web") {
    $("pageText").readOnly = false;
    $("pageTitle").readOnly = false;
  }
  setQuiz(null);
  caption.reset();
  avatar.setEmotion(null);
  updatePageUi();
  setBusy(false);
  host.onReset?.();
}

function autoGrow() {
  el.input.style.height = "auto";
  el.input.style.height = Math.min(el.input.scrollHeight, 160) + "px";
}

// ---------- Ovoz: asosiy rejim ----------
const PREFS_KEY = "jigar.prefs";
const LEGACY_PREFS_KEY = "aka.prefs"; // eski nom — saqlangan sozlamalar yo'qolmasin
const MODES = { normal: "oddiy", wild: "beparvo" };
// Asosiy qism — Jigar; suhbat tarixi ikkinchi darajali, har safar yopiq holda ochiladi.
const LENGTHS = ["qisqa", "odatiy", "batafsil"];
// Standart: qisqa va sodda — javob cho'zilmasin, oddiy so'zlar bilan bo'lsin.
const DEFAULT_PREFS = {
  typing: false, muted: false, mode: MODES.normal, lang: "uz", length: "qisqa", simple: true, chatOpen: false,
};
const HOLD_MS = 350; // shundan uzoq bosib turilsa — qo'yib yuborganda yuboriladi

// Ovoz tugmasi ikonkalari (index.html dagi .ic uslubida).
const ICON_SOUND = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
const ICON_MUTED = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 6M21 9l-5 6"/></svg>';
const ICON_KEYBOARD = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9"/></svg>';
const ICON_CLOSE = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const PROFILE_KEY = "jigar.profile"; // ro'yxatdan o'tishdagi savollar javobi (web/auth/onboarding.js)
const SIMPLE_LEVELS = ["5-7", "8-9"];

let prefs = loadPrefs();
let voiceState = "idle";
let paused = false; // o'quvchi "Pauza" bosgan — Jigar o'zi qayta tinglamaydi

/** Ro'yxatdan o'tishda tanlangan uslub. Sozlamalar oynasi yo'q — shu javoblar ustun. */
function profilePrefs() {
  try {
    const profile = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
    if (!profile) return {};
    return {
      ...(LANGS.includes(profile.lang) ? { lang: profile.lang } : {}),
      length: LENGTHS.includes(profile.length) ? profile.length : "odatiy",
      simple: profile.length === "qisqa" || SIMPLE_LEVELS.includes(profile.level),
      goal: profile.goal || null, // misollar maqsadga mos (serverda "O'QUVCHI PROFILI")
      level: profile.level || null, // murakkablik sinfga mos
      // Jahldor + Talaba = "beparvo" (so'kinadigan, baqiradigan) rejim — faqat kattalar uchun.
      // Maktab o'quvchisi uchun Jahldor — so'kinmaydigan qattiqqo'l ustoz (serverda ham tekshiriladi).
      mode: profile.persona === "jahldor" && profile.level === "student" ? MODES.wild : MODES.normal,
      persona: profile.persona || null, // robot yuzi va javob uslubi shu xarakterda
    };
  } catch {
    return {};
  }
}

/** So'rovga qo'shiladigan profil maydonlari (bo'sh bo'lsa yuborilmaydi). */
function profileFields() {
  return {
    persona: prefs.persona ?? undefined,
    goal: prefs.goal ?? undefined,
    level: prefs.level ?? undefined,
  };
}

function loadPrefs() {
  try {
    const saved = { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || localStorage.getItem(LEGACY_PREFS_KEY) || "{}") };
    const knownMode = Object.values(MODES).includes(saved.mode);
    const lang = LANGS.includes(saved.lang) ? saved.lang : DEFAULT_PREFS.lang;
    const length = LENGTHS.includes(saved.length) ? saved.length : DEFAULT_PREFS.length;
    const simple = typeof saved.simple === "boolean" ? saved.simple : DEFAULT_PREFS.simple;
    return { ...saved, mode: knownMode ? saved.mode : MODES.normal, lang, length, simple, chatOpen: DEFAULT_PREFS.chatOpen, ...profilePrefs() };
  } catch {
    return { ...DEFAULT_PREFS, ...profilePrefs() };
  }
}

function updatePrefs(patch) {
  prefs = { ...prefs, ...patch };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* saqlab bo'lmasa ham ishlayveradi */
  }
  renderPrefs();
}

const voice = createVoice({
  ttsUrl: () => `${host.apiBase}/api/tts`,
  authHeaders,
  sttUrl: () => `${host.apiBase}/api/stt`,
  onState(next) {
    voiceState = next;
    if (next !== "speaking") caption.done();
    el.mic.classList.toggle("listening", next === "listening");
    el.mic.classList.toggle("speaking", next === "speaking");
    el.mic.classList.toggle("transcribing", next === "transcribing");
    el.mic.setAttribute("aria-label", next === "listening" ? t("mic.stop") : t("mic.speak"));
    renderVoiceStatus();
  },
  onInterim(text) {
    if (text) setVoiceStatus(text, true);
  },
  onFinal: handleSpoken,
  onLevel: (level) => avatar.setLevel(level),
  onCaption: (c) => caption.follow(c),
  onEmotion: (emotion) => avatar.setEmotion(emotion),
  onError(kind, message) {
    if (kind !== "denied") return showError(t(message));
    if (host.requestMicPermission) {
      showError(t("err.micNeedPermission"));
      host.requestMicPermission();
    } else {
      showError(t("err.micDeniedHint"));
    }
  },
});

function setVoiceStatus(text, live = false) {
  el.voiceStatus.textContent = text;
  el.voiceStatus.classList.toggle("live", live);
}

/** Personaj holati: o'ylayotganda — "thinking", aks holda ovoz holati. */
function renderAvatar() {
  const thinking = state.busy || voiceState === "transcribing";
  avatar.setState(thinking ? "thinking" : voiceState);
}

/** Pauza faqat suhbat ketayotganda (yoki pauzadan qaytish uchun) kerak — jim boshlang'ich holatda yashirin. */
function renderPauseBtn() {
  const started = state.items.length > 0 || state.busy || voiceState !== "idle";
  el.pauseBtn.hidden = state.finished || !(started || paused);
}

function renderVoiceStatus() {
  renderAvatar();
  renderPauseBtn();
  if (!state.busy && voiceState !== "speaking") revealQuiz();
  if (!voice.supported.listen) return setVoiceStatus(t("status.unsupported"));
  if (state.busy) return setVoiceStatus(t("status.busy"));
  if (paused && voiceState === "idle") {
    return setVoiceStatus(prefs.lang === "ru" ? "Пауза — нажми ▶, чтобы продолжить" : "Pauza — davom etish uchun ▶ ni bos");
  }
  if (voiceState === "idle" && voice.pushToTalk) return setVoiceStatus(t("status.idlePushToTalk"));
  setVoiceStatus(t(`status.${voiceState}`));
}

function renderPrefs() {
  setLang(prefs.lang);
  translatePage();
  for (const btn of document.querySelectorAll(".lang-switch [data-lang]")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.lang === prefs.lang));
  }
  // Ovoz xarakterga va o'quvchi yoshiga (sinf) mos.
  voice.setStyle({
    mode: prefs.mode, lang: prefs.lang, persona: prefs.persona ?? null, level: prefs.level ?? null,
    pronunciation: prefs.goal === "language", // til o'rganish: server tinglaydi va talaffuzni baholaydi
  });
  for (const btn of el.settingsPop.querySelectorAll("[data-length]")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.length === prefs.length));
  }
  el.simpleToggle.checked = prefs.simple;
  el.send.textContent = el.input.value.trim() ? t("btn.send") : t("btn.explain");
  const typing = prefs.typing || !voice.supported.listen;
  el.textRow.hidden = !typing;
  el.typeToggle.setAttribute("aria-expanded", String(typing));
  el.typeToggle.lastElementChild.textContent = typing ? t("btn.close") : t("btn.type");
  el.typeToggle.firstElementChild.outerHTML = typing ? ICON_CLOSE : ICON_KEYBOARD; // statik SVG
  el.mute.innerHTML = prefs.muted ? ICON_MUTED : ICON_SOUND; // statik SVG
  el.mute.setAttribute("aria-pressed", String(prefs.muted));
  el.mute.title = prefs.muted ? t("mute.on") : t("mute.off");
  el.app.dataset.chat = prefs.chatOpen ? "open" : "closed";
  el.chatPanel.inert = !prefs.chatOpen;
  el.chatToggle.setAttribute("aria-expanded", String(prefs.chatOpen));
  renderChatCount();
  const wild = prefs.mode === MODES.wild;
  el.modeToggle.setAttribute("aria-pressed", String(wild));
  el.app.dataset.mode = prefs.mode;
  avatar.setMode(prefs.mode);
  avatar.setPersona(prefs.persona);
  renderPersonaTag();
}

// Sarlavhada tanlangan xarakter (ranglar web/auth/onboarding.js va shared/avatar.css bilan bir xil).
const PERSONA_INFO = {
  neytral: { color: "#2ee6c8", uz: ["Neytral", "xotirjam va lo'nda"], ru: ["Нейтральный", "спокойно и по делу"] },
  mehribon: { color: "#4da3ff", uz: ["Mehribon", "qo'llab-quvvatlaydi"], ru: ["Добрый", "всегда поддержит"] },
  kinoyali: { color: "#b46bff", uz: ["Kinoyali", "kesatadi, lekin o'rinli"], ru: ["Ироничный", "подколет по делу"] },
  jahldor: { color: "#ff8a3d", uz: ["Jahldor", "xatoni kechirmaydi"], ru: ["Строгий", "ошибок не прощает"] },
  romantik: { color: "#ff5fa2", uz: ["Romantik", "iltifot qiladi"], ru: ["Романтик", "делает комплименты"] },
};

function renderPersonaTag() {
  const info = PERSONA_INFO[prefs.persona];
  const brand = document.querySelector(".brand");
  $("tagline").hidden = Boolean(info);
  $("personaTag").hidden = !info;
  // Fon ham xarakter rangida (styles.css: .app::after).
  if (info) el.app.style.setProperty("--app-tint", info.color);
  else el.app.style.removeProperty("--app-tint");
  if (!info) {
    delete brand.dataset.persona;
    return;
  }
  const [name, hint] = info[prefs.lang === "ru" ? "ru" : "uz"];
  brand.dataset.persona = prefs.persona;
  brand.style.setProperty("--persona", info.color);
  $("personaName").textContent = name;
  $("personaHint").textContent = hint;
}

function handleSpoken(text, heardAlt = "", pronunciation = null) {
  state.lastInput = "voice";
  const quiz = state.pendingQuiz?.quiz;
  const letter = matchQuizAnswer(text, quiz, variantLetter) || (heardAlt && matchQuizAnswer(heardAlt, quiz, variantLetter));
  if (letter) return state.pendingQuiz.answer(letter);
  sendMessage(text, { fromVoice: true, heardAlt, pronunciation });
}

/**
 * Javobni o'qiydi. Brauzer tanishida o'quvchi ovoz bilan gaplashayotgan bo'lsa, keyin yana tinglaydi.
 * Bosib turib gapirish rejimida o'quvchi o'zi bosadi — avtomatik tinglash yo'q.
 */
function speakReply(text, { listenAfter, shownText }) {
  const listenAgain = () => {
    const auto = listenAfter && !voice.pushToTalk && voice.supported.listen;
    if (auto && !paused && !state.busy && !state.finished) voice.listen();
  };
  // Ovoz o'chiq — javob sahnada yozuv bo'lib turadi. Yoqiq — yozuv ovoz bilan birga chiqadi.
  if (prefs.muted || !voice.supported.speak) {
    caption.showStatic(shownText);
    return listenAgain();
  }
  voice.speak(text, { onDone: listenAgain });
}

function renderChatCount() {
  const count = state.items.length;
  el.chatCount.textContent = String(count);
  el.chatCount.hidden = count === 0 || prefs.chatOpen;
}

// Bosish = gapirishni boshlash (Jigar gapirayotgan bo'lsa, uni to'xtatadi).
// Bosib turib qo'yib yuborish = yuborish. Qisqa bosish = qayta bosguncha tinglash.
let pressStartedAt = 0;

function pressStart() {
  if (state.busy || state.finished) return;
  showError("");
  if (paused) setPaused(false); // mikrofonni o'zi bosdi — pauza tugadi
  if (voice.listening) return voice.stopListening();
  pressStartedAt = Date.now();
  voice.listen();
}

function pressEnd() {
  if (!pressStartedAt) return;
  const held = Date.now() - pressStartedAt;
  pressStartedAt = 0;
  if (held >= HOLD_MS && voice.listening) voice.stopListening();
}

function isTypingTarget(target) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

el.mic.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  el.mic.setPointerCapture?.(e.pointerId);
  pressStart();
});
el.mic.addEventListener("pointerup", pressEnd);
el.mic.addEventListener("pointercancel", pressEnd);
el.mic.addEventListener("click", (e) => {
  if (e.detail === 0) pressStart(); // klaviatura (Enter) — sichqoncha bosishi pointerdown'da
});
document.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat || isTypingTarget(e.target) || el.mic.hidden) return;
  e.preventDefault();
  pressStart();
});
document.addEventListener("keyup", (e) => {
  if (e.code !== "Space" || isTypingTarget(e.target)) return;
  pressEnd();
});
el.explain.addEventListener("click", () => {
  state.lastInput = "voice";
  voice.stopAll();
  sendMessage("", { fromVoice: true });
});
// Pauza: suhbat jonli davom etadi, lekin kerak bo'lmaganda to'xtatib qo'yish mumkin.
function setPaused(next) {
  paused = next;
  const ru = prefs.lang === "ru";
  el.pauseBtn.setAttribute("aria-pressed", String(paused));
  el.pauseBtn.firstElementChild.textContent = paused ? "▶" : "⏸";
  const label = paused ? (ru ? "Продолжить" : "Davom etish") : (ru ? "Пауза" : "Pauza");
  el.pauseBtn.lastElementChild.textContent = label;
  renderVoiceStatus();
}
el.pauseBtn.addEventListener("click", () => {
  if (paused) {
    setPaused(false);
    if (!state.busy && !state.finished && voice.supported.listen) voice.listen();
    return;
  }
  voice.stopAll(); // tinglash ham, gapirish ham to'xtaydi
  setPaused(true);
});

el.typeToggle.addEventListener("click", () => {
  updatePrefs({ typing: !prefs.typing });
  if (!el.textRow.hidden) el.input.focus();
});
// ---------- Sozlamalar oynasi (⚙): javob uzunligi va sodda tushuntirish ----------
function setSettingsOpen(open) {
  el.settingsPop.hidden = !open;
  el.settingsBtn.setAttribute("aria-expanded", String(open));
}
el.settingsBtn.addEventListener("click", () => setSettingsOpen(el.settingsPop.hidden));
document.addEventListener("pointerdown", (e) => {
  if (!el.settingsPop.hidden && !e.target.closest(".settings")) setSettingsOpen(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !el.settingsPop.hidden) setSettingsOpen(false);
});
for (const btn of el.settingsPop.querySelectorAll("[data-length]")) {
  btn.addEventListener("click", () => updatePrefs({ length: btn.dataset.length }));
}
el.simpleToggle.addEventListener("change", () => updatePrefs({ simple: el.simpleToggle.checked }));

$("nameForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("accountNameInput");
  const name = input.value.trim();
  try {
    const res = await fetch(`${host.apiBase}/api/auth/name`, {
      method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Ismni saqlab bo'lmadi.");
    $("accountName").textContent = data.user.name;
    input.value = data.user.name;
  } catch (err) {
    input.setCustomValidity(err.message);
    input.reportValidity();
    input.setCustomValidity("");
  }
});

// ---------- Support ----------
// Ovoz xizmati, xarakter, sinf va foydalanuvchilar — Support panelida (/admin).
// Ilovada support faqat panelga havolani ko'radi.
function renderSupport(user) {
  const isSupport = user?.role === "support";
  for (const node of el.settingsPop.querySelectorAll(".support-only")) node.hidden = !isSupport;
  const link = el.settingsPop.querySelector(".admin-link");
  if (link) link.href = `${host.apiBase}/admin`; // kengaytmada ham server manziliga ochiladi
}

// ---------- Obuna (PayGate) ----------
const billing = createBilling({ apiBase: () => host.apiBase, authHeaders });

// ---------- Hisob: kim kirgan va chiqish ----------
async function loadAccount() {
  await host.ready;
  try {
    const res = await fetch(`${host.apiBase}/api/auth/me`, { headers: authHeaders() });
    if (res.status === 401) return handleUnauthorized();
    if (!res.ok) return;
    const { user } = await res.json();
    $("accountName").textContent = user.name;
    $("accountNameInput").value = user.name;
    $("accountEmail").textContent = user.email;
    syncServerProfile(user.profile);
    renderSupport(user);
    billing.refresh();
    loadUsage();
  } catch {
    /* tarmoq bo'lmasa — hisob qatori bo'sh qoladi, ilova ishlayveradi */
  }
}

// ---------- Tarif: bugungi suhbat vaqti ----------
/** Sarlavhadagi taymer: "2.5 / 12 daq". Support (limit yo'q) — yashirin. */
function renderUsage(u) {
  if (!u) return;
  const tag = $("usageTag");
  tag.hidden = u.limitMinutes == null;
  if (tag.hidden) return;
  $("usageText").textContent = `${u.usedMinutes} / ${u.limitMinutes} ${t("usage.min")}`;
  tag.classList.toggle("low", u.remainingMinutes <= 2);
}

async function loadUsage() {
  try {
    const res = await fetch(`${host.apiBase}/api/usage`, { headers: authHeaders() });
    if (res.ok) renderUsage(await res.json());
  } catch {
    /* tarmoq bo'lmasa — taymer ko'rinmaydi */
  }
}

/** Hisobdagi profil (ro'yxatdan o'tishda saqlangan) — boshqa qurilmada ham shu sozlamalar ishlaydi. */
function syncServerProfile(profile) {
  if (!profile || typeof profile !== "object") return;
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    /* saqlab bo'lmasa ham shu sahifada qo'llanadi */
  }
  updatePrefs(profilePrefs());
}

$("logoutBtn").addEventListener("click", async () => {
  voice.stopAll();
  try {
    await fetch(`${host.apiBase}/api/auth/logout`, { method: "POST", headers: authHeaders() });
  } finally {
    if (host.logout) host.logout();
    else window.location.href = "/";
  }
});
setTimeout(loadAccount, 0);

el.chatToggle.addEventListener("click", () => updatePrefs({ chatOpen: !prefs.chatOpen }));
el.chatClose.addEventListener("click", () => updatePrefs({ chatOpen: false }));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && prefs.chatOpen) updatePrefs({ chatOpen: false });
});
el.pageBtn.addEventListener("click", () => el.pagePanel.showModal());
el.pagePanel.addEventListener("close", updatePageUi);
el.modeToggle.addEventListener("click", () => {
  const wild = prefs.mode !== MODES.wild;
  updatePrefs({ mode: wild ? MODES.wild : MODES.normal });
  addNotice(wild ? t("notice.wildOn") : t("notice.wildOff"));
});
for (const btn of document.querySelectorAll(".lang-switch [data-lang]")) {
  btn.addEventListener("click", () => {
    if (btn.dataset.lang === prefs.lang || state.busy) return;
    voice.stopAll();
    updatePrefs({ lang: btn.dataset.lang });
    updatePageUi();
    renderVoiceStatus();
    if (state.history.length > 0) addNotice(t("notice.lang"));
  });
}
el.mute.addEventListener("click", () => {
  if (!prefs.muted) voice.stopSpeaking();
  updatePrefs({ muted: !prefs.muted });
});

if (!voice.supported.listen) {
  el.mic.hidden = true;
  el.typeToggle.hidden = true;
  $("helloText").dataset.i18n = "hello.unsupported";
}
renderPrefs();

/** Serverda ElevenLabs bo'lsa — bosib turib gapirish va server tanishi. */
async function loadVoiceConfig() {
  try {
    const res = await fetch(`${host.apiBase}/api/voice-config`);
    if (!res.ok) return;
    const config = await res.json();
    // Brauzer tanishi bo'lsa — u (aniqroq); server tanishi faqat brauzerda yo'q bo'lsa yoki AKA_STT=elevenlabs.
    voice.useServerStt(config.stt && (config.preferServerStt || !voice.hasBrowserRecognition), config.stt);
    // Chrome tinglaganda Scribe ham eshitadi — Jigar ikkala variantdan to'g'ri savolni tiklaydi.
    voice.useDoubleCheck(config.doubleCheck && !voice.pushToTalk);
  } catch {
    /* server javob bermasa, brauzer tanishi bilan qolamiz */
  }
  if (voice.supported.listen) {
    el.mic.hidden = false;
    el.typeToggle.hidden = false;
  }
  renderPrefs();
  renderVoiceStatus();
}
// Kengaytmada apiBase sozlamalardan biroz kechroq o'qiladi.
setTimeout(loadVoiceConfig, 0);

// ---------- Yozish: qo'shimcha rejim ----------
function submitTyped() {
  state.lastInput = "text";
  voice.stopAll();
  sendMessage(el.input.value);
}

el.form.addEventListener("submit", (e) => {
  e.preventDefault();
  submitTyped();
});
el.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    submitTyped();
  }
});
el.input.addEventListener("input", () => {
  autoGrow();
  el.send.textContent = el.input.value.trim() ? t("btn.send") : t("btn.explain");
});
el.newChat.addEventListener("click", resetChat);
el.endLesson.addEventListener("click", endLesson);
el.clearSelection.addEventListener("click", () => setSelection(""));

// Kengaytmada boshqa sahifaga o'tilsa, yangi suhbat
host.onPageChange?.(() => {
  if (state.history.length > 0 && !state.busy) {
    resetChat();
    addNotice(t("notice.newPage"));
  }
});

updatePageUi();
setBusy(false);
