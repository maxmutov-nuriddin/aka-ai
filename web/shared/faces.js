// Xarakter yuzlari: Jigarning ekran-yuzi uslubida (qorong'i ekran, rangli hoshiya, yonib turgan ko'z va og'iz).
// Statik SVG — foydalanuvchi ma'lumoti aralashmaydi. Ro'yxatdan o'tish savollari va landing ishlatadi.
// Kayfiyat stikerlari (moodSvg) ham shu uslubda — emoji o'rniga brend stikerlari.
export const FACE_COLORS = {
  neytral: "#2ee6c8", // Jigarning asl ko'z rangi
  mehribon: "#4da3ff",
  kinoyali: "#b46bff",
  jahldor: "#ff8a3d",
  romantik: "#ff5fa2",
  moslashuvchan: "#7ee081",
};
const HEART = (x) => `<path d="M${x} 24.5 l-5.6 -5.4 a3.3 3.3 0 0 1 5.6 -4.3 a3.3 3.3 0 0 1 5.6 4.3 z" fill="currentColor"/>`;
const FACE_FEATURES = {
  neytral: `<circle cx="22" cy="18" r="3.6" fill="currentColor"/><circle cx="42" cy="18" r="3.6" fill="currentColor"/>
    <path d="M27 27.5 h10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`,
  mehribon: `<path d="M17 20 q5 -7 10 0 M37 20 q5 -7 10 0" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <path d="M25.5 25.5 q6.5 6 13 0" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`,
  kinoyali: `<path d="M17 18.5 h10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <circle cx="42" cy="18" r="3.8" fill="currentColor"/>
    <path d="M27 28.5 q6 0 11 -4.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`,
  jahldor: `<path d="M16 12.5 l10 4.5 M48 12.5 l-10 4.5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <circle cx="22" cy="21" r="3.2" fill="currentColor"/><circle cx="42" cy="21" r="3.2" fill="currentColor"/>
    <path d="M26 30 q6 -4.5 12 0" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`,
  romantik: `${HEART(22)}${HEART(42)}
    <path d="M28 28 q4 3.5 8 0" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="13" cy="26" rx="3" ry="1.8" fill="currentColor" opacity="0.45"/>
    <ellipse cx="51" cy="26" rx="3" ry="1.8" fill="currentColor" opacity="0.45"/>`,
  // Moslashuvchan: bir ko'z kulgan, biri ochiq — kayfiyatga qarab o'zgaradi
  moslashuvchan: `<path d="M17 20 q5 -7 10 0" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <circle cx="42" cy="18" r="3.6" fill="currentColor"/>
    <path d="M25.5 26 q6.5 4.5 13 0" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`,
};

/** Xarakter yuzi (SVG matni); rangi — atrofdagi `color` (currentColor). */
export function faceSvg(name) {
  return `<svg viewBox="0 0 64 40" aria-hidden="true">
    <rect x="2" y="2" width="60" height="36" rx="18" fill="#0b0e22" stroke="currentColor" stroke-width="3"/>
    ${FACE_FEATURES[name] ?? FACE_FEATURES.neytral}</svg>`;
}

// ---------- Kayfiyat stikerlari (landing: kayfiyat tugmalari, "His-tuyg'u" kartochkasi) ----------
export const MOOD_COLORS = {
  happy: "#5ff5dc",
  excited: "#fbbf24",
  curious: "#4da3ff",
  sad: "#9fb2d9",
  angry: "#ff6a2a",
};
const STAR = (x) => `<path d="M${x} 13.5l1.7 3.5 3.8.5-2.8 2.6.7 3.8-3.4-1.8-3.4 1.8.7-3.8-2.8-2.6 3.8-.5z" fill="currentColor"/>`;
const MOOD_FEATURES = {
  happy: `<path d="M17 20 q5 -7 10 0 M37 20 q5 -7 10 0" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <path d="M24 25 q8 8 16 0z" fill="currentColor"/>`,
  excited: `${STAR(22)}${STAR(42)}
    <path d="M25 27 q7 6 14 0" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`,
  curious: `<path d="M16 11.5 q5 -3 10 0" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="21" cy="18.5" r="3.8" fill="currentColor"/><circle cx="43" cy="19.5" r="3" fill="currentColor"/>
    <circle cx="32" cy="29" r="2.6" fill="none" stroke="currentColor" stroke-width="2.6"/>`,
  sad: `<path d="M16 17 l9 -3.5 M48 17 l-9 -3.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="22" cy="21" r="3" fill="currentColor"/><circle cx="42" cy="21" r="3" fill="currentColor"/>
    <path d="M26 30.5 q6 -4.5 12 0" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <path d="M47 24 q2.2 3.2 0 5 q-2.2 -1.8 0 -5z" fill="#7cc7ff"/>`,
  angry: FACE_FEATURES.jahldor,
};

/** Kayfiyat stikeri (SVG matni); rangi — MOOD_COLORS dan. */
export function moodSvg(name) {
  const color = MOOD_COLORS[name] ?? MOOD_COLORS.happy;
  return `<svg viewBox="0 0 64 40" aria-hidden="true" style="color:${color}">
    <rect x="2" y="2" width="60" height="36" rx="18" fill="#0b0e22" stroke="currentColor" stroke-width="3"/>
    ${MOOD_FEATURES[name] ?? MOOD_FEATURES.happy}</svg>`;
}
