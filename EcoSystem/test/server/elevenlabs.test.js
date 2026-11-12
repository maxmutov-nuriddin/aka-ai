import { test } from "node:test";
import assert from "node:assert/strict";
import { keepSafeVoiceTags, wordStartsFromAlignment, createElevenLabs, voiceSettingsFor, MAX_AUDIO_BYTES } from "../../server/voice/elevenlabs.js";
import { TtsNotConfiguredError } from "../../server/voice/azure.js";
import { ValidationError } from "../../server/core/jigar.js";

const ENV = { ELEVENLABS_API_KEY: "xi-test", ELEVENLABS_VOICE_ID: "voice123" };

function fakeFetch({ ok = true, status = 200, json = null, bytes = [1, 2, 3] } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok,
      status,
      json: async () => json,
      text: async () => "eleven error",
      arrayBuffer: async () => new Uint8Array(bytes).buffer,
    };
  };
  return { fetchImpl, calls };
}

test("synthesize eleven_v4_turbo bilan o'zbek tilida so'rov yuboradi", async () => {
  const { fetchImpl, calls } = fakeFetch();
  const eleven = createElevenLabs({ env: ENV, fetchImpl });
  assert.equal(eleven.configured, true);

  const audio = await eleven.synthesize("[laughs] Salom, jigar!");

  assert.deepEqual([...audio], [1, 2, 3]);
  const { url, init } = calls[0];
  assert.match(url, /^https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\/voice123\?output_format=mp3_44100_128$/);
  assert.equal(init.method, "POST");
  assert.equal(init.headers["xi-api-key"], "xi-test");
  const body = JSON.parse(init.body);
  assert.equal(body.model_id, "eleven_v4_turbo");
  assert.equal(body.language_code, "uz");
  assert.equal(body.text, "[laughs] Salom, jigar!"); // teglar saqlanadi
});

test("voiceSettingsFor: har xarakterning o'z ohangi, noma'lumi — standart", () => {
  const base = voiceSettingsFor(null);
  assert.equal(base.use_speaker_boost, true);
  assert.deepEqual(voiceSettingsFor("yovuz"), base);
  const jahldor = voiceSettingsFor("jahldor");
  const romantik = voiceSettingsFor("romantik");
  assert.ok(jahldor.speed > romantik.speed, "jahldor tezroq gapiradi");
  assert.ok(jahldor.style > voiceSettingsFor("mehribon").style, "jahldor ifodaliroq");
  for (const p of ["neytral", "mehribon", "kinoyali", "jahldor", "romantik"]) {
    const s = voiceSettingsFor(p);
    assert.ok(s.speed >= 0.7 && s.speed <= 1.2, `${p}: speed ElevenLabs chegarasida`);
    assert.ok(s.stability >= 0 && s.stability <= 1 && s.style >= 0 && s.style <= 1);
  }
});

test("synthesize va synthesizeTimed xarakter ohangini yuboradi", async () => {
  const { fetchImpl, calls } = fakeFetch({ json: { audio_base64: "AQID", alignment: null } });
  const eleven = createElevenLabs({ env: ENV, fetchImpl });
  await eleven.synthesize("Salom", { persona: "romantik" });
  assert.deepEqual(JSON.parse(calls[0].init.body).voice_settings, voiceSettingsFor("romantik"));
  await eleven.synthesizeTimed("Salom", { persona: "jahldor" });
  assert.deepEqual(JSON.parse(calls[1].init.body).voice_settings, voiceSettingsFor("jahldor"));
});

