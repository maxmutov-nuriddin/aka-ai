// Ovoz: tinglash va javobni o'qish.
// Tinglash: serverda ElevenLabs bo'lsa — mikrofon yozib olinadi va /api/stt da matnga aylantiriladi
// (bosib turib gapirish), bo'lmasa — brauzerning SpeechRecognition'i.
// O'qish: /api/tts (ElevenLabs/Azure), u ishlamasa — brauzer ovozi.
import { splitForSpeech, planEmotions, emotionAt } from "./speech.js";
import { toWav16k } from "./wav.js";
import { stripAudioTags } from "../shared/parse.js";

const LOCALES = { uz: "uz-UZ", ru: "ru-RU" };
// Brauzerda o'zbek ovozi bo'lmasa, o'zbek lotinini eng yaxshi o'qiydigani turkcha ovoz.
const VOICE_PREFERENCE = { uz: ["uz", "tr"], ru: ["ru"] };
const SERVER_CHUNK = 300;
const FIRST_CHUNK = 120; // birinchi bo'lak qisqa — ovoz tezroq boshlanadi
// Bir vaqtda oldindan yuklanadigan bo'laklar: sekin TTS (Gemini ~4-7 s/bo'lak) o'qish orasida pauza qoldirmasin.
const PREFETCH_AHEAD = 3;
const MIN_RECORDING_MS = 400; // bundan qisqasi — tasodifiy bosish
const MAX_RECORDING_MS = 60_000;
// Brauzer tanishi: gap o'rtasidagi qisqa pauzada uzilmaydi, shuncha jimlikdan keyin yuboradi.
const SILENCE_AFTER_SPEECH_MS = 1000;
const WAIT_FOR_SPEECH_MS = 8000;
// Brauzer ovozi (zaxira) uchun xarakter ohangi. ElevenLabs'dagi ohang serverda (voiceSettingsFor).
const BROWSER_TONE = {
  mehribon: { rate: 0.95, pitch: 1.05 },
  kinoyali: { rate: 1.03, pitch: 1.0 },
  jahldor: { rate: 1.1, pitch: 0.9 },
  romantik: { rate: 0.9, pitch: 1.1 },
};
const LEVEL_GAIN = 4; // RMS odatda 0..0.25 — og'iz uchun 0..1 ga cho'zamiz
// Ikkinchi tekshiruv (Scribe) shundan uzoq kutilmaydi — aks holda faqat Chrome natijasi yuboriladi.
const DOUBLE_CHECK_TIMEOUT_MS = 3000;
// Chrome hech narsa eshitmagan bo'lsa, Scribe natijasi kamida shuncha so'z bo'lsagina olinadi (shovqin emas).
const MIN_ALT_ONLY_WORDS = 2;
const MIC_CONSTRAINTS = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } };
const RECORDER_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

const DENIED_ERRORS = new Set(["not-allowed", "service-not-allowed"]);
const SILENT_ERRORS = new Set(["no-speech", "aborted"]);

// Xatolar kalit bilan beriladi — ilova ularni tanlangan tilga tarjima qiladi (i18n.js).
const ERROR_CODES = {
  network: "err.network",
  "audio-capture": "err.audioCapture",
  "language-not-supported": "err.langNotSupported",
};

class TtsOffError extends Error {}

function pickVoice(synth, lang) {
  const voices = synth.getVoices();
  for (const prefix of VOICE_PREFERENCE[lang] ?? VOICE_PREFERENCE.uz) {
    const found = voices.find((v) => v.lang?.toLowerCase().startsWith(prefix));
    if (found) return found;
  }
  return null;
}

function pickRecorderType() {
  return RECORDER_TYPES.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || "";
}

async function postJson(url, body, signal, headers = {}) {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal });
}

/**
 * @param {{
 *   ttsUrl?: () => string,
 *   sttUrl?: () => string,
 *   onState?: (state: "idle" | "listening" | "transcribing" | "speaking") => void,
 *   onInterim?: (text: string) => void,
 *   onFinal?: (text: string, alternative?: string, pronunciation?: object | null) => void,
 *   onError?: (kind: "denied" | "other", message: string) => void,
 *   onLevel?: (level: number | null) => void,
 *   onCaption?: (caption: { text: string, spoken: number }) => void,
 *   onEmotion?: (emotion: string | null) => void,
 *   authHeaders?: () => Record<string, string>,
 * }} options
 */
