// Jigar personaji: robot. Yuzi (ko'z, qosh, og'iz) va boshi har kadrda JS bilan chiziladi —
// kayfiyatlar orasida silliq o'tadi, gapirganda his-tuyg'uga mos imo-ishora qiladi, pirpiraydi, atrofga qaraydi.
// Holat (idle | listening | thinking | speaking), rejim (oddiy | beparvo)
// va kayfiyat (happy | excited | curious | whisper | sad | angry | smirk) tashqaridan beriladi.

const EYE_CENTERS = { left: [118, 108], right: [182, 108] };
const MOUTH_Y = 147;
const PIVOT = [150, 150];
const SMOOTH = 0.14; // har kadrda maqsadga yaqinlashish ulushi
const LEVEL_SMOOTH = 0.35;
const BLINK_MS = 150;
const BEAT_MS = 320; // urg'u (ovoz keskin ko'tarilganda) qancha davom etadi
const BEAT_RISE = 0.12; // shuncha keskin ko'tarilish — urg'u
const BEAT_GAP_MS = 280;

const BASE_EYE = { w: 30, h: 40, r: 13, scale: 1, open: 1, tilt: 0, lift: 0, dx: 0, dy: 0 };
const BASE_FACE = { brow: 0, browTilt: 0, browShow: 0, mouthW: 26, curve: 5, open: 0, skew: 0, mouthDx: 0 };

// Har kayfiyat: ko'zlar, qosh, og'iz va gapirgandagi bosh harakati (gesture).
const EMOTIONS = {
  neutral: { left: {}, right: {}, face: {}, cheeks: 0.3, gesture: "nod" },
  happy: {
    left: { h: 30, r: 15, lift: 0.78 }, right: { h: 30, r: 15, lift: 0.78 },
    face: { brow: 6, browShow: 0.9, mouthW: 34, curve: 11, open: 0.25 }, cheeks: 0.9, gesture: "bounce",
  },
  excited: {
    left: { scale: 1.22, r: 15 }, right: { scale: 1.22, r: 15 },
    face: { brow: 10, browShow: 1, mouthW: 30, curve: 8, open: 0.45 }, cheeks: 0.7, gesture: "hop",
  },
  curious: {
    left: { scale: 0.86, open: 0.78 }, right: { scale: 1.18 },
    face: { brow: 4, browTilt: -0.5, browShow: 1, mouthW: 16, curve: 0, mouthDx: 6 }, cheeks: 0.3, gesture: "tilt",
  },
  whisper: {
    left: { open: 0.45 }, right: { open: 0.45 },
    face: { brow: -2, browShow: 0.7, mouthW: 12, curve: 1 }, cheeks: 0.3, gesture: "lean",
  },
  sad: {
    left: { tilt: -0.9, open: 0.75, dy: 5 }, right: { tilt: -0.9, open: 0.75, dy: 5 },
    face: { brow: 2, browTilt: -1, browShow: 1, mouthW: 18, curve: -8 }, cheeks: 0.1, gesture: "droop",
  },
  angry: {
    left: { tilt: 1, open: 0.8 }, right: { tilt: 1, open: 0.8 },
    face: { brow: -5, browTilt: 1, browShow: 1, mouthW: 36, curve: -5, open: 0.35 }, cheeks: 0, gesture: "rage",
  },
  // Baqiriq (beparvo rejim, KATTA HARF yoki undov): jahldan kuchliroq.
  furious: {
    left: { tilt: 1.25, open: 0.66, scale: 1.06 }, right: { tilt: 1.25, open: 0.66, scale: 1.06 },
    face: { brow: -8, browTilt: 1.4, browShow: 1, mouthW: 42, curve: -7, open: 0.8 }, cheeks: 0, gesture: "rage",
  },
  smirk: {
    left: { open: 0.5, tilt: 0.35 }, right: { open: 0.9 },
    face: { brow: 3, browTilt: 0.4, browShow: 1, mouthW: 24, curve: 5, skew: 6, mouthDx: 4 }, cheeks: 0.3, gesture: "tilt",
  },
  // Xarakterlar uchun doimiy ifodalar (persona). Kayfiyat berilsa, u ustun.
  kind: {
    left: { h: 32, r: 15, lift: 0.55 }, right: { h: 32, r: 15, lift: 0.55 },
    face: { brow: 4, browShow: 0.6, mouthW: 30, curve: 9 }, cheeks: 0.75, gesture: "nod",
  },
  romantic: {
    left: {}, right: {},
    face: { brow: 5, browShow: 0.5, mouthW: 22, curve: 9 }, cheeks: 1, gesture: "bounce",
  },
};

