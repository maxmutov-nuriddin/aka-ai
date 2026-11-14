// Tezkor buyruqlar (AI'siz): aniq gaplar → asbob chaqiruvi; STT xatolari tuzatiladi; uzun gap yoki savol — null (AI'ga).
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchFastCommand, runFastCommand, parseLevel, normalize } from "../../server/agent/fast-commands.js";

const steps = (text) => matchFastCommand(text)?.steps?.map((s) => `${s.name}:${JSON.stringify(s.input)}`);

test("parseLevel: raqam, o'zbekcha so'z va 100", () => {
  assert.equal(parseLevel("40"), 40);
  assert.equal(parseLevel("ellik"), 50);
  assert.equal(parseLevel("qirq besh"), 45);
  assert.equal(parseLevel("yuz"), 100);
  assert.equal(parseLevel("500"), 100);
  assert.equal(parseLevel("salom"), null);
  assert.equal(parseLevel("bir ikki uch"), null);
});

test("ovoz: foiz, so'z bilan, oshir/pasaytir, o'chir/yoq; YouTube ovozi alohida", () => {
  assert.deepEqual(steps("Ovozni 40 qil"), ['pc_media:{"action":"volume_set","level":40}']);
  assert.deepEqual(steps("ovozni ellik foizga qo'y"), ['pc_media:{"action":"volume_set","level":50}']);
  assert.deepEqual(steps("Jigar, ovozni 30 foiz qil"), ['pc_media:{"action":"volume_set","level":30}']);
  assert.deepEqual(steps("ovozni pasaytir"), ['pc_media:{"action":"volume_down"}']);
  assert.deepEqual(steps("ovozni oshir"), ['pc_media:{"action":"volume_up"}']);
  assert.deepEqual(steps("ovozni o'chir"), ['pc_media:{"action":"mute"}']);
  assert.deepEqual(steps("youtube ovozini 20 qil"), ['pc_youtube:{"action":"volume","level":20}']);
});

test("ilova ochish; STT buzgan fe'l ('yok'), kirill va 'ni' qo'shimchasi", () => {
  assert.deepEqual(steps("Telegramni och"), ['pc_apps:{"action":"open","app":"Telegram"}']);
  assert.deepEqual(steps("Yandex Musicni yok"), ['pc_apps:{"action":"open","app":"Yandex Music"}']);
  assert.deepEqual(steps("Телеграмни оч"), ['pc_apps:{"action":"open","app":"Telegram"}']);
  assert.equal(matchFastCommand("google saytini och"), null); // sayt — AI
});

test("YouTube: qo'yish, yopish (pleer + tab), to'xtatish; brauzer tabini yopish", () => {
  assert.deepEqual(steps("YouTube'da hayr sentabr qo'y"), ['pc_youtube:{"action":"play","query":"hayr sentabr"}']);
  const close = matchFastCommand("YouTube'ni yop");
  assert.deepEqual(close.steps.map((s) => s.name), ["pc_youtube", "pc_apps"]);
  assert.ok(close.steps.every((s) => s.optional));
  assert.equal(close.say, "YouTube yopildi.");
  assert.deepEqual(steps("youtubeni nyop"), steps("youtubeni yop")); // STT: "nyop"
  assert.deepEqual(steps("Chrome'dagi YouTube tabini yop"), ['pc_apps:{"action":"close_tab","title":"Youtube"}']);
});

test("musiqa, qulflash, vaqt (asbobsiz)", () => {
  assert.deepEqual(steps("musiqani to'xtat"), ['pc_media:{"action":"play_pause"}']);
  assert.deepEqual(steps("keyingi qo'shiq"), ['pc_media:{"action":"next"}']);
  assert.deepEqual(steps("ekranni qulfla"), ['pc_system:{"action":"lock"}']);
  assert.equal(matchFastCommand("soat necha", { now: new Date("2026-11-14T03:31:00Z") }).say, "Hozir 08:31.");
});

test("tushunarsiz, uzun yoki savol gap — null (AI'ga o'tadi)", () => {
  for (const t of ["Bugun ob-havo qanday bo'ladi", "ovozni nima uchun pasaytirding", "Namay gap", "", "ovozni juda juda juda juda juda juda baland qilib qo'yib yubor endi", "ertaga soat nechada uchrashuv bor edi"]) {
    assert.equal(matchFastCommand(t), null, t);
  }
  assert.equal(normalize("Hey Jigar, iltimos Ovozni 40 qil!"), "ovozni 40 qil");
});

test("runFastCommand: qurilmasiz — null; majburiy qadam xato — null; ixtiyoriy xato — o'tkazib yuboriladi; matn", async () => {
  const toolbox = (results) => ({ devices: [{ id: "d" }], run: async (name) => results[name] ?? { isError: false, content: [{ type: "text", text: "Ovoz 40%." }] } });
  assert.equal(await runFastCommand(matchFastCommand("ovozni 40 qil"), { devices: [], run: async () => ({}) }), null);
  assert.equal(await runFastCommand(matchFastCommand("ovozni 40 qil"), toolbox({})), "Bajarildi. Ovoz 40%.");
  assert.equal(await runFastCommand(matchFastCommand("ovozni 40 qil"), toolbox({ pc_media: { isError: true, content: [] } })), null);
  const closed = await runFastCommand(matchFastCommand("youtubeni yop"), toolbox({ pc_youtube: { isError: true, content: [] }, pc_apps: { isError: false, content: [{ type: "text", text: "1 ta tab yopildi" }] } }));
  assert.equal(closed, "YouTube yopildi.");
  assert.equal(await runFastCommand(matchFastCommand("soat necha", { now: new Date("2026-11-14T03:31:00Z") }), null), "Hozir 08:31.");
});

test("tezkor: ilova yopish, ekran, uyqu, oynalar, fokus", () => {
  assert.deepEqual(matchFastCommand("Telegramni yop").steps, [{ name: "pc_apps", input: { action: "quit", app: "Telegram" } }]);
  assert.equal(matchFastCommand("ekranni o'chir").steps[0].input.action, "sleep_display");
  assert.equal(matchFastCommand("kompyuterni uxlat").steps[0].name, "pc_power");
  assert.equal(matchFastCommand("oynalarni yashir").steps[0].input.action, "hide_all");
  assert.deepEqual(matchFastCommand("Chromega o't").steps[0].input, { action: "focus", app: "Chrome" });
  assert.equal(matchFastCommand("musiqani o'chir"), null, "musiqa — ilova emas");
  assert.equal(matchFastCommand("ovozni o'chir").steps[0].input.action, "mute", "ovoz qoidasi ustun");
});

test("tezkor: holat o'qish — javob asbob natijasi", async () => {
  const command = matchFastCommand("batareya necha foiz");
  assert.equal(command.report, true);
  const toolbox = { devices: [{}], run: async () => ({ isError: false, content: [{ type: "text", text: "Batareya 38%, zaryadlanmoqda." }] }) };
  assert.equal(await runFastCommand(command, toolbox), "Batareya 38%, zaryadlanmoqda.");
});
