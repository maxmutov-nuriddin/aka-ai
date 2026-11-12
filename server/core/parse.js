// Model javobini bo'limlarga ajratadi: [SAVOL] (ovozli savolning to'g'ri yozilishi), [TUSHUNTIRISH], [ESDA QOLSIN],
// [VIZUAL], [QUIZ]. Shaxsiy yordamchi (support): [XOTIRA], [ESLATMA], [FAYL] — ekranda va ovozda ko'rinmaydi.
// Brauzerda ham, serverda ham ishlaydi (hech qanday Node API ishlatilmaydi).

const SECTION_NAMES = ["TUSHUNTIRISH", "ESDA QOLSIN", "VIZUAL", "QUIZ"];

// "[TUSHUNTIRISH]", "**[TUSHUNTIRISH]**", "## [TUSHUNTIRISH]" kabi sarlavhalarni topadi.
const HEADER_RE = /^[ \t>#*_]*\[(SAVOL|TUSHUNTIRISH|ESDA QOLSIN|VIZUAL|QUIZ|XOTIRA|ESLATMA|FAYL)\][ \t*_:]*(.*)$/gim;
const MAX_FACTS = 10; // bitta javobda eslab qolinadigan faktlar
const MAX_REMINDERS = 5;
const MAX_FILE_CHARS = 200_000;
// Fayl turlari: ochiladigan dasturda to'g'ri ko'rinadi (doc — Word, csv — Excel). Boshqasi — .txt.
export const FILE_TYPES = {
  txt: "text/plain", md: "text/markdown", csv: "text/csv", html: "text/html", doc: "application/msword", json: "application/json",
};
const MAX_HEARD_CHARS = 1000;

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
  // Tuzilmasiz javob — butun matn tushuntirish ([SAVOL] bo'limi bo'lsa, u ajratib olinadi).
  const savolHeader = found.find((f) => f.name === "SAVOL");
  const plain = savolHeader ? text.slice(found[found.indexOf(savolHeader) + 1]?.start ?? text.length) : text;
  return {
    structured: hasStructure,
    savol: parseHeard(sections.SAVOL),
    tushuntirish: hasStructure ? (sections.TUSHUNTIRISH ?? "") : plain.trim(),
    esdaQolsin: sections["ESDA QOLSIN"] ?? "",
    vizual: parseVisual(sections.VIZUAL),
    quiz: parseQuiz(sections.QUIZ),
    xotira: parseFacts(sections.XOTIRA),
    eslatmalar: parseReminders(sections.ESLATMA),
    fayl: parseFile(sections.FAYL),
  };
}

const isNone = (s) => NO_VISUAL.has(String(s ?? "").toLowerCase().replace(/[."!]+$/g, "").trim());

/** [XOTIRA]: foydalanuvchi haqida eslab qolinadigan faktlar — har qatorda bittasi ("- ..."). */
export function parseFacts(body) {
  if (!body || isNone(body)) return [];
  return body.split("\n")
    .map((line) => line.replace(/^\s*[-*•\d.)]+\s*/, "").trim())
    .filter((line) => line && !isNone(line))
    .slice(0, MAX_FACTS);
}

/** [ESLATMA]: JSON — [{"vaqt": "2026-11-13T10:00:00+05:00", "matn": "..."}] (bitta obyekt ham bo'ladi). */
export function parseReminders(body) {
  if (!body || isNone(body)) return [];
  const start = body.search(/[[{]/);
  if (start === -1) return [];
  const close = body.lastIndexOf(body[start] === "[" ? "]" : "}");
  const data = tryJson(body.slice(start, close + 1));
  const list = Array.isArray(data) ? data : data && typeof data === "object" ? [data] : [];
  return list
    .map((r) => ({ dueAt: String(r?.vaqt ?? r?.dueAt ?? "").trim(), text: String(r?.matn ?? r?.text ?? "").trim() }))
    .filter((r) => r.dueAt && r.text)
    .slice(0, MAX_REMINDERS);
}

/** [FAYL]: birinchi qator — "nomi: reja.csv", keyin mazmun (``` ichida bo'lishi mumkin). */
export function parseFile(body) {
  if (!body || isNone(body)) return null;
  const [first, ...rest] = body.split("\n");
  const rawName = first.replace(/^\s*(nomi|name|fayl)\s*:\s*/i, "").trim();
  let content = rest.join("\n");
  const fence = content.match(/```[a-z]*[ \t]*\n([\s\S]*?)```/i);
  if (fence) content = fence[1];
  content = content.replace(/^\n+|\s+$/g, "");
  if (!content) return null;
  const base = rawName.replace(/[^\p{L}\p{N} ._-]+/gu, "").replace(/\s+/g, "-").replace(/^[.-]+/, "").slice(0, 80);
  const ext = (base.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();
  const name = FILE_TYPES[ext] ? base : `${base.replace(/\.[a-z0-9]+$/i, "") || "jigar"}.txt`;
  return { nomi: name, mazmun: content.slice(0, MAX_FILE_CHARS) };
}

/** [SAVOL]: o'quvchining ovozli savoli to'g'ri imlo bilan (chatda xom tanilgan matn o'rniga). Bo'sh — null. */
export function parseHeard(body) {
  const line = String(body ?? "").replace(/\s+/g, " ").replace(/^["'«“]+|["'»”]+$/g, "").trim();
  if (!line || NO_VISUAL.has(line.toLowerCase().replace(/[."!]+$/g, ""))) return null;
  return line.slice(0, MAX_HEARD_CHARS);
}

export function parseVisual(body) {
  if (!body) return null;
  let code = body.trim();
  const fence = code.match(/```(?:mermaid|svg|xml|html)?[ \t]*\n([\s\S]*?)```/i);
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
