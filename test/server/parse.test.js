import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAkaResponse, parseQuiz, parseVisual, variantLetter, stripAudioTags } from "../../server/core/parse.js";

const SAMPLE = `[TUSHUNTIRISH]
Eshit, jigar, fotosintez — bu o'simlikning oshxonasi.
Quyosh nuri energiya beradi, shuning uchun o'simlik shakar yasaydi.

[ESDA QOLSIN]
O'simlik quyosh nuridan ovqat tayyorlaydi.

[VIZUAL]
\`\`\`mermaid
graph LR
  A[Quyosh] --> B[Barg]
\`\`\`

[QUIZ]
{"savol": "Fotosintez uchun nima kerak?", "variantlar": ["A) Qor", "B) Quyosh nuri", "C) Qum", "D) Tosh"], "togri": "B", "izoh": "Quyoshsiz oshxona ishlamaydi."}`;

test("to'liq javobni bo'limlarga ajratadi", () => {
  const r = parseAkaResponse(SAMPLE);
  assert.equal(r.structured, true);
  assert.match(r.tushuntirish, /^Eshit, jigar/);
  assert.match(r.tushuntirish, /shakar yasaydi\.$/);
  assert.equal(r.esdaQolsin, "O'simlik quyosh nuridan ovqat tayyorlaydi.");
  assert.equal(r.vizual, "graph LR\n  A[Quyosh] --> B[Barg]");
  assert.deepEqual(r.quiz, {
    savol: "Fotosintez uchun nima kerak?",
    variantlar: ["A) Qor", "B) Quyosh nuri", "C) Qum", "D) Tosh"],
    togri: "B",
    izoh: "Quyoshsiz oshxona ishlamaydi.",
  });
});

test("markdown bilan bezatilgan sarlavhalarni ham taniydi", () => {
  const r = parseAkaResponse("**[TUSHUNTIRISH]**\nSalom\n\n## [ESDA QOLSIN]\nEsla\n\n**[VIZUAL]**\nyo'q");
  assert.equal(r.tushuntirish, "Salom");
  assert.equal(r.esdaQolsin, "Esla");
  assert.equal(r.vizual, null);
  assert.equal(r.quiz, null);
});

test("sarlavha bilan bir qatorda yozilgan matnni yo'qotmaydi", () => {
  const r = parseAkaResponse("[ESDA QOLSIN] Bitta gap.");
  assert.equal(r.esdaQolsin, "Bitta gap.");
});

test("strukturasiz javob (masalan, xulosa) to'liq tushuntirishga tushadi", () => {
  const r = parseAkaResponse("Bugun zo'r o'qiding!\nTakrorlash kerak: kasrlar.");
  assert.equal(r.structured, false);
  assert.equal(r.tushuntirish, "Bugun zo'r o'qiding!\nTakrorlash kerak: kasrlar.");
});

test("VIZUAL: yo'q variantlari va fence'siz kod", () => {
  for (const v of ["yo'q", "Yo'q.", "yoʻq", "Нет", "  "]) assert.equal(parseVisual(v), null, v);
  assert.equal(parseVisual("graph TD\n A-->B"), "graph TD\n A-->B");
});

test("QUIZ: buzilgan yoki chala JSON null qaytaradi", () => {
  assert.equal(parseQuiz("hech narsa"), null);
  assert.equal(parseQuiz('{"savol": "x", "variantlar": ["A) 1"], "togri": "A"}'), null); // 1 ta variant
  assert.equal(parseQuiz('{"savol": "x", "variantlar": ["A) 1", "B) 2"], "togri": "E"}'), null); // yo'q harf
  assert.equal(parseQuiz('{"savol": "x", "variantlar": ["A) 1", "B) 2"], "togri": "A"'), null); // yopilmagan
});

test("QUIZ: aqlli qo'shtirnoq va atrofdagi matnga chidamli", () => {
  const q = parseQuiz('Mana:\n```json\n{“savol”: “2+2?”, “variantlar”: [“A) 3”, “B) 4”], “togri”: “b”, “izoh”: “oddiy”}\n```');
  assert.equal(q.togri, "B");
  assert.equal(q.savol, "2+2?");
});

test("QUIZ: kirill variantlar", () => {
  const q = parseQuiz('{"savol": "Сколько?", "variantlar": ["А) 1", "Б) 2", "В) 3"], "togri": "Б", "izoh": ""}');
  assert.equal(q.togri, "Б");
  assert.equal(variantLetter(q.variantlar[1], 1), "Б");
});

test("variantLetter: harfsiz variantga tartib bo'yicha harf beradi", () => {
  assert.equal(variantLetter("Quyosh", 2), "C");
  assert.equal(variantLetter("d. Tosh", 0), "D");
});

test("stripAudioTags ovoz teglarini olib tashlaydi, oddiy matnga tegmaydi", () => {
  assert.equal(stripAudioTags("[laughs] Eshit, jigar! [excited] Zo'r."), "Eshit, jigar! Zo'r.");
  assert.equal(stripAudioTags("Bu [low, gravelly voice] gap"), "Bu gap");
  assert.equal(stripAudioTags("Massiv [1, 2] va [A] harf"), "Massiv [1, 2] va [A] harf");
  assert.equal(stripAudioTags(""), "");
});