// Xarakter (ro'yxatdan o'tishda tanlanadi) -> jim turgandagi ifoda.
const PERSONA_BASE = { neytral: "neutral", mehribon: "kind", kinoyali: "smirk", jahldor: "angry", romantik: "romantic" };
// Romantikning yurak ko'zlari bu kayfiyatlarda oddiy ko'zga qaytadi (yurak bilan jahl yoki g'am chiqmaydi).
const NO_HEART_EMOTIONS = new Set(["angry", "furious", "sad"]);
const SILENT_LEVEL = 0.04; // shundan past ovoz — pauza (og'iz yopiladi)
const HEART_SIZE = 13;

const lerp = (a, b, k) => a + (b - a) * k;
const rand = (min, max) => min + Math.random() * (max - min);
const f = (n) => n.toFixed(2);

function eyePath([cx, cy], p, side) {
  const w = BASE_EYE.w * p.scale;
  const h = Math.max(2.5, BASE_EYE.h * p.scale * p.open);
  const r = Math.min(p.r * p.scale, w / 2, h / 2);
  const x0 = cx - w / 2 + p.dx;
  const x1 = cx + w / 2 + p.dx;
  const top = cy - h / 2 + p.dy;
  const bot = cy + h / 2 + p.dy;
  // tilt > 0: ichki burchak pastga (jahl), tilt < 0: ichki burchak tepaga (g'am)
  const inner = Math.max(-h / 2 + r, Math.min(h / 2 - r, p.tilt * h * 0.38));
  const yTL = side === "left" ? top : top + inner;
  const yTR = side === "left" ? top + inner : top;
  const lift = p.lift * h * 0.9;
  const mid = cx + p.dx;
  // Pastki burchak kichikroq — aks holda kulgidagi "^" egri chizig'i uchun joy qolmaydi.
  const rb = Math.min(r, w * 0.22);
  return `M${f(x0)} ${f(yTL + r)}Q${f(x0)} ${f(yTL)} ${f(x0 + r)} ${f(yTL)}L${f(x1 - r)} ${f(yTR)}Q${f(x1)} ${f(yTR)} ${f(x1)} ${f(yTR + r)}`
    + `L${f(x1)} ${f(bot - rb)}Q${f(x1)} ${f(bot)} ${f(x1 - rb)} ${f(bot)}Q${f(mid)} ${f(bot - 2 * lift)} ${f(x0 + rb)} ${f(bot)}`
    + `Q${f(x0)} ${f(bot)} ${f(x0)} ${f(bot - rb)}Z`;
}

/** Yurak ko'z (romantik): pirpiraganda vertikal siqiladi, kattalik va qarash yo'nalishi oddiy ko'z kabi. */
function heartPath([cx, cy], p) {
  const s = HEART_SIZE * p.scale;
  const o = Math.max(0.08, p.open);
  const x = cx + p.dx;
  const y = cy + p.dy;
  const bottom = y + s * 1.05 * o;
  const dip = y - s * 0.45 * o;
  const lobe = y - s * 1.2 * o;
  const side = y - s * 0.1 * o;
  return `M${f(x)} ${f(bottom)}C${f(x - s * 1.75)} ${f(side)} ${f(x - s)} ${f(lobe)} ${f(x)} ${f(dip)}`
    + `C${f(x + s)} ${f(lobe)} ${f(x + s * 1.75)} ${f(side)} ${f(x)} ${f(bottom)}Z`;
}

