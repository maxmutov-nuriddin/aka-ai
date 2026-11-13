// Jigarning "his holati" suhbat davomida: jahl darajasi (0..3) to'planadi va asta so'nadi.
// Haqorat, rashk yoki "drama" ([angry], [shouts], [jealous], [shocked], [crying]) — oshadi; javobda jahl bo'lsa, undagi kulgi
// ([chuckles] — roast'dagi hazil) uni yo'qqa chiqarmaydi. Jahlsiz iliq javob ([warm], [love], [proud], [smiles]) — bir pog'ona pasaytiradi.
// Darajani robot ko'rsatadi: 1 — qizil nur, 2 — olov, 3 — katta olov, bug' va titrash (shared/avatar.css: data-heat).
export const HEAT_MAX = 3;
export const COOL_DOWN_MS = 90_000; // shuncha vaqt jahlsiz o'tsa — bir pog'ona so'nadi

const HEATING = new Set(["angry", "furious", "jealous", "shocked", "crying"]);
const COOLING = new Set(["happy", "kind", "love", "proud"]);

/** Bitta javobdagi kayfiyatlardan keyingi daraja (sof — testlanadi). max — eng yuqori daraja. */
export function nextHeat(heat, emotions, max = HEAT_MAX) {
  const up = emotions.reduce((sum, e) => sum + (e === "furious" ? 2 : HEATING.has(e) ? 1 : 0), 0);
  // Kechirim (erib ketish, [love]) — ikki pog'ona: olov darhol o'chadi; boshqa iliq javob — bir pog'ona.
  const down = emotions.includes("love") ? 2 : emotions.some((e) => COOLING.has(e)) ? 1 : 0;
  const h = up ? heat + up : heat - down;
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
