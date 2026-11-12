// O'quvchi profili: ro'yxatdan o'tishdan oldingi savollar javobi (web/auth/onboarding.js).
// Faqat ma'lum maydonlar va ruxsat etilgan qiymatlar saqlanadi.
import {
  normalizeGoal, normalizeLang, normalizeLength, normalizeLevel, normalizePersona, ValidationError,
} from "../core/jigar.js";
import { fitLevel, levelsForGoal } from "../core/levels.js";

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
  return Object.keys(profile).length ? withGoalLevel(profile) : null;
}

/** Sinf yo'nalishga mos bo'lsin (maktab darsida "talaba" yo'q); universitetda sinf — avtomatik "talaba". */
function withGoalLevel(profile) {
  if (!profile.goal) return profile;
  if (profile.level && !levelsForGoal(profile.goal).includes(profile.level)) {
    throw new ValidationError("Tanlangan sinf bu yo'nalishga mos emas.");
  }
  const level = fitLevel(profile.goal, profile.level);
  return level ? { ...profile, level } : profile;
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
