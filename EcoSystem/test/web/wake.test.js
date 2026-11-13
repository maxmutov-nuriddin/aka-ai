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

test("brauzerda network — vaqtinchalik: to'xtamaydi, kutib qayta urinadi; ruxsat yo'q — to'xtaydi", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const sessions = fakeRecognition();
  const reasons = [];
  const wake = createWake({ onWake() {}, onUnavailable: (r) => reasons.push(r) });
  wake.setEnabled(true);
  sessions[0].fail("network");
  t.mock.timers.tick(60_000);
  assert.equal(sessions.length, 2, "qayta yoqildi");
  assert.equal(wake.enabled, true);
  sessions[1].fail("not-allowed");
  t.mock.timers.tick(60_000);
  assert.deepEqual(reasons, ["not-allowed"]);
  assert.equal(wake.enabled, false);
});

test("tez uzilishlar — kutish oshadi (≤ 30 s), lekin tinglash hech qachon o'zi o'chmaydi; eshitsa hisob nolga", (t) => {
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
  for (let i = 0; i < 10; i++) {
    sessions.at(-1).fail("no-speech");
    t.mock.timers.tick(30_000);
  }
  assert.equal(sessions.length, 12, "10 ta tez uzilishdan keyin ham tinglayapti");
  assert.deepEqual(reasons, []);
  let woke = 0;
  const wake2 = createWake({ onWake: () => woke++ });
  wake2.setEnabled(true);
  sessions.at(-1).onresult({ resultIndex: 0, results: [[{ transcript: "hey jigar" }]] });
  assert.equal(woke, 1);
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
