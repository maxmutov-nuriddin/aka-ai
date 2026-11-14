// Fon holati yozuvi (toza mantiq — Electron'siz, testlanadi). Chaqiruvchi: status-pill.js.
// Holat nomlari — web/app/diag emas, app-preload.js dagi STATES bilan bir xil.

const LABELS = {
  listening: "Tinglayapti…",
  transcribing: "Eshityapman…",
  thinking: "O'ylayapti…",
  speaking: "Gapiryapti…",
};

/** Idle'dan keyin yozuv yashirilguncha kutish: tez-tez almashinuvda miltillamasin. */
const PILL_HIDE_DELAY_MS = 700;

/** Holatga yorliq; idle yoki noma'lum holat — null (yozuv ko'rsatilmaydi). */
const pillLabel = (state) => LABELS[state] ?? null;

module.exports = { pillLabel, PILL_HIDE_DELAY_MS, LABELS };
