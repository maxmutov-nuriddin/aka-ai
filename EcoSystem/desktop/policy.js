// Kompyuter asboblari uchun xavfsizlik qoidalari (sof funksiyalar — testlanadi: test/desktop/policy.test.js).
// Fayllar — faqat uy papkasi ichida, maxfiy joylar (.ssh, kalitlar, .env) yopiq; xavfli buyruqlar — rad.
const os = require("node:os");
const path = require("node:path");

const PATH_MAX = 1024;
const COMMAND_MAX = 2000;
const APP_NAME_RE = /^[\p{L}\p{N} ._()&+-]{1,60}$/u;

// Uy papkasidagi maxfiy papkalar (yo'lning istalgan qismida bo'lsa — yopiq).
const BLOCKED_DIRS = new Set([
  ".ssh", ".gnupg", ".aws", ".azure", ".kube", ".docker", ".password-store", ".gcloud",
  "Keychains", "Cookies", "1Password", "Bitwarden",
]);
// Maxfiy fayl nomlari: .env, SSH kalitlari, sertifikatlar, parol bazalari, token fayllari.
const BLOCKED_FILE_RE = /^(\.env(\..+)?|id_[a-z0-9_]+(\.pub)?|.+\.(pem|key|p12|pfx|keychain|keychain-db|kdbx|ovpn)|\.netrc|\.npmrc|\.pypirc|\.git-credentials|credentials(\.json)?|Login Data|Cookies)$/i;
// Ochilganda o'zi ishga tushadigan fayllar — pc_open bilan ochilmaydi (buyruq — faqat ruxsat bilan).
const EXECUTABLE_RE = /\.(command|sh|bash|zsh|tool|exe|bat|cmd|ps1|vbs|scpt|applescript|jar|msi|pkg|workflow)$/i;
// Tasdiqlangan bo'lsa ham bajarilmaydigan buyruqlar: tizimni buzadigan yoki administrator huquqi so'raydiganlar.
const BLOCKED_COMMANDS = [
  /\bsudo\b/i,
  /\bmkfs\b/i,
  /\bdiskutil\s+(erase|partition|zero|secureErase)/i,
  /\bformat\s+[a-z]:/i,
  /\brm\s+-[a-z]*r[a-z]*\s+(\/|~|\$HOME|\/\*)(\s|$)/i,
  /\b(shutdown|reboot|halt)\b/i,
  /:\(\)\s*\{\s*:\|:&\s*\};:/, // fork-bomba
  /\bdd\b[^|]*\bof=\/dev\//i,
  /\bcsrutil\b/i,
];

/** "~" va nisbiy yo'lni uy papkasiga nisbatan ochadi. */
function expand(input, home) {
  if (input === "~") return home;
  if (input.startsWith("~/") || input.startsWith("~\\")) return path.join(home, input.slice(2));
  return path.isAbsolute(input) ? input : path.join(home, input);
}

/**
 * Yo'lni tekshiradi: uy papkasi ichida va maxfiy emas.
 * @returns {{ ok: true, path: string } | { ok: false, error: string }}
 */
function resolveSafePath(input, home = os.homedir()) {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return { ok: false, error: "Yo'l berilmagan." };
  if (raw.length > PATH_MAX || raw.includes("\0")) return { ok: false, error: "Yo'l noto'g'ri." };
  const full = path.resolve(expand(raw, home));
  const rel = path.relative(home, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return { ok: false, error: "Faqat uy papkasi ichidagi fayllar ochiq." };
  const parts = rel.split(path.sep).filter(Boolean);
  if (parts.some((p) => BLOCKED_DIRS.has(p))) return { ok: false, error: "Bu maxfiy papka — Jigar unga kirmaydi." };
  if (parts.length && BLOCKED_FILE_RE.test(parts[parts.length - 1])) return { ok: false, error: "Bu maxfiy fayl (kalit, parol yoki .env) — Jigar uni ochmaydi." };
  return { ok: true, path: full };
}

/** Buyruqni tekshiradi. Qaytaradi: xato matni yoki null (ruxsat). */
function checkCommand(command) {
  const cmd = typeof command === "string" ? command.trim() : "";
  if (!cmd) return "Buyruq bo'sh.";
  if (cmd.length > COMMAND_MAX) return "Buyruq juda uzun.";
  if (BLOCKED_COMMANDS.some((re) => re.test(cmd))) return "Bu buyruq xavfli (administrator huquqi yoki tizimni buzishi mumkin) — Jigar uni bajarmaydi.";
  return null;
}

/**
 * pc_open nishoni: veb manzil, ilova nomi yoki fayl/papka yo'li.
 * @returns {{ kind: "url" | "app" | "path", value: string } | { error: string }}
 */
function classifyOpenTarget(target, home = os.homedir()) {
  const value = typeof target === "string" ? target.trim() : "";
  if (!value) return { error: "Nima ochilishi berilmagan." };
  if (/^(https?:\/\/|mailto:)/i.test(value)) return { kind: "url", value };
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^[a-z]:[\\/]/i.test(value)) return { error: "Faqat http(s) manzillar ochiladi." };
  const looksLikePath = /^[~/\\.]/.test(value) || /^[a-z]:[\\/]/i.test(value) || value.includes("/") || value.includes("\\");
  if (looksLikePath) {
    const safe = resolveSafePath(value, home);
    if (!safe.ok) return { error: safe.error };
    if (EXECUTABLE_RE.test(safe.path)) return { error: "Dastur yoki skript faylini ochish — faqat buyruq orqali (ruxsat bilan)." };
    return { kind: "path", value: safe.path };
  }
  if (APP_NAME_RE.test(value)) return { kind: "app", value };
  return { error: "Ilova nomi noto'g'ri." };
}

module.exports = { resolveSafePath, checkCommand, classifyOpenTarget };
