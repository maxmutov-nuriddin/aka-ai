// "Hey Jigar": fonda tinglash yonib-o'chib turmasin — tez uzilishda kutish oshadi, tuzalmaydigan xatoda to'xtaydi.
import { test } from "node:test";
import assert from "node:assert/strict";

/** Soxta brauzer: har start() — yangi tinglash; testdan uni xato yoki tugash bilan yakunlaymiz. */
function fakeRecognition() {
  const sessions = [];
  class Recognition {
    start() { sessions.push(this); }
    abort() { this.aborted = true; }
    fail(error) { this.onerror?.({ error }); this.onend?.(); }
  }
  globalThis.window = { SpeechRecognition: Recognition };
  return sessions;
}

const { createWake, backoffDelay, hasWakeWord } = await import("../../web/app/wake.js");

test("backoffDelay: 0.4 s, keyin 1, 2, 4 ... 30 s gacha", () => {
  assert.equal(backoffDelay(0), 400);
  assert.equal(backoffDelay(1), 1000);
  assert.equal(backoffDelay(3), 4000);
  assert.equal(backoffDelay(20), 30_000);
  assert.ok(hasWakeWord("hey jigar"));
});

test("tuzalmaydigan xato (network — Electron) — qayta yoqilmaydi, onUnavailable bir marta", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const sessions = fakeRecognition();
  const reasons = [];
  const wake = createWake({ onWake() {}, onUnavailable: (r) => reasons.push(r) });
  wake.setEnabled(true);
  sessions[0].fail("network");
  t.mock.timers.tick(60_000);
  assert.equal(sessions.length, 1, "mikrofon qayta yoqilmadi");
  assert.deepEqual(reasons, ["network"]);
  assert.equal(wake.enabled, false);
});

test("tez uzilishlar — kutish oshadi, 5 tadan keyin to'xtaydi", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const sessions = fakeRecognition();
  const reasons = [];
  const wake = createWake({ onWake() {}, onUnavailable: (r) => reasons.push(r) });
  wake.setEnabled(true);
  sessions[0].fail("no-speech");
  t.mock.timers.tick(999);
  assert.equal(sessions.length, 1, "1 s dan oldin qayta yoqilmaydi");
  t.mock.timers.tick(1);
  assert.equal(sessions.length, 2);
  for (let i = 1; i < 5; i++) {
    sessions.at(-1).fail("no-speech");
    t.mock.timers.tick(30_000);
  }
  assert.deepEqual(reasons, ["unstable"]);
  assert.equal(sessions.length, 5);
});

test("uzoq ishlagan tinglash tugasa — tez (0.4 s) qayta yoqiladi, hisob nolga tushadi", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const sessions = fakeRecognition();
  const wake = createWake({ onWake() {} });
  wake.setEnabled(true);
  t.mock.timers.tick(60_000); // bir daqiqa tingladi
  sessions[0].fail("no-speech");
  t.mock.timers.tick(400);
  assert.equal(sessions.length, 2);
  wake.setEnabled(false);
  sessions[1].fail("aborted");
  t.mock.timers.tick(60_000);
  assert.equal(sessions.length, 2, "o'chirilgach qayta yoqilmaydi");
});
