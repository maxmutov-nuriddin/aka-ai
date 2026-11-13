// Desktop asboblarining xavfsizlik qoidalari: uy papkasi, maxfiy fayllar, xavfli buyruqlar, ochish nishoni.
import { test } from "node:test";
import assert from "node:assert/strict";
import policy from "../../desktop/policy.js";

const { resolveSafePath, checkCommand, classifyOpenTarget } = policy;
const HOME = "/Users/egasi";

test("resolveSafePath: ~ va nisbiy yo'l — uy papkasi ichida", () => {
  assert.deepEqual(resolveSafePath("~/Desktop/reja.txt", HOME), { ok: true, path: "/Users/egasi/Desktop/reja.txt" });
  assert.deepEqual(resolveSafePath("Documents", HOME), { ok: true, path: "/Users/egasi/Documents" });
  assert.equal(resolveSafePath("~", HOME).path, HOME);
});

test("resolveSafePath: tashqariga chiqish, maxfiy papka va fayllar — rad", () => {
  for (const bad of ["/etc/passwd", "~/../other/x", "../../etc", "", "~/a\0b"]) {
    assert.equal(resolveSafePath(bad, HOME).ok, false, bad);
  }
  for (const secret of ["~/.ssh/config", "~/.aws/credentials", "~/proj/.env", "~/proj/.env.local", "~/keys/server.pem",
    "~/.ssh", "~/Library/Keychains/login.keychain-db", "~/id_ed25519", "~/.npmrc", "~/.git-credentials"]) {
    assert.equal(resolveSafePath(secret, HOME).ok, false, secret);
  }
  assert.equal(resolveSafePath("~/proj/env.md", HOME).ok, true);
});

test("checkCommand: oddiy buyruq — ruxsat; xavflilari — rad", () => {
  assert.equal(checkCommand("ls -la ~/Desktop"), null);
  assert.equal(checkCommand("rm -rf ~/Desktop/eski"), null, "aniq papka — egasi tasdiqlaydi");
  for (const bad of ["", "sudo rm x", "rm -rf /", "rm -rf ~", "rm -fr $HOME", "diskutil eraseDisk APFS x disk2", "shutdown -h now",
    "dd if=/dev/zero of=/dev/disk2", "mkfs.ext4 /dev/sda", "csrutil disable", "x".repeat(2001)]) {
    assert.notEqual(checkCommand(bad), null, bad);
  }
});

test("classifyOpenTarget: URL, ilova, yo'l; xavfli sxema va skript — rad", () => {
  assert.deepEqual(classifyOpenTarget("https://kun.uz", HOME), { kind: "url", value: "https://kun.uz" });
  assert.deepEqual(classifyOpenTarget("Telegram", HOME), { kind: "app", value: "Telegram" });
  assert.deepEqual(classifyOpenTarget("Visual Studio Code", HOME), { kind: "app", value: "Visual Studio Code" });
  assert.deepEqual(classifyOpenTarget("~/Desktop/hisobot.pdf", HOME), { kind: "path", value: "/Users/egasi/Desktop/hisobot.pdf" });
  for (const bad of ["javascript:alert(1)", "file:///etc/passwd", "~/Desktop/run.command", "~/x.sh", "/etc/hosts", "Tele;rm", ""]) {
    assert.ok(classifyOpenTarget(bad, HOME).error, bad);
  }
});

test("ruxsat darajalari: wide — butun disk (maxfiylarsiz), full — cheklovsiz; buyruqlar darajaga qarab", () => {
  assert.equal(resolveSafePath("/etc/hosts", HOME, "safe").ok, false);
  assert.equal(resolveSafePath("/Applications/Project/x/IDEA.md", HOME, "wide").ok, true);
  assert.equal(resolveSafePath("/Users/egasi/.ssh/id_rsa", HOME, "wide").ok, false, "wide — maxfiy hali yopiq");
  assert.equal(resolveSafePath("/srv/app/.env", HOME, "wide").ok, false);
  assert.equal(resolveSafePath("/Users/egasi/.ssh/config", HOME, "full").ok, true);
  assert.notEqual(checkCommand("shutdown -h now", "safe"), null);
  assert.equal(checkCommand("rm -rf ~/eski", "full"), null, "full — server 'Ha' so'raydi, desktop to'xtatmaydi");
  assert.match(checkCommand("sudo ls", "unlimited"), /sudo/, "sudo — har darajada (parol so'raydi)");
  assert.deepEqual(classifyOpenTarget("/Applications/Project/a.pdf", HOME, "wide"), { kind: "path", value: "/Applications/Project/a.pdf" });
});

test("server manzili: faqat http(s), yo'l va login olib tashlanadi", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const Module = require("node:module");
  const original = Module._load;
  Module._load = function (request, ...rest) {
    return request === "electron" ? { app: {}, BrowserWindow: class {}, ipcMain: {} } : original.call(this, request, ...rest);
  };
  try {
    const { normalizeServerUrl } = require("../../desktop/server-url.js");
    assert.equal(normalizeServerUrl(" http://192.168.1.101:3100/app/ "), "http://192.168.1.101:3100");
    assert.equal(normalizeServerUrl("https://jigar.uz"), "https://jigar.uz");
    for (const bad of ["ftp://x", "javascript:alert(1)", "192.168.1.5", "", "http://user:pass@x.uz"]) assert.equal(normalizeServerUrl(bad), null, bad);
  } finally {
    Module._load = original;
  }
});
