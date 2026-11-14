// Versiyalangan statik fayllar: sahifa kod fayllariga ?v qo'shadi, import map yozadi, ?v bilan so'ralganlar 1 yil keshlanadi.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildId, versionHtml } from "../../server/http/assets.js";
import { startServer } from "./helpers.js";

const webDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../web");

const SAMPLE = `<head>
  <link rel="stylesheet" href="../shared/theme.css">
  <link rel="stylesheet" href="styles.css">
</head><body>
  <link rel="modulepreload" href="/app/app.js">
  <link rel="modulepreload" href="/shared/parse.js">
  <script src="host-web.js"></script>
  <script type="module" src="app.js"></script>
</body>`;

test("versionHtml: stil, skript va modulepreload manzillariga ?v; import map modullardan oldin", () => {
  const out = versionHtml(SAMPLE, "abc123");
  assert.match(out, /href="\.\.\/shared\/theme\.css\?v=abc123"/);
  assert.match(out, /href="styles\.css\?v=abc123"/);
  assert.match(out, /<script src="host-web\.js\?v=abc123">/);
  assert.match(out, /<script type="module" src="app\.js\?v=abc123">/);
  assert.match(out, /<link rel="modulepreload" href="\/app\/app\.js\?v=abc123">/);
  const map = JSON.parse(/<script type="importmap">(.*?)<\/script>/.exec(out)[1]);
  assert.deepEqual(map.imports, { "/app/app.js": "/app/app.js?v=abc123", "/shared/parse.js": "/shared/parse.js?v=abc123" });
  assert.ok(out.indexOf('type="importmap"') < out.indexOf('rel="modulepreload"'), "import map birinchi modulepreload'dan oldin");
  assert.doesNotMatch(versionHtml(out, "zzz"), /\?v=abc123\?v=/);
});

test("buildId: mazmun o'zgarsa — boshqa; bir xil — bir xil", () => {
  const id = buildId([path.join(webDir, "app"), path.join(webDir, "shared")]);
  assert.match(id, /^[0-9a-f]{10}$/);
  assert.equal(buildId([path.join(webDir, "app"), path.join(webDir, "shared")]), id);
  assert.notEqual(buildId([path.join(webDir, "shared")]), id);
});

test("/app/: versiyalangan HTML (no-cache); ?v bilan fayl — immutable; ?v'siz — oddiy", async () => {
  const s = await startServer({ jigar: { chat: async () => ({}) }, ttsProviders: {}, stt: { configured: false } });
  try {
    const page = await s.raw("/app/");
    assert.equal(page.status, 200);
    assert.equal(page.headers.get("cache-control"), "no-cache");
    const html = await page.text();
    const v = /app\.js\?v=([0-9a-f]{10})/.exec(html)?.[1];
    assert.ok(v, "app.js?v=... bor");
    assert.match(html, /<script type="importmap">/);
    const versioned = await s.raw(`/app/voice.js?v=${v}`);
    assert.equal(versioned.status, 200);
    assert.match(versioned.headers.get("cache-control"), /immutable/);
    assert.doesNotMatch((await s.raw("/app/voice.js")).headers.get("cache-control") ?? "", /immutable/);
    assert.match((await s.raw(`/shared/parse.js?v=${v}`)).headers.get("cache-control"), /immutable/);
  } finally {
    s.close();
  }
});
