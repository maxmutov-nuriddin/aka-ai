// Foydalanuvchi profili: ro'yxatdan o'tishdagi savollar javobi (web/auth/onboarding.js) — til, javob uzunligi, xarakter.
// Faqat ma'lum maydonlar va ruxsat etilgan qiymatlar saqlanadi. (EcoSystem'da yo'nalish va sinf yo'q.)
import { normalizeLang, normalizeLength, normalizePersona, ValidationError } from "../core/jigar.js";

const FIELDS = {
  lang: normalizeLang,
  length: normalizeLength,
  persona: normalizePersona,
};

/**
 * Profilni tekshiradi va tozalaydi. Berilmasa yoki bo'sh bo'lsa — null.
 * Noma'lum maydonlar (eski goal/level ham) tashlanadi, noto'g'ri qiymat — ValidationError.
 * @param {unknown} input
 * @returns {Record<string, string> | null}
 */
export function normalizeProfile(input) {
  if (input == null) return null;
  if (typeof input !== "object" || Array.isArray(input)) throw new ValidationError("profile obyekt bo'lishi kerak");
  const profile = {};
  for (const [field, normalize] of Object.entries(FIELDS)) {
    const value = input[field];
    if (value == null || value === "") continue; // berilmagan maydon — standart qiymat ishlaydi
    profile[field] = normalize(value);
  }
  return Object.keys(profile).length ? profile : null;
}

/** Bazadagi JSON matnni profilga aylantiradi (buzilgan bo'lsa — null). */
export function parseStoredProfile(text) {
  if (!text) return null;
  try {
    return normalizeProfile(JSON.parse(text));
  } catch {
    return null;
  }
}
