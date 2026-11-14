// Desktop: tayyor server manzillari — domen, keyin zaxira (sslip); takror va noto'g'ri manzil tashlanadi.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { presetUrls } = require("../../desktop/server-url.js");

test("presetUrls: serverUrls tartibi, eski serverUrl qo'shiladi, takror/buzuq tashlanadi", () => {
  assert.deepEqual(
    presetUrls({ serverUrls: ["https://a.uz", "yomon manzil", "https://b.io"], serverUrl: "https://a.uz" }),
    ["https://a.uz", "https://b.io"],
  );
  assert.deepEqual(presetUrls({ serverUrl: "https://a.uz" }), ["https://a.uz"]);
  assert.deepEqual(presetUrls(undefined), []);
});

test("presetUrls: ilova ichidagi ro'yxatda zaxira manzil bor", () => {
  const urls = presetUrls(require("../../desktop/package.json").jigar);
  assert.ok(urls.length >= 2);
});
