// Dasturlash yordamchisi: loyihani VS Code'da ochish, papkada Claude Code'ga topshiriq berish va natijasini o'qish.
// Claude Code fonda (`claude -p`) — chiqishi ~/Jigar/claude-runs/<id>.log ga; yoki ko'rinadigan Terminal oynasida.
// Prompt buyruq qatoriga qo'yilmaydi — muhit o'zgaruvchisi orqali beriladi (in'yeksiya yo'q).
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { run, osascript, powershell } = require("./os-run.js");
const { resolveSafePath } = require("./policy.js");

const IS_MAC = process.platform === "darwin";
const IS_WIN = process.platform === "win32";
const RUN_DIR = path.join(os.homedir(), "Jigar", "claude-runs");
const PROMPT_MAX = 8000;
const LOG_TAIL = 4000;
const runs = new Map(); // id -> { pid, log, cwd, startedAt, exit }
let lastRun = null;

/** Claude Code ruxsatlari: cheksiz darajada — hammasi; boshqasida — fayl tahrirlash (egasi topshiriqni tasdiqlagan). */
const claudeFlags = (level) => (level === "unlimited" ? "--dangerously-skip-permissions" : "--permission-mode acceptEdits");

function projectDir(dir, level) {
  const safe = resolveSafePath(dir, os.homedir(), level);
  if (!safe.ok) return { error: safe.error };
  const stat = fs.statSync(safe.path, { throwIfNoEntry: false });
  return stat?.isDirectory() ? { path: safe.path } : { error: `Papka topilmadi: ${safe.path}` };
}

/** AppleScript ichidagi shell buyrug'i uchun: avval shell ('...'), keyin AppleScript ("...") qochirish. */
const shellQuote = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;
const appleQuote = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

async function openInEditor(dir) {
  const r = IS_MAC ? await run("open", ["-a", "Visual Studio Code", dir])
    : IS_WIN ? await run("cmd.exe", ["/c", "code", dir])
    : await run("code", [dir]);
  return r.code === 0 ? { text: `VS Code'da ochildi: ${dir}` } : { error: "VS Code topilmadi (o'rnatilganmi? 'code' buyrug'i bormi?)." };
}

/** Topshiriqni faylga yozadi (ko'p qatorli matn Terminal'ga to'g'ridan-to'g'ri yozilmaydi — buziladi). */
function writePromptFile(prompt) {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  const file = path.join(RUN_DIR, `${Date.now()}.prompt`);
  fs.writeFileSync(file, prompt, { mode: 0o600 });
  return file;
}

async function claudeVisible(dir, prompt, level) {
  if (IS_MAC) {
    const command = `cd ${shellQuote(dir)} && claude ${claudeFlags(level)} "$(cat ${shellQuote(writePromptFile(prompt))})"`;
    const r = await osascript(`tell application "Terminal"\nactivate\ndo script "${appleQuote(command)}"\nend tell`);
    return r.code === 0 ? { text: `Terminal'da Claude Code ochildi: ${dir}` } : { error: `Terminal ochilmadi: ${r.stderr.trim().slice(0, 200)}` };
  }
  if (IS_WIN) {
    const r = await new Promise((resolve) => {
      const child = spawn("powershell.exe", ["-NoProfile", "-Command",
        `Start-Process powershell -WorkingDirectory $env:JIGAR_DIR -ArgumentList '-NoExit','-Command','claude ${claudeFlags(level)} $env:JIGAR_PROMPT'`],
      { env: { ...process.env, JIGAR_DIR: dir, JIGAR_PROMPT: prompt }, windowsHide: true });
      child.on("exit", (code) => resolve({ code }));
      child.on("error", () => resolve({ code: 1 }));
    });
    return r.code === 0 ? { text: `PowerShell'da Claude Code ochildi: ${dir}` } : { error: "PowerShell oynasi ochilmadi." };
  }
  return { error: "Ko'rinadigan rejim faqat macOS va Windows'da." };
}

function claudeBackground(dir, prompt, level) {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  const id = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const log = path.join(RUN_DIR, `${id}.log`);
  const out = fs.openSync(log, "a");
  fs.writeSync(out, `# Claude Code — ${dir}\n# Topshiriq: ${prompt}\n\n`);
  const [file, args] = IS_WIN
    ? ["powershell.exe", ["-NoProfile", "-Command", `claude -p $env:JIGAR_PROMPT ${claudeFlags(level)}`]]
    : [process.env.SHELL || "/bin/zsh", ["-lc", `exec claude -p "$JIGAR_PROMPT" ${claudeFlags(level)}`]];
  const child = spawn(file, args, { cwd: dir, env: { ...process.env, JIGAR_PROMPT: prompt }, detached: !IS_WIN, stdio: ["ignore", out, out], windowsHide: true });
  const entry = { pid: child.pid, log, cwd: dir, startedAt: Date.now(), exit: null };
  child.on("exit", (code) => { entry.exit = code ?? 0; });
  child.on("error", (err) => { entry.exit = -1; fs.appendFileSync(log, `\nXato: ${err.message}\n`); });
  child.unref();
  fs.closeSync(out);
  runs.set(id, entry);
  lastRun = id;
  return { text: `Claude Code fonda ishga tushdi (ish ${id}, PID ${child.pid}) — ${dir}. Tugashini kutish: watch create, condition process_exit pid=${child.pid}. Natija: pc_dev status.` };
}

function status(runId) {
  const id = runId || lastRun;
  const entry = id && runs.get(id);
  if (!entry) return { error: "Claude Code ishi topilmadi (desktop qayta ishga tushgan bo'lsa — ~/Jigar/claude-runs papkasiga qarang)." };
  const text = fs.readFileSync(entry.log, "utf8");
  const state = entry.exit == null ? "hali ishlayapti" : `tugadi (kod ${entry.exit})`;
  return { text: `Ish ${id}: ${state}, ${Math.round((Date.now() - entry.startedAt) / 60_000)} daqiqa.\nLog: ${entry.log}\n…${text.slice(-LOG_TAIL)}` };
}

async function dev(input, approved, level) {
  if (input.action === "status") return status(input.run);
  const dir = projectDir(input.path, level);
  if (dir.error) return dir;
  if (input.action === "open") return openInEditor(dir.path);
  if (input.action !== "claude") return { error: `Noma'lum amal: ${input.action}` };
  if (!approved) return { error: "Egasining ruxsati yo'q." };
  const prompt = String(input.prompt ?? "").trim().slice(0, PROMPT_MAX);
  if (!prompt) return { error: "Claude Code uchun topshiriq (prompt) bo'sh." };
  return input.visible ? claudeVisible(dir.path, prompt, level) : claudeBackground(dir.path, prompt, level);
}

module.exports = { dev, shellQuote, appleQuote };
