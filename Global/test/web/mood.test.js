// Jonli xarakter: yangi yuz teglari va suhbat davomida to'planadigan jahl darajasi.
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectEmotion, emotionsIn } from "../../web/app/speech.js";
import { nextHeat, createMood, HEAT_MAX } from "../../web/app/mood.js";

test("yangi teglar o'z kayfiyatiga: rashk, mehr, hayrat, zerikish, yig'i, g'urur", () => {
  assert.equal(detectEmotion("[jealous] Nima-a? ChatGPT?!"), "jealous");
  assert.equal(detectEmotion("[love] Ehh, sendan xafa bo'lib bo'lmaydi"), "love");
  assert.equal(detectEmotion("[shocked] Voy-voy!"), "shocked");
  assert.equal(detectEmotion("[bored] Zzz... yana shu xato"), "bored");
  assert.equal(detectEmotion("[crying] Meni xafa qilding..."), "crying");
  assert.equal(detectEmotion("[proud] Ana!"), "proud");
  assert.deepEqual(emotionsIn("[jealous] Nima? [angry] Yana! [smiles] Mayli. [noma'lum] x"), ["jealous", "angry", "happy"]);
  assert.deepEqual(emotionsIn("Tegsiz matn"), []);
});

test("nextHeat: haqorat va rashk oshiradi, baqiriq — ikki pog'ona, mehr va maqtov pasaytiradi; 0..max", () => {
  assert.equal(nextHeat(0, ["angry"]), 1);
  assert.equal(nextHeat(1, ["jealous", "angry"]), 3);
  assert.equal(nextHeat(0, ["furious"]), 2);
  assert.equal(nextHeat(3, ["furious", "angry"]), HEAT_MAX, "yuqoridan oshmaydi");
  assert.equal(nextHeat(2, ["love"]), 1);
  assert.equal(nextHeat(0, ["happy", "proud"]), 0, "pastdan tushmaydi");
  assert.equal(nextHeat(1, ["curious", "sad"]), 1, "boshqa kayfiyatlar ta'sir qilmaydi");
  assert.equal(nextHeat(1, ["furious"], 2), 2, "jahldor/beparvo — eng ko'pi 2");
});

test("createMood: to'planadi, vaqt bilan so'nadi, reset — nol", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const seen = [];
  const mood = createMood({ onHeat: (h) => seen.push(h), coolDownMs: 1000 });
  mood.feed(["angry"]);
  mood.feed(["angry", "angry"]);
  assert.equal(mood.heat, 3);
  t.mock.timers.tick(1000);
  assert.equal(mood.heat, 2);
  mood.feed(["angry"]); // yana jahl — so'nish taymeri qaytadan
  t.mock.timers.tick(999);
  assert.equal(mood.heat, 3);
  for (let i = 0; i < 3; i++) t.mock.timers.tick(1000); // har pog'ona — alohida taymer
  assert.equal(mood.heat, 0, "hammasi so'ndi");
  mood.feed(["furious"]);
  mood.reset();
  assert.equal(mood.heat, 0);
  assert.deepEqual(seen, [1, 3, 2, 3, 2, 1, 0, 2, 0]);
  const capped = createMood({ onHeat: () => {}, max: () => 2 });
  capped.feed(["furious", "furious"]);
  assert.equal(capped.heat, 2);
});
