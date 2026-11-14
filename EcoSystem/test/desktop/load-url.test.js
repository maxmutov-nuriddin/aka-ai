// loadTolerant: YouTube qayta yo'naltirishi (ERR_ABORTED) — xato emas; vaqtinchalik xato — qayta urinish; haqiqiy xato — tashlanadi.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadTolerant } = require("../../desktop/load-url.js");
const noSleep = async () => {};
const err = (errno, code) => Object.assign(new Error(`${code} (${errno})`), { errno, code });
const page = (results, url = "https://www.youtube.com/watch?v=x") => {
  let calls = 0;
  return { calls: () => calls, loadURL: async () => { const r = results[Math.min(calls++, results.length - 1)]; if (r) throw r; }, getURL: () => url };
};

test("muvaffaqiyatli yuklash — xato yo'q, bitta urinish", async () => {
  const p = page([null]);
  await loadTolerant(p, "https://www.youtube.com/watch?v=x", { host: "youtube.com", sleep: noSleep });
  assert.equal(p.calls(), 1);
});

test("ERR_ABORTED (-3): sahifa qayta yo'naltirilgan — xato emas, qayta urinilmaydi", async () => {
  const p = page([err(-3, "ERR_ABORTED")]);
  await loadTolerant(p, "https://www.youtube.com/watch?v=x", { host: "youtube.com", sleep: noSleep });
  assert.equal(p.calls(), 1);
});

test("ERR_FAILED (-2): bir marta qayta uriniladi; ikkinchisi o'tsa — davom etadi", async () => {
  const p = page([err(-2, "ERR_FAILED"), null]);
  await loadTolerant(p, "https://www.youtube.com/watch?v=x", { host: "youtube.com", sleep: noSleep });
  assert.equal(p.calls(), 2);
});

test("ikki marta yiqilsa-yu sahifa kerakli xostda turgan bo'lsa — davom etadi; boshqa xostda — xato", async () => {
  await loadTolerant(page([err(-2, "ERR_FAILED")]), "https://www.youtube.com/x", { host: "youtube.com", sleep: noSleep });
  await assert.rejects(
    loadTolerant(page([err(-105, "ERR_NAME_NOT_RESOLVED")], "about:blank"), "https://www.youtube.com/x", { host: "youtube.com", sleep: noSleep }),
    /ERR_NAME_NOT_RESOLVED/,
  );
});
