// Jurnalga yoziladigan ma'lumotdan maxfiy qismlarni olib tashlash: fayl mazmuni, SMS matni, kalit va parollar.
// Jurnal (~/Jigar/*.md) oddiy matn — uni birov ko'rsa ham sir chiqmasin.
const MAX = 300;

// Kalit va token ko'rinishlari (API kalitlar, Bearer, jgr_, uzun hex/base64).
const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\bAIza[0-9A-Za-z_-]{20,}/g,
  /\bjgr_[A-Za-z0-9_-]{10,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  /\b(?:password|passwd|parol|token|secret|api[_-]?key)\s*[=:]\s*\S+/gi,
  /--?(?:password|passwd|token|secret)(?:=|\s+)\S+/gi,
  /\b[A-Fa-f0-9]{40,}\b/g,
];

/** Matndagi kalit va parollarni "***" ga almashtiradi. */
export function maskSecrets(text) {
  return SECRET_PATTERNS.reduce((out, re) => out.replace(re, "***"), String(text ?? ""));
}

/** Asbob kiritishining jurnalga yoziladigan xavfsiz ko'rinishi (qisqa, maxfiysiz). */
export function redactInput(name, input = {}) {
  const safe = { ...input };
  if (typeof safe.content === "string") safe.content = `(${safe.content.length} belgi)`; // pc_write_file
  if (typeof safe.text === "string" && (name === "pc_message" || name === "phone")) safe.text = `(${safe.text.length} belgi)`; // SMS
  if (typeof safe.prompt === "string") safe.prompt = safe.prompt.slice(0, 120); // Claude Code topshirig'i — boshi
  return maskSecrets(JSON.stringify(safe)).slice(0, MAX);
}
