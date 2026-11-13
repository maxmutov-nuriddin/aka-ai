// "Hey Jigar" — desktop ilova uchun (Electron'da Google nutq xizmati yo'q, shuning uchun wake.js ishlamaydi).
// Mikrofon doim ochiq, lekin serverga hamma narsa ketmaydi: ovoz faolligi (VAD) bo'yicha faqat qisqa gap bo'lagi
// (0.35–3 s) yoziladi va /api/stt ga yuboriladi; matnda "Jigar" bo'lsa — savol tinglash boshlanadi.
import { hasWakeWord } from "./wake.js";

const VAD = { threshold: 0.018, startMs: 60, silenceMs: 600, minMs: 350, maxMs: 3000 };
const FRAME_MS = 50;
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

/**
 * wake.js bilan bir xil interfeys: { supported, enabled, setEnabled, pause, resume }.
 * @param {{ onWake: () => void, onUnavailable?: (reason: string) => void, apiBase: () => string,
 *           authHeaders: () => Record<string, string> }} deps
 */
export function createServerWake({ onWake, onUnavailable = () => {}, apiBase, authHeaders }) {
  const supported = Boolean(globalThis.navigator?.mediaDevices?.getUserMedia && globalThis.MediaRecorder);
  let wanted = false;
  let paused = false;
  let lang = "uz";
  let live = null; // { stream, ctx, timer, recorder }
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
        onWake();
      }
    } catch {
      /* tarmoq — keyingi gap bo'lagida */
    }
  }

  function giveUp(reason) {
    wanted = false;
    halt();
    onUnavailable(reason);
  }

  async function begin() {
    if (!supported || !wanted || paused || live) return;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      return giveUp("not-allowed");
    }
    if (!wanted || paused || live) return stream.getTracks().forEach((t) => t.stop());
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const segmenter = createSegmenter();
    const current = { stream, ctx, recorder: null, timer: null };
    current.timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      const event = segmenter.feed(rms(samples), performance.now());
      if (event === "start") {
        const chunks = [];
        const recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        recorder.onstop = () => recorder.keep && send(new Blob(chunks, { type: recorder.mimeType }));
        recorder.start();
        current.recorder = recorder;
      } else if (event && current.recorder) {
        current.recorder.keep = event.keep;
        if (current.recorder.state !== "inactive") current.recorder.stop();
        current.recorder = null;
      }
    }, FRAME_MS);
    live = current;
  }

  function halt() {
    if (!live) return;
    clearInterval(live.timer);
    if (live.recorder?.state === "recording") {
      live.recorder.keep = false;
      live.recorder.stop();
    }
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
