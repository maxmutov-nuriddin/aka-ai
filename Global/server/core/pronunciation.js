// Talaffuz tahlili (til o'rganish yo'nalishi): Azure bahosi (rus tili) yoki Scribe so'z ishonchi (taxminiy).
// Natija Jigarga o'quvchi xabari ostida izoh bo'lib boradi — u qaysi so'z va tovush sust ekanini aniq aytadi.

const MAX_WORDS = 40;
const MAX_WORD_CHARS = 40;
const MAX_WEAK_PHONEMES = 4;
const NOTE_WORDS = 5; // izohda ko'pi bilan nechta so'z
const AZURE_WEAK_WORD = 70; // shundan past — sust so'z
const LOCAL_WEAK_WORD = 75; // lokal model: o'lchov bo'yicha eng yaxshi chegara (yolg'on signal ~11-24%)
const AZURE_WEAK_PHONEME = 60;
const SCRIBE_WEAK_WORD = 35; // tanish ishonchi (%) — shundan past bo'lsa, talaffuz noaniq bo'lishi mumkin
const SOURCES = new Set(["azure", "local", "scribe"]);

const score100 = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
// Faqat harf, urg'u belgisi, tutuq va chiziqcha; harfsiz bo'lak ("-", "...") — so'z emas (bo'sh qaytadi).
const cleanWord = (text) => {
  const word = String(text ?? "").replace(/[^\p{L}\p{M}'-]+/gu, "").slice(0, MAX_WORD_CHARS);
  return /\p{L}/u.test(word) ? word : "";
};

/** ElevenLabs Scribe so'zlari (logprob) -> taxminiy baho: ishonch foizi. */
export function fromScribeWords(words) {
  const list = (Array.isArray(words) ? words : [])
    .filter((w) => w?.type === "word" && typeof w.logprob === "number")
    .map((w) => ({ word: cleanWord(w.text), score: score100(Math.exp(w.logprob) * 100) }))
    .filter((w) => w.word);
  return list.length ? { source: "scribe", overall: null, fluency: null, words: list.slice(0, MAX_WORDS) } : null;
}

/** Azure Pronunciation Assessment javobi (REST, format=detailed) -> baho. */
export function fromAzureResult(data) {
  const best = data?.RecognitionStatus === "Success" ? data.NBest?.[0] : null;
  if (!best) return null;
  const assessment = (node) => node?.PronunciationAssessment ?? node ?? {};
  const words = (best.Words ?? []).map((w) => {
    const a = assessment(w);
    const weak = (w.Phonemes ?? [])
      .filter((p) => score100(assessment(p).AccuracyScore) < AZURE_WEAK_PHONEME)
      .map((p) => String(p.Phoneme))
      .slice(0, MAX_WEAK_PHONEMES);
    return { word: cleanWord(w.Word), score: score100(a.AccuracyScore), error: String(a.ErrorType ?? "None"), weak };
  }).filter((w) => w.word);
  const top = assessment(best);
  return { source: "azure", overall: score100(top.PronScore ?? top.AccuracyScore), fluency: score100(top.FluencyScore), words: words.slice(0, MAX_WORDS) };
}

/** Mijozdan qaytib kelgan tahlil — ishonchsiz ma'lumot: tozalanadi va cheklanadi. */
export function normalizePronunciation(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.words)) return null;
  const optional = (v) => (v == null ? null : score100(v));
  const words = input.words.slice(0, MAX_WORDS).map((w) => ({
    word: cleanWord(w?.word),
    score: score100(w?.score),
    ...(w?.error ? { error: String(w.error).slice(0, 30) } : {}),
    ...(Array.isArray(w?.weak) ? { weak: w.weak.filter((p) => typeof p === "string").map((p) => p.slice(0, 8)).slice(0, MAX_WEAK_PHONEMES) } : {}),
  })).filter((w) => w.word);
  if (!words.length) return null;
  return { source: SOURCES.has(input.source) ? input.source : "scribe", overall: optional(input.overall), fluency: optional(input.fluency), words };
}

/** Jigar uchun izoh (o'quvchi ko'rmaydi). Tahlil bo'lmasa — bo'sh. */
export function pronunciationNote(p) {
  if (!p?.words?.length) return "";
  if (p.source === "azure" || p.source === "local") {
    const local = p.source === "local";
    const limit = local ? LOCAL_WEAK_WORD : AZURE_WEAK_WORD;
    const weak = p.words.filter((w) => w.score < limit).sort((a, b) => a.score - b.score).slice(0, NOTE_WORDS);
    const head = local
      ? `TALAFFUZ TAHLILI (tovush modeli, taxminiy): umumiy ${p.overall}/100.`
      : `TALAFFUZ TAHLILI (Azure, ishonchli): umumiy ${p.overall}/100, ravonlik ${p.fluency}/100.`;
    if (!weak.length) return `(${head} Talaffuz yaxshi — aniq maqta.)`;
    const list = weak.map((w) => `"${w.word}" ${w.score}/100${w.weak?.length ? ` (sust tovushlar: ${w.weak.join(", ")})` : ""}`).join("; ");
    const advice = local
      ? `Model ba'zan adashadi: eng sust 1-2 so'zni nomi bilan ayt, to'g'ri aytilishini ko'rsat va takrorlat, lekin "xato qilding" deb qat'iy aytma — "shu so'zni yana bir aytib ko'r" ohangida.`
      : "Faqat shu ma'lumotga tayan: eng sust 1-2 so'zni nomini aytib tuzat va takrorlat.";
    return `(${head} Sust so'zlar: ${list}. ${advice})`;
  }
  const unclear = p.words.filter((w) => w.score < SCRIBE_WEAK_WORD).sort((a, b) => a.score - b.score).slice(0, NOTE_WORDS);
  if (!unclear.length) return "";
  const list = unclear.map((w) => `"${w.word}" (${w.score}%)`).join(", ");
  return `(TALAFFUZ ISHORASI — taxminiy: tanish tizimi bu so'zlarni noaniq eshitdi: ${list}. Talaffuz noaniq bo'lishi mumkin — so'zni bo'g'inlab qayta aytishni so'ra, lekin "xato qilding" deb qat'iy aytma.)`;
}

/** O'quvchi xabari + talaffuz izohi. */
export function withPronunciation(text, pronunciation) {
  const note = pronunciationNote(pronunciation);
  return note ? `${text}\n\n${note}` : text;
}
