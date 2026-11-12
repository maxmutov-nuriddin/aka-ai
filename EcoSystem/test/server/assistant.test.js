import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../../server/db/database.js";
import { createAssistantStore, normalizeReminder, MEMORY_LIMIT } from "../../server/assistant/store.js";
import { tashkentNowNote } from "../../server/assistant/routes.js";
import { parseAkaResponse, parseFile, parseReminders } from "../../server/core/parse.js";
import { createJigar, systemPromptFor } from "../../server/core/jigar.js";
import { ValidationError } from "../../server/core/errors.js";
import { hasWakeWord } from "../../web/app/wake.js";
import { startServer, TEST_USER } from "./helpers.js";

const NOW = new Date("2026-11-12T14:40:00Z"); // Toshkent: 19:40, payshanba

function makeStore(now = NOW) {
  const db = openDatabase(":memory:");
  db.prepare("INSERT INTO users (name, email, password_hash) VALUES ('A', 'a@x.uz', 'h')").run();
  return { db, store: createAssistantStore(db, { now: () => now }) };
}

test("xotira: takrorlar tashlanadi, chegara oshsa eng eskisi o'chadi", () => {
  const { store } = makeStore();
  assert.deepEqual(store.addMemories(1, ["Ismi Nuriddin", "ismi  nuriddin!", "Qahva ichadi", ""]), ["Ismi Nuriddin", "Qahva ichadi"]);
  for (let i = 0; i < MEMORY_LIMIT + 5; i++) store.addMemories(1, [`fakt ${i}`]);
  const list = store.listMemories(1);
  assert.equal(list.length, MEMORY_LIMIT);
  assert.equal(list.at(-1).text, `fakt ${MEMORY_LIMIT + 4}`);
  assert.ok(store.deleteMemory(1, list[0].id));
  assert.equal(store.clearMemories(1), MEMORY_LIMIT - 1);
});

test("eslatmalar: noto'g'ri vaqt tashlanadi, vaqti kelgani 'due' da, bajarilgach chiqmaydi", () => {
  const { db, store } = makeStore();
  const added = store.addReminders(1, [
    { dueAt: "2026-11-12T19:45:00+05:00", text: "Choy" },
    { dueAt: "2026-11-13T10:00:00+05:00", text: "Qo'ng'iroq" },
    { dueAt: "kecha", text: "buzuq" },
    { dueAt: "2020-01-01T00:00:00Z", text: "o'tgan" },
  ]);
  assert.deepEqual(added.map((r) => r.text), ["Choy", "Qo'ng'iroq"]);
  assert.equal(store.pendingReminders(1).length, 2);
  assert.equal(store.dueReminders(1).length, 0);
  const later = createAssistantStore(db, { now: () => new Date("2026-11-12T14:50:00Z") }); // 19:50 — "Choy" vaqti kelgan
  const due = later.dueReminders(1);
  assert.deepEqual(due.map((r) => r.text), ["Choy"]);
  assert.ok(later.markReminderDone(1, due[0].id));
  assert.equal(later.dueReminders(1).length, 0);
  assert.throws(() => normalizeReminder({ dueAt: "2026-11-13T10:00:00+05:00", text: " " }, NOW), ValidationError);
});

test("tashkentNowNote: hafta kuni va Toshkent vaqti", () => {
  assert.equal(tashkentNowNote(NOW), "Hozir: payshanba, 2026-11-12 19:40 (Toshkent, +05:00)");
});

test("parse: [XOTIRA], [ESLATMA], [FAYL] ajratiladi; tushuntirishga aralashmaydi; fayl nomi tozalanadi", () => {
  const r = parseAkaResponse("[TUSHUNTIRISH]\nTayyor.\n\n[XOTIRA]\n- Ismi Nuriddin\n\n[ESLATMA]\n{\"vaqt\":\"2026-11-13T10:00:00+05:00\",\"matn\":\"Qo'ng'iroq\"}\n\n[FAYL]\nnomi: ../reja.csv\n```\nKun,Ish\n```");
  assert.equal(r.tushuntirish, "Tayyor.");
  assert.deepEqual(r.xotira, ["Ismi Nuriddin"]);
  assert.deepEqual(r.eslatmalar, [{ dueAt: "2026-11-13T10:00:00+05:00", text: "Qo'ng'iroq" }]);
  assert.deepEqual(r.fayl, { nomi: "reja.csv", mazmun: "Kun,Ish" });
  assert.equal(parseFile("nomi: virus.exe\nsalom").nomi, "virus.txt"); // ruxsatsiz tur — .txt
  assert.deepEqual(parseReminders("yo'q"), []);
  assert.deepEqual(parseAkaResponse("[TUSHUNTIRISH]\nok").xotira, []);
});

