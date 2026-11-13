// Xabarlar (macOS — Messages ilovasi): kontakt qidirish va iMessage/SMS yuborish (SMS — iPhone'dan "Text Message Forwarding" yoqilgan bo'lsa).
// Har yuborish — egasining "Ha"si bilan (server). Windows/Android — hozircha yo'q (Android agent rejada).
const { osascript } = require("./os-run.js");
const { appleQuote } = require("./dev.js");

const NAME_RE = /^[\p{L}\p{N} .'-]{1,60}$/u;
const PHONE_RE = /^\+?[0-9 ()-]{5,20}$/;
const EMAIL_RE = /^[^\s@"\\]{1,64}@[^\s@"\\]{1,190}$/;
const TEXT_MAX = 2000;

async function contacts(query) {
  if (!NAME_RE.test(String(query ?? ""))) return { error: "Kontakt ismi noto'g'ri." };
  const script = [
    'tell application "Contacts"',
    'set out to ""',
    `repeat with p in (every person whose name contains "${appleQuote(query)}")`,
    "repeat with ph in phones of p",
    'set out to out & name of p & " | " & (value of ph) & linefeed',
    "end repeat",
    "end repeat",
    "return out",
    "end tell",
  ].join("\n");
  const r = await osascript(script);
  if (r.code !== 0) return { error: "Kontaktlarni o'qib bo'lmadi: System Settings → Privacy & Security → Contacts → Jigar'ga ruxsat bering." };
  return { text: r.stdout.trim() || `"${query}" kontaktlarda topilmadi.` };
}

async function send(to, text) {
  const target = String(to ?? "").trim();
  if (!PHONE_RE.test(target) && !EMAIL_RE.test(target)) return { error: "Qabul qiluvchi telefon raqami yoki email bo'lishi kerak." };
  const body = String(text ?? "").trim().slice(0, TEXT_MAX);
  if (!body) return { error: "Xabar matni bo'sh." };
  const message = appleQuote(body).replace(/\r?\n/g, "\\n");
  for (const service of ["iMessage", "SMS"]) {
    const r = await osascript([
      'tell application "Messages"',
      `set svc to 1st account whose service type = ${service}`,
      `send "${message}" to participant "${appleQuote(target)}" of svc`,
      "end tell",
    ].join("\n"));
    if (r.code === 0) return { text: `${service} yuborildi: ${target}` };
  }
  return { error: "Xabar yuborilmadi: Messages'da iMessage kirilganmi? SMS uchun iPhone'da Text Message Forwarding yoqilganmi?" };
}

async function message(input, approved) {
  if (process.platform !== "darwin") return { error: "Xabar yuborish hozircha faqat Mac'da (Messages). Telefon uchun Android agent kerak." };
  if (input.action === "contacts") return contacts(input.query);
  if (input.action !== "send") return { error: `Noma'lum amal: ${input.action}` };
  if (!approved) return { error: "Egasining ruxsati yo'q." };
  return send(input.to, input.text);
}

module.exports = { message };
