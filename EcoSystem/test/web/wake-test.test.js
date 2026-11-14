// "Hey Jigar"ni sinash: natija izohi — past ovoz, bo'sh matn, ism tanildi / tanilmadi.
import { test } from "node:test";
import assert from "node:assert/strict";
import { wakeVerdict } from "../../web/app/wake-test.js";

test("wakeVerdict: ovoz past — mikrofon haqida aytadi", () => {
  const { ok, note } = wakeVerdict(0.001, "Hey Jigar");
  assert.equal(ok, false);
  assert.match(note, /past/);
});

test("wakeVerdict: matn bo'sh — tanilmadi", () => {
  assert.equal(wakeVerdict(0.1, "").ok, false);
});

test("wakeVerdict: ism tanildi / boshqa so'z", () => {
  assert.equal(wakeVerdict(0.1, "Hey Jigar").ok, true);
  assert.equal(wakeVerdict(0.1, "salom dunyo").ok, false);
});
