// Desktop boshqaruv skriptlari (AppleScript / PowerShell) va YouTube yordamchilari — sof funksiyalar.
import { test } from "node:test";
import assert from "node:assert/strict";
import scripts from "../../desktop/scripts.js";
import policy from "../../desktop/policy.js";
import { createRequire } from "node:module";

const { mac, win, clampLevel } = scripts;

test("ovoz: daraja 0-100 ga keltiriladi; macOS va Windows skriptlari", () => {
  assert.equal(clampLevel(150), 100);
  assert.equal(clampLevel(-5), 0);
  assert.equal(clampLevel("abc"), 0);
  assert.equal(mac.volumeSet(35), "set volume output volume 35 without output muted");
  assert.match(mac.volumeStep(-10), /\+ -10/);
  assert.match(win.volumeSet(30), /1\.\.50 .*\[char\]174.*1\.\.15 .*\[char\]175/);
  assert.match(win.media("play_pause"), /\[char\]179/);
  assert.equal(mac.player("Spotify", "next"), 'tell application "Spotify" to next track');
});

test("ilovalar: nom skriptga qo'yiladi — isSafeAppName qo'shtirnoq va ; ni o'tkazmaydi", () => {
  assert.equal(mac.quit("Telegram"), 'tell application "Telegram" to quit');
  assert.match(win.hide("chrome"), /Get-Process -Name 'chrome'/);
  assert.match(mac.hideAll(["Jigar", "Finder"]), /name is not "Jigar" and name is not "Finder"/);
  for (const ok of ["Google Chrome", "Visual Studio Code", "Telegram"]) assert.ok(policy.isSafeAppName(ok), ok);
  for (const bad of ['Safari" to quit\ndo shell script "rm', "x'; Remove-Item", "a;b", "", "a\\b"]) {
    assert.equal(policy.isSafeAppName(bad), false, bad);
  }
});

test("YouTube: video id havoladan; qidiruv natijalari (API kalitsiz)", () => {
  const require = createRequire(import.meta.url);
  const Module = require("node:module");
  // youtube.js electron'ni talab qiladi — testda soxta modul.
  const original = Module._load;
  Module._load = function (request, ...rest) {
    return request === "electron" ? { BrowserWindow: class {} } : original.call(this, request, ...rest);
  };
  try {
    const { videoIdFrom, parseSearch } = require("../../desktop/youtube.js");
    assert.equal(videoIdFrom("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30"), "dQw4w9WgXcQ");
    assert.equal(videoIdFrom("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    assert.equal(videoIdFrom("https://youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    assert.equal(videoIdFrom("dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    assert.equal(videoIdFrom("https://evil.com/watch?v=dQw4w9WgXcQ"), null);
    assert.equal(videoIdFrom("salom"), null);
    const html = '{"videoRenderer":{"videoId":"AAAAAAAAAAA","thumbnail":{},"title":{"runs":[{"text":"Birinchi \\"zo\'r\\" qo\'shiq"}]}}'
      + '{"videoRenderer":{"videoId":"BBBBBBBBBBB","x":1,"title":{"runs":[{"text":"Ikkinchi"}]}}'
      + '{"videoRenderer":{"videoId":"AAAAAAAAAAA","title":{"runs":[{"text":"takror"}]}}';
    assert.deepEqual(parseSearch(html), [
      { id: "AAAAAAAAAAA", title: 'Birinchi "zo\'r" qo\'shiq' },
      { id: "BBBBBBBBBBB", title: "Ikkinchi" },
    ]);
  } finally {
    Module._load = original;
  }
});

test("dev: prompt qo'shtirnoqlari — shell va AppleScript qochirish (in'yeksiya yo'q)", () => {
  const require = createRequire(import.meta.url);
  const { shellQuote, appleQuote } = require("../../desktop/dev.js");
  assert.equal(shellQuote("a'b"), "'a'\\''b'");
  assert.equal(shellQuote("$(rm -rf ~)"), "'$(rm -rf ~)'");
  assert.equal(appleQuote('say "hi" \\ x'), 'say \\"hi\\" \\\\ x');
});