/** Qosh: ichki uchi tilt bilan tushadi (jahl) yoki ko'tariladi (g'am). */
function browPath([cx, cy], face, eye, side) {
  const dir = side === "left" ? 1 : -1; // ichki tomon
  const FACE_TOP = 72; // qosh ekran chegarasidan chiqmasin
  const y = Math.max(FACE_TOP, cy - (BASE_EYE.h * eye.scale) / 2 - 12 - face.brow + eye.dy * 0.5);
  const inner = cx + dir * 15 + eye.dx;
  const outer = cx - dir * 15 + eye.dx;
  const yInner = y + face.browTilt * 7;
  const yOuter = y - face.browTilt * 2;
  return `M${f(outer)} ${f(yOuter)}Q${f(cx + eye.dx)} ${f(Math.min(yInner, yOuter) - 4)} ${f(inner)} ${f(yInner)}`;
}

/** Og'iz: open=0 — chiziq (tabassum/qovoq), open>0 — ochiq og'iz; curve>0 — burchaklar tepada. */
function mouthPath(face) {
  const half = face.mouthW / 2;
  const cx = 150 + face.mouthDx;
  const xL = cx - half;
  const xR = cx + half;
  const yL = MOUTH_Y - face.curve * 0.5;
  const yR = yL - face.skew;
  const top = MOUTH_Y + face.curve * 0.6 - face.open * 6;
  const bottom = MOUTH_Y + face.curve * 0.6 + face.open * 26;
  return `M${f(xL)} ${f(yL)}Q${f(cx)} ${f(top)} ${f(xR)} ${f(yR)}Q${f(cx)} ${f(bottom)} ${f(xL)} ${f(yL)}Z`;
}

/** Gapirgandagi bosh harakati: [burchak, pastga siljish, kattalashish]. */
function gestureFor(name, t, level) {
  switch (name) {
    case "bounce": return [3 * Math.sin(t / 300), -Math.abs(Math.sin(t / 170)) * 6, 1];
    case "hop": return [4 * Math.sin(t / 220), -Math.abs(Math.sin(t / 130)) * 8, 1.03];
    case "tilt": return [9 + 2 * Math.sin(t / 700), 0, 1];
    case "lean": return [-4 + Math.sin(t / 800), 5, 1.06];
    case "droop": return [5 + 2 * Math.sin(t / 900), 7, 0.98];
    case "rage": return [4 * Math.sin(t / 55) * (0.4 + level), 4, 1.05];
    default: return [2 * Math.sin(t / 420), level * 4, 1]; // nod
  }
}

