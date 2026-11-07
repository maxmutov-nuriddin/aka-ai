import { parseAkaResponse, variantLetter } from "./parse.js";

const host = window.AKA_HOST;
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
};

let state = freshState();

function freshState() {
  return {
    page: null, // suhbat boshida olingan sahifa (keyin o'zgarmaydi — kesh uchun)
    history: [], // [{role, content}]
    items: [], // xulosa uchun: [{savol, javob, quiz}]
    busy: false,
    finished: false,
    selection: "",
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
    const { svg } = await window.mermaid.render(`aka-mmd-${++mermaidCounter}`, code);
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
  b.appendChild(node("div", null, text || "Shu sahifani tushuntirib ber."));
  el.chat.appendChild(b);
  scrollDown();
}

function addTyping() {
  const t = node("div", "msg aka typing");
  t.append(node("span"), node("span"), node("span"));
  t.setAttribute("aria-label", "Aka yozyapti");
  el.chat.appendChild(t);
  scrollDown();
  return t;
}

function addNotice(text, kind = "info") {
  const n = node("div", `notice ${kind}`, text);
  el.chat.appendChild(n);
  scrollDown();
}

function addAkaCard(parsed, itemIndex) {
  const card = node("article", "msg aka card");

  if (parsed.tushuntirish) {
    const sec = node("section", "sec explain");
    sec.appendChild(renderRichText(parsed.tushuntirish));
    card.appendChild(sec);
  }

  if (parsed.esdaQolsin) {
    const sec = node("section", "sec remember");
    sec.appendChild(node("h3", null, "Esda qolsin"));
    sec.appendChild(renderRichText(parsed.esdaQolsin));
    card.appendChild(sec);
  }

  if (parsed.vizual) {
    const sec = node("section", "sec visual");
    sec.appendChild(node("h3", null, "Chizma"));
    const box = node("div", "diagram");
    sec.appendChild(box);
    card.appendChild(sec);
    renderMermaid(box, parsed.vizual);
  }

  if (parsed.quiz) {
    card.appendChild(renderQuiz(parsed.quiz, itemIndex));
  }

  el.chat.appendChild(card);
  scrollDown();
}

function renderQuiz(quiz, itemIndex) {
  const sec = node("section", "sec quiz");
  sec.appendChild(node("h3", null, "Quiz"));
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
    const correct = letter === quiz.togri;
    for (const b of buttons) {
      b.disabled = true;
      if (b.dataset.letter === quiz.togri) b.classList.add("right");
      if (b.dataset.letter === letter && !correct) b.classList.add("wrong");
    }
    feedback.hidden = false;
    feedback.className = `quiz-feedback ${correct ? "ok" : "bad"}`;
    feedback.replaceChildren(
      node("strong", null, correct ? "To'g'ri! " : "Xato. "),
      document.createTextNode(quiz.izoh || ""),
    );
    const item = state.items[itemIndex];
    if (item?.quiz) item.quiz.tanlangan = letter;
    // Aka maqtaydi yoki ruhlantiradi va yangi savol beradi.
    sendMessage(`Quizga javobim: ${variantText}`, { fromQuiz: true });
  }

  sec.append(list, feedback);
  return sec;
}

