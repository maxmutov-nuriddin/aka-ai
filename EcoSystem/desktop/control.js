// Kompyuterni boshqarish: tizim ovozi va media, ilovalar (ro'yxat, ochish, yashirish, yopish), tizim (qulf, batareya).
// macOS — AppleScript ("System Events" uchun Automation ruxsati birinchi marta so'raladi), Windows — PowerShell.
const os = require("node:os");
const { osascript, powershell, run } = require("./os-run.js");
const { mac, win } = require("./scripts.js");
const { isSafeAppName } = require("./policy.js");
const { youtube, playerOpen } = require("./youtube.js");

const IS_MAC = process.platform === "darwin";
const IS_WIN = process.platform === "win32";
const VOLUME_STEP = 10;
// Yashirilmaydigan / yopilmaydigan: Jigarning o'zi va tizim qobig'i.
const KEEP_MAC = ["Jigar", "Electron", "Finder"];
const KEEP_WIN = ["Jigar", "electron", "explorer"];
const MUSIC_APPS = ["Spotify", "Music"];

const unsupported = () => ({ error: "Bu amal faqat macOS va Windows'da ishlaydi." });
const fail = (r, what) => ({ error: `${what}: ${(r.stderr || r.stdout || "xato").trim().slice(0, 300)}` });
const permissionHint = (r) => /not allowed|-1743|assistive|not authorized/i.test(r.stderr)
  ? { error: "Ruxsat kerak: System Settings → Privacy & Security → Automation → Jigar → System Events'ni yoqing." }
  : null;

/** Skriptni ishga tushiradi: muvaffaqiyatda — matn, xatoda — tushunarli xato. */
async function script(macScript, winScript, okText, what) {
  if (!IS_MAC && !IS_WIN) return unsupported();
  const r = IS_MAC ? await osascript(macScript) : await powershell(winScript);
  if (r.code !== 0) return permissionHint(r) ?? fail(r, what);
  return { text: typeof okText === "function" ? okText(r.stdout.trim()) : okText };
}

async function macVolumeText() {
  const r = await osascript(mac.volumeStatus());
  const [level, muted] = r.stdout.trim().split(",");
  return r.code === 0 ? `Ovoz: ${level}%${muted === "true" ? " (o'chiq)" : ""}.` : "Ovoz o'zgartirildi.";
}

async function runningApps() {
  if (!IS_MAC && !IS_WIN) return [];
  const r = IS_MAC ? await osascript(mac.appsList()) : await powershell(win.appsList());
  if (r.code !== 0) return null;
  return IS_MAC ? r.stdout.trim().split(/,\s*/).filter(Boolean) : r.stdout.trim().split(/\r?\n/).filter(Boolean);
}

/** Play/pause, keyingi, oldingi: ishlayotgan musiqa ilovasi → Jigar YouTube pleeri → (Windows) media tugmasi. */
async function mediaControl(action) {
  if (IS_MAC) {
    const apps = (await runningApps()) ?? [];
    const music = MUSIC_APPS.find((a) => apps.includes(a));
    if (music) {
      const r = await osascript(mac.player(music, action));
      return r.code === 0 ? { text: `${music}: bajarildi.` } : fail(r, music);
    }
  }
  if (playerOpen() && action === "play_pause") {
    const state = await youtube({ action: "status" });
    return youtube({ action: /pauzada/.test(state.text ?? "") ? "resume" : "pause" });
  }
  if (IS_WIN) return script("", win.media(action), "Media tugmasi bosildi.", "Media");
  return { error: "Hech qanday musiqa ilovasi (Spotify, Music) yoki YouTube pleeri ochiq emas." };
}

async function media({ action, level }) {
  switch (action) {
    case "status":
      if (IS_MAC) return { text: await macVolumeText() };
      return { text: "Windows'da aniq ovoz darajasini o'qib bo'lmaydi; o'zgartirish ishlaydi." };
    case "volume_set":
      return IS_MAC
        ? (await osascript(mac.volumeSet(level))).code === 0 ? { text: await macVolumeText() } : { error: "Ovozni o'zgartirib bo'lmadi." }
        : script("", win.volumeSet(level), `Ovoz ≈${level}%.`, "Ovoz");
    case "volume_up":
    case "volume_down": {
      const delta = action === "volume_up" ? VOLUME_STEP : -VOLUME_STEP;
      if (IS_MAC) return (await osascript(mac.volumeStep(delta))).code === 0 ? { text: await macVolumeText() } : { error: "Ovozni o'zgartirib bo'lmadi." };
      return script("", win.volumeStep(delta), delta > 0 ? "Ovoz oshirildi." : "Ovoz pasaytirildi.", "Ovoz");
    }
    case "mute":
    case "unmute":
      return script(mac.mute(action === "mute"), win.mute(), action === "mute" ? "Ovoz o'chirildi." : "Ovoz yoqildi.", "Ovoz");
    case "play_pause":
    case "next":
    case "previous":
      return mediaControl(action);
    default:
      return { error: `Noma'lum amal: ${action}` };
  }
}

