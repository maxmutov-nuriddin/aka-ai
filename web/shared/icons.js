// Brend ikonkalari (emoji o'rniga): chiziqli SVG, rangi — atrofdagi `color` (currentColor).
// Ishlatadi: landing (yo'nalishlar), ro'yxatdan o'tish savollari (yo'nalish, uzunlik, sinf), ilova (sahifa belgisi).

const PATHS = {
  // Yo'nalishlar
  study: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/><path d="M9 8h6"/>',
  exam: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  olympiad: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5.5a3 3 0 0 0 3 4.5M16 6h2.5a3 3 0 0 1-3 4.5"/><path d="M12 13v4M8.5 20h7M10 17h4"/>',
  university: '<path d="M2.5 9 12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v4.5c0 1.6 2.5 3 5.5 3s5.5-1.4 5.5-3V11"/><path d="M21.5 9v5"/>',
  language: '<path d="M3 5h11v8H8.5L5 16v-3H3z"/><path d="M14 9h7v8h-2v3l-3.5-3H10v-4"/><path d="M6 8.5h5M6 10.5h3"/>',
  interview: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21M8.5 21h7"/>',
  curious: '<path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z"/><path d="M9.5 19h5M10.5 21.5h3"/>',
  // Javob uzunligi
  qisqa: '<path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z"/>',
  odatiy: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 12h7"/>',
  batafsil: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.3" fill="currentColor"/><circle cx="4.5" cy="12" r="1.3" fill="currentColor"/><circle cx="4.5" cy="18" r="1.3" fill="currentColor"/>',
  // Sinf (o'sish: nihol -> o'simlik -> daraxt -> talaba qalpog'i)
  "5-7": '<path d="M12 21v-8"/><path d="M12 13c0-3.5-2.5-5.5-6.5-5.5 0 3.5 2.5 5.5 6.5 5.5z"/><path d="M12 11c0-3 2-4.8 5.5-4.8 0 3-2 4.8-5.5 4.8z"/>',
  "8-9": '<path d="M12 21V8"/><path d="M12 14c0-3-2.2-4.8-5.8-4.8 0 3 2.2 4.8 5.8 4.8zM12 12c0-3 2.2-4.8 5.8-4.8 0 3-2.2 4.8-5.8 4.8z"/><path d="M12 8.5c-1.6-1.3-1.6-3.7 0-5 1.6 1.3 1.6 3.7 0 5z"/>',
  "10-11": '<path d="M12 22v-5"/><path d="M12 2.5 18 10h-3l4 5.5H5L9 10H6z"/>',
  student: '<path d="M2.5 9 12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v4.5c0 1.6 2.5 3 5.5 3s5.5-1.4 5.5-3V11"/><path d="M21.5 9v5"/>',
  // Ilova
  page: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="8.5" cy="10" r="1.6"/><path d="m21 16-5-5-8.5 8"/>',
};

/** Ikonka SVG matni. Noma'lum nom — bo'sh satr. */
export function iconSvg(name, size = 24) {
  const body = PATHS[name];
  if (!body) return "";
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/** Yo'nalish ranglari (landing va ro'yxatdan o'tish bir xil). */
export const GOAL_COLORS = {
  study: "#7c74ff",
  exam: "#4da3ff",
  olympiad: "#fbbf24",
  university: "#ff6fae",
  language: "#2ee6c8",
  interview: "#ffb547",
  curious: "#c58cff",
};