const ROBOT_SVG = `
<svg class="av" viewBox="0 0 300 340" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="avShell" cx="0.32" cy="0.22" r="0.95">
      <stop offset="0" stop-color="#ffffff" />
      <stop offset="0.5" stop-color="#e6e9f7" />
      <stop offset="0.85" stop-color="#b9c0e2" />
      <stop offset="1" stop-color="#9aa3cf" />
    </radialGradient>
    <linearGradient id="avShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.55" stop-color="#1b1f45" stop-opacity="0" />
      <stop offset="1" stop-color="#1b1f45" stop-opacity="0.28" />
    </linearGradient>
    <radialGradient id="avFace" cx="0.5" cy="0.4" r="0.75">
      <stop offset="0" stop-color="#161b44" />
      <stop offset="1" stop-color="#03040b" />
    </radialGradient>
    <linearGradient id="avGlare" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.3" />
      <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
    </linearGradient>
    <pattern id="avScan" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="4" height="1.2" fill="#ffffff" opacity="0.035" />
    </pattern>
    <filter id="avGlow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="3.2" result="b" />
      <feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
  </defs>
  <ellipse class="av-shadow" cx="150" cy="328" rx="74" ry="9" />
  <g class="av-float">
    <g data-part="armL">
      <rect class="av-shell" x="58" y="228" width="24" height="56" rx="12" />
      <circle class="av-joint" cx="70" cy="234" r="5" />
    </g>
    <g data-part="armR">
      <rect class="av-shell" x="218" y="228" width="24" height="56" rx="12" />
      <circle class="av-joint" cx="230" cy="234" r="5" />
    </g>
    <rect class="av-neck" x="128" y="198" width="44" height="20" rx="7" />
    <rect class="av-neck-ring" x="124" y="210" width="52" height="6" rx="3" />
    <path class="av-shell" d="M88 236 Q88 214 116 214 L184 214 Q212 214 212 236 L206 286 Q202 312 172 312 L128 312 Q98 312 94 286 Z" />
    <path class="av-shade" d="M88 236 Q88 214 116 214 L184 214 Q212 214 212 236 L206 286 Q202 312 172 312 L128 312 Q98 312 94 286 Z" />
    <path class="av-seam" d="M100 240 L200 240" />
    <circle class="av-core-ring" cx="150" cy="266" r="16" />
    <circle class="av-core" data-part="core" cx="150" cy="266" r="7" filter="url(#avGlow)" />
    <g data-part="head">
      <line class="av-antenna" x1="150" y1="44" x2="150" y2="20" />
      <circle class="av-tip-halo" cx="150" cy="15" r="12" />
      <circle class="av-tip" cx="150" cy="15" r="7" filter="url(#avGlow)" />
      <rect class="av-shell" x="20" y="88" width="34" height="58" rx="17" />
      <rect class="av-shell" x="246" y="88" width="34" height="58" rx="17" />
      <rect class="av-ear-light" x="27" y="102" width="8" height="30" rx="4" filter="url(#avGlow)" />
      <rect class="av-ear-light" x="265" y="102" width="8" height="30" rx="4" filter="url(#avGlow)" />
      <rect class="av-shell av-head" x="42" y="40" width="216" height="164" rx="68" />
      <rect class="av-shade" x="42" y="40" width="216" height="164" rx="68" />
      <path class="av-rim" d="M84 52 Q150 33 216 52" />
      <rect class="av-face" x="62" y="60" width="176" height="120" rx="48" />
      <rect class="av-scan" x="62" y="60" width="176" height="120" rx="48" />
      <rect class="av-face-edge" x="66" y="64" width="168" height="112" rx="44" />
      <g class="av-features" filter="url(#avGlow)">
        <path class="av-brow" data-part="browL" />
        <path class="av-brow" data-part="browR" />
        <path class="av-eye" data-part="eyeL" />
        <path class="av-eye" data-part="eyeR" />
        <path class="av-mouth" data-part="mouth" />
      </g>
      <ellipse class="av-cheek" data-part="cheekL" cx="88" cy="142" rx="11" ry="6" />
      <ellipse class="av-cheek" data-part="cheekR" cx="212" cy="142" rx="11" ry="6" />
      <path class="av-glare" d="M82 72 Q100 64 130 64 L122 80 Q98 80 86 94 Z" />
    </g>
  </g>
</svg>`;

function presetFor(emotion, mode, persona) {
  if (emotion && EMOTIONS[emotion]) return EMOTIONS[emotion];
  if (persona && PERSONA_BASE[persona]) return EMOTIONS[PERSONA_BASE[persona]];
  return mode === "beparvo" ? EMOTIONS.angry : EMOTIONS.neutral;
}

/**
 * @param {HTMLElement} root
 * @returns {{
 *   setState: (s: string) => void,
 *   setMode: (m: string) => void,
 *   setLevel: (v: number | null) => void,
 *   setEmotion: (e: string | null) => void,
 *   lookAt: (x: number | null, y?: number) => void,
 * }}
 */
