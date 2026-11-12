// Kompyuter (Jigarning qo'li): hub (long-poll navbati), ruxsat so'rovlari, asboblar qutisi, yo'llar (HTTP).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDeviceHub, DeviceOfflineError } from "../../server/devices/hub.js";
import { createApprovals } from "../../server/devices/approvals.js";
import { createPcToolbox, toToolContent, describeAction, PC_TOOLS, CONFIRM_TOOLS } from "../../server/devices/tools.js";
import { normalizeResult } from "../../server/devices/routes.js";
import { contextNote } from "../../server/app.js";
import { parseAkaResponse } from "../../server/core/parse.js";
import { startServer } from "./helpers.js";

const USER = 1;

test("hub: ulanmagan kompyuterga buyruq — DeviceOfflineError", async () => {
  const hub = createDeviceHub();
  assert.deepEqual(hub.status(USER), { online: false });
  await assert.rejects(hub.call(USER, { tool: "pc_screenshot" }), DeviceOfflineError);
});

test("hub: poll buyruqni oladi, resolve natijani call'ga qaytaradi", async () => {
  const hub = createDeviceHub({ pollWaitMs: 1000 });
  const polled = hub.poll(USER, { name: "MacBook\nPro", platform: "darwin" });
  assert.deepEqual(hub.status(USER), { online: true, name: "MacBook Pro", platform: "darwin" });
  const result = hub.call(USER, { tool: "pc_open", input: { target: "Safari" } });
  const command = await polled;
  assert.equal(command.tool, "pc_open");
  assert.equal(command.approved, false);
  assert.equal(hub.resolve(USER, command.id, { text: "ok" }), true);
  assert.deepEqual(await result, { text: "ok" });
  assert.equal(hub.resolve(USER, command.id, {}), false, "ikkinchi marta — noma'lum");
});

test("hub: navbatdagi buyruq keyingi poll'da darhol beriladi; poll vaqti tugasa — null", async () => {
  const hub = createDeviceHub({ pollWaitMs: 20 });
  assert.equal(await hub.poll(USER, { name: "pc" }), null);
  const result = hub.call(USER, { tool: "pc_windows" });
  const command = await hub.poll(USER, { name: "pc" });
  assert.equal(command.tool, "pc_windows");
  hub.resolve(USER, command.id, { text: "oynalar" });
  assert.equal((await result).text, "oynalar");
});

test("hub: uzilgan poll'dagi buyruq requeue bilan qaytadi; javob kelmasa — vaqt tugaydi", async () => {
  const hub = createDeviceHub({ pollWaitMs: 1000, callTimeoutMs: 30 });
  const first = hub.poll(USER, { name: "pc" });
  const result = hub.call(USER, { tool: "pc_screenshot" });
  const command = await first;
  hub.requeue(USER, command);
  const again = await hub.poll(USER, { name: "pc" });
  assert.equal(again.id, command.id);
  await assert.rejects(result, /vaqt tugadi/);
});

test("approvals: faqat o'sha foydalanuvchi javob beradi; javobsiz — rad; cancel — rad", async () => {
  const approvals = createApprovals({ timeoutMs: 20 });
  const a = approvals.request(USER);
  assert.equal(approvals.answer(2, a.id, true), false);
  assert.equal(approvals.answer(USER, a.id, true), true);
  assert.equal(await a.decision, true);
  const b = approvals.request(USER);
  assert.equal(await b.decision, false, "vaqt tugadi");
  const c = approvals.request(USER);
  approvals.cancel(c.id);
  assert.equal(await c.decision, false);
  assert.equal(approvals.answer(USER, c.id, true), false);
});

test("toolbox: kompyuter ulanmagan — null (asbob berilmaydi)", () => {
  const box = createPcToolbox({ hub: createDeviceHub(), userId: USER, confirm: async () => true });
  assert.equal(box, null);
});

/** Ulangan kompyuterni taqlid qiladi: har buyruqqa javob beradi va ularni yozib boradi. */
function connectedHub(reply = () => ({ text: "ok" })) {
  const hub = createDeviceHub({ pollWaitMs: 1000 });
  const commands = [];
  let running = true;
  (async () => {
    while (running) {
      const command = await hub.poll(USER, { name: "pc", platform: "darwin" });
      if (command) {
        commands.push(command);
        hub.resolve(USER, command.id, reply(command));
      }
    }
  })();
  return { hub, commands, stop: () => { running = false; } };
}

test("toolbox: xavfli asbob — ruxsatsiz bajarilmaydi; ruxsat bilan approved: true", async () => {
  const { hub, commands, stop } = connectedHub();
  try {
    const asked = [];
    let allow = false;
    const statuses = [];
    const box = createPcToolbox({ hub, userId: USER, confirm: async (a) => { asked.push(a); return allow; }, onStatus: (s) => statuses.push(s) });
    assert.equal(box.definitions, PC_TOOLS);
    const denied = await box.run("pc_run_command", { command: "ls", reason: "Ro'yxat" });
    assert.equal(denied.isError, true);
    assert.equal(commands.length, 0, "kompyuterga yuborilmadi");
    assert.deepEqual(asked[0], { tool: "pc_run_command", reason: "Ro'yxat", detail: "ls" });
    allow = true;
    const ok = await box.run("pc_run_command", { command: "ls", reason: "Ro'yxat" });
    assert.equal(ok.isError, false);
    assert.equal(commands[0].approved, true);
    const read = await box.run("pc_read_file", { path: "~/a.txt" });
    assert.equal(read.isError, false);
    assert.equal(commands[1].approved, false);
    assert.equal(asked.length, 2, "o'qish uchun ruxsat so'ralmaydi");
    assert.ok(statuses.includes("📄 Faylni o'qiyapman"));
    assert.equal((await box.run("pc_format_disk", {})).isError, true);
  } finally {
    stop();
  }
});

