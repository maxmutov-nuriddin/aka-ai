// Umumiy xato turlari. Yo'llar ularni HTTP holatiga aylantiradi (app.js).

/** Kiruvchi ma'lumot noto'g'ri — 400. */
export class ValidationError extends Error {}

/** Ovoz xizmati kaliti o'rnatilmagan — 503. */
export class TtsNotConfiguredError extends Error {}

/** Kirish kerak yoki sessiya tugagan — 401. */
export class AuthError extends Error {}
