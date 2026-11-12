// Support paneli: umumiy yorliqlar, formatlash, API, bildirishnoma va tasdiqlash oynasi.

export const GOALS = { curious: "Qiziqish", study: "Maktab darslari", exam: "Imtihon (DTM)", olympiad: "Olimpiada", university: "Universitet", language: "Til o'rganish", interview: "Suhbatga tayyorgarlik" };
export const PERSONAS = { neytral: "Neytral", mehribon: "Mehribon", kinoyali: "Kinoyali", jahldor: "Jahldor", romantik: "Romantik" };
export const LEVELS = { "5-7": "5–7 sinf", "8-9": "8–9 sinf", "10-11": "10–11 sinf", student: "Talaba" };
export const PROVIDERS = { fishaudio: "Fish Audio", elevenlabs: "ElevenLabs", gemini: "Gemini TTS", openai: "OpenAI TTS", omnivoice: "OmniVoice" };
export const LLMS = { claude: "Claude", haiku: "Haiku", gemini: "Gemini", openai: "OpenAI" };

const TOAST_MS = 2800;
const DAY_MS = 86_400_000;
const numberFmt = new Intl.NumberFormat("ru-RU");

export const $ = (id) => document.getElementById(id);
export const som = (n) => `${numberFmt.format(Math.round(n))} so'm`;
export const num = (n) => numberFmt.format(Math.round(n * 10) / 10);
export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Ism bosh harflari (avatar uchun). */
export const initials = (name) =>
  String(name ?? "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

/** "YYYY-MM-DD" -> "bugun" / "kecha" / "3 kun oldin" / "—". */
export function relativeDay(day, today) {
  if (!day) return "—";
  const diff = Math.round((Date.parse(today) - Date.parse(day)) / DAY_MS);
  if (diff <= 0) return "bugun";
  if (diff === 1) return "kecha";
  return `${diff} kun oldin`;
}

/** SQLite "YYYY-MM-DD HH:MM:SS" (UTC) -> mahalliy sana. */
export const formatDate = (sqlTime) => (sqlTime ? new Date(`${sqlTime.replace(" ", "T")}Z`).toLocaleDateString("ru-RU") : "—");

/** JSON so'rov. Xato bo'lsa — server xabari bilan Error. 401 — kirish sahifasiga. */
export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    location.href = `/login?next=${encodeURIComponent("/admin")}`;
    throw new Error("Kirilmagan");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Xato: ${res.status}`);
  return data;
}

let toastTimer = null;
export function toast(message, isError = false) {
  const el = $("toast");
  el.textContent = message;
  el.classList.toggle("is-error", isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, TOAST_MS);
}

/** Tasdiqlash oynasi. Qaytaradi: Promise<boolean>. */
export function confirmDialog({ title, text, confirmLabel = "Tasdiqlash", danger = false }) {
  const dialog = $("confirmDialog");
  $("confirmTitle").textContent = title;
  $("confirmText").textContent = text;
  const ok = $("confirmOk");
  ok.textContent = confirmLabel;
  ok.classList.toggle("btn-danger", danger);
  ok.classList.toggle("btn-primary", !danger);
  dialog.returnValue = "";
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "ok"), { once: true });
  });
}
