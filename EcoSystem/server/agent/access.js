// Ruxsat darajalari (ECOTIZIM-REJA.md, 10-band). Egasi Sozlamalarda tanlaydi:
//   safe      — uy papkasi; buyruq, yozish va xavfli amallar "Ha" bilan (standart)
//   wide      — butun disk (maxfiy fayllardan tashqari); "Ha" — safe kabi
//   full      — cheklovsiz; "Ha" faqat qaytarib bo'lmaydigan ishlarga (o'chirish, xabar, kompyuterni o'chirish ...)
//   unlimited — hech narsa so'ralmaydi ("Ha"siz), muddatsiz; yoqish — parol bilan (egasi o'zi qaytarmaguncha)
export const ACCESS_LEVELS = ["safe", "wide", "full", "unlimited"];

// Qaytarib bo'lmaydigan yoki tashqariga ta'sir qiladigan buyruqlar — full darajada ham "Ha" so'raladi.
const DESTRUCTIVE_RE = new RegExp([
  String.raw`\b(rm|rmdir|del|erase|rd|shred|truncate|unlink)\b`,
  String.raw`\bmv\b`,
  String.raw`\b(mkfs|dd|diskutil|format|fdisk|parted)\b`,
  String.raw`\b(shutdown|reboot|halt|poweroff)\b`,
  String.raw`\b(kill|killall|pkill|taskkill|Stop-Process)\b`,
  String.raw`\bgit\s+(push|reset|clean|rebase|checkout\s+--|branch\s+-D)`,
  String.raw`\bdrop\s+(table|database)\b`,
  String.raw`\b(chmod|chown|launchctl|crontab)\b`,
  String.raw`\b(npm|yarn|pnpm)\s+publish\b`,
  String.raw`\b(curl|wget)\b[^|]*\|\s*(sh|bash|zsh)`,
  String.raw`\bRemove-Item\b`,
].join("|"), "i");

export const isDestructiveCommand = (command) => DESTRUCTIVE_RE.test(String(command ?? ""));

/** Har darajada ham tasdiq talab qiladigan amallar (unlimited'dan tashqari): tashqariga ketadigan yoki to'xtatib bo'lmaydigan. */
const ALWAYS_ASK = {
  pc_message: (i) => i?.action === "send",
  pc_power: (i) => ["shutdown", "restart"].includes(i?.action),
  pc_apps: (i) => i?.action === "quit_all",
  phone: (i) => i?.action === "sms",
};

/** Faqat safe/wide darajada tasdiq talab qiladiganlar. */
const ASK_WHEN_CAREFUL = {
  pc_run_command: () => true,
  pc_write_file: () => true,
  pc_dev: (i) => i?.action === "claude",
};

/**
 * Shu chaqiruvga egasining "Ha"si kerakmi.
 * @param {string} name asbob nomi
 * @param {object} input
 * @param {string} level ruxsat darajasi
 */
export function needsConfirm(name, input, level = "safe") {
  if (level === "unlimited") return false;
  if (ALWAYS_ASK[name]?.(input)) return true;
  if (level === "full") return name === "pc_run_command" && isDestructiveCommand(input?.command);
  return Boolean(ASK_WHEN_CAREFUL[name]?.(input));
}

/** Saqlangan daraja; noma'lum qiymat — safe. */
export const effectiveLevel = (level) => (ACCESS_LEVELS.includes(level) ? level : "safe");