const fakeClaude = (replies, calls) => {
  const create = async (p) => { calls.push(p); return replies.shift() ?? { content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", model: "m" }; };
  return { messages: { create }, beta: { messages: { create } } };
};

test("prompt: xotira bo'limi, hozirgi vaqt va internet qidiruvi doim", async () => {
  assert.match(systemPromptFor("uz", { memories: ["Ismi Nuriddin"] }), /# XOTIRA[\s\S]*- Ismi Nuriddin/);
  assert.doesNotMatch(systemPromptFor("uz", {}), /# XOTIRA/);
  const calls = [];
  const jigar = createJigar({ client: fakeClaude([], calls), config: { model: "m", effort: "medium", maxTokens: 100, fallbacks: true } });
  await jigar.chat({ history: [{ role: "user", content: "Ob-havo?" }], memories: ["Ismi Nuriddin"], nowNote: "Hozir: payshanba" });
  assert.equal(calls[0].tools[0].name, "web_search");
  assert.match(calls[0].messages[0].content, /\(Hozir: payshanba\)$/);
  assert.match(calls[0].system, /- Ismi Nuriddin/);
});
test("pause_turn: qidiruv uzoq cho'zilsa javob davom ettiriladi va matnlar qo'shiladi", async () => {
  const replies = [
    { content: [{ type: "text", text: "[TUSHUNTIRISH]\nQidir" }], stop_reason: "pause_turn", model: "m" },
    { content: [{ type: "text", text: "dim." }], stop_reason: "end_turn", model: "m" },
  ];
  const calls = [];
  const jigar = createJigar({ client: fakeClaude(replies, calls), config: { model: "m", effort: "medium", maxTokens: 100, fallbacks: false } });
  const r = await jigar.chat({ history: [{ role: "user", content: "x" }] });
  assert.equal(r.text, "[TUSHUNTIRISH]\nQidirdim.");
  assert.equal(calls[1].messages.at(-1).role, "assistant");
});

test("/api/assistant: kirgan egasi uchun; chat javobidagi xotira saqlanadi; kirmaganga — 401", async () => {
  const reply = "[TUSHUNTIRISH]\nXo'p.\n\n[XOTIRA]\n- Ismi Nuriddin\n\n[ESLATMA]\n[{\"vaqt\":\"2099-01-01T10:00:00+05:00\",\"matn\":\"Test\"}]";
  const jigar = {
    async chat() { return { text: reply, parsed: parseAkaResponse(reply) }; },
    async summary() { return { text: "" }; },
  };
  const s = await startServer({ jigar });
  try {
    const chat = await (await s.post("/api/chat", { history: [{ role: "user", content: "Eslab qol" }] })).json();
    assert.deepEqual(chat.assistant.remembered, ["Ismi Nuriddin"]);
    assert.equal(chat.assistant.reminders.length, 0); // 2099 — 1 yildan uzoq: rad etiladi
    const list = await (await s.raw("/api/assistant")).json();
    assert.equal(list.memories[0].text, "Ismi Nuriddin");
  } finally {
    s.close();
  }
  const anon = await startServer({ jigar }, { login: false });
  try {
    assert.equal((await anon.raw("/api/assistant")).status, 401);
  } finally {
    anon.close();
  }
});

test("\"Hey Jigar\": uyg'otish so'zi turli yozilishda topiladi, boshqa so'z ichida emas", () => {
  for (const t of ["hey jigar", "Jigar, qara", "эй джигар", "salom jiger"]) assert.ok(hasWakeWord(t), t);
  for (const t of ["jigarrang ko'ylak", "salom"]) assert.ok(!hasWakeWord(t), t);
});
