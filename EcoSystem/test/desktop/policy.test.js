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