test("toToolContent: rasm + matn, xato, bo'sh; describeAction; normalizeResult", () => {
  const shot = toToolContent({ image: "QUJD", text: "Ekran" });
  assert.equal(shot.content[0].type, "image");
  assert.equal(shot.content[0].source.data, "QUJD");
  assert.equal(shot.content[1].text, "Ekran");
  assert.equal(toToolContent({ image: "<script>", text: "x" }).content.length, 1, "base64 bo'lmagan rasm tashlanadi");
  assert.deepEqual(toToolContent({ error: "yo'q" }), { content: [{ type: "text", text: "yo'q" }], isError: true });
  assert.equal(toToolContent({}).content[0].text, "Bajarildi.");
  assert.deepEqual(describeAction("pc_write_file", { path: "~/x.txt", content: "abc", reason: "r" }), { reason: "r", detail: "~/x.txt (3 belgi)" });
  assert.ok(CONFIRM_TOOLS.has("pc_write_file") && !CONFIRM_TOOLS.has("pc_screenshot"));
  assert.deepEqual(normalizeResult({ text: "a", image: 5, error: null, extra: "x" }), { text: "a" });
});

test("contextNote: vaqt, kompyuter, telefon, Jigar yaqinda aytgani", () => {
  const note = contextNote({ device: { name: "Mac", platform: "darwin" }, mobile: true, recentNudges: ["Xato bor"] }, new Date("2026-11-13T05:00:00Z"));
  assert.match(note, /10:00/);
  assert.match(note, /Kompyuter ulangan: Mac \(darwin\)/);
  assert.match(note, /telefondan/);
  assert.match(note, /yaqinda aytgan eding: "Xato bor"/);
  assert.match(contextNote({ device: null, mobile: false, recentNudges: [] }), /Kompyuter ulanmagan/);
});

const REPLY = "[TUSHUNTIRISH]\nXo'p.";

test("HTTP: desktop poll → chat asbobni ishlatadi → ruxsat so'rovi oqimda → /api/actions bilan tasdiq", async () => {
  // Soxta Jigar: kompyuterda buyruq bajarishga urinadi (toolbox orqali), natijani javobga yozadi.
  const jigar = {
    async chat(args) {
      const r = await args.toolbox.run("pc_run_command", { command: "echo salom", reason: "Sinov" });
      const text = `[TUSHUNTIRISH]\n${r.content[0].text} | ${args.nowNote.includes("Kompyuter ulangan") ? "ulangan" : "yo'q"}`;
      return { text, parsed: parseAkaResponse(text), userContent: "x" };
    },
  };
  const s = await startServer({ jigar, ttsProviders: {}, stt: { configured: false } });
  try {
    // Desktop: buyruq kutadi, kelgach bajaradi.
    const desktop = (async () => {
      const { command } = await (await s.post("/api/devices/poll", { name: "Mac", platform: "darwin" })).json();
      assert.equal(command.approved, true);
      await s.post("/api/devices/result", { id: command.id, result: { text: "salom" } });
    })();
    // Desktop so'rovi serverga yetib borguncha kutamiz.
    let online = false;
    for (let i = 0; i < 50 && !online; i++) {
      online = (await (await s.raw("/api/devices")).json()).pc.online;
      if (!online) await new Promise((r) => setTimeout(r, 10));
    }
    assert.equal(online, true);

    const res = await s.post("/api/chat", { history: [{ role: "user", content: "salom de" }], stream: true });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let done = null;
    while (!done) {
      const { value, done: end } = await reader.read();
      if (end) break;
      buffer += decoder.decode(value, { stream: true });
      for (const line of buffer.split("\n").slice(0, -1)) {
        const msg = JSON.parse(line);
        if (msg.type === "confirm") {
          assert.equal(msg.detail, "echo salom");
          const answer = await s.post(`/api/actions/${msg.id}`, { approve: true });
          assert.equal(answer.status, 200);
        }
        if (msg.type === "done") done = msg;
      }
      buffer = buffer.slice(buffer.lastIndexOf("\n") + 1);
    }
    await desktop;
    assert.match(done.text, /salom \| ulangan/);
    assert.equal((await s.post("/api/actions/yoq", { approve: true })).status, 404);
  } finally {
    s.close();
  }
});

test("HTTP: qurilma va nudge yo'llari — kirmaganga 401, boshqa /api yo'llariga tegmaydi", async () => {
  const s = await startServer({ jigar: { chat: async () => ({ text: REPLY }) }, ttsProviders: {}, stt: { configured: false } }, { login: false });
  try {
    assert.equal((await s.raw("/api/devices")).status, 401);
    assert.equal((await s.raw("/api/nudges")).status, 401);
    assert.equal((await s.post("/api/devices/poll", {})).status, 401);
    assert.equal((await s.raw("/api/health")).status, 200);
    assert.equal((await s.raw("/api/yoq-yol")).status, 404);
  } finally {
    s.close();
  }
});
