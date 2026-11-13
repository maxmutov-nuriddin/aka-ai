// Kompyuterdagi asboblar (Electron main jarayoni): server yuborgan buyruqni bajaradi va natijani qaytaradi.
// Natija shakli: { text } | { image (base64 JPEG), text } | { error }. Xavfsizlik qoidalari — policy.js.
// pc_run_command va pc_write_file — faqat server egasining "Ha"sini olgan bo'lsa (approved: true).
const { desktopCapturer, shell, systemPreferences } = require("electron");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { resolveSafePath, checkCommand, classifyOpenTarget } = require("./policy.js");
const { run } = require("./os-run.js");
const { media, apps, system } = require("./control.js");
const { youtube } = require("./youtube.js");
const { homeTv } = require("./home.js");
const { power, probe, health } = require("./power.js");
const { dev } = require("./dev.js");
const { message } = require("./messages.js");
const { screenText } = require("./screen-text.js");
const { effectiveLevel } = require("./access-cap.js");

// Shu kompyuterdagi eng yuqori ruxsat (main.js o'rnatadi: ECO_MAX_ACCESS yoki config.json).
let maxAccess = "full";
const setMaxAccess = (value) => { maxAccess = value; };

const SCREEN_SIZE = { width: 1600, height: 1000 }; // surat shu o'lchamga sig'diriladi (tokenlar tejaladi)
const JPEG_QUALITY = 70;
const HIDE_SETTLE_MS = 350; // Jigar oynasi yashirilgach, ekran yangilanishini kutish
const LIST_LIMIT = 200;
const READ_MAX_BYTES = 200_000;
const WRITE_MAX_CHARS = 500_000;
const OUTPUT_MAX = 20_000;
const BINARY_PROBE_BYTES = 8000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errorText = (err) => (err instanceof Error ? err.message : String(err)); // desktopCapturer satr tashlaydi
const SCREEN_PERMISSION_HINT = "Ekranni ko'rishga ruxsat yo'q: System Settings → Privacy & Security → Screen Recording → Jigar'ni yoqing, keyin ilovani qayta oching.";

/** Ekran/oyna manbalari. macOS ruxsati yo'q bo'lsa — tushunarli xato (ruxsat yo'q holatda Electron "Failed to get sources" tashlaydi). */
async function captureSources(options) {
  try {
    return { sources: await desktopCapturer.getSources(options) };
  } catch (err) {
    const denied = process.platform === "darwin" && systemPreferences.getMediaAccessStatus("screen") !== "granted";
    return { error: denied ? SCREEN_PERMISSION_HINT : `Ekranni olib bo'lmadi: ${errorText(err)}` };
  }
}
const clip = (s, n = OUTPUT_MAX) => (s.length > n ? `${s.slice(0, n)}\n…(qisqartirildi)` : s);
const sizeLabel = (bytes) => (bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`);

/** Yo'l tekshiruvi + symlink orqali uy papkasidan chiqib ketmaslik (realpath qayta tekshiriladi). */
async function safePath(input, { mustExist = true, level = "safe" } = {}) {
  const first = resolveSafePath(input, os.homedir(), level);
  if (!first.ok) return first;
  if (!mustExist) {
    const parent = await fs.realpath(path.dirname(first.path)).catch(() => null);
    if (!parent) return first; // papka hali yo'q — yoziladi
    const again = resolveSafePath(path.join(parent, path.basename(first.path)), os.homedir(), level);
    return again;
  }
  const real = await fs.realpath(first.path).catch(() => null);
  if (!real) return { ok: false, error: "Bunday fayl yoki papka yo'q." };
  return resolveSafePath(real, os.homedir(), level);
}

async function screenshot({ getWindow }) {
  // Jigar oynasi oldinda bo'lsa — vaqtincha yashiriladi (ekranda egasining ishi ko'rinsin).
  const win = getWindow();
  const hide = Boolean(win?.isVisible() && win.isFocused());
  if (hide) {
    win.hide();
    await sleep(HIDE_SETTLE_MS);
  }
  try {
    const { sources, error } = await captureSources({ types: ["screen"], thumbnailSize: SCREEN_SIZE });
    if (error) return { error };
    const thumb = sources[0]?.thumbnail;
    if (!thumb || thumb.isEmpty()) return { error: "Ekran suratini olib bo'lmadi (ruxsatni tekshiring)." };
    return { image: thumb.toJPEG(JPEG_QUALITY).toString("base64"), text: `Ekran surati (${sources.length} ta ekrandan birinchisi).` };
  } finally {
    if (hide) win.show();
  }
}

async function windows() {
  const { sources, error } = await captureSources({ types: ["window"], thumbnailSize: { width: 0, height: 0 } });
  if (error) return { error };
  const names = [...new Set(sources.map((s) => s.name).filter((n) => n && n !== "Jigar"))];
  return { text: names.length ? names.map((n) => `- ${n}`).join("\n") : "Ochiq oyna topilmadi." };
}

async function listDir({ path: dir }, level) {
  const safe = await safePath(dir, { level });
  if (!safe.ok) return { error: safe.error };
  const entries = await fs.readdir(safe.path, { withFileTypes: true });
  const shown = entries.filter((e) => !e.name.startsWith(".")).sort((a, b) => a.name.localeCompare(b.name)).slice(0, LIST_LIMIT);
  const lines = await Promise.all(shown.map(async (e) => {
    if (e.isDirectory()) return `📁 ${e.name}/`;
    const stat = await fs.stat(path.join(safe.path, e.name)).catch(() => null);
    return `${e.name}${stat ? ` (${sizeLabel(stat.size)})` : ""}`;
  }));
  const more = entries.length > shown.length ? `\n…jami ${entries.length} ta (yashirin fayllar ko'rsatilmadi)` : "";
  return { text: `${safe.path}\n${lines.join("\n") || "(bo'sh)"}${more}` };
}

async function readFile({ path: file }, level) {
  const safe = await safePath(file, { level });
  if (!safe.ok) return { error: safe.error };
  const stat = await fs.stat(safe.path);
  if (!stat.isFile()) return { error: "Bu fayl emas." };
  if (stat.size > READ_MAX_BYTES) return { error: `Fayl juda katta (${sizeLabel(stat.size)}; ko'pi bilan ${sizeLabel(READ_MAX_BYTES)}).` };
  const buffer = await fs.readFile(safe.path);
  if (buffer.subarray(0, BINARY_PROBE_BYTES).includes(0)) return { error: "Bu matnli fayl emas (rasm, dastur yoki arxiv)." };
  return { text: clip(buffer.toString("utf8")) };
}


async function open({ target }, level) {
  const t = classifyOpenTarget(target, os.homedir(), level);
  if (t.error) return { error: t.error };
  if (t.kind === "url") {
    await shell.openExternal(t.value);
    return { text: `Ochildi: ${t.value}` };
  }
  if (t.kind === "path") {
    const safe = await safePath(t.value, { level });
    if (!safe.ok) return { error: safe.error };
    const failure = await shell.openPath(safe.path);
    return failure ? { error: failure } : { text: `Ochildi: ${safe.path}` };
  }
  const r = process.platform === "darwin" ? await run("open", ["-a", t.value])
    : process.platform === "win32" ? await run("cmd.exe", ["/c", "start", "", t.value])
    : { code: 1, stderr: "Bu tizimda ilovani nomi bilan ochish qo'llanmaydi." };
  return r.code === 0 ? { text: `Ochildi: ${t.value}` } : { error: `"${t.value}" ochilmadi: ${clip(r.stderr || "ilova topilmadi", 500)}` };
}

async function runCommand({ command }, approved, level) {
  if (!approved) return { error: "Egasining ruxsati yo'q." };
  const blocked = checkCommand(command, level);
  if (blocked) return { error: blocked };
  const r = process.platform === "win32"
    ? await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command])
    : await run(process.env.SHELL || "/bin/zsh", ["-lc", command]);
  const parts = [`Chiqish kodi: ${r.code}${r.killed ? " (vaqt tugadi — to'xtatildi)" : ""}`];
  if (r.stdout.trim()) parts.push(`Natija:\n${r.stdout.trim()}`);
  if (r.stderr.trim()) parts.push(`Xato oqimi:\n${r.stderr.trim()}`);
  return { text: clip(parts.join("\n\n")) };
}

