// Jigarning "ko'zi": oldi yoki orqa kamera. Yoqiq bo'lsa, har savolga joriy kadr (JPEG) ilova qilinadi —
// o'quvchi daftar, masala yoki buyumni ko'rsatadi, Jigar ko'rib yordam beradi.

const MAX_SIDE = 1568; // Claude rasmni shu o'lchamgacha kichraytiradi — kattasini yuborish behuda
const JPEG_QUALITY = 0.82; // ~150-350 KB: matn o'qiladi, so'rov yengil
const FACING = { back: "environment", front: "user" };

/** Telefon yoki planshet (orqa kamerasi bor). Kompyuterda kamera doim foydalanuvchiga qaragan. */
const isMobile = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;

/**
 * Rasmni (video kadr, yuklangan surat) Claude uchun mos JPEG'ga aylantiradi: uzun tomoni MAX_SIDE gacha.
 * @param {CanvasImageSource} source
 * @param {number} width asl kenglik
 * @param {number} height asl balandlik
 * @returns {string} data:image/jpeg;base64,...
 */
export function toJpegDataUrl(source, width, height) {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

/**
 * @param {{ video: HTMLVideoElement }} options
 */
export function createCamera({ video }) {
  let stream = null;
  let facing = "back";

  const supported = Boolean(navigator.mediaDevices?.getUserMedia);

  function release() {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
  }

  /** Kamerani yoqadi. Ruxsat berilmasa yoki kamera yo'q bo'lsa — xato (chaqiruvchi foydalanuvchiga ko'rsatadi). */
  async function start(side = facing) {
    if (!supported) throw new Error("unsupported");
    const next = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: FACING[side] }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    release();
    stream = next;
    facing = side;
    video.srcObject = stream;
    // Old kamera — oynadagidek (o'ngga qimirlasa, o'ngga). Qaysi kamera ekanini brauzer bergan kameradan bilamiz:
    // noutbukda orqa kamera yo'q — "orqa" so'ralsa ham old kamera keladi. Faqat aniq orqa kamera aylantirilmaydi.
    // Jigarga yuboriladigan kadr (snapshot) aylantirilmaydi — yozuvlar to'g'ri o'qiladi.
    const actual = stream.getVideoTracks()[0]?.getSettings?.().facingMode;
    video.classList.toggle("mirrored", actual ? actual !== "environment" : side === "front" || !isMobile());
    await video.play().catch(() => {});
  }

  /** Oldi <-> orqa. Ikkinchi kamera bo'lmasa — xato, avvalgisi qoladi. */
  async function flip() {
    await start(facing === "back" ? "front" : "back");
  }

  /** Joriy kadr: data:image/jpeg;base64,... yoki null (kamera hali tayyor emas). */
  function snapshot() {
    if (!stream || !video.videoWidth || !video.videoHeight) return null;
    return toJpegDataUrl(video, video.videoWidth, video.videoHeight);
  }

  return {
    supported,
    get active() {
      return Boolean(stream);
    },
    start,
    flip,
    stop: release,
    snapshot,
  };
}