// ---------- Tarmoq ----------
async function api(pathname, body) {
  const res = await fetch(`${host.apiBase}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* bo'sh javob */
  }
  if (!res.ok) throw new Error(data?.error || `Server xatosi (${res.status})`);
  return data;
}

function setBusy(busy) {
  state.busy = busy;
  el.send.disabled = busy || state.finished;
  el.input.disabled = busy || state.finished;
  el.endLesson.disabled = busy || state.finished || state.items.length === 0;
  el.form.classList.toggle("busy", busy);
}

function showError(msg) {
  el.error.textContent = msg;
  el.error.hidden = !msg;
}

// ---------- Asosiy oqim ----------
async function ensurePage() {
  if (state.page) return state.page;
  const page = await host.getPage();
  const hasText = page && (page.text?.trim() || page.title?.trim());
  state.page = hasText ? { title: page.title || "", url: page.url || "", text: page.text || "" } : null;
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
      ? "— suhbat shu sahifa bo'yicha (o'zgartirish uchun yangi suhbat boshla)"
      : "— matnni shu yerga qo'y";
    if (locked) el.pagePanel.open = false;
  } else {
    el.pagePanel.hidden = true;
    const p = state.page;
    el.pageChip.hidden = !p;
    if (p) el.pageChip.textContent = `📄 ${p.title || p.url || "Joriy sahifa"}`;
  }
}

function setSelection(text) {
  state.selection = (text || "").trim();
  el.selectionBox.hidden = !state.selection;
  el.selectionText.textContent =
    state.selection.length > 160 ? state.selection.slice(0, 160) + "…" : state.selection;
}

async function sendMessage(text, { fromQuiz = false } = {}) {
  if (state.busy || state.finished) return;
  showError("");
  const message = (text ?? "").trim();
  setBusy(true);

  let page;
  try {
    page = await ensurePage();
  } catch (e) {
    setBusy(false);
    return showError(e.message || "Sahifani o'qib bo'lmadi.");
  }
  if (!page && !message) {
    setBusy(false);
    return showError(
      host.mode === "web"
        ? "Avval sahifa matnini qo'y yoki savol yoz."
        : "Bu sahifadan matn olib bo'lmadi. Savolingni yozib ko'r.",
    );
  }

  let selection = fromQuiz ? "" : state.selection;
  if (!fromQuiz && !selection && host.getSelection) {
    selection = ((await host.getSelection().catch(() => "")) || "").trim().slice(0, 4000);
  }
  addUserBubble(message, selection);
  state.history.push({ role: "user", content: message });
  if (!fromQuiz) {
    el.input.value = "";
    autoGrow();
    setSelection("");
  }
  updatePageUi();
  const typing = addTyping();

  try {
    const data = await api("/api/chat", { page, history: state.history, selection });
    typing.remove();
    state.history.push({ role: "assistant", content: data.text });
    const parsed = data.parsed ?? parseAkaResponse(data.text);
    const itemIndex = state.items.length;
    state.items.push({
      savol: message || "Sahifani tushuntirib ber",
      javob: [parsed.tushuntirish, parsed.esdaQolsin].filter(Boolean).join(" ").slice(0, 1200),
      quiz: parsed.quiz ? { savol: parsed.quiz.savol, togri: parsed.quiz.togri, tanlangan: "" } : null,
    });
    if (data.pageTruncated && state.history.length === 2) {
      addNotice("Sahifa juda uzun ekan, Aka faqat uning boshlang'ich qismini o'qidi.");
    }
    addAkaCard(parsed, itemIndex);
    if (data.truncated) addNotice("Javob oxirigacha sig'madi. \"Davom et\" deb yozib ko'r.");
  } catch (e) {
    typing.remove();
    state.history.pop(); // muvaffaqiyatsiz xabarni tarixdan olib tashlaymiz
    el.chat.lastElementChild?.classList.contains("user") && el.chat.lastElementChild.remove();
    if (!fromQuiz) el.input.value = message;
    showError(e.message || "Xato yuz berdi.");
  } finally {
    setBusy(false);
    if (!fromQuiz) el.input.focus();
  }
}

async function endLesson() {
  if (state.busy || state.finished || state.items.length === 0) return;
  showError("");
  setBusy(true);
  const typing = addTyping();
  try {
    const data = await api("/api/summary", { pageTitle: state.page?.title || "", items: state.items });
    typing.remove();
    const card = node("article", "msg aka card summary");
    card.appendChild(node("h3", null, "Bugungi dars xulosasi"));
    card.appendChild(renderRichText(data.text));
    el.chat.appendChild(card);
    state.finished = true;
    addNotice("Dars tugadi. Yangi dars uchun \"Yangi suhbat\" tugmasini bos.");
  } catch (e) {
    typing.remove();
    showError(e.message || "Xulosani olib bo'lmadi.");
  } finally {
    setBusy(false);
  }
}

function resetChat() {
  if (state.busy) return;
  state = freshState();
  el.chat.replaceChildren(el.empty);
  el.empty.hidden = false;
  showError("");
  setSelection("");
  if (host.mode === "web") {
    $("pageText").readOnly = false;
    $("pageTitle").readOnly = false;
    el.pagePanel.open = true;
  }
  updatePageUi();
  setBusy(false);
  host.onReset?.();
}

function autoGrow() {
  el.input.style.height = "auto";
  el.input.style.height = Math.min(el.input.scrollHeight, 160) + "px";
}

el.form.addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage(el.input.value);
});
el.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    sendMessage(el.input.value);
  }
});
el.input.addEventListener("input", () => {
  autoGrow();
  el.send.textContent = el.input.value.trim() ? "Yuborish" : "Tushuntir";
});
el.newChat.addEventListener("click", resetChat);
el.endLesson.addEventListener("click", endLesson);
el.clearSelection.addEventListener("click", () => setSelection(""));

// Kengaytmada boshqa sahifaga o'tilsa, yangi suhbat
host.onPageChange?.(() => {
  if (state.history.length > 0 && !state.busy) {
    resetChat();
    addNotice("Yangi sahifa ochildi — yangi suhbat boshlandi.");
  }
});

updatePageUi();
setBusy(false);
