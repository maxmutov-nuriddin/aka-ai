// Model javobini bo'limlarga ajratadi: [TUSHUNTIRISH], [ESDA QOLSIN], [VIZUAL], [QUIZ].
// Brauzerda ham, serverda ham ishlaydi (hech qanday Node API ishlatilmaydi).

const SECTION_NAMES = ["TUSHUNTIRISH", "ESDA QOLSIN", "VIZUAL", "QUIZ"];

// "[TUSHUNTIRISH]", "**[TUSHUNTIRISH]**", "## [TUSHUNTIRISH]" kabi sarlavhalarni topadi.
const HEADER_RE = /^[ \t>#*_]*\[(TUSHUNTIRISH|ESDA QOLSIN|VIZUAL|QUIZ)\][ \t*_:]*(.*)$/gim;

const NO_VISUAL = new Set(["yo'q", "yo‘q", "yoʻq", "yoq", "йўқ", "нет", "no", "-", ""]);

export function parseAkaResponse(raw) {
  const text = String(raw ?? "").replace(/\r\n/g, "\n");
  const found = [];
  for (const m of text.matchAll(HEADER_RE)) {
    found.push({ name: m[1].toUpperCase(), start: m.index, bodyStart: m.index + m[0].length, inline: m[2] });
  }

  const sections = {};
  for (let i = 0; i < found.length; i++) {
    const cur = found[i];
    const end = i + 1 < found.length ? found[i + 1].start : text.length;
    const body = (cur.inline + "\n" + text.slice(cur.bodyStart, end)).trim();
    if (!(cur.name in sections)) sections[cur.name] = body;
  }

  const hasStructure = SECTION_NAMES.some((n) => n in sections);
  return {
    structured: hasStructure,
    tushuntirish: hasStructure ? (sections.TUSHUNTIRISH ?? "") : text.trim(),
    esdaQolsin: sections["ESDA QOLSIN"] ?? "",
    vizual: parseVisual(sections.VIZUAL),
    quiz: parseQuiz(sections.QUIZ),
  };
}

export function parseVisual(body) {
  if (!body) return null;
  let code = body.trim();
  const fence = code.match(/```(?:mermaid)?[ \t]*\n([\s\S]*?)```/i);
  if (fence) code = fence[1].trim();
  const normalized = code.toLowerCase().replace(/[."!]+$/g, "").trim();
  if (NO_VISUAL.has(normalized)) return null;
  return code;
}

export function parseQuiz(body) {
  if (!body) return null;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  const candidate = body.slice(start, end + 1);

  let obj = tryJson(candidate);
  if (!obj) {
    // Ba'zan model "aqlli" qo'shtirnoq ishlatadi.
    obj = tryJson(candidate.replace(/[“”„]/g, '"'));
  }
  if (!obj || typeof obj !== "object") return null;

  const savol = typeof obj.savol === "string" ? obj.savol.trim() : "";
  const variantlar = Array.isArray(obj.variantlar)
    ? obj.variantlar.filter((v) => typeof v === "string" && v.trim()).map((v) => v.trim())
    : [];
  const togri = typeof obj.togri === "string" ? obj.togri.trim().charAt(0).toUpperCase() : "";
  const izoh = typeof obj.izoh === "string" ? obj.izoh.trim() : "";

  if (!savol || variantlar.length < 2 || !togri) return null;
  const letters = variantlar.map((v, i) => variantLetter(v, i));
  if (!letters.includes(togri)) return null;

  return { savol, variantlar, togri, izoh };
}

// Ovoz teglari: [laughs], [excited], [low, gravelly voice]. Ovozga boradi, ekranda ko'rinmaydi.
const AUDIO_TAG_RE = /[ \t]*\[[a-z]+(?:[ ,'-]+[a-z]+){0,4}\][ \t]*/g;

export function stripAudioTags(text) {
  return String(text ?? "")
    .replace(AUDIO_TAG_RE, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[ \t]+|[ \t]+$/gm, "");
}

export function variantLetter(variant, index) {
  const m = String(variant).match(/^\s*([A-Za-zА-Яа-я])\s*[).:-]/);
  if (m) return m[1].toUpperCase();
  return String.fromCharCode(65 + index);
}

function tryJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
