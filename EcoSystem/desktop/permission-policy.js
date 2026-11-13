// Ruxsat qarorlari (toza mantiq — Electron'siz, testlanadi). Chaqiruvchi: permissions.js.
// Saqlanadigan qiymat (userData/config.json → permissions.media): "granted" | "denied" | undefined (hali so'ralmagan).

/**
 * Sahifa mikrofon/kamera so'radi: "allow" | "deny" | "ask". Faqat "granted" abadiy saqlanadi.
 * "Rad etish" — faqat shu seans uchun (sessionDenied): ko'rinmay yopilgan oyna (yashirin ishga tushish, to'liq ekranli
 * o'yin) ruxsatni abadiy o'chirib qo'ymasin. Eski versiyalar saqlagan "denied" ham qayta so'raladi.
 */
function mediaDecision(stored, sessionDenied = false) {
  if (stored === "granted") return "allow";
  if (sessionDenied) return "deny";
  return "ask";
}

/** Operatsion tizim mikrofonni ilovadan to'sganmi (Windows "Privacy" yoki macOS). */
function osBlocked(status) {
  return status === "denied" || status === "restricted";
}

/** Tizim sozlamalari havolasi: to'g'ri "Mikrofon" bo'limini ochadi. */
const MIC_SETTINGS_URL = {
  win32: "ms-settings:privacy-microphone",
  darwin: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
};

/** So'ralgan turlar (audio/video) bo'yicha odam o'qiydigan matn. */
function mediaLabel(mediaTypes) {
  const types = Array.isArray(mediaTypes) && mediaTypes.length ? mediaTypes : ["audio"];
  const names = [];
  if (types.includes("audio")) names.push("mikrofon");
  if (types.includes("video")) names.push("kamera");
  return names.join(" va ") || "mikrofon";
}

module.exports = { mediaDecision, osBlocked, MIC_SETTINGS_URL, mediaLabel };
