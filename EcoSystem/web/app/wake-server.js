// "Hey Jigar" — desktop ilova uchun (Electron'da Google nutq xizmati yo'q, shuning uchun wake.js ishlamaydi).
// Mikrofon doim ochiq, lekin serverga hamma narsa ketmaydi: ovoz faolligi (VAD) bo'yicha faqat qisqa gap bo'lagi
// (0.35–6 s) yoziladi va /api/stt ga yuboriladi; matnda "Jigar" bo'lsa — savol tinglash boshlanadi
// (ismdan keyin buyruq ham aytilgan bo'lsa — darhol bajariladi).
// Ovoz PCM (16 kHz) sifatida olinadi va ovoz boshlanishidan 0.4 s OLDINGI qism ham qo'shiladi —
// aks holda "Hey" kesilib, tanish xizmati ismni eshitmay qoladi.
import { hasWakeWord, wakeRemainder } from "./wake.js";

const VAD = { threshold: 0.018, startMs: 60, silenceMs: 600, minMs: 350, maxMs: 6000 };
const SAMPLE_RATE = 16_000;
const CHUNK_SAMPLES = 1024; // ≈ 64 ms
const PREROLL_MS = 400;
const SEND_GAP_MS = 1500; // ketma-ket yuborishlar orasida (xarajat va limit)

/**
 * Ovoz faolligi bo'yicha bo'laklash (sof — testlanadi). feed(daraja, vaqt) →
 * "start" (yozishni boshla) | { end: davomiylik, keep: yuborishga arziydimi } | null.
 */
export function createSegmenter(options = {}) {
  const o = { ...VAD, ...options };
  let loudSince = null;
  let startedAt = null;
  let quietSince = null;
  return {
    feed(level, now) {
      const loud = level >= o.threshold;
      if (startedAt == null) {
        loudSince = loud ? (loudSince ?? now) : null;
        if (loudSince != null && now - loudSince >= o.startMs) {
          startedAt = loudSince;
          quietSince = null;
          return "start";
        }
        return null;
      }
      quietSince = loud ? null : (quietSince ?? now);
      const length = now - startedAt;
      if ((quietSince != null && now - quietSince >= o.silenceMs) || length >= o.maxMs) {
        const spoken = (quietSince ?? now) - startedAt;
        startedAt = null;
        loudSince = null;
        return { end: spoken, keep: spoken >= o.minMs && length < o.maxMs };
      }
      return null;
    },
  };
}

const rms = (samples) => Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length);

/** Float32 PCM bo'laklari → WAV (16-bit mono). Sof — testlanadi. */
export function encodeWav(chunks, sampleRate = SAMPLE_RATE) {
  const length = chunks.reduce((n, c) => n + c.length, 0);
  const view = new DataView(new ArrayBuffer(44 + length * 2));
  const text = (offset, value) => [...value].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, length * 2, true);
  let offset = 44;
  for (const chunk of chunks) {
    for (const v of chunk) {
      const s = Math.max(-1, Math.min(1, v));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([view.buffer], { type: "audio/wav" });
}

/**
 * wake.js bilan bir xil interfeys: { supported, enabled, setEnabled, pause, resume }.
 * @param {{ onWake: () => void, onUnavailable?: (reason: string) => void, apiBase: () => string,
 *           authHeaders: () => Record<string, string> }} deps
 */
export function createServerWake({ onWake, onUnavailable = () => {}, apiBase, authHeaders }) {
  const supported = Boolean(globalThis.navigator?.mediaDevices?.getUserMedia && globalThis.AudioContext);
  let wanted = false;
  let paused = false;
  let lang = "uz";
  let live = null; // { stream, ctx, processor }
  let lastSent = 0;

  async function send(blob) {
    if (Date.now() - lastSent < SEND_GAP_MS) return;
    lastSent = Date.now();
    try {
      const res = await fetch(`${apiBase()}/api/stt?lang=${lang}`, { method: "POST", headers: { "Content-Type": blob.type || "audio/webm", ...authHeaders() }, body: blob });
      if (res.status === 503) return giveUp("stt"); // serverda ovoz tanish sozlanmagan
      if (!res.ok) return;
      const { text } = await res.json();
      if (wanted && !paused && hasWakeWord(text)) {
        halt();
        onWake(wakeRemainder(text), text); // "Hey Jigar, ovozni 40 qil" — buyruq ham birga
      }
    } catch {
      /* tarmoq — keyingi gap bo'lagida */
    }
  }

  /** detail — texnik sabab ("NotAllowedError: Permission denied by system" kabi): ekranda va jurnalda ko'rinadi. */
  function giveUp(reason, detail = "") {
    wanted = false;
    halt();
    onUnavailable(reason, detail);
  }

  async function begin() {
    if (!supported || !wanted || paused || live) return;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      return giveUp("not-allowed", `${err?.name ?? "Error"}: ${err?.message ?? ""}`.trim());
    }
    if (!wanted || paused || live) return stream.getTracks().forEach((t) => t.stop());
    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    const source = ctx.createMediaStreamSource(stream);
    // ScriptProcessor — oddiy va alohida fayl talab qilmaydi (AudioWorklet modul yuklashni talab qiladi).
    const processor = ctx.createScriptProcessor(CHUNK_SAMPLES, 1, 1);
    const prerollChunks = Math.ceil((PREROLL_MS / 1000) * SAMPLE_RATE / CHUNK_SAMPLES);
    const segmenter = createSegmenter();
    let preroll = [];
    let recording = null;
    let clock = 0;
    processor.onaudioprocess = (e) => {
      const chunk = new Float32Array(e.inputBuffer.getChannelData(0));
      clock += (CHUNK_SAMPLES / SAMPLE_RATE) * 1000;
      if (recording) recording.push(chunk);
      else preroll = [...preroll.slice(1 - prerollChunks), chunk];
      const event = segmenter.feed(rms(chunk), clock);
      if (event === "start") {
        recording = [...preroll];
        preroll = [];
      } else if (event && recording) {
        if (event.keep) send(encodeWav(recording));
        recording = null;
      }
    };
    source.connect(processor);
    processor.connect(ctx.destination); // ScriptProcessor faqat ulangan bo'lsa ishlaydi (chiqish — jim)
    live = { stream, ctx, processor };
  }

  function halt() {
    if (!live) return;
    live.processor.onaudioprocess = null;
    live.processor.disconnect();
    live.stream.getTracks().forEach((t) => t.stop());
    live.ctx.close().catch(() => {});
    live = null;
  }

  return {
    supported,
    get enabled() {
      return wanted;
    },
    setEnabled(on, nextLang = lang) {
      wanted = Boolean(on) && supported;
      lang = nextLang;
      if (wanted) begin();
      else halt();
    },
    /** Jigar gapirayotganda yoki savol tinglayotganda — mikrofon bitta. */
    pause() {
      paused = true;
      halt();
    },
    resume() {
      paused = false;
      begin();
    },
  };
}
