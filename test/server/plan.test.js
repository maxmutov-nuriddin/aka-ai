import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TARIFFS, minutesForBudget, normalizePlan, planDailyMinutes, planPrice, recommendedMinutes, standardPlan,
} from "../../server/usage/tariffs.js";
import { systemPromptFor } from "../../server/core/jigar.js";

test("konstruktor narxi: tayyor tarifni yig'sa — narx aynan bir xil", () => {
  for (const [goal, t] of Object.entries(TARIFFS)) {
    assert.equal(planPrice([goal], t.minutes), t.price, goal);
  }
});

test("konstruktor narxi sarfga qarab: daqiqa ko'paysa — oshadi; bir nechta yo'nalishda — eng qimmat daqiqa narxi", () => {
  assert.equal(planPrice(["study"], 6), 125000); // 249000 / 12 x 6 = 124 500 -> 1000 ga yaxlitlanadi
  assert.ok(planPrice(["study"], 20) > planPrice(["study"], 12));
  // Maktab + Til: til daqiqasi qimmatroq (talaffuz) — shu narx olinadi.
  assert.equal(planPrice(["study", "language"], 12), TARIFFS.language.price);
  assert.equal(planPrice(["study", "exam"], 15), planPrice(["study"], 15)); // yo'nalishlar soni narxni oshirmaydi
});

test("summadan daqiqa, tavsiya va tekshiruv", () => {
  assert.equal(minutesForBudget(["study"], 249000), 12);
  assert.equal(minutesForBudget(["study"], 1000), 5); // kamida 5 daqiqa
  assert.equal(minutesForBudget(["study"], 99_000_000), 30); // ko'pi bilan 30
  assert.equal(recommendedMinutes(["study"]), 12);
  assert.equal(recommendedMinutes(["study", "language"]), 15); // eng kattasi + 3 har qo'shimchaga
  assert.equal(recommendedMinutes(["olympiad", "university", "exam", "study"]), 29);
  assert.deepEqual(normalizePlan({ goals: ["language", "study", "study"], minutes: 15 }), { goals: ["study", "language"], minutes: 15 });
  assert.equal(normalizePlan({ goals: [], minutes: 10 }), null);
  assert.equal(normalizePlan({ goals: ["hack"], minutes: 10 }), null);
  assert.equal(normalizePlan({ goals: ["study"], minutes: 3 }), null);
  assert.equal(normalizePlan({ goals: ["study"], minutes: 31 }), null);
  assert.deepEqual(standardPlan("exam"), { goals: ["exam"], minutes: 15 });
});

test("kunlik limit rejadan: teng foyda qoidasi — reja narxidan (415 000 x 0.83 / daqiqa narxi x 30)", () => {
  assert.equal(planDailyMinutes({ goals: ["study"], minutes: 20 }, "fishaudio", "claude"), 20.8);
  assert.equal(planDailyMinutes({ goals: ["study"], minutes: 20 }, "gemini", "claude"), 31.2);
});

test("Jigar: bir nechta yo'nalish — hammasi doirada; til tanlangan bo'lsa — gapirish murabbiyi ham", () => {
  const p = systemPromptFor("oddiy", "uz", { goals: ["study", "language"] });
  assert.match(p, /bir nechta yo'nalish/i);
  assert.match(p, /5–11-sinf/);
  assert.match(p, /# YO'NALISH: TIL O'RGANISH/);
  const single = systemPromptFor("oddiy", "uz", { goals: ["curious"] });
  assert.match(single, /Bu tarifga KIRMAYDI/); // bitta yo'nalish — eski qoida
  assert.doesNotMatch(systemPromptFor("oddiy", "uz", { goals: ["study", "exam"] }), /TIL O'RGANISH/);
});
