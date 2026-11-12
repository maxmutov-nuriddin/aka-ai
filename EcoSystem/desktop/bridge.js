// Desktop ↔ server ko'prigi: kompyuter serverga ulanadi ("long-poll") va Jigar yuborgan buyruqlarni bajaradi.
// Kirish: oynadagi sessiya cookie'si (egasi bir marta kirgan bo'lsa yetarli); localhost'da — parolsiz rejim.
const os = require("node:os");
const { session } = require("electron");

const POLL_TIMEOUT_MS = 40_000; // server 25 s kutadi — undan uzunroq
const RETRY_MS = 5_000; // tarmoq xatosida
const SIGNED_OUT_RETRY_MS = 10_000; // hali kirmagan (401) — egasi oynada kirishini kutamiz

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Oynadagi sessiya cookie'lari — Cookie sarlavhasi. */
async function cookieHeader(baseUrl) {
  const cookies = await session.defaultSession.cookies.get({ url: baseUrl });
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

/**
 * @param {{ baseUrl: string, runTool: (command: object) => Promise<object>, log?: (msg: string) => void }} options
 * @returns {{ stop: () => void }}
 */
function startBridge({ baseUrl, runTool, log = console.warn }) {
  let stopped = false;
  const info = { name: os.hostname().replace(/\.local$/, ""), platform: process.platform };

  async function post(pathname, body, timeoutMs) {
    const cookie = await cookieHeader(baseUrl);
    return fetch(`${baseUrl}${pathname}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  /** Buyruqni bajarib, natijani qaytaradi. Poll'ni to'xtatmaydi (uzoq buyruq paytida ham ulangan bo'lib turadi). */
  async function handle(command) {
    const result = await runTool(command).catch((err) => ({ error: String(err?.message ?? err) }));
    await post("/api/devices/result", { id: command.id, result }, POLL_TIMEOUT_MS).catch((err) => log(`[bridge] natija yuborilmadi: ${err.message}`));
  }

  (async function loop() {
    while (!stopped) {
      try {
        const res = await post("/api/devices/poll", info, POLL_TIMEOUT_MS);
        if (res.status === 401) {
          await sleep(SIGNED_OUT_RETRY_MS);
          continue;
        }
        if (!res.ok) {
          await sleep(RETRY_MS);
          continue;
        }
        const { command } = await res.json();
        if (command) handle(command);
      } catch {
        await sleep(RETRY_MS); // server o'chiq yoki internet yo'q — qayta urinamiz
      }
    }
  })();

  return { stop: () => { stopped = true; } };
}

module.exports = { startBridge };