export function createVoice({
  ttsUrl,
  sttUrl,
  onState = () => {},
  onInterim = () => {},
  onFinal = () => {},
  onError = () => {},
  onLevel = () => {},
  onCaption = () => {},
  onEmotion = () => {},
  // Kengaytma Bearer token yuboradi; veb — cookie (sarlavha kerak emas).
  authHeaders = () => ({}),
} = {}) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis;
  const canRecord = Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder && sttUrl);

  let serverStt = false; // app /api/voice-config dan keyin yoqadi
  let sttAvailable = false; // serverda tanish bor — til o'rganishda (pronunciation) doim u ishlatiladi
  let serverTts = Boolean(ttsUrl); // server "sozlanmagan" desa, sessiya davomida o'chadi
  let recognition = null;
  let style = { mode: "oddiy", lang: "uz" }; // rejim (kayfiyat uchun) va til (tinglash/gapirish uchun)
  let shadow = null; // Chrome tinglayotganda parallel yozuv — Scribe uchun
  let doubleCheck = false;
  let listenToken = 0; // eski (bekor qilingan) tinglash natijasi yuborilmasin
  let recording = null; // { recorder, stream, startedAt, timer, cancelled }
  let speakToken = 0;
  let isSpeaking = false;
  let abortFetch = null;
  let stopPlayback = null;
  // Chrome tugamagan utterance'larni axlatga tashlasa, onend chaqirilmaydi — havola saqlaymiz.
  let utterances = [];
  let audioCtx = null;

  const supported = {
    get listen() {
      return (serverStt && canRecord) || (style.pronunciation && sttAvailable) || Boolean(Recognition);
    },
    speak: Boolean(synth) || Boolean(ttsUrl),
  };

  // ---------- Tinglash ----------
  /** Rejim va til: { mode?, lang?, pronunciation? } — pronunciation: til o'rganish (server tanishi + talaffuz bahosi). */
  function setStyle(next) {
    style = { ...style, ...next };
  }

  const sttEndpoint = () => `${sttUrl()}?lang=${encodeURIComponent(style.lang)}`;

  function useServerStt(on, available = on) {
    serverStt = Boolean(on) && canRecord;
    sttAvailable = Boolean(available) && canRecord;
  }

  /** Chrome tanishiga qo'shimcha ravishda Scribe ham eshitadi — Jigar ikkala variantni solishtiradi. */
  function useDoubleCheck(on) {
    doubleCheck = Boolean(on) && canRecord;
  }

  function startShadowRecording() {
    const session = { parts: [], recorder: null, stream: null, cancelled: false };
    session.ready = navigator.mediaDevices
      .getUserMedia(MIC_CONSTRAINTS)
      .then((stream) => {
        if (session.cancelled) return stream.getTracks().forEach((t) => t.stop());
        const type = pickRecorderType();
        const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
        recorder.ondataavailable = (e) => e.data.size && session.parts.push(e.data);
        Object.assign(session, { stream, recorder });
        recorder.start();
      })
      .catch(() => {}); // ikkinchi tekshiruv ixtiyoriy — bo'lmasa faqat Chrome natijasi
    return session;
  }

  /** Parallel yozuvni to'xtatadi. Qaytaradi: audio yoki null. */
  async function stopShadowRecording(session) {
    await session.ready;
    const { recorder, stream } = session;
    if (!recorder || recorder.state !== "recording") {
      stream?.getTracks().forEach((t) => t.stop());
      return null;
    }
    return new Promise((resolve) => {
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = recorder.mimeType || "audio/webm";
        resolve(session.cancelled || !session.parts.length ? null : new Blob(session.parts, { type }));
      };
      recorder.stop();
    });
  }

  function cancelShadow() {
    if (!shadow) return;
    shadow.cancelled = true;
    stopShadowRecording(shadow);
    shadow = null;
  }

  async function transcribeAlternative(blob) {
    try {
      const res = await fetch(sttEndpoint(), {
        method: "POST",
        headers: { "Content-Type": blob.type, ...authHeaders() },
        body: blob,
        signal: AbortSignal.timeout(DOUBLE_CHECK_TIMEOUT_MS),
      });
      if (!res.ok) return "";
      const data = await res.json();
      return String(data.text || "").trim();
    } catch {
      return ""; // vaqt tugadi yoki tarmoq — Chrome natijasi bilan davom etamiz
    }
  }

  /** Chrome natijasi + Scribe natijasi. Chrome eshitmagan bo'lsa, Scribe asosiy bo'ladi. */
  async function finishWithDoubleCheck(chromeText, session, token) {
    onState("transcribing");
    const blob = await stopShadowRecording(session);
    const alt = blob ? await transcribeAlternative(blob) : "";
    if (token !== listenToken) return;
    onState("idle");
    if (chromeText) return onFinal(chromeText, alt);
    if (alt.split(/\s+/).filter(Boolean).length >= MIN_ALT_ONLY_WORDS) return onFinal(alt, "");
  }

  function listen() {
    listenToken += 1;
    warmUpAudio(); // foydalanuvchi bosgan paytda — keyin Jigar ovozini o'lchash uchun
    stopSpeaking();
    stopListening({ send: false });
    // Til o'rganishda nutq ikki tilda — brauzer tanishi bitta tilda ishlaydi, shuning uchun server (Scribe) tinglaydi.
    if ((serverStt || (style.pronunciation && sttAvailable)) && canRecord) return startRecording();
    if (Recognition) return startRecognition();
  }

  /** send: false — yozuvni tashlab yuboradi (masalan, yangi suhbatda). */
  function stopListening({ send = true } = {}) {
    if (recording) return finishRecording(send);
    if (!recognition) return;
    if (send) return recognition.stop(); // onend natijani yuboradi
    const rec = recognition;
    recognition = null;
    listenToken += 1;
    cancelShadow();
    rec.onend = null;
    rec.abort();
    onState("idle");
  }

  async function startRecording() {
    const session = { cancelled: false };
    recording = session;
    onState("listening");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (session.cancelled || recording !== session) return stream.getTracks().forEach((t) => t.stop());
      const type = pickRecorderType();
      const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const parts = [];
      recorder.ondataavailable = (e) => e.data.size && parts.push(e.data);
      recorder.onstop = () => onRecorded(session, parts, recorder.mimeType || type || "audio/webm");
      Object.assign(session, { recorder, stream, startedAt: Date.now() });
      session.timer = setTimeout(() => finishRecording(true), MAX_RECORDING_MS);
      recorder.start();
    } catch (err) {
      recording = null;
      onState("idle");
      if (err?.name === "NotAllowedError" || err?.name === "SecurityError") {
        return onError("denied", "err.micDenied");
      }
      onError("other", "err.micFailed");
    }
  }

  function finishRecording(send) {
    const session = recording;
    if (!session) return;
    recording = null;
    clearTimeout(session.timer);
    const tooShort = Date.now() - (session.startedAt ?? Date.now()) < MIN_RECORDING_MS;
    session.cancelled = !send || tooShort;
    if (session.recorder?.state === "recording") session.recorder.stop();
    else session.stream?.getTracks().forEach((t) => t.stop());
    if (session.cancelled || !session.recorder) onState("idle");
  }

  async function onRecorded(session, parts, mimeType) {
    session.stream.getTracks().forEach((t) => t.stop());
    if (session.cancelled) return;
    onState("transcribing");
    try {
      const body = await uploadBody(new Blob(parts, { type: mimeType }));
      const res = await fetch(sttEndpoint(), {
        method: "POST",
        headers: { "Content-Type": body.type, ...authHeaders() },
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 503) serverStt = false; // keyingi safar brauzer tanishi ishlaydi
      if (!res.ok) throw new Error(data.error || "err.sttFailed");
      onState("idle");
      const text = String(data.text || "").trim();
      if (!text) return onError("other", "err.notHeard");
      onFinal(text, "", data.pronunciation ?? null);
    } catch (err) {
      onState("idle");
      onError("other", err.message || "err.sttFailed");
    }
  }

  /** Til o'rganishda — WAV (talaffuz bahosi uchun); aylantirib bo'lmasa yoki boshqa rejimda — asl yozuv. */
  async function uploadBody(blob) {
    if (!style.pronunciation) return blob;
    try {
      return await toWav16k(blob);
    } catch {
      return blob;
    }
  }

  function startRecognition() {
    const rec = new Recognition();
    rec.lang = LOCALES[style.lang] ?? LOCALES.uz;
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;
    let finalText = "";
    let silenceTimer = 0;
    const stopAfter = (ms) => {
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => recognition === rec && rec.stop(), ms);
    };

    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      onInterim((finalText + interim).trim());
      stopAfter(SILENCE_AFTER_SPEECH_MS);
    };
    rec.onerror = (event) => {
      if (SILENT_ERRORS.has(event.error)) return;
      if (DENIED_ERRORS.has(event.error)) return onError("denied", "err.micDenied");
      onError("other", ERROR_CODES[event.error] || "err.sttFailed");
    };
    rec.onend = () => {
      clearTimeout(silenceTimer);
      if (recognition !== rec) return;
      recognition = null;
      const text = finalText.trim();
      const session = shadow;
      shadow = null;
      if (session) return finishWithDoubleCheck(text, session, listenToken);
      onState("idle");
      if (text) onFinal(text);
    };

    recognition = rec;
    if (doubleCheck) shadow = startShadowRecording();
    try {
      rec.start();
      stopAfter(WAIT_FOR_SPEECH_MS);
      onState("listening");
    } catch {
      recognition = null;
      cancelShadow();
      onState("idle");
      onError("other", "err.micFailed");
    }
  }

  // ---------- O'qish ----------
  /** Bo'lak o'qila boshlaganda: kayfiyat va yozuv (hali aytilmagan). */
  // Hozir o'qilayotgan bo'lak: matn va har gapning kayfiyati. Ovoz qaysi gapga yetsa — yuz o'shanga o'tadi.
  let plan = null;
  let shownEmotion;

  function beginChunk(rawChunk) {
    plan = planEmotions(rawChunk, style);
    shownEmotion = undefined;
    reportProgress(0);
    return plan.text;
  }

  function reportProgress(spoken) {
    if (!plan) return;
    onCaption({ text: plan.text, spoken });
    const emotion = emotionAt(plan.marks, spoken);
    if (emotion === shownEmotion) return;
    shownEmotion = emotion;
    onEmotion(emotion);
  }

  /** Matnni o'qiydi; oxirigacha o'qilsa onDone chaqiriladi (to'xtatilsa — yo'q). */
  function speak(text, { onDone } = {}) {
    warmUpAudio();
    stopSpeaking();
    if (!stripAudioTags(text).trim() || !supported.speak) return onDone?.();
    const token = ++speakToken;
    isSpeaking = true;
    onState("speaking");
    if (serverTts) playServer(text, token, onDone);
    else speakBrowser(text, token, onDone);
  }

  function finish(token, onDone) {
    if (token !== speakToken) return;
    isSpeaking = false;
    onEmotion(null);
    onState("idle");
    onDone?.();
  }

  /** Qaytaradi: audio havolasi va (bo'lsa) har so'z boshlanish vaqti — server X-Word-Starts sarlavhasida beradi. */
  async function fetchAudio(text, signal) {
    const res = await postJson(ttsUrl(), { text, lang: style.lang, persona: style.persona ?? undefined, level: style.level ?? undefined }, signal, authHeaders());
    if (res.status === 503) throw new TtsOffError("Ovoz xizmati sozlanmagan");
    if (!res.ok) throw new Error(`TTS ${res.status}`);
    const header = res.headers.get("X-Word-Starts");
    const wordStarts = header ? header.split(",").map(Number).filter(Number.isFinite) : null;
    return { url: URL.createObjectURL(await res.blob()), wordStarts };
  }

  /** AudioContext'ni foydalanuvchi harakati paytida tayyorlaydi (brauzer avtoijro qoidasi). */
  function warmUpAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      audioCtx ??= new Ctx();
      if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    } catch {
      audioCtx = null;
    }
  }

  /** Ovoz balandligini o'lchaydi (personajning og'zi uchun). Qaytaradi: to'xtatish funksiyasi. */
  function meter(audio) {
    // To'xtab turgan kontekstga ulangan audio eshitilmay qoladi — faqat ishlayotganida ulaymiz.
    if (audioCtx?.state !== "running") {
      onLevel(null);
      return () => onLevel(0);
    }
    try {
      const source = audioCtx.createMediaElementSource(audio);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyser.connect(audioCtx.destination);
      const samples = new Uint8Array(analyser.fftSize);
      let frame = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const v of samples) sum += ((v - 128) / 128) ** 2;
        onLevel(Math.min(1, Math.sqrt(sum / samples.length) * LEVEL_GAIN));
        frame = requestAnimationFrame(tick);
      };
      tick();
      return () => {
        cancelAnimationFrame(frame);
        source.disconnect();
        analyser.disconnect();
        onLevel(0);
      };
    } catch {
      onLevel(null);
      return () => onLevel(0);
    }
  }

  /**
   * Yozuv va robot yuzini ovoz bilan birga yuritadi. So'z vaqtlari bo'lsa — aynan aytilayotgan so'zgacha,
   * bo'lmasa (yoki so'zlar soni mos kelmasa) — ijro etilgan vaqt ulushi bo'yicha.
   */
  function followCaption(audio, text, wordStarts) {
    const wordEnds = [...text.matchAll(/\S+/g)].map((m) => m.index + m[0].length);
    const timed = Array.isArray(wordStarts) && wordStarts.length === wordEnds.length && wordEnds.length > 0;
    let frame = 0;
    const tick = () => {
      if (timed) {
        let i = -1;
        while (i + 1 < wordStarts.length && wordStarts[i + 1] <= audio.currentTime) i += 1;
        reportProgress(i < 0 ? 0 : wordEnds[i]);
      } else if (Number.isFinite(audio.duration) && audio.duration > 0) {
        reportProgress(Math.round((audio.currentTime / audio.duration) * text.length));
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      reportProgress(text.length);
    };
  }

  function playUrl(url, captionText = "", wordStarts = null) {
    let stopMeter = () => {};
    let stopCaption = () => {};
    return new Promise((resolve, reject) => {
      const audio = new Audio(url);
      stopMeter = meter(audio);
      stopCaption = followCaption(audio, captionText, wordStarts);
      stopPlayback = () => {
        audio.pause();
        resolve();
      };
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("Audio ijro etilmadi"));
      audio.play().catch(reject);
    }).finally(() => {
      stopMeter();
      stopCaption();
      stopPlayback = null;
      URL.revokeObjectURL(url);
    });
  }

  async function playServer(text, token, onDone) {
    const chunks = splitForSpeech(text, SERVER_CHUNK, FIRST_CHUNK);
    const controller = new AbortController();
    abortFetch = () => controller.abort();
    const load = (i) => {
      const p = fetchAudio(chunks[i], controller.signal);
      p.catch(() => {}); // xato quyida, await qilinganda ushlanadi
      return p;
    };

    // Oldinga PREFETCH_AHEAD tagacha bo'lak parallel yuklanadi — biri o'qilayotganda keyingilari tayyor bo'ladi.
    let pending = chunks.slice(0, PREFETCH_AHEAD).map((_, i) => load(i));
    for (let i = 0; i < chunks.length; i++) {
      try {
        const { url, wordStarts } = await pending[0];
        if (token !== speakToken) return URL.revokeObjectURL(url);
        const nextIndex = i + PREFETCH_AHEAD;
        pending = [...pending.slice(1), ...(nextIndex < chunks.length ? [load(nextIndex)] : [])];
        await playUrl(url, beginChunk(chunks[i]), wordStarts);
      } catch (err) {
        if (token !== speakToken) return;
        if (err instanceof TtsOffError) serverTts = false;
        controller.abort();
        // Server ovozi ishlamadi — qolganini brauzer ovozi o'qiydi.
        return speakBrowser(chunks.slice(i).join(" "), token, onDone);
      }
      if (token !== speakToken) return;
    }
    finish(token, onDone);
  }

  /**
   * Oqimli o'qish: javob to'liq tayyor bo'lishini kutmasdan, kelgan gaplarni darrov o'qiydi.
   * Qaytaradi: { add(text) — yana matn, end() — boshqa matn yo'q }. Server ovozi ishlamasa — qolgani brauzer ovozida.
   */
  function speakStream({ onDone } = {}) {
    warmUpAudio();
    stopSpeaking();
    const token = ++speakToken;
    const pieces = [];
    const loads = [];
    let ended = false;
    let running = false;
    let wake = null;
    const notify = () => {
      const resume = wake;
      wake = null;
      resume?.();
    };
    const controller = new AbortController();
    abortFetch = () => {
      controller.abort();
      notify(); // kutib turgan o'qish halqasi to'xtasin
    };
    const waitMore = () => new Promise((resolve) => { wake = resolve; });
    const load = (i) => {
      if (!loads[i]) {
        loads[i] = fetchAudio(pieces[i], controller.signal);
        loads[i].catch(() => {}); // xato quyida, await qilinganda ushlanadi
      }
      return loads[i];
    };
    const prefetch = (from) => {
      for (let j = from; j < Math.min(pieces.length, from + PREFETCH_AHEAD); j++) load(j);
    };
    async function restInBrowser(i) {
      while (!ended && token === speakToken) await waitMore();
      if (token === speakToken) speakBrowser(pieces.slice(i).join(" "), token, onDone);
    }

    async function run() {
      for (let i = 0; ; i++) {
        while (i >= pieces.length && !ended && token === speakToken) await waitMore();
        if (token !== speakToken) return;
        if (i >= pieces.length) return finish(token, onDone);
        if (!serverTts) return restInBrowser(i);
        prefetch(i);
        try {
          const { url, wordStarts } = await load(i);
          if (token !== speakToken) return URL.revokeObjectURL(url);
          prefetch(i + 1);
          await playUrl(url, beginChunk(pieces[i]), wordStarts);
        } catch (err) {
          if (token !== speakToken) return;
          if (err instanceof TtsOffError) serverTts = false;
          controller.abort();
          return restInBrowser(i);
        }
      }
    }

    return {
      add(text) {
        if (token !== speakToken || ended) return;
        const parts = splitForSpeech(text, SERVER_CHUNK).filter((p) => stripAudioTags(p).trim());
        if (!parts.length) return;
        pieces.push(...parts);
        if (!running) {
          running = true;
          isSpeaking = true;
          onState("speaking");
          run();
        }
        notify();
      },
      end() {
        if (ended) return;
        ended = true;
        if (!running && token === speakToken) return onDone?.(); // hech narsa o'qilmadi
        notify();
      },
    };
  }

  function speakBrowser(text, token, onDone) {
    if (!synth) return finish(token, onDone);
    // Teglar kayfiyat uchun bo'lakda qoladi, lekin brauzer ularni so'z sifatida o'qib yubormasligi uchun olinadi.
    const chunks = splitForSpeech(text).filter((c) => stripAudioTags(c).trim());
    if (chunks.length === 0) return finish(token, onDone);
    const voice = pickVoice(synth, style.lang);
    onLevel(null); // brauzer ovozini o'lchab bo'lmaydi

    utterances = chunks.map((chunk, i) => {
      // Yozuv bilan bir xil matn — brauzer bergan belgi raqamlari kayfiyat belgilariga mos tushadi.
      const u = new SpeechSynthesisUtterance(planEmotions(chunk, style).text);
      u.onstart = () => token === speakToken && beginChunk(chunk);
      u.onboundary = (e) => {
        if (token === speakToken) reportProgress(e.charIndex + (e.charLength || 0));
      };
      if (voice) u.voice = voice;
      u.lang = voice?.lang || LOCALES[style.lang] || LOCALES.uz;
      const tone = BROWSER_TONE[style.persona];
      if (tone) Object.assign(u, tone); // zaxira ovozda ham xarakter ohangi (tezlik, balandlik)
      if (i === chunks.length - 1) u.onend = () => finish(token, onDone);
      u.onerror = (e) => {
        if (e.error === "interrupted" || e.error === "canceled") return;
        finish(token, null);
      };
      return u;
    });
    for (const u of utterances) synth.speak(u);
  }

  function stopSpeaking() {
    const wasSpeaking = isSpeaking;
    speakToken += 1;
    isSpeaking = false;
    abortFetch?.();
    abortFetch = null;
    stopPlayback?.();
    utterances = [];
    synth?.cancel();
    onLevel(0);
    onEmotion(null);
    if (wasSpeaking) onState("idle");
  }

  function stopAll() {
    stopListening({ send: false });
    stopSpeaking();
  }

  // Ovozlar ro'yxati ba'zi brauzerlarda kechikib yuklanadi.
  synth?.getVoices();

  return {
    supported,
    useServerStt,
    useDoubleCheck,
    setStyle,
    listen,
    stopListening,
    speak,
    speakStream,
    stopSpeaking,
    stopAll,
    hasBrowserRecognition: Boolean(Recognition),
    get pushToTalk() {
      return serverStt && canRecord;
    },
    get listening() {
      return recognition !== null || recording !== null;
    },
    get speaking() {
      return isSpeaking;
    },
  };
}