async function apps({ action, app }) {
  const name = String(app ?? "").trim();
  const needsName = ["open", "focus", "hide", "quit"].includes(action);
  if (needsName && !isSafeAppName(name)) return { error: "Ilova nomi noto'g'ri yoki berilmagan." };
  switch (action) {
    case "list": {
      const list = await runningApps();
      return list ? { text: list.length ? list.map((a) => `- ${a}`).join("\n") : "Ochiq ilova yo'q." } : { error: "Ro'yxatni olib bo'lmadi (Automation ruxsatini tekshiring)." };
    }
    case "open": {
      const r = IS_MAC ? await run("open", ["-a", name]) : IS_WIN ? await run("cmd.exe", ["/c", "start", "", name]) : null;
      if (!r) return unsupported();
      return r.code === 0 ? { text: `Ochildi: ${name}` } : { error: `"${name}" topilmadi.` };
    }
    case "focus":
      return script(mac.focus(name), win.focus(name), `${name} oldinga chiqarildi.`, name);
    case "hide":
      return script(mac.hide(name), win.hide(name), `${name} yashirildi.`, name);
    case "quit":
      return script(mac.quit(name), win.quit(name), `${name} yopildi.`, name);
    case "hide_all":
      return script(mac.hideAll(KEEP_MAC), win.hideAll(), "Hamma oynalar yashirildi.", "Yashirish");
    case "quit_all":
      return quitAll();
    default:
      return { error: `Noma'lum amal: ${action}` };
  }
}

/** Hamma ilovalarni yopish (server egasining "Ha"sini olgan). Saqlanmagan ish bo'lsa, ilova o'zi so'raydi. */
async function quitAll() {
  if (IS_WIN) return script("", win.quitAll(KEEP_WIN), (out) => `Yopildi: ${out.split(/\r?\n/).join(", ") || "hech narsa"}.`, "Yopish");
  if (!IS_MAC) return unsupported();
  const list = (await runningApps()) ?? [];
  const closed = [];
  for (const name of list.filter((a) => !KEEP_MAC.includes(a) && isSafeAppName(a))) {
    if ((await osascript(mac.quit(name))).code === 0) closed.push(name);
  }
  return { text: closed.length ? `Yopildi: ${closed.join(", ")}.` : "Yopiladigan ilova yo'q." };
}

async function system({ action }) {
  switch (action) {
    case "lock":
    case "sleep_display":
      if (IS_MAC) {
        const r = await run("pmset", ["displaysleepnow"]);
        return r.code === 0 ? { text: "Ekran o'chirildi (parol yoqilgan bo'lsa — qulflandi)." } : fail(r, "Ekran");
      }
      if (IS_WIN && action === "lock") {
        const [file, args] = win.lock();
        const r = await run(file, args);
        return r.code === 0 ? { text: "Kompyuter qulflandi." } : fail(r, "Qulf");
      }
      return script("", win.sleepDisplay(), "Ekran o'chirildi.", "Ekran");
    case "battery": {
      if (IS_MAC) {
        const r = await run("pmset", ["-g", "batt"]);
        return r.code === 0 ? { text: r.stdout.trim() } : fail(r, "Batareya");
      }
      return script("", win.battery(), (out) => out || "Batareya topilmadi (stol kompyuteri).", "Batareya");
    }
    case "info": {
      const gb = (b) => (b / 1024 ** 3).toFixed(1);
      return {
        text: [
          `Qurilma: ${os.hostname()} (${process.platform}, ${os.arch()})`,
          `Protsessor: ${os.cpus()[0]?.model ?? "?"} × ${os.cpus().length}`,
          `Xotira: ${gb(os.freemem())} / ${gb(os.totalmem())} GB bo'sh`,
          `Ishlab turibdi: ${Math.round(os.uptime() / 3600)} soat`,
        ].join("\n"),
      };
    }
    default:
      return { error: `Noma'lum amal: ${action}` };
  }
}

module.exports = { media, apps, system };
