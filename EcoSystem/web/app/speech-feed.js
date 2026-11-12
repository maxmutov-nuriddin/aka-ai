// Oqimli javobni ovozga uzatadi: [TUSHUNTIRISH] bo'limidan to'liq tugagan gaplar kelishi bilan o'qishga beriladi,
// javob tugagach — qolgan qismi ("Esda qolsin" va savol bilan) bir bo'lakda.

import { toSpeechText } from "./speech.js";

const EXPLAIN_HEADER_RE = /^[ \t>#*_]*\[TUSHUNTIRISH\][ \t*_:]*/im;
// Keyingi bo'lim sarlavhasi — tushuntirish shu yerda tugaydi.
const NEXT_HEADER_RE = /^[ \t>#*_]*\[(?:ESDA QOLSIN|VIZUAL|QUIZ|SAVOL|XOTIRA|ESLATMA|FAYL)\]/im;
// Gap oxiri: tinish belgisi va undan keyin bo'shliq (oxirgi belgi hali tugamagan gap ham bo'lishi mumkin).
const SENTENCE_END_RE = /[.!?…](?=\s)/g;
const FIRST_PIECE_MIN = 25; // birinchi bo'lak: bitta qisqa gap ham yetadi — ovoz tez boshlansin
const NEXT_PIECE_MIN = 140; // keyingilari: kamroq, lekin kattaroq so'rov

/** Matndagi oxirgi to'liq gap tugagan joy (indeks) yoki -1. */
function lastSentenceEnd(text) {
  let end = -1;
  for (const m of text.matchAll(SENTENCE_END_RE)) end = m.index + 1;
  return end;
}

/**
 * @param {{ lang: string, say: (text: string) => void, end: () => void }} options
 *   say — o'qishga matn (ovozga tayyorlangan), end — boshqa matn yo'q.
 */
export function createSpeechFeed({ lang, say, end }) {
  let raw = "";
  let taken = 0; // tushuntirishning allaqachon o'qishga berilgan qismi (belgi)
  let sentAny = false;

  /** Tushuntirish bo'limi (hozircha kelgani) va u tugaganmi. Sarlavha hali kelmagan bo'lsa — null. */
  function explainSoFar() {
    const head = EXPLAIN_HEADER_RE.exec(raw);
    if (!head) return null;
    const rest = raw.slice(head.index + head[0].length);
    const next = NEXT_HEADER_RE.exec(rest);
    return { body: next ? rest.slice(0, next.index) : rest, complete: Boolean(next) };
  }

  function speakPiece(piece) {
    const spoken = toSpeechText({ tushuntirish: piece }, lang);
    if (!spoken.trim()) return;
    say(spoken);
    sentAny = true;
  }

  return {
    /** Yangi kelgan matn bo'lagi. */
    push(delta) {
      raw += delta;
      const section = explainSoFar();
      if (!section || section.complete) return; // tugagan bo'limning qolgani — finish() da
      const boundary = lastSentenceEnd(section.body);
      if (boundary <= taken) return;
      const piece = section.body.slice(taken, boundary);
      if (piece.trim().length < (sentAny ? NEXT_PIECE_MIN : FIRST_PIECE_MIN)) return;
      speakPiece(piece);
      taken = boundary;
    },
    /** Javob tugadi: qolgan tushuntirish, "Esda qolsin" va savol — bir bo'lakda, keyin tugatish. */
    finish(parsed) {
      const section = explainSoFar();
      const remaining = section ? section.body.slice(taken) : parsed.tushuntirish;
      const rest = toSpeechText({ ...parsed, tushuntirish: remaining }, lang);
      if (rest.trim()) say(rest);
      end();
    },
  };
}
