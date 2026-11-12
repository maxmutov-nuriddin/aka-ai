// Ovoz yozuvini (webm/mp4) 16 kHz mono PCM WAV ga aylantiradi — talaffuz bahosi (Azure) shu formatni qabul qiladi.
// Faqat brauzerning o'z Web Audio API si ishlatiladi; tashqi kutubxona yo'q.

const SAMPLE_RATE = 16_000;
const WAV_HEADER_BYTES = 44;

/** Float32 [-1..1] namunalar -> PCM16 WAV. */
function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset, s) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true); // fmt bo'lagi uzunligi
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // bayt/soniya
  view.setUint16(32, 2, true); // blok
  view.setUint16(34, 16, true); // bit
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((v, i) => {
    const clamped = Math.max(-1, Math.min(1, v));
    view.setInt16(WAV_HEADER_BYTES + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  });
  return new Blob([buffer], { type: "audio/wav" });
}

/** Yozuv -> 16 kHz mono WAV. Brauzer dekodlay olmasa — xato (chaqiruvchi asl yozuvni yuboradi). */
export async function toWav16k(blob) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const frames = Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE));
    const offline = new OfflineAudioContext(1, frames, SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return encodeWav(rendered.getChannelData(0), SAMPLE_RATE);
  } finally {
    ctx.close();
  }
}
