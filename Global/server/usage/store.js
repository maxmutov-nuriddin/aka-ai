// Kunlik sarf (repository): tarif limiti uchun har foydalanuvchining bugungi savollari va ovoz belgilari.
const TASHKENT_OFFSET_MS = 5 * 60 * 60_000; // UTC+5, yozgi vaqt yo'q
const CHARS_PER_MINUTE = 900; // o'zbekcha nutq: ~900 belgi ≈ 1 daqiqa ovoz
// Har savol (LLM xarajati) — standart 0.5 daqiqa: tarif tannarxi shunga hisoblangan (1 savol-javob ≈ 1 daqiqa); .env: MINUTES_PER_CHAT
const DEFAULT_MINUTES_PER_CHAT = 0.5;

/** .env dagi MINUTES_PER_CHAT: manfiy bo'lmagan chekli son; bo'sh yoki noto'g'ri bo'lsa — standart. */
export function minutesPerChatFrom(env = {}) {
  const raw = String(env.MINUTES_PER_CHAT ?? "").trim();
  const value = Number(raw);
  return raw && Number.isFinite(value) && value >= 0 ? value : DEFAULT_MINUTES_PER_CHAT;
}

/** Bugungi sana (YYYY-MM-DD) Toshkent vaqti bo'yicha — limit yarim tunda yangilanadi. */
export function todayInTashkent(now = new Date()) {
  return new Date(now.getTime() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {{ now?: () => Date, minutesPerChat?: number }} [options]
 */
export function createUsageStore(db, { now = () => new Date(), minutesPerChat = DEFAULT_MINUTES_PER_CHAT } = {}) {
  const q = {
    get: db.prepare("SELECT chats, tts_chars FROM usage_daily WHERE user_id = ? AND day = ?"),
    add: db.prepare(
      `INSERT INTO usage_daily (user_id, day, chats, tts_chars) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, day) DO UPDATE SET chats = chats + excluded.chats, tts_chars = tts_chars + excluded.tts_chars`,
    ),
    reset: db.prepare("DELETE FROM usage_daily WHERE user_id = ? AND day = ?"),
    totals: db.prepare(
      `SELECT day, COUNT(*) AS users, SUM(chats) AS chats, SUM(tts_chars) AS ttsChars
       FROM usage_daily WHERE day >= ? GROUP BY day`,
    ),
    lastDays: db.prepare("SELECT user_id AS userId, MAX(day) AS day FROM usage_daily GROUP BY user_id"),
    since: db.prepare("SELECT COALESCE(SUM(chats), 0) AS chats, COALESCE(SUM(tts_chars), 0) AS ttsChars FROM usage_daily WHERE user_id = ? AND day >= ?"),
  };
  const today = () => todayInTashkent(now());

  /** Bugungi sarf daqiqada (0.1 aniqlikda): savollar + Jigarning ovozi. */
  function minutesToday(userId) {
    const row = q.get.get(userId, today());
    if (!row) return 0;
    return Math.round((row.chats * minutesPerChat + row.tts_chars / CHARS_PER_MINUTE) * 10) / 10;
  }

  /** Berilgan kundan (shu kun ham) beri sarf daqiqada — paket qoldig'i uchun. */
  function minutesSince(userId, day) {
    const r = q.since.get(userId, day);
    return Math.round((r.chats * minutesPerChat + r.ttsChars / CHARS_PER_MINUTE) * 10) / 10;
  }

  /**
   * Faol paket holati: { key, minutes, used, remaining, until } yoki null (paket yo'q, muddati o'tgan yoki tugagan).
   * @param {number} userId
   * @param {{ key: string, minutes: number, startDay: string, until: string } | null | undefined} pkg
   */
  function packageStatus(userId, pkg) {
    if (!pkg || Date.parse(pkg.until) <= now().getTime()) return null;
    const used = minutesSince(userId, pkg.startDay);
    const remaining = Math.max(0, Math.round((pkg.minutes - used) * 10) / 10);
    if (remaining <= 0) return null;
    return { key: pkg.key, minutes: pkg.minutes, used, remaining, until: pkg.until };
  }

  /** Muvaffaqiyatli javobdan keyin. */
  function addChat(userId) {
    q.add.run(userId, today(), 1, 0);
  }

  /** Ovoz yaratilgandan keyin (belgilar soni). */
  function addSpeech(userId, chars) {
    if (chars > 0) q.add.run(userId, today(), 0, Math.round(chars));
  }

  /** Support: foydalanuvchining bugungi sarfini nolga tushiradi. */
  function resetToday(userId) {
    q.reset.run(userId, today());
  }

  /** Support: oxirgi N kun (eskidan yangiga) — har kun: faol foydalanuvchilar va daqiqalar. */
  function dailyTotals(days) {
    const ms = 86_400_000;
    const list = Array.from({ length: days }, (_, i) => todayInTashkent(new Date(now().getTime() - (days - 1 - i) * ms)));
    const rows = new Map(q.totals.all(list[0]).map((r) => [r.day, r]));
    return list.map((day) => {
      const r = rows.get(day);
      const minutes = r ? Math.round((r.chats * minutesPerChat + r.ttsChars / CHARS_PER_MINUTE) * 10) / 10 : 0;
      return { day, users: r?.users ?? 0, minutes };
    });
  }

  /** Support: har foydalanuvchining oxirgi faol kuni (Map: userId -> "YYYY-MM-DD"). */
  function lastActiveDays() {
    return new Map(q.lastDays.all().map((r) => [r.userId, r.day]));
  }

  return { minutesToday, addChat, addSpeech, resetToday, dailyTotals, lastActiveDays, minutesSince, packageStatus };
}