test("synthesize: har xarakterning o'z ovozi, xarakter yo'q — .env dagi asosiy ovoz, .env bilan almashtirsa bo'ladi", async () => {
  const { fetchImpl, calls } = fakeFetch();
  const env = { ...ENV, ELEVENLABS_VOICE_ID_ROMANTIK: "myRomantic01", ELEVENLABS_VOICE_ID_MEHRIBON_KATTA: "myKindOld01" };
  const eleven = createElevenLabs({ env, fetchImpl });
  await eleven.synthesize("Salom", { persona: "jahldor" }); // sinf noma'lum — yosh ovoz
  await eleven.synthesize("Salom", { persona: "jahldor", level: "student" });
  await eleven.synthesize("Salom", { persona: "neytral", level: "10-11" });
  await eleven.synthesize("Salom", { persona: "romantik", level: "5-7" });
  await eleven.synthesize("Salom", { persona: "romantik", level: "student" });
  await eleven.synthesize("Salom", { persona: "mehribon", level: "8-9" });
  await eleven.synthesize("Salom", { persona: "mehribon", level: "10-11" });
  await eleven.synthesize("Salom");
  const voiceOf = (i) => calls[i].url.match(/text-to-speech\/([^/?]+)/)[1];
  assert.equal(voiceOf(0), "GcnlXfqDudh5dSQpZVll"); // Mirzabek — yosh, qattiqqo'l
  assert.equal(voiceOf(1), "agoC45V78njTIxYzwmSb"); // Davronbek — katta, salobatli
  assert.equal(voiceOf(2), "cfWx14ZbaEUT4BjIA5tH"); // Mirjalol — katta, xotirjam
  assert.equal(voiceOf(3), "myRomantic01"); // .env: ikkala yosh guruhiga
  assert.equal(voiceOf(4), "myRomantic01");
  assert.equal(voiceOf(5), "GChwNsPvTsqD6tAAORVU"); // Shohjahon — yosh, iliq
  assert.equal(voiceOf(6), "myKindOld01"); // .env: faqat katta guruhga
  assert.equal(voiceOf(7), "voice123"); // xarakter yo'q — asosiy ovoz
});

test("voiceFor: 5 xarakter × 2 yosh guruhi — 10 ta har xil ovoz", () => {
  const eleven = createElevenLabs({ env: ENV });
  const voices = new Set();
  for (const p of ["neytral", "mehribon", "kinoyali", "jahldor", "romantik"]) {
    voices.add(eleven.voiceFor(p, "5-7"));
    voices.add(eleven.voiceFor(p, "student"));
    assert.equal(eleven.voiceFor(p, "8-9"), eleven.voiceFor(p, "5-7"), `${p}: 5-9 sinf bir guruh`);
    assert.equal(eleven.voiceFor(p, "10-11"), eleven.voiceFor(p, "student"), `${p}: 10-11 va talaba bir guruh`);
  }
  assert.equal(voices.size, 10);
});

test("synthesize: xarakter ovozi ishlamasa (masalan, o'chirilgan) — asosiy ovoz bilan qayta urinadi", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const failed = calls.length === 1; // birinchi (xarakter ovozi) — 404
    return {
      ok: !failed,
      status: failed ? 404 : 200,
      text: async () => "voice_not_found",
      json: async () => ({ audio_base64: "AQID", alignment: null }),
      arrayBuffer: async () => new Uint8Array([7, 8]).buffer,
    };
  };
  const eleven = createElevenLabs({ env: ENV, fetchImpl });
  const audio = await eleven.synthesize("Salom", { persona: "jahldor" });
  assert.deepEqual([...audio], [7, 8]);
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /text-to-speech\/voice123\?/);

  calls.length = 0;
  const timed = await eleven.synthesizeTimed("Salom", { persona: "romantik" });
  assert.deepEqual([...timed.audio], [1, 2, 3]);
  assert.match(calls[1].url, /text-to-speech\/voice123\/with-timestamps/);
});

test("synthesize: asosiy ovoz ham ishlamasa — xato beradi (cheksiz urinmaydi)", async () => {
  const { fetchImpl, calls } = fakeFetch({ ok: false, status: 500 });
  const eleven = createElevenLabs({ env: ENV, fetchImpl });
  await assert.rejects(eleven.synthesize("Salom", { persona: "jahldor" }), /500/);
  assert.equal(calls.length, 2);
  await assert.rejects(eleven.synthesize("Salom"), /500/);
  assert.equal(calls.length, 3); // xarakter yo'q — bitta urinish
});

