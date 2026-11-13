// Yuklab olish: ro'yxat (faqat mavjud fayllar, SHA-256, QR), faylning o'zi, path traversal va noma'lum nom — 404.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { startServer } from "./helpers.js";

const fakeJigar = { chat: async () => ({ text: "x" }) };

async function withDownloads(files, run) {
  const dir = mkdtempSync(path.join(tmpdir(), "jigar-dl-"));
  for (const [name, body] of Object.entries(files)) writeFileSync(path.join(dir, name), body);
  const s = await startServer({ jigar: fakeJigar, ttsProviders: {}, stt: { configured: false }, env: { ECO_DOWNLOADS_DIR: dir } }, { login: false });
  try {
    await run(s);
  } finally {
    s.close();
  }
}

test("/api/downloads: mavjud fayl — hajm, SHA-256, url; yo'g'i — ready: false; versiya", async () => {
  await withDownloads({ "Jigar-mac.dmg": "dmg-bayt" }, async (s) => {
    const data = await (await s.raw("/api/downloads")).json();
    const mac = data.files.find((f) => f.platform === "mac");
    assert.equal(mac.ready, true);
    assert.equal(mac.size, 8);
    assert.equal(mac.sha256, createHash("sha256").update("dmg-bayt").digest("hex"));
    assert.equal(mac.url, "/downloads/Jigar-mac.dmg");
    assert.equal(data.files.find((f) => f.platform === "windows").ready, false);
    assert.match(data.version, /^\d+\.\d+\.\d+$/);
    if (data.phoneUrl) assert.match(data.qr, /^<svg/);
  });
});

test("/downloads/:file: fayl yuklanadi (attachment); boshqa nom, traversal, yo'q fayl — 404", async () => {
  await withDownloads({ "Jigar-mac.dmg": "dmg-bayt", ".env": "SECRET" }, async (s) => {
    const ok = await s.raw("/downloads/Jigar-mac.dmg");
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get("content-disposition"), /attachment; filename="Jigar-mac.dmg"/);
    assert.equal(await ok.text(), "dmg-bayt");
    for (const bad of ["/downloads/.env", "/downloads/..%2F.env", "/downloads/..%2F..%2Fpackage.json", "/downloads/Jigar-win.exe"]) {
      const res = await s.raw(bad);
      assert.equal(res.status, 404, bad);
      assert.doesNotMatch(await res.text(), /SECRET/);
    }
  });
});

test("/download — alohida sahifa yo'q: Sozlamalar → Jigar ilovalari bo'limiga yo'naltiradi", async () => {
  await withDownloads({}, async (s) => {
    const res = await s.raw("/download", { redirect: "manual" });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/app/?settings=apps");
  });
});

test("phoneUrlFor: serverda — domen (https), uyda — Wi-Fi IP; IP yo'q — null", async () => {
  const { phoneUrlFor } = await import("../../server/downloads/routes.js");
  assert.equal(phoneUrlFor({ protocol: "https", host: "jigar.example.uz" }, "10.0.0.5"), "https://jigar.example.uz/app/?settings=apps");
  assert.equal(phoneUrlFor({ protocol: "http", host: "localhost:3100" }, "192.168.0.59"), "http://192.168.0.59:3100/app/?settings=apps");
  assert.equal(phoneUrlFor({ protocol: "http", host: "127.0.0.1:3100" }, null), null);
});

test("Windows: .exe bo'lmasa — .zip (o'rnatishsiz) beriladi", async () => {
  await withDownloads({ "Jigar-win.zip": "zip-bayt" }, async (s) => {
    const data = await (await s.raw("/api/downloads")).json();
    const win = data.files.find((f) => f.platform === "windows");
    assert.equal(win.ready, true);
    assert.equal(win.url, "/downloads/Jigar-win.zip");
    assert.equal((await s.raw("/downloads/Jigar-win.zip")).status, 200);
  });
});
