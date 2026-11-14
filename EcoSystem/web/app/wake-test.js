// Sozlamalar → "Hey Jigar"ni sinash: 4 s yozib oladi, ovoz darajasini jonli ko'rsatadi, yozuvni qayta eshittiradi
// va serverdagi tanish xizmati nima eshitganini hamda "Jigar" so'zi tanilganini aytadi.
// Egasi mikrofon past/baland ekanini va ism to'g'ri tanilishini o'zi tekshiradi. Chaqiruvchi: app.js.
import { MIC_CONSTRAINTS, SAMPLE_RATE, THRESHOLD, encodeWav, rms } from "./wake-server.js";
import { hasWakeWord } from "./wake.js";

const RECORD_MS = 4000;
const CHUNK_SAMPLES = 1024;
const METER_FULL = 0.15; // shu darajada indikator to'la

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

/** 4 s yozuv: Float32 bo'laklar + eng baland daraja. onLevel — har bo'lakda (indikator uchun). */
async function record(onLevel) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  const processor = ctx.createScriptProcessor(CHUNK_SAMPLES, 1, 1);
  const chunks = [];
  let peak = 0;
  processor.onaudioprocess = (e) => {
    const chunk = new Float32Array(e.inputBuffer.getChannelData(0));
    chunks.push(chunk);
    const level = rms(chunk);
    peak = Math.max(peak, level);
    onLevel(level);
  };
  ctx.createMediaStreamSource(stream).connect(processor);
  processor.connect(ctx.destination);
  await new Promise((resolve) => setTimeout(resolve, RECORD_MS));
  processor.onaudioprocess = null;
  processor.disconnect();
  stream.getTracks().forEach((t) => t.stop());
  await ctx.close().catch(() => {});
  return { chunks, peak };
}

/** Natija izohi (sof — testlanadi). */
export function wakeVerdict(peak, text) {
  if (peak < THRESHOLD.min * 2) return { ok: false, note: "Ovoz juda past: mikrofon tanlanganini va ovoz darajasini tekshiring." };
  if (!text) return { ok: false, note: "Hech narsa tanilmadi. Yaqinroq va balandroq ayting." };
  if (hasWakeWord(text)) return { ok: true, note: "Jigar ismini tanidi — \"Hey Jigar\" ishlaydi." };
  return { ok: false, note: "Ism tanilmadi. \"Jigar\"ni aniqroq, bir oz cho'zib ayting." };
}

/**
 * @param {HTMLElement} root
 * @param {{ apiBase: () => string, authHeaders: () => Record<string, string>, lang: () => string,
 *           pauseWake: () => void, resumeWake: () => void }} deps
 */
export function mountWakeTest(root, { apiBase, authHeaders, lang, pauseWake, resumeWake }) {
  const button = el("button", "btn-secondary", "🎙 Sinab ko'rish: \"Hey Jigar\" deng");
  button.type = "button";
  const meter = el("div", "wake-meter");
  const bar = el("div", "wake-meter-bar");
  const mark = el("div", "wake-meter-mark");
  mark.style.left = `${(THRESHOLD.min / METER_FULL) * 100}%`;
  meter.append(bar, mark);
  meter.hidden = true;
  const result = el("small", "wake-test-result");
  const audio = el("audio");
  audio.controls = true;
  audio.hidden = true;
  root.append(button, meter, result, audio);

  button.addEventListener("click", async () => {
    button.disabled = true;
    audio.hidden = true;
    meter.hidden = false;
    result.textContent = "Tinglayapman… \"Hey Jigar\" deng (4 soniya).";
    pauseWake();
    try {
      const { chunks, peak } = await record((level) => {
        bar.style.width = `${Math.min(100, (level / METER_FULL) * 100)}%`;
      });
      const wav = encodeWav(chunks);
      if (audio.src) URL.revokeObjectURL(audio.src);
      audio.src = URL.createObjectURL(wav);
      audio.hidden = false;
      result.textContent = "Tekshiryapman…";
      const res = await fetch(`${apiBase()}/api/stt?lang=${lang()}&wake=1`, { method: "POST", headers: { "Content-Type": "audio/wav", ...authHeaders() }, body: wav });
      const { text = "", error } = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(error || `server ${res.status}`);
      const { ok, note } = wakeVerdict(peak, text);
      result.textContent = `${ok ? "✓" : "✗"} Eshitilgani: "${text || "—"}". ${note} (daraja ${peak.toFixed(3)})`;
    } catch (err) {
      result.textContent = `✗ Sinab bo'lmadi: ${err?.name === "NotAllowedError" ? "mikrofonga ruxsat yo'q" : err?.message || "xato"}`;
    } finally {
      meter.hidden = true;
      bar.style.width = "0";
      button.disabled = false;
      resumeWake();
    }
  });
}
