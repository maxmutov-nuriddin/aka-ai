// Quvvat (qulflash, uxlatish, o'chirish, qayta yoqish), kuzatuv uchun o'lchov (pc_probe) va salomatlik (pc_health).
// pc_probe / pc_health — modelga berilmaydi, server rejalashtiruvchisi chaqiradi (server/agent/scheduler.js).
const os = require("node:os");
const fs = require("node:fs/promises");
const { statfsSync } = require("node:fs");
const { createHash } = require("node:crypto");
const { desktopCapturer } = require("electron");
const { run, osascript, powershell } = require("./os-run.js");
const { resolveSafePath, isSafeAppName } = require("./policy.js");

const IS_MAC = process.platform === "darwin";
const IS_WIN = process.platform === "win32";
const CPU_SAMPLE_MS = 1000;
const THUMB = { width: 64, height: 40 }; // ekran o'zgardimi — kichik surat xeshi yetarli
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (value) => ({ text: JSON.stringify(value) });

const POWER = {
  mac: {
    lock: ["pmset", ["displaysleepnow"]],
    sleep: ["pmset", ["sleepnow"]],
    shutdown: ["osascript", ["-e", 'tell application "System Events" to shut down']],
    restart: ["osascript", ["-e", 'tell application "System Events" to restart']],
  },
  win: {
    lock: ["rundll32.exe", ["user32.dll,LockWorkStation"]],
    sleep: ["rundll32.exe", ["powrprof.dll,SetSuspendState", "0,1,0"]],
    shutdown: ["shutdown", ["/s", "/t", "0"]],
    restart: ["shutdown", ["/r", "/t", "0"]],
  },
};
const POWER_TEXT = { lock: "Ekran qulflandi.", sleep: "Kompyuter uxlatildi.", shutdown: "Kompyuter o'chirilmoqda.", restart: "Kompyuter qayta yoqilmoqda." };

async function power({ action }, approved) {
  const table = IS_MAC ? POWER.mac : IS_WIN ? POWER.win : null;
  if (!table) return { error: "Faqat macOS va Windows." };
  if (!table[action]) return { error: `Noma'lum amal: ${action}` };
  if (["shutdown", "restart"].includes(action) && !approved) return { error: "Egasining ruxsati yo'q." };
  const [file, args] = table[action];
  const r = await run(file, args, { timeoutMs: 15_000 });
  return r.code === 0 ? { text: POWER_TEXT[action] } : { error: `${action}: ${(r.stderr || "xato").trim().slice(0, 300)}` };
}

/** Butun protsessor bandligi 0..1 (ikki o'lchov orasidagi farq — Windows'da ham ishlaydi). */
async function cpuLoad() {
  const snap = () => os.cpus().reduce((acc, c) => {
    const total = Object.values(c.times).reduce((a, b) => a + b, 0);
    return { idle: acc.idle + c.times.idle, total: acc.total + total };
  }, { idle: 0, total: 0 });
  const a = snap();
  await sleep(CPU_SAMPLE_MS);
  const b = snap();
  const total = b.total - a.total;
  return total > 0 ? Math.max(0, Math.min(1, 1 - (b.idle - a.idle) / total)) : 0;
}

/** Nom yoki PID bo'yicha jarayonlar: { running: soni, cpu: % (bitta yadro = 100) }. */
async function processStats({ name, pid }) {
  const wanted = String(name ?? "").toLowerCase();
  if (wanted && !isSafeAppName(name)) return { error: "Jarayon nomi noto'g'ri." };
  if (IS_WIN) {
    const filter = pid ? `-Id ${Number(pid)}` : `-Name '*${name}*'`;
    const cmd = `$a = Get-Process ${filter} -ErrorAction SilentlyContinue; $s = ($a | Measure-Object CPU -Sum).Sum; Start-Sleep -Milliseconds ${CPU_SAMPLE_MS}; $b = Get-Process ${filter} -ErrorAction SilentlyContinue; $e = ($b | Measure-Object CPU -Sum).Sum; "$(@($b).Count) $([math]::Round((($e - $s) / ${CPU_SAMPLE_MS / 1000}) * 100, 1))"`;
    const r = await powershell(cmd);
    const [count, cpu] = r.stdout.trim().split(/\s+/).map(Number);
    return { running: count || 0, cpu: cpu || 0 };
  }
  const r = await run("ps", ["-axo", "pid=,pcpu=,args="], { timeoutMs: 10_000 });
  const rows = r.stdout.split("\n").map((line) => /^\s*(\d+)\s+([\d.]+)\s+(.*)$/.exec(line)).filter(Boolean)
    .filter(([, p, , args]) => Number(p) !== process.pid && (pid ? Number(p) === Number(pid) : args.toLowerCase().includes(wanted)))
    .filter(([, , , args]) => !/\bps -axo\b/.test(args));
  return { running: rows.length, cpu: rows.reduce((sum, [, , c]) => sum + Number(c), 0) };
}

async function screenHash() {
  try {
    const [source] = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: THUMB });
    if (!source || source.thumbnail.isEmpty()) return { error: "Ekranni o'qib bo'lmadi (Screen Recording ruxsati)." };
    return { hash: createHash("sha1").update(source.thumbnail.toBitmap()).digest("hex") };
  } catch (err) {
    return { error: `Ekran: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function fileStats({ path }, level) {
  const safe = resolveSafePath(path, os.homedir(), level);
  if (!safe.ok) return { error: safe.error };
  const stat = await fs.stat(safe.path).catch(() => null);
  return { exists: Boolean(stat), mtime: stat ? stat.mtimeMs : null };
}

/** Kuzatuv sharti uchun o'lchov (server baholaydi). */
async function probe(condition, level) {
  const kind = condition?.type;
  const result = kind === "process_exit" || kind === "process_idle" ? await processStats(condition)
    : kind === "screen_still" ? await screenHash()
    : kind === "file" ? await fileStats(condition, level)
    : { error: `Bu shartni qurilmada o'lchab bo'lmaydi: ${kind}` };
  return result.error ? result : json(result);
}

async function battery() {
  if (IS_MAC) {
    const r = await run("pmset", ["-g", "batt"], { timeoutMs: 10_000 });
    const m = /(\d+)%;\s*([a-z ]+);/i.exec(r.stdout);
    return m ? { percent: Number(m[1]), charging: !/discharging/i.test(m[2]) } : null;
  }
  if (IS_WIN) {
    const r = await powershell("Get-CimInstance Win32_Battery | ForEach-Object { \"$($_.EstimatedChargeRemaining) $($_.BatteryStatus)\" }");
    const [percent, status] = r.stdout.trim().split(/\s+/).map(Number);
    return Number.isFinite(percent) ? { percent, charging: status === 2 || status >= 6 } : null;
  }
  return null;
}

/** Monitoring: batareya, bo'sh disk (GB), protsessor (0..1), bo'sh xotira (GB). */
async function health() {
  let diskFreeGb = null;
  try {
    const s = statfsSync(os.homedir());
    diskFreeGb = (s.bavail * s.bsize) / 1e9;
  } catch {
    /* eski Node — disk o'lchanmaydi */
  }
  return json({ battery: await battery(), diskFreeGb, cpu: await cpuLoad(), memFreeGb: os.freemem() / 1e9 });
}

module.exports = { power, probe, health };
