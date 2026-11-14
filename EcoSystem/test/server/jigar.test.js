// EcoSystem jigar.js: shaxsiy yordamchi prompti, xabarlar, Claude so'rovi (oqim, qidiruv, zaxira), muqobil miyalar.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMessages, createJigar, getConfig, normalizeHistory, normalizePage, normalizeLang, normalizeLength, normalizePersona,
  systemPromptFor, stripOptional, promptNeeds, recentHistory, withHeardAlternative, PERSONAS, LIMITS, SYSTEM_PROMPT, CAMERA_NOTE, VOICE_NOTE, ValidationError,
} from "../../server/core/jigar.js";

const config = { model: "claude-opus-5-5", effort: "medium", maxTokens: 16000, fallbacks: true };
const okResponse = (text) => ({ content: [{ type: "text", text }], stop_reason: "end_turn", model: "claude-opus-5-5", usage: { input_tokens: 1, output_tokens: 1 } });

function fakeClient(response) {
  const calls = [];
  const create = async (params) => {
    calls.push(params);
    return typeof response === "function" ? response(params) : response;
  };
  return { calls, client: { messages: { create }, beta: { messages: { create } } } };
}

test("asosiy prompt — shaxsiy yordamchi, o'qituvchi qoidalari yo'q", () => {
  assert.match(SYSTEM_PROMPT, /shaxsiy yordamchi/);
  assert.doesNotMatch(SYSTEM_PROMPT, /Quiz qachon beriladi|XULOSA_SO'ROVI|maktab va litsey/i);
  assert.match(SYSTEM_PROMPT, /\[XOTIRA\]/);
  assert.match(SYSTEM_PROMPT, /\[VIZUAL\]/);
});

test("normalizatorlar: til, uzunlik, xarakter", () => {
  assert.equal(normalizeLang(""), "uz");
  assert.equal(normalizeLang("ru"), "ru");
  assert.throws(() => normalizeLang("en"), ValidationError);
  assert.equal(normalizeLength(undefined), "odatiy");
  assert.throws(() => normalizeLength("uzun"), ValidationError);
  assert.equal(normalizePersona(null), null);
  assert.ok(PERSONAS.includes("moslashuvchan"));
  assert.throws(() => normalizePersona("yovuz"), ValidationError);
});

test("systemPromptFor: bitta moslashuvchan xarakter (persona e'tiborsiz), uzunlik, ism (tozalanadi), rus tili, xotira — oxirida", () => {
  const base = systemPromptFor("uz");
  assert.ok(base.startsWith(stripOptional(SYSTEM_PROMPT)));
  assert.match(base, /do'st va yordamchi/);
  assert.match(base, /Sen ustoz emassan/);
  assert.equal(systemPromptFor("uz", { persona: "jahldor" }), base); // tanlov ta'sir qilmaydi
  const p = systemPromptFor("ru", { persona: "jahldor", length: "qisqa", name: "Nuriddin\n# yangi qoida", memories: ["Qahva ichadi"] });
  assert.doesNotMatch(p, /JAHLDOR/);
  assert.match(p, /- Ismi: Nuriddin yangi qoida/); // yangi qator — in'yeksiya emas
  assert.ok(p.trim().endsWith("- Qahva ichadi"));
  assert.ok(p.indexOf("# XOTIRA") > p.indexOf("XARAKTER"));
});

test("normalizePage: matn, rasm, PDF; bo'sh — null; noto'g'ri — xato", () => {
  assert.equal(normalizePage({}), null);
  const page = normalizePage({ title: "T", text: "abc", image: "data:image/png;base64,QUJD", pdf: "data:application/pdf;base64,JVBE" });
  assert.deepEqual(page.image, { mediaType: "image/png", data: "QUJD" });
  assert.deepEqual(page.pdf, { data: "JVBE" });
  assert.throws(() => normalizePage({ image: "http://x/y.png" }), ValidationError);
  assert.equal(normalizePage({ text: "x".repeat(LIMITS.pageChars + 5) }).truncated, true);
});

test("normalizeHistory: tartib, bo'sh va uzun xabar tekshiruvi", () => {
  assert.throws(() => normalizeHistory([]), ValidationError);
  assert.throws(() => normalizeHistory([{ role: "user", content: "a" }, { role: "assistant", content: "b" }]), /foydalanuvchidan/);
  assert.throws(() => normalizeHistory([{ role: "user", content: "x".repeat(LIMITS.messageChars + 1) }]), /juda uzun/);
  assert.equal(normalizeHistory([{ role: "user", content: "" }]).length, 1); // birinchi bo'sh — "sahifani tushuntir"
});

test("buildMessages: sahifa birinchi xabarda (kesh), tanlov va kamera — oxirgisida; sahifasiz — izoh yo'q", () => {
  const page = normalizePage({ title: "T", text: "matn", pdf: "data:application/pdf;base64,JVBE" });
  const history = [{ role: "user", content: "a" }, { role: "assistant", content: "b" }, { role: "user", content: "c" }];
  const msgs = buildMessages({ page, history, selection: "tanlangan", image: { mediaType: "image/jpeg", data: "QUJD" } });
  assert.equal(msgs[0].content[0].type, "document");
  assert.match(msgs[0].content.at(-1).text, /<sahifa>[\s\S]*matn/);
  assert.equal(msgs[2].content[0].type, "image");
  assert.match(msgs[2].content[1].text, /tanlangan/);
  assert.equal(buildMessages({ page: null, history: [{ role: "user", content: "Salom" }] })[0].content, "Salom");
});

test("withHeardAlternative: farq bo'lsa ikkinchi variant qo'shiladi", () => {
  assert.equal(withHeardAlternative("salom", "Salom!"), "salom");
  assert.match(withHeardAlternative("foto sintez nima", "fotosintez mana"), /Ikkinchi tanish tizimi shunday eshitdi: "fotosintez mana"/);
});

test("chat: Claude parametrlari — model, tizim, kesh, zaxira model, internet qidiruvi; ovoz/kamera/vaqt izohlari", async () => {
  const { client, calls } = fakeClient(okResponse("[SAVOL]\nSalom?\n[TUSHUNTIRISH]\nSalom, Nuriddin!"));
  const jigar = createJigar({ client, config });
  const r = await jigar.chat({
    history: [{ role: "user", content: "salom" }], voice: true, image: "data:image/jpeg;base64,QUJD",
    userName: "Nuriddin", nowNote: "Hozir: juma", memories: ["Dasturchi"],
  });
  const p = calls[0];
  assert.equal(p.model, "claude-opus-5-5");
  assert.deepEqual(p.cache_control, { type: "ephemeral" });
  assert.equal(p.fallbacks, "default");
  assert.equal(p.tools[0].name, "web_search");
  // Tizim prompti alohida blok va 1 soat keshlanadi (yangi savolda ham keshdan o'qiladi)
  assert.equal(p.system.length, 1);
  assert.deepEqual(p.system[0].cache_control, { type: "ephemeral", ttl: "1h" });
  assert.match(p.system[0].text, /- Ismi: Nuriddin/);
  assert.match(p.system[0].text, /- Dasturchi/);
  const last = p.messages[0].content;
  assert.equal(last[0].type, "image");
  assert.ok(last[1].text.startsWith(CAMERA_NOTE));
  assert.ok(last[1].text.includes(VOICE_NOTE));
  assert.match(last[1].text, /\(Hozir: juma\)$/);
  assert.equal(r.parsed.savol, "Salom?");
  assert.equal(r.parsed.tushuntirish, "Salom, Nuriddin!");
});

test("chat: oqim (onDelta) — beta stream, bo'laklar yakuniy matnga teng", async () => {
  const final = okResponse("[TUSHUNTIRISH]\nok");
  const seen = [];
  const stream = (kind) => () => {
    seen.push(kind);
    const handlers = [];
    return {
      on(event, fn) { if (event === "text") handlers.push(fn); return this; },
      async finalMessage() { for (const t of ["[TUSHUNTIRISH]\n", "ok"]) handlers.forEach((h) => h(t)); return final; },
    };
  };
  const client = { messages: { stream: stream("plain") }, beta: { messages: { stream: stream("beta") } } };
  const deltas = [];
  const r = await createJigar({ client, config }).chat({ history: [{ role: "user", content: "x" }], onDelta: (d) => deltas.push(d) });
  assert.equal(deltas.join(""), r.text);
  assert.deepEqual(seen, ["beta"]);
});

test("chat: Gemini tanlansa — muqobil miya; PDF bo'lsa yoki xato bersa — Claude", async () => {
  let altCalls = 0;
  const gemini = { configured: true, async generate() { altCalls++; return { text: "[TUSHUNTIRISH]\ngemini", model: "g" }; } };
  const { client, calls } = fakeClient(okResponse("[TUSHUNTIRISH]\nclaude"));
  const jigar = createJigar({ client, config, gemini });
  assert.equal((await jigar.chat({ history: [{ role: "user", content: "x" }], llm: "gemini" })).parsed.tushuntirish, "gemini");
  await jigar.chat({ page: { pdf: "data:application/pdf;base64,JVBE" }, history: [{ role: "user", content: "x" }], llm: "gemini" });
  assert.equal(altCalls, 1);
  assert.equal(calls.length, 1);
  const broken = createJigar({ client, config, gemini: { configured: true, async generate() { throw new Error("down"); } } });
  assert.equal((await broken.chat({ history: [{ role: "user", content: "x" }], llm: "gemini" })).parsed.tushuntirish, "claude");
});

test("chat: haiku — arzon model, zaxirasiz, oddiy qidiruv; rad javobi yumshoq", async () => {
  const { client, calls } = fakeClient(okResponse("ok"));
  await createJigar({ client, config: { ...config, haikuModel: "claude-haiku-5-5" } }).chat({ history: [{ role: "user", content: "x" }], llm: "haiku" });
  assert.equal(calls[0].model, "claude-haiku-5-5");
  assert.equal(calls[0].fallbacks, undefined);
  assert.equal(calls[0].tools[0].type, "web_search_20250305");
  const refused = fakeClient({ ...okResponse("qisman"), stop_reason: "refusal" });
  const r = await createJigar({ client: refused.client, config }).chat({ history: [{ role: "user", content: "x" }] });
  assert.equal(r.refused, true);
  assert.match(r.text, /javob bera olmayman/);
  assert.equal(getConfig({}).model, "claude-opus-5-5");
});

test("chat: kompyuter asboblari — tool_use → bajariladi → tool_result yuboriladi, matn birlashadi", async () => {
  const toolUse = {
    content: [{ type: "tool_use", id: "tu_1", name: "pc_screenshot", input: {} }],
    stop_reason: "tool_use", model: "claude-opus-5-5", usage: { input_tokens: 1, output_tokens: 1 },
  };
  let n = 0;
  const { client, calls } = fakeClient(() => (n++ === 0 ? toolUse : okResponse("[TUSHUNTIRISH]\nEkranda VS Code ochiq.")));
  const ran = [];
  const toolbox = {
    definitions: [{ name: "pc_screenshot", description: "ekran", input_schema: { type: "object", properties: {} } }],
    async run(name, input) {
      ran.push([name, input]);
      return { content: [{ type: "text", text: "rasm" }], isError: false };
    },
  };
  const jigar = createJigar({ client, config });
  const res = await jigar.chat({ history: [{ role: "user", content: "ekranimga qara" }], toolbox });
  assert.deepEqual(ran, [["pc_screenshot", {}]]);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].tools.some((t) => t.name === "pc_screenshot"), "asbob berildi");
  const last = calls[1].messages;
  assert.equal(last.at(-2).role, "assistant");
  assert.deepEqual(last.at(-1), { role: "user", content: [{ type: "tool_result", tool_use_id: "tu_1", content: [{ type: "text", text: "rasm" }] }] });
  assert.match(res.parsed.tushuntirish, /VS Code/);
});

