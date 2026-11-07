import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { createApp } from "../server/index.js";
import { ValidationError } from "../server/aka.js";

let server, base;
const aka = {
  async chat({ history }) {
    if (history?.[0]?.content === "boom") throw new Anthropic.APIConnectionError({ message: "down" });
    if (!Array.isArray(history)) throw new ValidationError("history bo'sh bo'lmasligi kerak");
    return { text: "[TUSHUNTIRISH]\nok", parsed: { tushuntirish: "ok" } };
  },
  async summary() {
    return { text: "Xulosa", refused: false };
  },
};

before(async () => {
  const app = createApp({ aka, env: { AKA_RATE_MAX: "5", AKA_ALLOWED_ORIGINS: "chrome-extension://*" } });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const post = (path, body, headers = {}) =>
  fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

test("health va statik fayllar", async () => {
  assert.equal((await (await fetch(base + "/api/health")).json()).ok, true);
  for (const p of ["/", "/app.js", "/parse.js", "/styles.css", "/host-web.js", "/vendor/mermaid.min.js"]) {
    assert.equal((await fetch(base + p)).status, 200, p);
  }
});

test("chat: muvaffaqiyatli javob", async () => {
  const r = await post("/api/chat", { history: [{ role: "user", content: "hi" }] });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).parsed.tushuntirish, "ok");
});

test("chat: validatsiya xatosi 400, aloqa xatosi 503", async () => {
  assert.equal((await post("/api/chat", {})).status, 400);
  const r = await post("/api/chat", { history: [{ role: "user", content: "boom" }] });
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /aloqa uzildi/);
});

test("buzilgan JSON 400 qaytaradi", async () => {
  const r = await fetch(base + "/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  assert.equal(r.status, 400);
});

test("CORS: kengaytmaga ruxsat, boshqa saytga yo'q", async () => {
  const ok = await fetch(base + "/api/chat", { method: "OPTIONS", headers: { Origin: "chrome-extension://abc" } });
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get("access-control-allow-origin"), "chrome-extension://abc");
  const bad = await fetch(base + "/api/chat", { method: "OPTIONS", headers: { Origin: "https://evil.example" } });
  assert.equal(bad.headers.get("access-control-allow-origin"), null);
});

test("rate limit 429 qaytaradi", async () => {
  let last;
  for (let i = 0; i < 6; i++) last = await post("/api/summary", { items: [{ savol: "a" }] });
  assert.equal(last.status, 429);
});
