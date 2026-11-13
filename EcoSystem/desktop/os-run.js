// Tizim buyruqlarini ishga tushirish (shell'siz: execFile — argumentlar alohida, in'yeksiya yo'q).
const os = require("node:os");
const { execFile } = require("node:child_process");

const DEFAULT_TIMEOUT_MS = 60_000;
const SCRIPT_TIMEOUT_MS = 20_000;
const MAX_BUFFER = 1024 * 1024;

/** @returns {Promise<{ code: number, killed: boolean, stdout: string, stderr: string }>} */
function run(file, args, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { cwd: os.homedir(), timeout: timeoutMs, maxBuffer: MAX_BUFFER, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, killed: Boolean(err?.killed), stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

/** AppleScript (macOS): har qator — alohida -e. */
const osascript = (script) => run("osascript", script.split("\n").flatMap((line) => ["-e", line]), { timeoutMs: SCRIPT_TIMEOUT_MS });

/** JavaScript for Automation (macOS) — bitta skript. */
const jxa = (script, timeoutMs = SCRIPT_TIMEOUT_MS) => run("osascript", ["-l", "JavaScript", "-e", script], { timeoutMs });

/** PowerShell (Windows). */
const powershell = (command, timeoutMs = SCRIPT_TIMEOUT_MS) => run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { timeoutMs });

module.exports = { run, osascript, jxa, powershell };