test("chat: kompyuter ulangan bo'lsa muqobil miya (Gemini) emas, Claude javob beradi", async () => {
  const { client, calls } = fakeClient(okResponse("[TUSHUNTIRISH]\nclaude"));
  const gemini = { configured: true, async generate() { throw new Error("chaqirilmasligi kerak"); } };
  const toolbox = { definitions: [], run: async () => ({ content: [], isError: false }) };
  const res = await createJigar({ client, config, gemini }).chat({ history: [{ role: "user", content: "x" }], llm: "gemini", toolbox });
  assert.equal(calls.length, 1);
  assert.match(res.text, /claude/);
});

test("think: proaktiv fikr — Haiku, fikrlashsiz, rad etilsa bo'sh", async () => {
  const { client, calls } = fakeClient(okResponse("JIM"));
  const jigar = createJigar({ client, config: { ...config, haikuModel: "claude-haiku-5-5" } });
  assert.equal(await jigar.think({ system: "s", content: "c" }), "JIM");
  assert.equal(calls[0].model, "claude-haiku-5-5");
  assert.deepEqual(calls[0].thinking, { type: "disabled" });
  assert.equal(calls[0].tools, undefined);
  await jigar.think({ system: "s", content: "c", search: true });
  assert.equal(calls[1].tools[0].name, "web_search");
  const refused = fakeClient({ ...okResponse("yo'q"), stop_reason: "refusal" });
  assert.equal(await createJigar({ client: refused.client, config }).think({ system: "s", content: "c" }), "");
});

