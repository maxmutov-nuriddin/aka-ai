import { test } from "node:test";
import assert from "node:assert/strict";
import { fitLevel, levelsForGoal, LEVEL_ORDER } from "../../server/core/levels.js";
import { normalizeProfile } from "../../server/auth/profile.js";
import { ValidationError } from "../../server/core/jigar.js";

test("yo'nalishga mos sinflar: maktab va olimpiadada talaba yo'q, universitetda faqat talaba", () => {
  assert.deepEqual(levelsForGoal("study"), ["5-7", "8-9", "10-11"]);
  assert.deepEqual(levelsForGoal("olympiad"), ["5-7", "8-9", "10-11"]);
  assert.deepEqual(levelsForGoal("exam"), ["8-9", "10-11", "student"]);
  assert.deepEqual(levelsForGoal("university"), ["student"]);
  assert.deepEqual(levelsForGoal("language"), LEVEL_ORDER);
  assert.deepEqual(levelsForGoal("curious"), LEVEL_ORDER);
  assert.deepEqual(levelsForGoal(undefined), LEVEL_ORDER);
});

test("fitLevel: mos kelmasa eng yaqin ruxsat etilgan sinf; bitta variant bo'lsa — o'sha", () => {
  assert.equal(fitLevel("study", "student"), "10-11");
  assert.equal(fitLevel("exam", "5-7"), "8-9");
  assert.equal(fitLevel("university", "8-9"), "student");
  assert.equal(fitLevel("university", undefined), "student");
  assert.equal(fitLevel("study", "8-9"), "8-9");
  assert.equal(fitLevel("study", undefined), undefined);
});

test("profil: yo'nalishga mos kelmaydigan sinf rad etiladi; universitetda sinf avtomatik talaba", () => {
  assert.throws(() => normalizeProfile({ goal: "study", level: "student" }), ValidationError);
  assert.throws(() => normalizeProfile({ goal: "university", level: "5-7" }), ValidationError);
  assert.deepEqual(normalizeProfile({ goal: "university" }), { goal: "university", level: "student" });
  assert.deepEqual(normalizeProfile({ goal: "exam", level: "student" }), { goal: "exam", level: "student" });
});