export function createAvatar(root) {
  // o'zgarmas, ishonchli belgilash. .av-hearts — Romantik xarakterda robot atrofida suzib yuruvchi yurakchalar.
  root.innerHTML = `${ROBOT_SVG}<div class="av-hearts" aria-hidden="true">${"<span>♥</span>".repeat(6)}</div>`;
  const part = (name) => root.querySelector(`[data-part="${name}"]`);
  const nodes = Object.fromEntries(
    ["eyeL", "eyeR", "browL", "browR", "mouth", "head", "armL", "armR", "core", "cheekL", "cheekR"].map((n) => [n, part(n)]),
  );
  const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const ui = { state: "idle", mode: "oddiy", persona: null, emotion: null, level: 0, autoTalk: false, look: null };
  const GAZE_RANGE = { x: 9, y: 6 };
  const cur = {
    left: { ...BASE_EYE }, right: { ...BASE_EYE }, face: { ...BASE_FACE },
    angle: 0, y: 0, scale: 1, cheeks: 0.3, level: 0, beat: 0, armR: 0, armL: 0,
  };
  const talk = { prevLevel: 0, beatAt: -1e9, sway: 0, swayNext: 0 };
  let reportedError = false;
  const gaze = { dx: 0, dy: 0, next: 0 };
  let blinkAt = performance.now() + rand(1500, 4000);

  function targetEye(side, preset, now) {
    const t = { ...BASE_EYE, ...preset[side] };
    if (ui.state === "listening") t.scale *= 1.1;
    if (ui.state === "speaking") {
      t.scale *= 1 + cur.level * 0.05;
      t.open *= 1 - cur.level * 0.14 - cur.beat * 0.1; // baland bo'g'inda ko'z bir oz qisiladi — urg'u
    }
    t.dx += gaze.dx;
    t.dy += gaze.dy;
    const sinceBlink = now - blinkAt;
    if (sinceBlink >= 0 && sinceBlink < BLINK_MS) t.open *= 1 - Math.sin((sinceBlink / BLINK_MS) * Math.PI) * 0.92;
    return t;
  }

  function targetFace(preset, speaking) {
    const t = { ...BASE_FACE, ...preset.face };
    if (ui.state === "listening") Object.assign(t, { brow: t.brow + 5, browShow: Math.max(t.browShow, 0.6) });
    if (ui.state === "thinking") Object.assign(t, { browTilt: -0.4, browShow: 0.8, brow: 4, mouthW: 14, curve: 0, mouthDx: 5 });
    if (speaking) {
      // Gapirganda: og'iz ovozga qarab ochiladi, qoshlar urg'u bilan ko'tariladi.
      // Pauzada (ovoz yo'q) og'iz deyarli yopiladi — gap bilan birga ochilib-yopiladi, ochiq qotib qolmaydi.
      const voiced = cur.level > SILENT_LEVEL ? 0.12 : 0;
      t.open = t.open * 0.35 + voiced + cur.level * (preset === EMOTIONS.furious ? 1.45 : preset === EMOTIONS.angry ? 1.25 : 1);
      t.brow += cur.level * 6 + cur.beat * 7; // urg'uda qosh sakraydi
      t.browShow = Math.max(t.browShow, 0.55);
    } else {
      t.open = 0;
    }
    if (ui.emotion === "whisper") t.open *= 0.4;
    return t;
  }

  function updateGaze(now) {
    // Tashqaridan berilgan nuqtaga qaraydi (masalan, sichqoncha) — faqat jim turganda.
    if (ui.look && ui.state === "idle") {
      Object.assign(gaze, { dx: ui.look.x * GAZE_RANGE.x, dy: ui.look.y * GAZE_RANGE.y, next: now + 60 });
      return;
    }
    if (now < gaze.next) return;
    if (ui.state === "thinking") {
      const toLeft = gaze.dx >= 0;
      Object.assign(gaze, { dx: toLeft ? -9 : 9, dy: -7, next: now + 900 });
    } else if (ui.state === "listening") {
      Object.assign(gaze, { dx: 0, dy: 0, next: now + 600 });
    } else {
      const range = ui.state === "speaking" ? 3 : 7;
      Object.assign(gaze, { dx: rand(-range, range), dy: rand(-range / 2, range / 2), next: now + (calm ? 1e9 : rand(1200, 3600)) });
    }
  }

  function moveHead(now, preset, speaking) {
    let [angle, y, scale] = [0, 0, 1];
    if (speaking && !calm) {
      [angle, y, scale] = gestureFor(preset.gesture, now, cur.level);
      // Gap davomida bosh sekin u yoq-bu yoqqa buriladi, urg'uda irg'iydi.
      if (now > talk.swayNext) Object.assign(talk, { sway: rand(-5, 5), swayNext: now + rand(900, 2200) });
      angle += talk.sway;
      y += cur.beat * 4;
    }
    else if (preset.gesture === "tilt" || preset.gesture === "droop" || preset.gesture === "lean") [angle, y, scale] = gestureFor(preset.gesture, 0, 0);
    if (ui.state === "listening") [angle, y, scale] = [-6, -2, 1.02];
    if (ui.state === "thinking") angle = 4 * Math.sin(now / 600);
    cur.angle = lerp(cur.angle, angle, 0.12);
    cur.y = lerp(cur.y, y, 0.18);
    cur.scale = lerp(cur.scale, scale, 0.1);
    const [px, py] = PIVOT;
    nodes.head.setAttribute(
      "transform",
      `translate(0 ${f(cur.y)}) rotate(${f(cur.angle)} ${px} ${py}) translate(${px} ${py}) scale(${f(cur.scale)}) translate(${-px} ${-py})`,
    );
  }

  /**
   * Qo'llar (yelkadan aylanadi; o'ng qo'l manfiy burchakda tashqariga-tepaga, chap — musbatda).
   * Har kayfiyatning o'z ishorasi bor; gapirganda ustiga gapga qo'shilgan imo va urg'u qo'shiladi.
   */
  function armPose(now, speaking) {
    const t = now;
    const wild = ui.mode === "beparvo";
    switch (ui.emotion ?? (wild && speaking ? "angry" : null)) {
      case "happy": // quvonib silkitadi
        return [-38 + Math.sin(t / 150) * 16, 38 - Math.sin(t / 150) * 16];
      case "excited": // o'ng qo'l bilan qo'l siltaydi, chap qo'l tepaga
        return [-115 + Math.sin(t / 110) * 28, 55 + Math.sin(t / 240) * 10];
      case "curious": // yelka qisadi: "nima deysan?"
        return [-52 + Math.sin(t / 700) * 4, 52 - Math.sin(t / 700) * 4];
      case "whisper": // qo'llar yaqin, sekin
        return [10 + Math.sin(t / 900) * 2, -10 - Math.sin(t / 900) * 2];
      case "sad": // osilib qolgan qo'llar
        return [12 + Math.sin(t / 1300) * 2, -12 - Math.sin(t / 1300) * 2];
      case "angry": // musht silkitadi
        return [-32 + Math.sin(t / 70) * 18, 32 - Math.sin(t / 70) * 18];
      case "furious": // ikki qo'l tepada, jahl bilan silkitadi
        return [-78 + Math.sin(t / 50) * 22, 78 - Math.sin(t / 55) * 22];
      case "smirk": // bir qo'l belda, ikkinchisi "ha-ha" deb silkitadi
        return [-24 + Math.sin(t / 300) * 10, -28];
      default:
        break;
    }
    if (ui.state === "listening") return [-140 + Math.sin(t / 500) * 4, 6]; // quloq tutadi
    if (ui.state === "thinking") return [-60 + Math.sin(t / 400) * 6, 8]; // "hmm..."
    if (speaking) {
      // Gapga qo'shib imo qiladi: navbatma-navbat qo'llar, urg'uda keskinroq.
      return [-18 + Math.sin(t / 380) * 12 - cur.beat * 30 - cur.level * 10, 14 + Math.sin(t / 470 + 1.3) * 10 + cur.beat * 18];
    }
    const sway = Math.sin(t / 900) * 4;
    return [sway, -sway];
  }

  function moveArms(now, speaking) {
    const [right, left] = calm ? [0, 0] : armPose(now, speaking);
    cur.armR = lerp(cur.armR, right, 0.16);
    cur.armL = lerp(cur.armL, left, 0.16);
    nodes.armR.setAttribute("transform", `rotate(${f(cur.armR)} 230 234)`);
    nodes.armL.setAttribute("transform", `rotate(${f(cur.armL)} 70 234)`);
  }

  function updateBeat(now, speaking) {
    if (speaking && cur.level - talk.prevLevel > BEAT_RISE && now - talk.beatAt > BEAT_GAP_MS) talk.beatAt = now;
    talk.prevLevel = cur.level;
    cur.beat = Math.max(0, 1 - (now - talk.beatAt) / BEAT_MS);
  }

  // Kadrda xato chiqsa ham animatsiya to'xtamaydi — robot qotib qolmasin.
  function tick(now) {
    try {
      frame(now);
    } catch (err) {
      if (!reportedError) console.error("[avatar]", err);
      reportedError = true;
    }
    requestAnimationFrame(tick);
  }

  function frame(now) {
    if (now - blinkAt > BLINK_MS) {
      blinkAt = now + rand(2200, 5600);
      if (Math.random() < 0.18) blinkAt = now + 260; // ba'zan ikki marta pirpiraydi
    }
    updateGaze(now);

    const speaking = ui.state === "speaking";
    const level = speaking && ui.autoTalk ? 0.35 + 0.3 * Math.sin(now / 70) * Math.sin(now / 190) : ui.level;
    cur.level = lerp(cur.level, speaking ? level : 0, LEVEL_SMOOTH);
    updateBeat(now, speaking);

    const preset = presetFor(ui.emotion, ui.mode, ui.persona);
    for (const side of ["left", "right"]) {
      const target = targetEye(side, preset, now);
      for (const key of Object.keys(target)) cur[side][key] = lerp(cur[side][key], target[key], key === "open" ? 0.5 : SMOOTH);
    }
    const faceTarget = targetFace(preset, speaking);
    for (const key of Object.keys(faceTarget)) cur.face[key] = lerp(cur.face[key], faceTarget[key], key === "open" ? 0.45 : SMOOTH);

    const hearts = ui.persona === "romantik" && !NO_HEART_EMOTIONS.has(ui.emotion);
    nodes.eyeL.setAttribute("d", hearts ? heartPath(EYE_CENTERS.left, cur.left) : eyePath(EYE_CENTERS.left, cur.left, "left"));
    nodes.eyeR.setAttribute("d", hearts ? heartPath(EYE_CENTERS.right, cur.right) : eyePath(EYE_CENTERS.right, cur.right, "right"));
    nodes.browL.setAttribute("d", browPath(EYE_CENTERS.left, cur.face, cur.left, "left"));
    nodes.browR.setAttribute("d", browPath(EYE_CENTERS.right, cur.face, cur.right, "right"));
    nodes.browL.setAttribute("opacity", f(cur.face.browShow));
    nodes.browR.setAttribute("opacity", f(cur.face.browShow));
    nodes.mouth.setAttribute("d", mouthPath(cur.face));

    cur.cheeks = lerp(cur.cheeks, preset.cheeks, SMOOTH);
    nodes.cheekL.setAttribute("opacity", f(cur.cheeks));
    nodes.cheekR.setAttribute("opacity", f(cur.cheeks));

    moveHead(now, preset, speaking);
    moveArms(now, speaking);
    nodes.core.setAttribute("r", f(7 + cur.level * 6));
  }

  function setLevel(value) {
    ui.autoTalk = value === null; // brauzer ovozini o'lchab bo'lmaydi — og'iz o'zi qimirlaydi
    if (value !== null) ui.level = Math.max(0, Math.min(1, value));
  }

  function setState(state) {
    ui.state = state;
    root.dataset.state = state;
    gaze.next = 0;
    if (state !== "speaking") ui.level = 0;
  }

  function setMode(mode) {
    ui.mode = mode;
    root.dataset.mode = mode;
  }

  /** Xarakter: jim turgandagi ifoda va ko'z rangi (CSS: [data-persona]). */
  function setPersona(persona) {
    ui.persona = PERSONA_BASE[persona] ? persona : null;
    if (ui.persona) root.dataset.persona = ui.persona;
    else delete root.dataset.persona;
  }

  function setEmotion(emotion) {
    ui.emotion = emotion && EMOTIONS[emotion] ? emotion : null;
    if (ui.emotion) root.dataset.emotion = ui.emotion;
    else delete root.dataset.emotion;
  }

  setState("idle");
  requestAnimationFrame(tick);
  /** x, y: -1..1 (markazga nisbatan). null — o'zi atrofga qarashga qaytadi. */
  function lookAt(x, y = 0) {
    const clamp = (v) => Math.max(-1, Math.min(1, Number(v) || 0));
    ui.look = x === null ? null : { x: clamp(x), y: clamp(y) };
    gaze.next = 0;
  }

  return { setState, setMode, setPersona, setLevel, setEmotion, lookAt };
}
