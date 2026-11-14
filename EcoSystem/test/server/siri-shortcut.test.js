// "Jigarga ayt" Siri buyrug'i: tavsif to'g'ri ketma-ketlikda, kalit va manzil tekshiriladi.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildShortcut, voiceUrl, TOKEN_RE } = require("../../desktop/siri-shortcut.js");
const TOKEN = "jgr_abcdefghij1234567890";

test("buildShortcut: 4 amal — yozish → so'rov → speech → aytish; kalit va manzil joyida", () => {
  const s = buildShortcut({ serverUrl: "https://example.uz/app/?x=1", token: TOKEN });
  const ids = s.WFWorkflowActions.map((a) => a.WFWorkflowActionIdentifier);
  assert.deepEqual(ids, ["is.workflow.actions.dictatetext", "is.workflow.actions.downloadurl", "is.workflow.actions.getvalueforkey", "is.workflow.actions.speaktext"]);
  const request = s.WFWorkflowActions[1].WFWorkflowActionParameters;
  assert.equal(request.WFURL, "https://example.uz/api/voice");
  assert.equal(request.WFHTTPMethod, "POST");
  assert.match(JSON.stringify(request.WFHTTPHeaders), new RegExp(`Bearer ${TOKEN}`));
  assert.equal(s.WFWorkflowActions[2].WFWorkflowActionParameters.WFDictionaryKey, "speech");
});

test("buildShortcut: amallar bir-biriga UUID bilan bog'lanadi", () => {
  const [dictate, request, value, speak] = buildShortcut({ serverUrl: "https://example.uz", token: TOKEN }).WFWorkflowActions.map((a) => a.WFWorkflowActionParameters);
  const body = JSON.stringify(request.WFJSONValues);
  assert.ok(body.includes(dictate.UUID));
  assert.equal(value.WFInput.Value.OutputUUID, request.UUID);
  assert.ok(JSON.stringify(speak.WFText).includes(value.UUID));
});

test("buildShortcut: noto'g'ri kalit yoki manzil — null (http tashqi manzil ham rad)", () => {
  assert.equal(buildShortcut({ serverUrl: "https://example.uz", token: "yomon" }), null);
  assert.equal(buildShortcut({ serverUrl: "http://example.uz", token: TOKEN }), null);
  assert.equal(buildShortcut({ serverUrl: "javascript:alert(1)", token: TOKEN }), null);
  assert.ok(buildShortcut({ serverUrl: "http://localhost:3100", token: TOKEN }));
  assert.equal(voiceUrl("https://a.uz/x"), "https://a.uz/api/voice");
  assert.equal(TOKEN_RE.test("jgr_" + "a".repeat(300)), false);
});
