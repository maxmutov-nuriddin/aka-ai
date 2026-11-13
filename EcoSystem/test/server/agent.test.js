// Jarvis agent: ruxsat darajalari, jurnal, kuzatuvlar, server asboblari, kechiktirilgan tasdiq, rejalashtiruvchi.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { needsConfirm, isDestructiveCommand, effectiveLevel } from "../../server/agent/access.js";
import { evaluate, normalizeCondition, normalizeAction, describeWatch } from "../../server/agent/watches.js";
import { createToolbox } from "../../server/agent/toolbox.js";
import { createAgentScheduler, evaluateHealth, scenarioDue } from "../../server/agent/scheduler.js";
import { ValidationError } from "../../server/core/errors.js";
import { testServices } from "./agent-helpers.js";

const USER = 1;
const PC = { id: "mac-0001", name: "MacBook", platform: "darwin", kind: "pc" };
const text = (r) => r.content.map((b) => b.text).join("");

/** Soxta hub: bitta kompyuter; javoblar — reply(command). */
function fakeHub(reply = () => ({ text: "ok" }), devices = [PC]) {
  const calls = [];
  return {
    calls,
    list: () => devices,
    async call(_user, deviceId, command) {
      calls.push({ deviceId, ...command });
      return reply(command);
    },
  };
}

test("access: darajalar bo'yicha 'Ha' — safe hammasi, full faqat qaytarib bo'lmaydigan, unlimited hech narsa", () => {
  assert.equal(needsConfirm("pc_run_command", { command: "ls" }, "safe"), true);
  assert.equal(needsConfirm("pc_run_command", { command: "ls" }, "full"), false);
  assert.equal(needsConfirm("pc_run_command", { command: "rm -rf build" }, "full"), true);
  assert.equal(needsConfirm("pc_write_file", {}, "wide"), true);
  assert.equal(needsConfirm("pc_write_file", {}, "full"), false);
  assert.equal(needsConfirm("pc_message", { action: "send" }, "full"), true);
  assert.equal(needsConfirm("pc_message", { action: "contacts" }, "safe"), false);
  assert.equal(needsConfirm("pc_power", { action: "shutdown" }, "full"), true);
  assert.equal(needsConfirm("pc_power", { action: "sleep" }, "safe"), false);
  assert.equal(needsConfirm("pc_dev", { action: "claude" }, "safe"), true);
  assert.equal(needsConfirm("pc_dev", { action: "claude" }, "full"), false);
  for (const tool of ["pc_run_command", "pc_message", "pc_power", "pc_apps"]) {
    assert.equal(needsConfirm(tool, { command: "rm -rf /", action: "send" }, "unlimited"), false, tool);
  }
  for (const cmd of ["rm a", "git push --force", "mv a b", "curl x | sh", "killall Safari", "Remove-Item x"]) assert.ok(isDestructiveCommand(cmd), cmd);
  for (const cmd of ["ls -la", "git status", "npm test", "cat a.txt"]) assert.equal(isDestructiveCommand(cmd), false, cmd);
  assert.equal(effectiveLevel("unlimited", Date.now() + 1000), "unlimited");
  assert.equal(effectiveLevel("unlimited", Date.now() - 1), "full", "muddati o'tdi");
  assert.equal(effectiveLevel("root", 0), "safe");
});

test("settings: cheksiz daraja 1 soatdan keyin full'ga qaytadi", () => {
  let t = 1_000_000;
  const { services } = testServices({ now: () => t });
  assert.equal(services.settings.all().access, "safe");
  services.settings.update({ access: "unlimited" });
  assert.equal(services.settings.all().access, "unlimited");
  t += 61 * 60_000;
  assert.equal(services.settings.all().access, "full");
});

