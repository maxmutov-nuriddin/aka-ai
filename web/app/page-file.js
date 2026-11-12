// Darslik faylini yuklash (veb-rejim, "Sahifa" oynasi): PDF — o'zicha, rasm — kichraytirilgan JPEG.
// Jigar shu hujjat bo'yicha tushuntiradi va savol beradi (server: page.pdf / page.image).

import { toJpegDataUrl } from "./camera.js";

export const MAX_PDF_BYTES = 8 * 1024 * 1024; // server chegarasi bilan bir xil (LIMITS.pdfBase64Chars)
const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // telefon surati ham sig'adi — baribir kichraytiriladi

/** Xato: foydalanuvchiga ko'rsatiladigan sabab kodi (i18n kaliti). */
export class PageFileError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new PageFileError("file.readError"));
    reader.readAsDataURL(file);
  });
}

async function imageToJpeg(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return toJpegDataUrl(img, img.naturalWidth, img.naturalHeight);
  } catch {
    throw new PageFileError("file.readError");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Faylni tekshiradi va yuborishga tayyorlaydi.
 * @param {File} file
 * @returns {Promise<{ kind: "pdf" | "image", name: string, dataUrl: string }>}
 */
export async function readPageFile(file) {
  if (!file) throw new PageFileError("file.readError");
  if (file.type === "application/pdf") {
    if (file.size > MAX_PDF_BYTES) throw new PageFileError("file.tooBig");
    const dataUrl = await readAsDataUrl(file);
    // Ba'zi brauzerlar turini bo'sh qoldiradi — server aynan shu ko'rinishni kutadi.
    return { kind: "pdf", name: file.name, dataUrl: dataUrl.replace(/^data:[^;]*;/, "data:application/pdf;") };
  }
  if (file.type.startsWith("image/")) {
    if (file.size > MAX_IMAGE_BYTES) throw new PageFileError("file.tooBig");
    return { kind: "image", name: file.name, dataUrl: await imageToJpeg(file) };
  }
  throw new PageFileError("file.badType");
}
