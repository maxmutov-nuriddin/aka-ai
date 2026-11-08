// Yo'nalishga mos sinflar — bitta qoida: server (profil tekshiruvi), ro'yxatdan o'tish savollari va Support paneli.
// Brauzerga /shared/levels.js manzilida beriladi (server/app.js), shuning uchun bu fayl hech narsani import qilmaydi.

/** Barcha sinflar (yoshi bo'yicha tartibda). */
export const LEVEL_ORDER = ["5-7", "8-9", "10-11", "student"];

const SCHOOL = ["5-7", "8-9", "10-11"];
const LEVELS_BY_GOAL = {
  study: SCHOOL, // maktab dasturi — talaba emas
  olympiad: SCHOOL, // fan olimpiadalari — maktab o'quvchilari
  exam: ["8-9", "10-11", "student"], // nazorat, attestatsiya, DTM; "student" — maktabni bitirgan abituriyent
  university: ["student"], // faqat talaba — savol so'ralmaydi
  // language, curious va boshqalar — hamma yosh
};

/** Yo'nalish uchun ruxsat etilgan sinflar. */
export function levelsForGoal(goal) {
  return LEVELS_BY_GOAL[goal] ?? LEVEL_ORDER;
}

/** Sinf yo'nalishga mos kelmasa — yoshi bo'yicha eng yaqin ruxsat etilgani; bitta variant bo'lsa — o'sha. */
export function fitLevel(goal, level) {
  const allowed = levelsForGoal(goal);
  if (!level) return allowed.length === 1 ? allowed[0] : level;
  if (allowed.includes(level)) return level;
  const index = LEVEL_ORDER.indexOf(level);
  return allowed.reduce((best, candidate) =>
    Math.abs(LEVEL_ORDER.indexOf(candidate) - index) < Math.abs(LEVEL_ORDER.indexOf(best) - index) ? candidate : best,
  );
}
