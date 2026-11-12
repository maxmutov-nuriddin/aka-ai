// Jigarning "ko'zi": oldi yoki orqa kamera. Yoqiq bo'lsa, har savolga joriy kadr (JPEG) ilova qilinadi —
// o'quvchi daftar, masala yoki buyumni ko'rsatadi, Jigar ko'rib yordam beradi.

const MAX_SIDE = 1568; // Claude rasmni shu o'lchamgacha kichraytiradi — kattasini yuborish behuda
const JPEG_QUALITY = 0.82; // ~150-350 KB: matn o'qiladi, so'rov yengil
const FACING = { back: "environment", front: "user" };

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
    video.classList.toggle("mirrored", side === "front"); // old kamera — oynadagidek
    await video.play().catch(() => {});
  }

  /** Oldi <-> orqa. Ikkinchi kamera bo'lmasa — xato, avvalgisi qoladi. */
  async function flip() {
    await start(facing === "back" ? "front" : "back");
  }

  /** Joriy kadr: data:image/jpeg;base64,... yoki null (kamera hali tayyor emas). */
  function snapshot() {
    if (!stream || !video.videoWidth || !video.videoHeight) return null;
    const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
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