test("Claude darajalari: haiku (standart, fikrlashsiz), sonnet, opus; muqobil miya o'rniga — haiku", async () => {
  const { client, calls } = fakeClient(okResponse("[TUSHUNTIRISH]\nok"));
  const models = { ...config, haikuModel: "claude-haiku-5-5", sonnetModel: "claude-sonnet-5-5" };
  const jigar = createJigar({ client, config: models });
  const ask = (llm) => jigar.chat({ history: [{ role: "user", content: "x" }], llm });
  await ask("haiku");
  await ask("sonnet");
  await ask("opus");
  await ask("gemini"); // sozlanmagan muqobil — eng arzon Claude
  assert.deepEqual(calls.map((c) => c.model), ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"]);
  assert.deepEqual(calls[0].thinking, { type: "disabled" });
  assert.equal(calls[1].thinking, undefined);
});

test("va'da ushlagichi: 'hozir tekshiraman' deb asbobsiz to'xtasa — bir marta majburlab davom ettiriladi", async () => {
  const replies = [
    okResponse("[TUSHUNTIRISH]\nXo'p, hozir ekranni ko'raman."),
    { content: [{ type: "tool_use", id: "tu_1", name: "pc_screenshot", input: {} }], stop_reason: "tool_use", model: "m", usage: { input_tokens: 1, output_tokens: 1 } },
    okResponse("Ekranda VS Code ochiq."),
  ];
  const { client, calls } = fakeClient(() => replies.shift());
  const ran = [];
  const toolbox = { definitions: [], run: async (name) => { ran.push(name); return { content: [{ type: "text", text: "rasm" }], isError: false }; } };
  const res = await createJigar({ client, config }).chat({ history: [{ role: "user", content: "ekranimga qara" }], toolbox });
  assert.deepEqual(ran, ["pc_screenshot"], "asbob haqiqatan chaqirildi");
  assert.equal(calls.length, 3);
  assert.match(calls[1].messages.at(-1).content, /asbob chaqirmading/);
  assert.match(res.text, /VS Code/);
});

test("va'da ushlagichi: asbobsiz oddiy javob, asbob ishlatilgan javob va asbobsiz suhbat — tegilmaydi", async () => {
  const { client, calls } = fakeClient(okResponse("[TUSHUNTIRISH]\nBajarildi, ovoz 50%."));
  await createJigar({ client, config }).chat({ history: [{ role: "user", content: "x" }], toolbox: { definitions: [], run: async () => ({}) } });
  assert.equal(calls.length, 1);
  const noTools = fakeClient(okResponse("Hozir tekshiraman."));
  await createJigar({ client: noTools.client, config }).chat({ history: [{ role: "user", content: "x" }] });
  assert.equal(noTools.calls.length, 1, "asboblar yo'q — majburlanmaydi");
});

test("asbobdan oldingi sharh ('avval tekshiraman') javobga tushmaydi — faqat natija", async () => {
  const replies = [
    { content: [{ type: "text", text: "Avval ilovalarni tekshiraman." }, { type: "tool_use", id: "tu_1", name: "pc_apps", input: { action: "list" } }], stop_reason: "tool_use", model: "m", usage: { input_tokens: 1, output_tokens: 1 } },
    okResponse("[TUSHUNTIRISH]\nBajarildi, Yandex Music ochildi."),
  ];
  const { client } = fakeClient(() => replies.shift());
  const toolbox = { definitions: [], run: async () => ({ content: [{ type: "text", text: "ok" }], isError: false }) };
  const res = await createJigar({ client, config }).chat({ history: [{ role: "user", content: "yandex musiqani och" }], toolbox });
  assert.equal(res.parsed.tushuntirish, "Bajarildi, Yandex Music ochildi.");
  assert.doesNotMatch(res.text, /tekshiraman/);
});

test("addressNote: egasi \"sen\" yoki \"Siz\" deganini aniqlaydi; belgisiz — oldingi xabarlarga qaraydi", async () => {
  const { addressNote, ADDRESS_NOTES } = await import("../../server/core/jigar.js");
  const one = (content) => addressNote([{ role: "user", content }]);
  assert.equal(one("sen ahmoqsan nima qilyapsan"), ADDRESS_NOTES.sen);
  assert.equal(one("jinni bo'ldingmi, nega ochmading"), ADDRESS_NOTES.sen);
  assert.equal(one("Siz menga reja tuzib bera olasizmi?"), ADDRESS_NOTES.siz);
  assert.equal(one("ты где"), ADDRESS_NOTES.sen);
  assert.equal(one("Вы можете помочь?"), ADDRESS_NOTES.siz);
  assert.equal(one("ovozni 40 qil"), "");
  assert.equal(one("ishsiz qoldim"), "");
  const history = [{ role: "user", content: "sen zo'rsan" }, { role: "assistant", content: "x" }, { role: "user", content: "ovozni 40 qil" }];
  assert.equal(addressNote(history), ADDRESS_NOTES.sen);
  assert.equal(addressNote(null), "");
});

test("ixtiyoriy prompt bo'limlari: kamera/sahifa/vizual faqat kerak bo'lganda; token ancha kam", () => {
  const lean = systemPromptFor("uz");
  const full = systemPromptFor("uz", { needs: ["kamera", "sahifa", "vizual"] });
  assert.ok(!/<!--/.test(lean) && !/<!--/.test(full), "markerlar tozalanadi");
  assert.doesNotMatch(lean, /Mermaid|viewBox|Kamera \(Jigarning ko'zi\)/);
  assert.match(full, /Mermaid/);
  assert.match(full, /Kamera \(Jigarning ko'zi\)/);
  assert.ok(full.length - lean.length > 3500, "ixtiyoriy qismlar ~3.5 ming belgidan ko'p");
  assert.deepEqual(promptNeeds({ lastUserText: "ovozni 30 qil" }), []);
  assert.deepEqual(promptNeeds({ lastUserText: "bitta diagramma chizib ber" }), ["vizual"]);
  assert.deepEqual(promptNeeds({ camera: true, page: true, lastUserText: "jadval qil" }), ["kamera", "sahifa", "vizual"]);
});

test("recentHistory: oxirgi 10 ta; birinchisi doim 'user'; qisqa tarix o'zgarmaydi", () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ role: i % 2 === 0 ? "user" : "assistant", content: String(i) }));
  assert.equal(recentHistory(mk(7)).length, 7);
  const trimmed = recentHistory(mk(21)); // oxirgi 10: indekslar 11..20 → 11 — assistant, tashlanadi → 9 ta, user bilan boshlanadi
  assert.equal(trimmed[0].role, "user");
  assert.equal(trimmed.at(-1).content, "20");
  assert.ok(trimmed.length <= 10);
});
