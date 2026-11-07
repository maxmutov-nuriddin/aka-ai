// O'quvchi profili: ro'yxatdan o'tishdan oldingi savollar javobi (web/auth/onboarding.js).
// Faqat ma'lum maydonlar va ruxsat etilgan qiymatlar saqlanadi.
import {
  normalizeGoal, normalizeLang, normalizeLength, normalizeLevel, normalizePersona, ValidationError,
} from "../core/jigar.js";

const FIELDS = {
  lang: normalizeLang,
  goal: normalizeGoal,
  length: normalizeLength,
  persona: normalizePersona,
  level: normalizeLevel,
};

/**
 * Profilni tekshiradi va tozalaydi. Berilmasa yoki bo'sh bo'lsa — null.
 * Noma'lum maydonlar tashlanadi, noto'g'ri qiymat — ValidationError.
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