test("synthesize model va ovozni .env dan oladi", async () => {
  const { fetchImpl, calls } = fakeFetch();
  const eleven = createElevenLabs({
    env: { ...ENV, ELEVENLABS_MODEL: "eleven_v4", ELEVENLABS_VOICE_ID: "abcXYZ09" },
    fetchImpl,
  });
  await eleven.synthesize("Salom");
  assert.match(calls[0].url, /text-to-speech\/abcXYZ09\?/);
  assert.equal(JSON.parse(calls[0].init.body).model_id, "eleven_v4");
});

test("synthesize eleven_v3 ga language_code yubormaydi (u 'uz' ni qabul qilmaydi)", async () => {
  const { fetchImpl, calls } = fakeFetch();
  const eleven = createElevenLabs({ env: { ...ENV, ELEVENLABS_MODEL: "eleven_v3" }, fetchImpl });
  await eleven.synthesize("Salom");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model_id, "eleven_v3");
  assert.equal("language_code" in body, false);
});

test("synthesize noto'g'ri voice id ni standartiga almashtiradi", async () => {
  const { fetchImpl, calls } = fakeFetch();
  const eleven = createElevenLabs({ env: { ...ENV, ELEVENLABS_VOICE_ID: "../../x" }, fetchImpl });
  await eleven.synthesize("Salom");
  assert.doesNotMatch(calls[0].url, /\.\./);
});

test("kalit bo'lmasa TtsNotConfiguredError", async () => {
  const eleven = createElevenLabs({ env: {}, fetchImpl: fakeFetch().fetchImpl });
  assert.equal(eleven.configured, false);
  await assert.rejects(eleven.synthesize("Salom"), TtsNotConfiguredError);
  await assert.rejects(eleven.transcribe(Buffer.from([1]), "audio/webm"), TtsNotConfiguredError);
});

test("synthesize bo'sh matnni rad etadi, API xatosini status bilan beradi", async () => {
  const eleven = createElevenLabs({ env: ENV, fetchImpl: fakeFetch({ ok: false, status: 401 }).fetchImpl });
  await assert.rejects(eleven.synthesize("  "), ValidationError);
  await assert.rejects(eleven.synthesize("Salom"), /ElevenLabs TTS 401/);
});

test("transcribe scribe_v2 ga o'zbek tili bilan yuboradi va matnni qaytaradi", async () => {
  const { fetchImpl, calls } = fakeFetch({ json: { text: " Fotosintez nima? ", language_code: "uzb" } });
  const eleven = createElevenLabs({ env: ENV, fetchImpl });

  const text = await eleven.transcribe(Buffer.from([5, 6, 7]), "audio/webm;codecs=opus");

  assert.equal(text, "Fotosintez nima?");
  const { url, init } = calls[0];
  assert.equal(url, "https://api.elevenlabs.io/v1/speech-to-text");
  assert.equal(init.headers["xi-api-key"], "xi-test");
  assert.ok(init.body instanceof FormData);
  assert.equal(init.body.get("model_id"), "scribe_v2");
  assert.equal(init.body.get("language_code"), "uz");
  assert.equal(init.body.get("tag_audio_events"), "false");
  const file = init.body.get("file");
  assert.equal(file.type, "audio/webm;codecs=opus");
  assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [5, 6, 7]);
});

test("transcribe noto'g'ri audioni rad etadi", async () => {
  const eleven = createElevenLabs({ env: ENV, fetchImpl: fakeFetch().fetchImpl });
  await assert.rejects(eleven.transcribe(Buffer.alloc(0), "audio/webm"), ValidationError);
  await assert.rejects(eleven.transcribe(Buffer.from([1]), "text/html"), ValidationError);
  await assert.rejects(eleven.transcribe("matn", "audio/webm"), ValidationError);
  await assert.rejects(eleven.transcribe(Buffer.alloc(MAX_AUDIO_BYTES + 1), "audio/webm"), ValidationError);
});

test("transcribe API xatosini status bilan beradi", async () => {
  const eleven = createElevenLabs({ env: ENV, fetchImpl: fakeFetch({ ok: false, status: 422 }).fetchImpl });
  await assert.rejects(eleven.transcribe(Buffer.from([1]), "audio/webm"), /ElevenLabs STT 422/);
});

