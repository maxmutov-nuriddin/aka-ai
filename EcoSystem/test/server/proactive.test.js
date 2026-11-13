// Jigarning o'z tashabbusi: nudge jadvali, xulosa vaqti, "JIM" javobi, rejalashtiruvchi (soxta soat, hub, Jigar bilan).
import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../../server/db/database.js";
import { createAuthStore, OWNER_EMAIL } from "../../server/auth/store.js";
import { createAssistantStore } from "../../server/assistant/store.js";
import { createEcoSettings } from "../../server/settings.js";
import { createNudgeStore } from "../../server/proactive/store.js";
import { createProactive, dueBrief, nudgeText, tashkentClock, WATCH_EVERY_MS, WATCH_COOLDOWN_MS } from "../../server/proactive/scheduler.js";

const at = (iso) => Date.parse(iso);
// Toshkent = UTC+5: 03:30Z = 08:30, 09:00Z = 14:00, 16:30Z = 21:30, 19:00Z = 00:00 (tun).
const MORNING = at("2026-11-13T03:30:00Z");
const AFTERNOON = at("2026-11-13T09:00:00Z");
const EVENING = at("2026-11-13T16:30:00Z");

async function setup(nowMs, { online = true } = {}) {
  const clock = { now: nowMs };
  const now = () => clock.now;
  const db = openDatabase(":memory:");
  const store = createAuthStore(db, { supportEmails: new Set() });
  const owner = await store.createUser({ name: "Nuriddin", email: OWNER_EMAIL, password: "parol-12345" });
  const assistant = createAssistantStore(db);
  const settings = createEcoSettings(db, {});
  const nudges = createNudgeStore(db, { now });
  const thoughts = [];
  const replies = [];
  const jigar = { async think(req) { thoughts.push(req); return replies.shift() ?? "JIM"; } };
  const shots = [];
  const hub = {
    list: () => (online ? [{ id: "pc-0001", name: "Mac", kind: "pc" }] : []),
    async call(_id, _device, cmd) { shots.push(cmd); return { image: "QUJD" }; },
  };
  const proactive = createProactive({ jigar, hub, nudges, assistant, settings, store, now, log: () => {} });
  return { clock, owner, nudges, settings, thoughts, replies, shots, proactive };
}

test("tashkentClock va dueBrief: oynalar, kuniga bir marta", () => {
  assert.equal(tashkentClock(MORNING).hour, 8);
  assert.equal(dueBrief(MORNING, () => null), "morning");
  assert.equal(dueBrief(AFTERNOON, () => null), null);
  assert.equal(dueBrief(EVENING, () => null), "evening");
  assert.equal(dueBrief(MORNING, () => MORNING - 60_000), null, "bugun yuborilgan");
  assert.equal(dueBrief(MORNING, () => MORNING - 24 * 3600_000), "morning", "kecha yuborilgan");
});

test("nudgeText: JIM va bo'sh — null; teglar olib tashlanadi", () => {
  assert.equal(nudgeText("JIM"), null);
  assert.equal(nudgeText("  jim."), null);
  assert.equal(nudgeText(""), null);
  assert.equal(nudgeText("[smiles] Xato bor."), "Xato bor.");
});

test("nudge store: qo'shish, ko'rilmaganlar, ko'rildi, lastAt, since", async () => {
  const { nudges, owner, clock } = await setup(MORNING);
  assert.equal(nudges.add(owner.id, "yomon", "x"), null);
  assert.equal(nudges.add(owner.id, "watch", "  "), null);
  const n = nudges.add(owner.id, "watch", "Salom");
  assert.deepEqual(nudges.unseen(owner.id).map((x) => x.text), ["Salom"]);
  assert.equal(nudges.markSeen(owner.id, n.id), true);
  assert.equal(nudges.unseen(owner.id).length, 0);
  assert.equal(nudges.lastAt(owner.id, "watch"), MORNING);
  clock.now += 2 * 3600_000;
  assert.equal(nudges.since(owner.id, 3600_000).length, 0);
  assert.equal(nudges.since(owner.id, 3 * 3600_000).length, 1);
});

test("tick: ertalab — xulosa (qidiruv bilan) bir marta; keyin ekranga qaraydi", async () => {
  const s = await setup(MORNING);
  s.replies.push("Xayrli tong, Nuriddin!", "Kodda xato bor: 12-qator.");
  await s.proactive.tick();
  assert.equal(s.thoughts[0].search, true);
  assert.match(s.thoughts[0].content, /ERTALABKI REJA/);
  assert.match(s.thoughts[0].content, /Nuriddin/);
  assert.equal(s.shots.length, 1);
  assert.equal(s.thoughts[1].content[0].type, "image");
  assert.deepEqual(s.nudges.unseen(s.owner.id).map((n) => [n.kind, n.text]), [
    ["morning", "Xayrli tong, Nuriddin!"],
    ["watch", "Kodda xato bor: 12-qator."],
  ]);
  await s.proactive.tick();
  assert.equal(s.thoughts.length, 2, "xulosa takrorlanmaydi, ekran — 10 daqiqadan keyin");
});

test("tick: ekran — 10 daqiqada bir, gapdan keyin 30 daqiqa jim; JIM — saqlanmaydi", async () => {
  const s = await setup(AFTERNOON);
  await s.proactive.tick(); // JIM
  assert.equal(s.shots.length, 1);
  assert.equal(s.nudges.unseen(s.owner.id).length, 0);
  s.clock.now += WATCH_EVERY_MS;
  s.replies.push("Dam oling.");
  await s.proactive.tick();
  assert.equal(s.nudges.unseen(s.owner.id).length, 1);
  s.clock.now += WATCH_EVERY_MS;
  await s.proactive.tick();
  assert.equal(s.shots.length, 2, "30 daqiqa jim");
  s.clock.now += WATCH_COOLDOWN_MS;
  await s.proactive.tick();
  assert.equal(s.shots.length, 3);
});

test("tick: o'chirilgan sozlama, ulanmagan kompyuter, tun — ekranga qaralmaydi; xulosa JIM — ko'rinmaydi", async () => {
  const off = await setup(AFTERNOON);
  off.settings.update({ proactive: "off" });
  await off.proactive.tick();
  assert.equal(off.shots.length, 0);

  const offline = await setup(AFTERNOON, { online: false });
  await offline.proactive.tick();
  assert.equal(offline.shots.length, 0);

  const night = await setup(at("2026-11-13T19:00:00Z"));
  await night.proactive.tick();
  assert.equal(night.shots.length, 0);

  const evening = await setup(EVENING); // xulosa JIM
  evening.settings.update({ proactive: "off" });
  await evening.proactive.tick();
  assert.equal(evening.nudges.unseen(evening.owner.id).length, 0);
  assert.equal(evening.nudges.lastAt(evening.owner.id, "evening"), EVENING, "bugun qayta urinilmaydi");
  await evening.proactive.tick();
  assert.equal(evening.thoughts.length, 1);
});

test("settings: proactive va briefs — on/off, standart on", async () => {
  const s = await setup(AFTERNOON);
  assert.equal(s.settings.all().proactive, "on");
  assert.equal(s.settings.all().briefs, "on");
  assert.throws(() => s.settings.update({ briefs: "ha" }));
  assert.equal(s.settings.update({ briefs: "off" }).briefs, "off");
});
