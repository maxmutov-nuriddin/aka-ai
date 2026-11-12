// Xarakter ohangi — ovoz modeliga beriladigan "rejissyor ko'rsatmasi" (Gemini: speech_metadata.style, OpenAI: instructions).
// Matn ichiga yozilmaydi (aks holda o'qib yuboradi). Har xarakter prompts/persona-*.md dagi fe'l-atvorga mos:
// ovoz ham, so'zlar ham bitta odamniki bo'lib eshitilsin.

// Hammasiga umumiy: o'qib berayotgan diktor emas, jonli suhbatdosh.
const NATURAL = "Sound like a real person talking to a friend face to face, not reading aloud: natural conversational rhythm, "
  + "small pauses between thoughts, varied intonation, clear articulation.";

// Xarakter x yosh guruhi (yosh: 5–9-sinf, katta: 10–11-sinf va talaba).
const PERSONA_STYLES = {
  neytral: {
    yosh: "A calm, confident young teacher. Even, clear and friendly, steady medium pace, no drama and no exaggerated emotion.",
    katta: "A calm, knowledgeable lecturer. Composed, precise and assured, steady unhurried pace, minimal emotion, quiet authority.",
  },
  mehribon: {
    yosh: "A kind, patient older brother. Warm and gentle with an audible smile, soft encouraging tone, unhurried, reassuring.",
    katta: "A warm, supportive mentor. Soft, sincere and encouraging, relaxed pace, gentle smile in the voice, never condescending.",
  },
  kinoyali: {
    yosh: "A witty, sharp-tongued friend. Playful and teasing with a smirk in the voice, lively pace, dry ironic emphasis on key words.",
    katta: "A dry, sarcastic stand-up comedian who knows the subject. Deadpan irony, raised-eyebrow tone, amused pauses before punchlines.",
  },
  jahldor: {
    yosh: "A strict, impatient teacher who has lost patience. Irritated and sharp, firm and loud, fast clipped pace, stern emphasis.",
    katta: "An angry, demanding drill sergeant of a teacher. Impatient, harsh and forceful, loud, fast and clipped, no warmth at all.",
  },
  moslashuvchan: {
    yosh: "A versatile, empathetic friend. Lets each sentence carry its own emotion: warm when comforting, lively when excited, calm and clear when explaining.",
    katta: "A perceptive, adaptable companion. Natural and responsive tone that follows the content: gentle on hard moments, upbeat on good news, steady on facts.",
  },
  romantik: {
    yosh: "An inspired teacher in love with the subject. Soft, sincere and dreamy, slow flowing pace, quiet wonder in the voice.",
    katta: "A tender, affectionate voice speaking to someone dear. Soft, warm and intimate, slow and unhurried, gentle smile, lightly playful.",
  },
};

const BAND_BY_LEVEL = { "5-7": "yosh", "8-9": "yosh", "10-11": "katta", student: "katta" };

/**
 * Xarakter va sinfga mos ovoz ohangi (inglizcha ko'rsatma). Noma'lum xarakter — neytral, noma'lum sinf — yosh.
 * @param {string | null | undefined} persona
 * @param {string | null | undefined} level
 * @returns {string}
 */
export function speechStyleFor(persona, level) {
  const styles = PERSONA_STYLES[persona] ?? PERSONA_STYLES.neytral;
  return `${styles[BAND_BY_LEVEL[level] ?? "yosh"]} ${NATURAL}`;
}
