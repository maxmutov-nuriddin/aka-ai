// Jigarning "his holati" suhbat davomida: jahl darajasi (0..3) to'planadi va asta so'nadi.
// Haqorat yoki rashk ([angry], [shouts], [jealous]) — oshadi; kechirim, maqtov, mehr ([warm], [love], [proud], [smiles]) — pasayadi.
// Darajani robot ko'rsatadi: 1 — qizil nur, 2 — olov, 3 — katta olov, bug' va titrash (shared/avatar.css: data-heat).
export const HEAT_MAX = 3;
export const COOL_DOWN_MS = 90_000; // shuncha vaqt jahlsiz o'tsa — bir pog'ona so'nadi

const HEATING = new Set(["angry", "furious", "jealous"]);
const COOLING = new Set(["happy", "kind", "love", "proud"]);

/** Bitta javobdagi kayfiyatlardan keyingi daraja (sof — testlanadi). max — eng yuqori daraja. */
export function nextHeat(heat, emotions, max = HEAT_MAX) {
  let h = heat;
  for (const emotion of emotions) {
    if (emotion === "furious") h += 2;
    else if (HEATING.has(emotion)) h += 1;
    else if (COOLING.has(emotion)) h -= 1;
  }
  return Math.max(0, Math.min(max, h));
}

/**
 * @param {{ onHeat: (heat: number) => void, coolDownMs?: number, max?: () => number }} deps
 *   max — eng yuqori daraja (jahldor xarakter va beparvo rejimda jahl — odatiy holat: doimiy titrash bo'lmasin).
 * @returns {{ feed: (emotions: string[]) => void, reset: () => void, readonly heat: number }}
 */
export function createMood({ onHeat, coolDownMs = COOL_DOWN_MS, max = () => HEAT_MAX }) {
  let heat = 0;
  let timer = null;

  function set(value) {
    if (value === heat) return;
    heat = value;
    onHeat(heat);
  }

  /** Jahl bo'lsa — vaqt o'tishi bilan bir pog'onadan so'nadi. */
  function scheduleCool() {
    clearTimeout(timer);
    if (!heat) return;
    timer = setTimeout(() => {
      set(heat - 1);
      scheduleCool();
    }, coolDownMs);
  }

  return {
    get heat() {
      return heat;
    },
    feed(emotions) {
      set(nextHeat(heat, emotions, max()));
      scheduleCool();
    },
    reset() {
      clearTimeout(timer);
      set(0);
    },
  };
}