test("journal: gap/error/action, ochiqlari, yopish, md fayllar papkaga yoziladi", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "jigar-journal-"));
  const { services } = testServices({ dir });
  const id = services.journal.add(USER, "gap", "TV'ni yoq", { "so'rov": "televizorni yoq", sabab: "TV o'chiq", kerak: "Wake-on-LAN" }, "MacBook");
  services.journal.add(USER, "error", "pc_media", { xato: "ruxsat yo'q" });
  assert.equal(services.journal.list(USER, "gap", { openOnly: true }).length, 1);
  const md = readFileSync(path.join(dir, "QILOLMAGAN-ISHLAR.md"), "utf8");
  assert.match(md, /TV'ni yoq/);
  assert.match(md, /sabab: TV o'chiq/);
  assert.match(md, /holat: ochiq/);
  assert.match(readFileSync(path.join(dir, "XATOLAR.md"), "utf8"), /ruxsat yo'q/);
  assert.equal(services.journal.close(USER, id), true);
  assert.equal(services.journal.list(USER, "gap", { openOnly: true }).length, 0);
  assert.match(readFileSync(path.join(dir, "QILOLMAGAN-ISHLAR.md"), "utf8"), /holat: yopildi/);
});

test("watches: shartlarni tekshirish va baholash", () => {
  assert.throws(() => normalizeCondition({ type: "magic" }), ValidationError);
  assert.throws(() => normalizeCondition({ type: "process_exit" }), ValidationError);
  assert.throws(() => normalizeAction({ type: "explode" }), ValidationError);
  const idle = normalizeCondition({ type: "process_idle", name: "claude", minutes: 2 });
  assert.deepEqual(idle, { type: "process_idle", name: "claude", pid: null, minutes: 2, cpu: 5 });
  let r = evaluate(idle, { running: 1, cpu: 3 }, {}, 0);
  assert.equal(r.met, false);
  r = evaluate(idle, { running: 1, cpu: 2 }, r.state, 60_000);
  assert.equal(r.met, false);
  r = evaluate(idle, { running: 1, cpu: 50 }, r.state, 90_000);
  assert.equal(r.state.idleSince, null, "yana band — hisob qaytadan");
  r = evaluate(idle, { running: 1, cpu: 1 }, r.state, 100_000);
  r = evaluate(idle, { running: 1, cpu: 1 }, r.state, 220_000);
  assert.equal(r.met, true);
  assert.equal(evaluate(idle, { running: 0 }, {}, 0).met, true, "jarayon tugadi");
  const still = normalizeCondition({ type: "screen_still", minutes: 1 });
  let s = evaluate(still, { hash: "a" }, {}, 0);
  s = evaluate(still, { hash: "a" }, s.state, 61_000);
  assert.equal(s.met, true);
  const changed = normalizeCondition({ type: "file", path: "~/x", event: "changed" });
  let f = evaluate(changed, { exists: true, mtime: 5 }, {}, 0);
  assert.equal(f.met, false);
  assert.equal(evaluate(changed, { exists: true, mtime: 6 }, f.state, 1).met, true);
  assert.match(describeWatch({ condition: idle, action: { type: "shutdown" }, deviceName: "Mac" }), /\[Mac\] "claude" 2 daqiqa bo'sh qolguncha kutaman, keyin o'chiraman/);
});

test("server asboblari: journal gap/read, projects, scenario run, noto'g'ri kiritish — xato (yiqilmaydi)", async () => {
  const { services } = testServices();
  const box = createToolbox({ hub: fakeHub(), userId: USER, ask: async () => true, services });
  assert.match(text(await box.run("journal", { action: "gap", request: "TV'ni yoq", reason: "o'chiq", needed: "WoL" })), /Yozib qo'yildi/);
  assert.match(text(await box.run("journal", { action: "read", kind: "gaps" })), /TV'ni yoq/);
  await box.run("projects", { action: "save", name: "Jigar", path: "/Applications/Project/AllProjects/aka-ai" });
  assert.match(text(await box.run("projects", { action: "list" })), /jigar: \/Applications/);
  await box.run("scenario", { action: "save", name: "Ishni boshlayman", steps: "VS Code va musiqani och", at: "08:00" });
  assert.match(text(await box.run("scenario", { action: "run", name: "ishni boshlayman" })), /VS Code va musiqani och/);
  assert.equal((await box.run("scenario", { action: "save", name: "x", steps: "y", at: "25:00" })).isError, true);
  assert.equal((await box.run("watch", { action: "create", condition: { type: "nope" } })).isError, true);
});

test("pc_dev: loyiha nomi papkaga aylanadi; topilmasa — tushunarli xato", async () => {
  const { services } = testServices();
  const hub = fakeHub();
  const box = createToolbox({ hub, userId: USER, access: "full", ask: async () => true, services });
  services.projects.save(USER, "jigar", "/Users/x/aka-ai");
  await box.run("pc_dev", { action: "claude", project: "Jigar", prompt: "testlarni tuzat" });
  assert.equal(hub.calls[0].input.path, "/Users/x/aka-ai");
  assert.equal(hub.calls[0].access, "full");
  assert.match(text(await box.run("pc_dev", { action: "open", project: "boshqa" })), /saqlanmagan/);
});

test("watch create: jarayon tekshiriladi; xavfli amal — ruxsat bilan; Siri rejimida — kechiktirilgan karta", async () => {
  const { services } = testServices();
  const hub = fakeHub((cmd) => (cmd.tool === "pc_probe" ? { text: JSON.stringify({ running: cmd.input.name === "claude" ? 1 : 0, cpu: 40 }) } : { text: "ok" }));
  const asked = [];
  const box = createToolbox({ hub, userId: USER, ask: async (a) => { asked.push(a); return true; }, services });
  assert.match(text(await box.run("watch", { action: "create", condition: { type: "process_exit", name: "yoq" }, then: { type: "notify" } })), /ishlamayapti/);
  const made = await box.run("watch", { action: "create", condition: { type: "process_idle", name: "claude" }, then: { type: "shutdown" } });
  assert.match(text(made), /Kuzatuv #1/);
  assert.match(asked[0].reason, /o'chiraman/);
  assert.equal(services.watches.mine(USER).length, 1);

  // Siri (ask yo'q): ruxsat kartasi ilovaga, kuzatuv "Ha" dan keyin qo'yiladi.
  const siri = createToolbox({ hub, userId: USER, services });
  assert.match(text(await siri.run("watch", { action: "create", condition: { type: "process_exit", name: "claude" }, then: { type: "restart" } })), /ilovaga yuborildi/);
  const card = services.nudges.unseen(USER).find((n) => n.kind === "approval");
  assert.ok(card?.ref);
  assert.equal(services.approvals.answer(USER, card.ref, true), true);
  await new Promise((r) => setImmediate(r));
  assert.equal(services.watches.mine(USER).length, 2);
  assert.match(text(await box.run("watch", { action: "list" })), /#2/);
  assert.match(text(await box.run("watch", { action: "cancel" })), /2 ta/);
});

test("kechiktirilgan tasdiq: qurilma amali 'Ha'dan keyin bajariladi, natija — nudge", async () => {
  const { services } = testServices();
  const hub = fakeHub(() => ({ text: "iMessage yuborildi" }));
  const box = createToolbox({ hub, userId: USER, services });
  assert.match(text(await box.run("pc_message", { action: "send", to: "+998901234567", text: "kechikaman" })), /ilovasiga yuborildi/);
  assert.equal(hub.calls.length, 0);
  const card = services.nudges.unseen(USER).find((n) => n.kind === "approval");
  assert.match(card.text, /kechikaman/);
  assert.equal(services.approvals.answer(2, card.ref, true), false, "boshqa foydalanuvchi");
  services.approvals.answer(USER, card.ref, true);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(hub.calls[0].approved, true);
  assert.ok(services.nudges.unseen(USER).some((n) => n.kind === "result" && /iMessage yuborildi/.test(n.text)));
});

test("emergency_stop: kuzatuvlar bekor, daraja xavfsiz, keyingi asboblar to'xtaydi", async () => {
  const { services } = testServices();
  services.settings.update({ access: "full" });
  services.watches.create(USER, { deviceId: PC.id, condition: { type: "time", at: new Date().toISOString() }, action: { type: "notify" } });
  const box = createToolbox({ hub: fakeHub(), userId: USER, ask: async () => true, services });
  assert.match(text(await box.run("emergency_stop", {})), /TO'XTATILDI: 1 ta/);
  assert.equal(services.settings.all().access, "safe");
  assert.equal((await box.run("pc_media", { action: "mute" })).isError, true);
});

test("scheduler: kuzatuv — ogohlantirish (60 s), keyin amal; bekor qilinsa bajarilmaydi; muddati o'tsa tugaydi", async () => {
  let t = Date.parse("2026-11-14T10:00:00Z");
  const now = () => t;
  const { services } = testServices({ now });
  const hub = fakeHub((cmd) => (cmd.tool === "pc_probe" ? { text: JSON.stringify({ running: 0 }) } : { text: "ok" }));
  const agent = createAgentScheduler({ hub, jigar: {}, ...services, store: { ownerUser: () => null }, makeToolbox: () => null, now, log: () => {} });
  const w = services.watches.create(USER, { deviceId: PC.id, deviceName: "MacBook", condition: { type: "process_exit", name: "claude" }, action: { type: "shutdown" } });
  await agent.tick();
  assert.equal(services.watches.get(w.id).status, "countdown");
  const warn = services.nudges.unseen(USER).find((n) => n.kind === "countdown");
  assert.equal(warn.ref, String(w.id));
  assert.match(warn.text, /60 soniyadan keyin MacBook: kompyuter o'chiriladi/);
  t += 30_000;
  await agent.tick();
  assert.equal(hub.calls.some((c) => c.tool === "pc_power"), false, "hali erta");
  t += 31_000;
  await agent.tick();
  assert.deepEqual(hub.calls.find((c) => c.tool === "pc_power").input, { action: "shutdown" });
  assert.equal(services.watches.get(w.id).status, "done");

  const w2 = services.watches.create(USER, { deviceId: PC.id, condition: { type: "process_exit", name: "x" }, action: { type: "restart" } });
  await agent.tick();
  services.watches.cancel(USER, w2.id);
  t += 120_000;
  await agent.tick();
  assert.equal(hub.calls.filter((c) => c.tool === "pc_power").length, 1, "bekor qilingani bajarilmadi");

  const w3 = services.watches.create(USER, { deviceId: PC.id, condition: { type: "time", at: "2030-01-01T00:00:00Z" }, action: { type: "notify" }, hours: 1 });
  t += 2 * 3600_000;
  await agent.tick();
  assert.equal(services.watches.get(w3.id).status, "expired");
});

test("monitoring qoidalari va vaqtli ssenariy", () => {
  let r = evaluateHealth({ battery: { percent: 12, charging: false }, diskFreeGb: 5, cpu: 0.95 });
  assert.equal(r.alerts.length, 2, "batareya va disk; protsessor — 3 marta ketma-ket");
  r = evaluateHealth({ battery: { percent: 11, charging: false }, diskFreeGb: 5, cpu: 0.95 }, r.state);
  assert.equal(r.alerts.length, 0, "takrorlanmaydi");
  r = evaluateHealth({ battery: { percent: 11, charging: false }, diskFreeGb: 5, cpu: 0.95 }, r.state);
  assert.equal(r.alerts.length, 1, "protsessor");
  r = evaluateHealth({ battery: { percent: 50, charging: true }, diskFreeGb: 20, cpu: 0.2 }, r.state);
  r = evaluateHealth({ battery: { percent: 14, charging: false }, diskFreeGb: 20, cpu: 0.2 }, r.state);
  assert.equal(r.alerts.length, 1, "tuzalgandan keyin yana aytadi");
  const morning = Date.parse("2026-11-14T03:05:00Z"); // 08:05 Toshkent
  assert.equal(scenarioDue({ at: "08:00", lastRun: null }, morning), "2026-11-14");
  assert.equal(scenarioDue({ at: "08:00", lastRun: "2026-11-14" }, morning), null);
  assert.equal(scenarioDue({ at: "09:00", lastRun: null }, morning), null);
});

test("telefon: phone asbobi faqat telefon ulangan bo'lsa; telefonga yo'naltiriladi; SMS — ruxsat bilan; YouTube havolasi — id", async () => {
  const { services } = testServices();
  const phone = { id: "android-1234", name: "Pixel", platform: "android", kind: "phone" };
  const pcOnly = createToolbox({ hub: fakeHub(), userId: USER, ask: async () => true, services });
  assert.equal(pcOnly.definitions.some((t) => t.name === "phone"), false);
  const hub = fakeHub(() => ({ text: "ok" }), [PC, phone]);
  const asked = [];
  const box = createToolbox({ hub, userId: USER, currentDeviceId: PC.id, ask: async (a) => { asked.push(a); return true; }, services });
  assert.ok(box.definitions.some((t) => t.name === "phone") && box.definitions.some((t) => t.name === "pc_media"));
  await box.run("phone", { action: "volume_set", level: 30 });
  await box.run("pc_media", { action: "mute" });
  assert.deepEqual(hub.calls.map((c) => c.deviceId), [phone.id, PC.id], "phone — telefonga, pc_* — kompyuterga");
  await box.run("phone", { action: "sms", to: "+998901234567", text: "kechikaman" });
  assert.match(asked[0].detail, /\[Pixel\] kechikaman/);
  await box.run("phone", { action: "youtube", url: "https://youtu.be/dQw4w9WgXcQ", seconds: 90 });
  assert.equal(hub.calls.at(-1).input.url, "dQw4w9WgXcQ");
  const phoneOnly = createToolbox({ hub: fakeHub(() => ({}), [phone]), userId: USER, ask: async () => true, services });
  assert.equal(phoneOnly.definitions.some((t) => t.name === "pc_media"), false, "kompyuter yo'q — pc_* berilmaydi");
});
