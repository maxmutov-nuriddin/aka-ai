// "Jigarga ayt" buyrug'ini Shortcuts'ga qo'shish (faqat macOS): fayl yaratadi → Apple bilan imzolaydi (`shortcuts sign`) →
// Shortcuts'da ochadi (egasi "Qo'shish" tugmasini bosadi). Kalit vaqtinchalik papkada turadi va oxirida o'chiriladi.
// Mantiq (tavsif) — siri-shortcut.js; bu fayl faqat tizim buyruqlarini ishga tushiradi. Chaqiruvchi: main.js (jigar:install-siri).
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { shell } = require("electron");
const { SHORTCUT_NAME, buildShortcut } = require("./siri-shortcut.js");

const run = promisify(execFile);
const SIGN_TIMEOUT_MS = 60_000; // imzolash Apple serveriga boradi

/**
 * @param {{ serverUrl: string, token: string, language?: string }} options
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function installSiriShortcut(options) {
  if (process.platform !== "darwin") return { ok: false, error: "Siri buyrug'i faqat Mac'da." };
  const description = buildShortcut(options);
  if (!description) return { ok: false, error: "Server manzili yoki kalit noto'g'ri." };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jigar-siri-"));
  const source = path.join(dir, `${SHORTCUT_NAME}.json`);
  const binary = path.join(dir, "unsigned.shortcut");
  const signed = path.join(dir, `${SHORTCUT_NAME}.shortcut`);
  try {
    fs.writeFileSync(source, JSON.stringify(description), { mode: 0o600 });
    await run("/usr/bin/plutil", ["-convert", "binary1", "-o", binary, source]);
    await run("/usr/bin/shortcuts", ["sign", "--mode", "anyone", "--input", binary, "--output", signed], { timeout: SIGN_TIMEOUT_MS });
    const failure = await shell.openPath(signed);
    if (failure) return { ok: false, error: failure };
    await new Promise((resolve) => setTimeout(resolve, 4000)); // Shortcuts faylni o'qib olguncha
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Imzolab bo'lmadi: ${err?.message ?? err}`.slice(0, 200) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { installSiriShortcut };