async function writeFile({ path: file, content }, approved, level) {
  if (!approved) return { error: "Egasining ruxsati yo'q." };
  if (typeof content !== "string" || content.length > WRITE_MAX_CHARS) return { error: "Mazmun yo'q yoki juda katta." };
  const safe = await safePath(file, { mustExist: false, level });
  if (!safe.ok) return { error: safe.error };
  await fs.mkdir(path.dirname(safe.path), { recursive: true });
  await fs.writeFile(safe.path, content, "utf8");
  return { text: `Yozildi: ${safe.path} (${content.length} belgi)` };
}

// Imzo: (input, approved, deps, level). approved — server ruxsat bergan (egasi "Ha" degan yoki daraja ruxsat beradi).
const HANDLERS = {
  pc_screenshot: (input, _a, deps) => screenshot(deps),
  pc_windows: () => windows(),
  pc_list_dir: (input, _a, _d, level) => listDir(input, level),
  pc_read_file: (input, _a, _d, level) => readFile(input, level),
  pc_open: (input, _a, _d, level) => open(input, level),
  pc_run_command: (input, approved, _d, level) => runCommand(input, approved, level),
  pc_write_file: (input, approved, _d, level) => writeFile(input, approved, level),
  pc_media: (input) => media(input),
  pc_apps: (input, approved) => (input.action === "quit_all" && !approved ? { error: "Egasining ruxsati yo'q." } : apps(input)),
  pc_youtube: (input) => youtube(input),
  pc_system: (input) => system(input),
  home_tv: (input) => homeTv(input),
  pc_power: (input, approved) => power(input, approved),
  pc_probe: (input, _a, _d, level) => probe(input, level),
  pc_health: () => health(),
  pc_dev: (input, approved, _d, level) => dev(input, approved, level),
  pc_message: (input, approved) => message(input, approved),
  pc_screen_text: () => screenText(),
};

/**
 * Server buyrug'ini bajaradi. Xato — { error } (Jigar egasiga tushuntiradi).
 * @param {{ tool: string, input: object, approved: boolean, access?: string }} command
 * @param {{ getWindow: () => import("electron").BrowserWindow | null }} deps
 */
async function runTool(command, deps) {
  const handler = HANDLERS[command?.tool];
  if (!handler) return { error: `Noma'lum asbob: ${command?.tool}` };
  try {
    const level = effectiveLevel(command.access, maxAccess);
    return await handler(command.input ?? {}, command.approved === true, deps, level);
  } catch (err) {
    return { error: `Bajarib bo'lmadi: ${errorText(err)}` };
  }
}

module.exports = { runTool, setMaxAccess };
