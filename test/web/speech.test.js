import { test } from "node:test";
import assert from "node:assert/strict";
import { toSpeechText, splitForSpeech, matchQuizAnswer, toSpokenUzbek, numberToUzbek, ordinalToUzbek, detectEmotion, inferEmotion, planEmotions, emotionAt, toSpokenRussian } from "../../web/app/speech.js";
import { revealUpTo } from "../../web/app/caption.js";

const QUIZ = {
  savol: "Fotosintez uchun nima kerak?",
  variantlar: ["A) Qor", "B) Quyosh nuri", "C) Qum", "D) Tosh"],
  togri: "B",
  izoh: "Quyoshsiz oshxona ishlamaydi.",
};

test("toSpeechText tushuntirish, esda qolsin va quizni o'qiladigan matnga aylantiradi", () => {
  const text = toSpeechText({
    tushuntirish: "Eshit, **jigar**, bu `oshxona`.",
    esdaQolsin: "O'simlik ovqat tayyorlaydi.",
    vizual: "graph LR\n A --> B",
    quiz: QUIZ,
  });
  assert.match(text, /^Eshit, jigar, bu oshxona\./);
  assert.match(text, /Esda qolsin: O'simlik ovqat tayyorlaydi\./);
  assert.match(text, /Fotosintez uchun nima kerak\?/);
  assert.match(text, /Ikkinchi variant: Quyosh nuri/);
  assert.doesNotMatch(text, /graph LR/);
  assert.doesNotMatch(text, /\*\*|`/);
});

test("toSpeechText bo'sh javobda bo'sh qator qaytaradi", () => {
  assert.equal(toSpeechText({ tushuntirish: "", esdaQolsin: "", quiz: null }), "");
  assert.equal(toSpeechText(null), "");
});

test("splitForSpeech uzun matnni gaplar bo'yicha bo'laklarga bo'ladi", () => {
  const sentence = "Bu bitta gap. ";
  const chunks = splitForSpeech(sentence.repeat(40), 100);
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(c.length <= 100, `bo'lak juda uzun: ${c.length}`);
  assert.equal(chunks.join(" ").replace(/\s+/g, " ").trim(), sentence.repeat(40).trim());
});

test("splitForSpeech nuqtasiz juda uzun gapni ham kesadi", () => {
  const chunks = splitForSpeech("so'z ".repeat(100), 50);
  for (const c of chunks) assert.ok(c.length <= 50);
});

test("matchQuizAnswer harf bilan aytilgan javobni topadi", () => {
  assert.equal(matchQuizAnswer("B", QUIZ), "B");
  assert.equal(matchQuizAnswer("javob b", QUIZ), "B");
  assert.equal(matchQuizAnswer("D variant", QUIZ), "D");
  assert.equal(matchQuizAnswer("Б", QUIZ), "B");
});

test("matchQuizAnswer tartib so'zi bilan aytilgan javobni topadi", () => {
  assert.equal(matchQuizAnswer("birinchisi", QUIZ), "A");
  assert.equal(matchQuizAnswer("uchinchi variant", QUIZ), "C");
  assert.equal(matchQuizAnswer("to'rtinchi", QUIZ), "D");
});

test("matchQuizAnswer variant matni bilan aytilgan javobni topadi", () => {
  assert.equal(matchQuizAnswer("quyosh nuri", QUIZ), "B");
  assert.equal(matchQuizAnswer("menimcha quyosh nuri kerak", QUIZ), "B");
});

test("matchQuizAnswer oddiy savolni quiz javobi deb olmaydi", () => {
  assert.equal(matchQuizAnswer("fotosintez qayerda bo'ladi, tushuntirib ber", QUIZ), null);
  assert.equal(matchQuizAnswer("", QUIZ), null);
  assert.equal(matchQuizAnswer("B", null), null);
});

test("splitForSpeech birinchi bo'lakni qisqa qiladi (tez boshlash uchun)", () => {
  const text = "Birinchi gap juda muhim. " + "Bu keyingi gap. ".repeat(30);
  const chunks = splitForSpeech(text, 200, 40);
  assert.ok(chunks[0].length <= 40, `birinchi bo'lak: ${chunks[0].length}`);
  assert.ok(chunks.slice(1).every((c) => c.length <= 200));
  assert.ok(chunks[1].length > 40);
});

test("toSpeechText ovoz teglarini saqlaydi", () => {
  const text = toSpeechText({ tushuntirish: "[laughs] Eshit, jigar.", esdaQolsin: "", quiz: null });
  assert.equal(text, "[laughs] Eshit, jigar.");
});

test("numberToUzbek sonlarni o'zbekcha so'z bilan yozadi", () => {
  assert.equal(numberToUzbek(0), "nol");
  assert.equal(numberToUzbek(101), "yuz bir");
  assert.equal(numberToUzbek(1000), "ming");
  assert.equal(numberToUzbek(2026), "ikki ming yigirma olti");
  assert.equal(numberToUzbek(250000), "ikki yuz ellik ming");
  assert.equal(numberToUzbek(1000000), "bir million");
});

test("ordinalToUzbek tartib sonni yasaydi", () => {
  assert.equal(ordinalToUzbek(1), "birinchi");
  assert.equal(ordinalToUzbek(2), "ikkinchi");
  assert.equal(ordinalToUzbek(4), "to'rtinchi");
  assert.equal(ordinalToUzbek(2026), "ikki ming yigirma oltinchi");
});

test("toSpokenUzbek raqam, formula, emoji va baqiriqni o'zbekcha o'qiladigan qiladi", () => {
  assert.equal(toSpokenUzbek("2026-yilda 15% o'sdi 🌱"), "ikki ming yigirma oltinchi yilda o'n besh foiz o'sdi");
  assert.equal(toSpokenUzbek("karbonat angidrid (CO2) gazi"), "karbonat angidrid gazi");
  assert.equal(toSpokenUzbek("suv H2O"), "suv ash ikki o");
  assert.equal(toSpokenUzbek("3,5 kg"), "uch butun besh kilogramm");
  assert.equal(toSpokenUzbek("2 + 2 = 4"), "ikki qo'shuv ikki teng to'rt");
  assert.equal(toSpokenUzbek("quyosh nuri + suv = shakar"), "quyosh nuri va suv, natijada shakar");
  assert.equal(toSpokenUzbek("[shouts] Ha, DANGASA! DNK"), "[shouts] Ha, Dangasa! DNK");
});

test("detectEmotion ovoz tegidan kayfiyatni topadi", () => {
  assert.equal(detectEmotion("Salom [laughs] jigar"), "happy");
  assert.equal(detectEmotion("[laughs harder] voy"), "happy");
  assert.equal(detectEmotion("[nimadir] keyin [sighs]"), "sad");
  assert.equal(detectEmotion("[shouts] TENTAK"), "furious");
  assert.equal(detectEmotion("tegsiz gap"), null);
});

test("revealUpTo yozuvni so'z oxirigacha ochadi", () => {
  const text = "Eshit jigar bu oson";
  assert.equal(revealUpTo(text, 0), 0);
  assert.equal(revealUpTo(text, 2), 5); // "Eshit"
  assert.equal(revealUpTo(text, 6), 11); // "Eshit jigar"
  assert.equal(revealUpTo(text, 17), text.length);
  assert.equal(revealUpTo(text, 99), text.length);
});

test("toSpeechText quiz variantlarini harf emas, tartib so'zi bilan o'qiydi", () => {
  const text = toSpeechText({ quiz: QUIZ });
  assert.match(text, /Birinchi variant: Qor\./);
  assert.match(text, /To'rtinchi variant: Tosh\./);
  assert.doesNotMatch(text, /\b[ABCD]\)/);
});

test("toSpokenUzbek inglizcha so'zlarni o'zbekchasiga almashtiradi", () => {
  assert.equal(toSpokenUzbek("Okay, jigar, bu cool"), "xo'p, jigar, bu zo'r");
});

test("inferEmotion gapning o'zidan kayfiyatni topadi", () => {
  assert.equal(inferEmotion("Ey tentak, yana xato!"), "angry");
  assert.equal(inferEmotion("Zo'r, jigar, to'g'ri topding."), "happy");
  assert.equal(inferEmotion("Afsus, bu qiyin mavzu."), "sad");
  assert.equal(inferEmotion("Ha, albatta, sen akademiksan."), "smirk");
  assert.equal(inferEmotion("Nega osmon ko'k?"), "curious");
  assert.equal(inferEmotion("Bu juda qiziq!"), "excited");
  assert.equal(inferEmotion("Kasr butunning bo'lagi."), null);
});

test("planEmotions har gap uchun kayfiyat belgilaydi, emotionAt hozirgisini qaytaradi", () => {
  const { text, marks } = planEmotions("[laughs] Eshit, jigar. Kasr bu bo'lak. Nega shunday?");
  assert.equal(text, "Eshit, jigar. Kasr bu bo'lak. Nega shunday?");
  assert.deepEqual(marks.map((m) => m.emotion), ["happy", "happy", "curious"]);
  assert.equal(emotionAt(marks, 0), "happy");
  assert.equal(emotionAt(marks, text.indexOf("Nega")), "curious");
});

test("toSpeechText ruscha: yorliqlar va variantlar ruscha", () => {
  const text = toSpeechText({ tushuntirish: "Слушай, братишка 🍕", esdaQolsin: "Дробь — часть целого.", quiz: QUIZ }, "ru");
  assert.match(text, /^Слушай, братишка$/m);
  assert.match(text, /Запомни: Дробь/);
  assert.match(text, /Теперь вопрос\./);
  assert.match(text, /Второй вариант: Quyosh nuri\./);
});

test("toSpokenRussian baqiriqni pasaytiradi, qisqartmani saqlaydi", () => {
  assert.equal(toSpokenRussian("НЕТ, балбес! Это ДНК 😤"), "Нет, балбес! Это ДНК");
  assert.equal(toSpokenRussian("углекислый газ (CO2) нужен"), "углекислый газ нужен");
});

test("inferEmotion ruscha so'zlar va beparvo rejim", () => {
  assert.equal(inferEmotion("Ну ты и балбес."), "angry");
  assert.equal(inferEmotion("Молодец, братишка."), "happy");
  assert.equal(inferEmotion("Жаль, тема сложная."), "sad");
  assert.equal(inferEmotion("Ты серьёзно?", { mode: "beparvo" }), "smirk");
  assert.equal(inferEmotion("Quloq sol!", { mode: "beparvo" }), "furious");
  assert.equal(inferEmotion("YO'Q, eshak", { mode: "beparvo" }), "furious");
  assert.equal(inferEmotion("Quloq sol!"), "excited");
});

test("matchQuizAnswer ruscha tartib so'zlarini tushunadi", () => {
  assert.equal(matchQuizAnswer("второй вариант", QUIZ), "B");
  assert.equal(matchQuizAnswer("четвёртый", QUIZ), "D");
  assert.equal(matchQuizAnswer("бэ", QUIZ), "B");
});