test("keepSafeVoiceTags talaffuzni buzadigan teglarni olib tashlaydi", () => {
  assert.equal(keepSafeVoiceTags("[angry] Jin ursin! [laughs] Ha-ha."), "Jin ursin! [laughs] Ha-ha.");
  assert.equal(keepSafeVoiceTags("[frustrated] Yana? [shouting] Quloq sol! [sighs] Mayli."), "Yana? Quloq sol! [sighs] Mayli.");
  assert.equal(keepSafeVoiceTags("[curious] Qani [laughs harder] voy"), "[curious] Qani voy");
});

test("synthesize xavfli teglarni ElevenLabs'ga yubormaydi", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(JSON.parse(init.body));
    return new Response(new Uint8Array([1]), { status: 200 });
  };
  const el = createElevenLabs({ env: { ELEVENLABS_API_KEY: "sk_x" }, fetchImpl });
  await el.synthesize("[angry] Tentak! [excited] Qara.");
  assert.equal(calls[0].text, "Tentak! [excited] Qara.");
  await assert.rejects(el.synthesize("[angry]"), ValidationError);
});

test("wordStartsFromAlignment teglarni tashlab, har so'z boshlanish vaqtini beradi", () => {
  const text = "[laughs] Eshit, jigar! Kasr";
  const alignment = {
    characters: [...text],
    character_start_times_seconds: [...text].map((_, i) => i / 10),
  };
  const starts = wordStartsFromAlignment(alignment);
  assert.equal(starts.length, 3); // Eshit, | jigar! | Kasr
  assert.equal(starts[0], text.indexOf("Eshit") / 10);
  assert.equal(starts[2], text.indexOf("Kasr") / 10);
  assert.deepEqual(wordStartsFromAlignment(null), []);
});

test("synthesizeTimed ovoz va so'z vaqtlarini qaytaradi, tilni yuboradi", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const json = {
      audio_base64: Buffer.from([7, 8]).toString("base64"),
      alignment: { characters: [..."Привет мир"], character_start_times_seconds: [...Array(10).keys()].map((i) => i / 10) },
    };
    return new Response(JSON.stringify(json), { status: 200 });
  };
  const el = createElevenLabs({ env: { ELEVENLABS_API_KEY: "sk_x" }, fetchImpl });
  const out = await el.synthesizeTimed("Привет мир", { lang: "ru" });
  assert.deepEqual([...out.audio], [7, 8]);
  assert.deepEqual(out.wordStarts, [0, 0.7]);
  assert.match(calls[0].url, /\/with-timestamps\?/);
  assert.equal(calls[0].body.language_code, "ru");
  assert.equal(calls[0].body.voice_settings.use_speaker_boost, true);
});

test("transcribe tanlangan tilni yuboradi, noma'lum til — uz", async () => {
  const langs = [];
  const fetchImpl = async (_url, init) => {
    langs.push(init.body.get("language_code"));
    return new Response(JSON.stringify({ text: "ok" }), { status: 200 });
  };
  const el = createElevenLabs({ env: { ELEVENLABS_API_KEY: "sk_x" }, fetchImpl });
  await el.transcribe(Buffer.from([1]), "audio/webm", { lang: "ru" });
  await el.transcribe(Buffer.from([1]), "audio/webm", { lang: "xx" });
  assert.deepEqual(langs, ["ru", "uz"]);
});

test("til o'rganish rejimi: lang \"auto\" — TTS va STT tilni o'zi aniqlaydi (language_code yuborilmaydi)", async () => {
  const { fetchImpl, calls } = fakeFetch({ json: { text: "Привет" } });
  const eleven = createElevenLabs({ env: ENV, fetchImpl });
  await eleven.synthesize("Salom! Привет!", { lang: "auto" });
  assert.equal("language_code" in JSON.parse(calls[0].init.body), false);
  await eleven.transcribe(Buffer.from([1, 2, 3]), "audio/webm", { lang: "auto" });
  assert.equal(calls[1].init.body.get("language_code"), null);
});
