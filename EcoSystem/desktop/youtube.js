// YouTube — Jigarning o'z pleer oynasida (Electron). Ruxsatsiz va macOS/Windows'da bir xil boshqariladi:
// qidirish, ochish (vaqtdan), pauza, vaqtga o'tish, YouTube ovozi (tizim ovozidan alohida), to'liq ekran.
// Sahifadagi YouTube pleer API (movie_player) ishlatiladi; bo'lmasa — <video> elementi.
const { BrowserWindow } = require("electron");
const { loadTolerant } = require("./load-url.js");
const { videoIdFrom, parseSearch, search } = require("./youtube-search.js");

const SEEK_STEP_S = 10;
const VIDEO_WAIT_MS = 8000;
const POLL_MS = 250;
const PLAYER_SIZE = { width: 1000, height: 620 };

let player = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const seconds = (n, fallback = 0) => Math.max(0, Math.round(Number.isFinite(Number(n)) ? Number(n) : fallback));

function ensurePlayer() {
  if (player && !player.isDestroyed()) return player;
  player = new BrowserWindow({
    ...PLAYER_SIZE,
    title: "Jigar — YouTube",
    backgroundColor: "#000000",
    webPreferences: { partition: "persist:youtube", contextIsolation: true, sandbox: true, autoplayPolicy: "no-user-gesture-required" },
  });
  // Oddiy Chrome sifatida ko'rinsin: "Electron" belgisi bo'lsa YouTube ba'zan yuklashni to'xtatadi.
  player.webContents.setUserAgent(player.webContents.getUserAgent().replace(/\s(Electron|jigar)\/\S+/gi, ""));
  player.on("closed", () => { player = null; });
  return player;
}

/** Pleer sahifasida amal (raqamlar oldindan tozalangan) va holatni qaytarish. */
const STATE_JS = `(() => {
  const p = document.getElementById("movie_player"); const v = document.querySelector("video");
  if (!p && !v) return { error: "Video hali yuklanmagan." };
  const api = (name, ...a) => (p && typeof p[name] === "function" ? (p[name](...a), true) : false);
  const now = () => (p?.getCurrentTime ? p.getCurrentTime() : v?.currentTime || 0);
  ACTION;
  return {
    title: (p?.getVideoData?.().title) || document.title.replace(/ - YouTube$/, ""),
    time: Math.round(now()), duration: Math.round(p?.getDuration?.() || v?.duration || 0),
    volume: Math.round(p?.getVolume ? p.getVolume() : (v?.volume || 0) * 100),
    muted: Boolean(p?.isMuted ? p.isMuted() : v?.muted), paused: Boolean(v?.paused),
  };
})()`;

const ACTIONS = {
  status: () => "",
  pause: () => 'api("pauseVideo") || v.pause()',
  resume: () => 'api("playVideo") || v.play()',
  seek: (input) => `api("seekTo", ${seconds(input.seconds)}, true) || (v.currentTime = ${seconds(input.seconds)})`,
  forward: (input) => `{ const t = now() + ${seconds(input.seconds, SEEK_STEP_S)}; api("seekTo", t, true) || (v.currentTime = t); }`,
  back: (input) => `{ const t = Math.max(0, now() - ${seconds(input.seconds, SEEK_STEP_S)}); api("seekTo", t, true) || (v.currentTime = t); }`,
  volume: (input) => { const l = Math.min(100, seconds(input.level)); return `api("unMute"); api("setVolume", ${l}) || (v.volume = ${l / 100}); if (v) v.muted = false`; },
  mute: () => 'api("mute") || (v.muted = true)',
  unmute: () => 'api("unMute") || (v.muted = false)',
};

const describe = (s) => s.error ? s : {
  text: `"${s.title}" — ${fmt(s.time)} / ${fmt(s.duration)}, YouTube ovozi ${s.volume}%${s.muted ? " (o'chiq)" : ""}${s.paused ? ", pauzada" : ""}.`,
};
const fmt = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;

async function runInPlayer(code) {
  if (!player || player.isDestroyed()) return { error: "YouTube pleeri ochiq emas — avval play bilan oching." };
  return describe(await player.webContents.executeJavaScript(STATE_JS.replace("ACTION", code)));
}

/** Video yuklanib, o'ynay boshlaguncha kutadi (autoplay). */
async function waitForVideo() {
  for (let waited = 0; waited < VIDEO_WAIT_MS; waited += POLL_MS) {
    const ready = await player.webContents.executeJavaScript('Boolean(document.querySelector("video")?.readyState >= 2)').catch(() => false);
    if (ready) return true;
    await sleep(POLL_MS);
  }
  return false;
}

async function play(input) {
  let id = videoIdFrom(input.url);
  if (!id && input.query) id = (await search(input.query))[0]?.id ?? null;
  if (!id) return { error: "Video topilmadi — boshqacha so'z bilan qidirib ko'ring." };
  const win = ensurePlayer();
  const start = seconds(input.seconds);
  await loadTolerant(win.webContents, `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ""}`, { host: "youtube.com" });
  win.show();
  if (!(await waitForVideo())) return { text: `Ochildi: https://youtu.be/${id} (video hali yuklanyapti).` };
  await runInPlayer('api("playVideo") || v.play()');
  return runInPlayer("");
}

/**
 * @param {{ action: string, query?: string, url?: string, seconds?: number, level?: number }} input
 */
async function youtube(input) {
  const action = input?.action;
  if (action === "search") {
    const found = await search(input.query);
    return found.length
      ? { text: found.map((r, i) => `${i + 1}. ${r.title} — https://youtu.be/${r.id}`).join("\n") }
      : { error: "Hech narsa topilmadi." };
  }
  if (action === "play") return play(input);
  if (action === "close") {
    if (player && !player.isDestroyed()) player.close();
    return { text: "YouTube pleeri yopildi." };
  }
  if (action === "fullscreen") {
    if (!player || player.isDestroyed()) return { error: "YouTube pleeri ochiq emas." };
    player.setFullScreen(!player.isFullScreen());
    return { text: player.isFullScreen() ? "To'liq ekran." : "Oddiy oyna." };
  }
  if (!ACTIONS[action]) return { error: `Noma'lum amal: ${action}` };
  return runInPlayer(ACTIONS[action](input ?? {}));
}

/** Media tugmasi (play/pause) uchun: pleer ochiqmi. */
const playerOpen = () => Boolean(player && !player.isDestroyed());

module.exports = { youtube, playerOpen, videoIdFrom, parseSearch, search };
