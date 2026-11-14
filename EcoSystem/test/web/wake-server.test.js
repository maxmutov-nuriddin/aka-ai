// Desktop "Hey Jigar": ovoz faolligi bo'yicha bo'laklash — qisqa gap yuboriladi, shovqin va uzun nutq yuborilmaydi.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSegmenter, encodeWav } from "../../web/app/wake-server.js";

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

test("'Hey Jigar, ovozni 40 qil' (≈4 s, bir nafasda) — yuboriladi", () => {
  const events = run(createSegmenter(), [[0, 300], [0.1, 4000], [0, 800]]);
  assert.equal(events[1].keep, true);
});

test("uzun nutq (> 6 s, oddiy suhbat yoki TV) — kesiladi va yuborilmaydi", () => {
  const events = run(createSegmenter(), [[0.1, 8000]]);
  assert.equal(events[1].keep, false);
});

test("encodeWav: 16-bit mono WAV sarlavhasi va namunalar", async () => {
  const blob = encodeWav([new Float32Array([0, 1, -1]), new Float32Array([0.5])], 16000);
  const view = new DataView(await blob.arrayBuffer());
  assert.equal(blob.type, "audio/wav");
  assert.equal(view.byteLength, 44 + 4 * 2);
  assert.equal(String.fromCharCode(...new Uint8Array(await blob.slice(0, 4).arrayBuffer())), "RIFF");
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getInt16(46, true), 0x7fff);
  assert.equal(view.getInt16(48, true), -0x8000);
});

test("createSegmenter.feed: moslashuvchan sezgirlik — past ovozli mikrofon ham boshlanadi; baland shovqinda boshlanmaydi", () => {
  const quiet = createSegmenter();
  let events = [];
  for (let t = 0; t < 1000; t += 50) { const e = quiet.feed(0.012, t, 0.008); if (e) events.push(e); }
  assert.equal(events[0], "start"); // 0.012 >= 0.008 — past ovoz tanildi
  const noisy = createSegmenter();
  events = [];
  for (let t = 0; t < 1000; t += 50) { const e = noisy.feed(0.012, t, 0.03); if (e) events.push(e); }
  assert.deepEqual(events, []); // 0.012 < 0.03 — shovqin deb hisoblanadi
});
