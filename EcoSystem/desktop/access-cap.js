// Qurilmaning o'z ruxsat chegarasi: server qanday daraja yuborsa ham, bu kompyuterda undan yuqori ishlamaydi.
// Standart — "full" (cheksiz rejim ushbu kompyuterda ishlamaydi). O'zgartirish: ECO_MAX_ACCESS yoki
// userData/config.json ichida "maxAccess": "safe" | "wide" | "full" | "unlimited". Server buzilsa yoki aldansa ham himoya shu yerda.
const LEVELS = ["safe", "wide", "full", "unlimited"];
const DEFAULT_MAX = "full";

const valid = (value) => (LEVELS.includes(value) ? value : null);

/** Server yuborgan daraja (noto'g'ri bo'lsa — safe) va chegara orasidan pastrog'i. */
function effectiveLevel(requested, max = DEFAULT_MAX) {
  const asked = valid(requested) ?? "safe";
  const cap = valid(max) ?? DEFAULT_MAX;
  return LEVELS.indexOf(asked) > LEVELS.indexOf(cap) ? cap : asked;
}

module.exports = { effectiveLevel, LEVELS, DEFAULT_MAX };
