// Fon holati yozuvi: holat → yorliq; idle va noma'lum holat — yozuv yo'q.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { pillLabel, PILL_HIDE_DELAY_MS } = require("../../desktop/pill-policy.js");

test("pillLabel: faol holatlar — yozuv; idle va noma'lum — null", () => {
  assert.equal(pillLabel("listening"), "Tinglayapti…");
  assert.equal(pillLabel("transcribing"), "Eshityapman…");
  assert.equal(pillLabel("thinking"), "O'ylayapti…");
  assert.equal(pillLabel("speaking"), "Gapiryapti…");
  assert.equal(pillLabel("idle"), null);
  assert.equal(pillLabel("nomalum"), null);
  assert.ok(PILL_HIDE_DELAY_MS > 0);
});
