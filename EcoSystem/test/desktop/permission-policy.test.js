// Desktop ruxsat qarorlari: saqlangan javob → ruxsat/rad/so'rash; tizim to'sganmi; sozlamalar havolasi.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { mediaDecision, osBlocked, MIC_SETTINGS_URL, mediaLabel } = require("../../desktop/permission-policy.js");

test("mediaDecision: saqlangan javob bo'lmasa — so'raydi; bo'lsa — shuni qo'llaydi", () => {
  assert.equal(mediaDecision(undefined), "ask");
  assert.equal(mediaDecision(null), "ask");
  assert.equal(mediaDecision("granted"), "allow");
  assert.equal(mediaDecision("denied"), "deny");
  assert.equal(mediaDecision("nomalum"), "ask"); // buzilgan qiymat — xavfsiz tomonga: qayta so'raydi
});

test("osBlocked: faqat 'denied' va 'restricted' to'sgan hisoblanadi", () => {
  assert.equal(osBlocked("denied"), true);
  assert.equal(osBlocked("restricted"), true);
  assert.equal(osBlocked("granted"), false);
  assert.equal(osBlocked("not-determined"), false);
  assert.equal(osBlocked(undefined), false);
});

test("MIC_SETTINGS_URL: Windows — ms-settings, macOS — System Settings Mikrofon bo'limi", () => {
  assert.equal(MIC_SETTINGS_URL.win32, "ms-settings:privacy-microphone");
  assert.match(MIC_SETTINGS_URL.darwin, /Privacy_Microphone$/);
});

test("mediaLabel: audio — mikrofon, video — kamera, ikkalasi — 'mikrofon va kamera'; bo'sh — mikrofon", () => {
  assert.equal(mediaLabel(["audio"]), "mikrofon");
  assert.equal(mediaLabel(["video"]), "kamera");
  assert.equal(mediaLabel(["audio", "video"]), "mikrofon va kamera");
  assert.equal(mediaLabel([]), "mikrofon");
  assert.equal(mediaLabel(undefined), "mikrofon");
});
