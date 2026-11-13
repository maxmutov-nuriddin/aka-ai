// Desktop "Hey Jigar": ovoz faolligi bo'yicha bo'laklash — qisqa gap yuboriladi, shovqin va uzun nutq yuborilmaydi.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSegmenter } from "../../web/app/wake-server.js";

/** [daraja, davomiylik ms] ketma-ketligini 50 ms qadam bilan beradi. */
function run(segmenter, pattern) {
  const events = [];
  let t = 0;
  for (const [level, ms] of pattern) {
    for (let end = t + ms; t < end; t += 50) {
      const e = segmenter.feed(level, t);
      if (e) events.push(e);
    }
  }
  return events;
}

test("'Hey Jigar' (≈1 s) — boshlanadi va yuboriladi", () => {
  const events = run(createSegmenter(), [[0, 300], [0.1, 1000], [0, 800]]);
  assert.equal(events[0], "start");
  assert.equal(events[1].keep, true);
  assert.ok(events[1].end >= 900 && events[1].end <= 1100);
});

test("qisqa taqillash (< 0.35 s) — yuborilmaydi; jimlik — hech narsa", () => {
  assert.equal(run(createSegmenter(), [[0.1, 200], [0, 800]])[1].keep, false);
  assert.deepEqual(run(createSegmenter(), [[0.001, 5000]]), []);
});

test("uzun nutq (> 3 s, oddiy suhbat) — kesiladi va yuborilmaydi", () => {
  const events = run(createSegmenter(), [[0.1, 5000]]);
  assert.equal(events[1].keep, false);
});
