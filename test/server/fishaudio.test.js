import { test } from "node:test";
import assert from "node:assert/strict";
import { createFishAudio, fishProsodyFor } from "../../server/voice/fishaudio.js";
import { TtsNotConfiguredError } from "../../server/voice/azure.js";
import { ValidationError } from "../../server/core/jigar.js";

const ENV = { FISH_API_KEY: "fish-test", FISH_VOICE_ID: "baseVoice01" };

function fakeFetch({ ok = true, status = 200, bytes = [4, 5, 6] } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return { ok, status, text: async () => "fish error", arrayBuffer: async () => new Uint8Array(bytes).buffer };
  };
  return { fetchImpl, calls };
}

test("fish: kalit bo'lmasa sozlanmagan va TtsNotConfiguredError", async () => {
  const fish = createFishAudio({ env: {} });
  assert.equal(fish.configured, false);
  await assert.rejects(fish.synthesize("Salom"), TtsNotConfiguredError);
});

test("fish: to'g'ri so'rov yuboradi — standart Drama 3, ovoz, mp3, til; teglar ko'rsatma sifatida saqlanadi", async () => {
  const { fetchImpl, calls } = fakeFetch();
  const fish = createFishAudio({ env: ENV, fetchImpl });
  const audio = await fish.synthesize("[laughs] Salom, jigar! [sarcastic] Zo'r.", { lang: "uz" });
  assert.deepEqual([...audio], [4, 5, 6]);
  const { url, init, body } = calls[0];
  assert.equal(url, "https://api.fish.audio/v1/tts");
  assert.equal(init.method, "POST");
  assert.equal(init.headers.Authorization, "Bearer fish-test");
  assert.equal(init.headers.model, "drama-3");
  assert.equal(body.text, "[laughs] Salom, jigar! [sarcastic] Zo'r.");
  assert.equal(body.reference_id, "baseVoice01");
  assert.equal(body.format, "mp3");
  assert.equal(body.language, "uz");
});

test("fish: xarakter ohangi (tezlik, ifodalilik) va xarakter ovozi .env dan", async () => {
  const { fetchImpl, calls } = fakeFetch();
  const fish = createFishAudio({ env: { ...ENV, FISH_VOICE_ID_JAHLDOR: "angryVoice01", FISH_MODEL: "s2.1-pro-free" }, fetchImpl });
  await fish.synthesize("Salom", { persona: "jahldor" });
  await fish.synthesize("Salom", { persona: "romantik" });
  assert.equal(calls[0].body.reference_id, "angryVoice01");
  assert.equal(calls[1].body.reference_id, "ebe8b1e774544b36a842c30761a67dc5"); // romantik — standart (Uzbel)
  assert.equal(calls[0].init.headers.model, "s2.1-pro-free"); // .env dagi model
  assert.ok(calls[0].body.prosody.speed > calls[1].body.prosody.speed, "jahldor tezroq");
  assert.ok(calls[0].body.temperature > fishProsodyFor("neytral").temperature, "jahldor ifodaliroq");
  for (const p of ["neytral", "mehribon", "kinoyali", "jahldor", "romantik"]) {
    const s = fishProsodyFor(p);
    assert.ok(s.speed >= 0.5 && s.speed <= 2 && s.temperature >= 0 && s.temperature <= 1);
  }
});

test("fish: yoshga mos ovoz (ElevenLabs kabi) — 5–9 yosh, 10+/talaba katta; guruh ovozi bo'lmasa umumiy", async () => {
  const { fetchImpl, calls } = fakeFetch();
  const env = { ...ENV, FISH_VOICE_ID_JAHLDOR_YOSH: "angryYoung1", FISH_VOICE_ID_JAHLDOR_KATTA: "angryOld01", FISH_VOICE_ID_MEHRIBON: "kindAll001" };
  const fish = createFishAudio({ env, fetchImpl });
  await fish.synthesize("Salom", { persona: "jahldor", level: "8-9" });
  await fish.synthesize("Salom", { persona: "jahldor", level: "student" });
  await fish.synthesize("Salom", { persona: "jahldor" }); // sinf noma'lum — yosh
  await fish.synthesize("Salom", { persona: "mehribon", level: "10-11" });
  assert.deepEqual(calls.map((c) => c.body.reference_id), ["angryYoung1", "angryOld01", "angryYoung1", "kindAll001"]);
});

test("fish: standart o'zbekcha ovozlar — 5 xarakter × 2 yosh, hammasi har xil; xarakter yo'q — FISH_VOICE_ID", async () => {
  const { fetchImpl, calls } = fakeFetch();
  const fish = createFishAudio({ env: { FISH_API_KEY: "k" }, fetchImpl });
  for (const p of ["neytral", "mehribon", "kinoyali", "jahldor", "romantik"]) {
    await fish.synthesize("Salom", { persona: p, level: "5-7" });
    await fish.synthesize("Salom", { persona: p, level: "student" });
  }
  await fish.synthesize("Salom");
  const ids = calls.map((c) => c.body.reference_id);
  assert.equal(new Set(ids.slice(0, 10)).size, 10);
  assert.equal(ids[7], "44ad146afad04e4e99a7b98b8f97106f"); // jahldor katta — Confident Uzbek
  assert.equal(ids[10], undefined); // xarakter yo'q, FISH_VOICE_ID yo'q — Fish standart ovozi
});

test("fish: model har so'rovda tanlanadi; drama-3 teglarni (ko'rsatma) saqlaydi, boshqalari olib tashlaydi", async () => {
  const { fetchImpl, calls } = fakeFetch();
  const fish = createFishAudio({ env: ENV, fetchImpl });
  await fish.synthesize("[laughs] Salom! [whispers] Sir.", { model: "drama-3" });
  await fish.synthesize("[laughs] Salom! [whispers] Sir.", { model: "s2.1-pro-free" });
  await fish.synthesize("Salom", { model: "s2-pro" }); // ro'yxatda yo'q — standart (Drama 3)
  assert.equal(calls[0].init.headers.model, "drama-3");
  assert.equal(calls[0].body.text, "[laughs] Salom! [whispers] Sir.");
  assert.equal(calls[1].init.headers.model, "s2.1-pro-free");
  assert.equal(calls[1].body.text, "Salom! Sir.");
  assert.equal(calls[2].init.headers.model, "drama-3");
});

test("fish: bo'sh matn — ValidationError, API xatosi — status bilan", async () => {
  const fish = createFishAudio({ env: ENV, fetchImpl: fakeFetch({ ok: false, status: 402 }).fetchImpl });
  await assert.rejects(fish.synthesize("  "), ValidationError);
  await assert.rejects(fish.synthesize("[laughs]"), ValidationError);
  await assert.rejects(fish.synthesize("Salom"), /402/);
});

test("fish: til o'rganish rejimi (lang \"auto\") — til maydoni yuborilmaydi", async () => {
  const { fetchImpl, calls } = fakeFetch();
  await createFishAudio({ env: ENV, fetchImpl }).synthesize("Salom! Привет!", { lang: "auto" });
  assert.equal("language" in calls[0].body, false);
});
