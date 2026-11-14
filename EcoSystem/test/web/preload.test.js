// index.html dagi modulepreload ro'yxati app.js import zanjiri bilan bir xil bo'lishi kerak (yangi modul qo'shilsa — ro'yxatga ham).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { moduleGraph } from "../../web/app/preload-graph.mjs";

const webDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../web");

test("index.html: modulepreload ro'yxati app.js import zanjiriga to'liq mos", () => {
  const html = readFileSync(path.join(webDir, "app/index.html"), "utf8");
  const listed = [...html.matchAll(/<link rel="modulepreload" href="\/([^"]+)">/g)].map((m) => m[1]).sort();
  assert.deepEqual(listed, moduleGraph(webDir));
});

test("mermaid (5.5 MB) dastlabki yuklashni to'smaydi: index.html da skript yo'q", () => {
  const html = readFileSync(path.join(webDir, "app/index.html"), "utf8");
  assert.doesNotMatch(html, /mermaid/);
});
