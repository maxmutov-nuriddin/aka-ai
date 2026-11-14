// jigar:// havolalari: faqat "listen" qabul qilinadi; buyruq matni havoladan olinmaydi.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { deepLinkAction, deepLinkFromArgv } = require("../../desktop/deep-link.js");

test("deepLinkAction: jigar://listen — listen; boshqasi — null", () => {
  assert.equal(deepLinkAction("jigar://listen"), "listen");
  assert.equal(deepLinkAction("JIGAR://Listen/"), "listen");
  assert.equal(deepLinkAction("jigar://ask?text=rm -rf"), null, "matnli buyruq yo'q");
  assert.equal(deepLinkAction("https://listen"), null);
  assert.equal(deepLinkAction("buzuq"), null);
});

test("deepLinkFromArgv: Windows argv ichidan havola", () => {
  assert.equal(deepLinkFromArgv(["Jigar.exe", "--hidden", "jigar://listen"]), "jigar://listen");
  assert.equal(deepLinkFromArgv(["Jigar.exe"]), null);
});
