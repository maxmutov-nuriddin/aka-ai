import { test } from "node:test";
import assert from "node:assert/strict";
import { createSpeechFeed } from "../../web/app/speech-feed.js";

/** Javobni belgi-belgi (yoki bo'lak-bo'lak) beradi va o'qishga berilganlarni yig'adi. */
function feedAll(chunks) {
  const said = [];
  let ended = 0;
  const feed = createSpeechFeed({ lang: "uz", say: (t) => said.push(t), end: () => ended++ });
  for (const c of chunks) feed.push(c);
  return { said, feed, ended: () => ended };
}

const ANSWER = "[SAVOL]\nFotosintez nima?\n\n[TUSHUNTIRISH]\nFotosintez — o'simlik ovqat yasashi. Barg quyosh nurini ushlaydi va suvni parchalaydi. "
  + "Natijada kislorod chiqadi va shakar hosil bo'ladi, o'simlik shu bilan o'sadi.\n\n[ESDA QOLSIN]\nNur + suv = ovqat.\n\n[VIZUAL]\nyo'q\n\n[QUIZ]\nyo'q";

test("birinchi to'liq gap javob tugashidan oldin o'qishga beriladi; [SAVOL] o'qilmaydi", () => {
  const { said } = feedAll([...ANSWER.slice(0, ANSWER.indexOf("Barg") + 5)]);
  assert.equal(said.length, 1);
  assert.match(said[0], /^Fotosintez/);
  assert.doesNotMatch(said.join(" "), /Fotosintez nima\?/);
});

test("finish: qolgan tushuntirish va 'Esda qolsin' bir marta, takrorsiz; end chaqiriladi", () => {
  const { said, feed, ended } = feedAll([...ANSWER]);
  feed.finish({ tushuntirish: "(ishlatilmaydi)", esdaQolsin: "Nur + suv = ovqat.", quiz: null });
  const all = said.join(" ");
  assert.equal(all.match(/o'simlik ovqat yasashi/g).length, 1);
  assert.equal(all.match(/kislorod chiqadi/g).length, 1);
  assert.match(said.at(-1), /Esda qolsin/);
  assert.equal(ended(), 1);
});

test("sarlavhasiz javob: oqimda hech narsa o'qilmaydi, finish butun tushuntirishni beradi", () => {
  const { said, feed } = feedAll(["Salom! Bu oddiy javob. Hammasi joyida."]);
  assert.equal(said.length, 0);
  feed.finish({ tushuntirish: "Salom! Bu oddiy javob. Hammasi joyida.", esdaQolsin: "", quiz: null });
  assert.equal(said.length, 1);
  assert.match(said[0], /oddiy javob/);
});
