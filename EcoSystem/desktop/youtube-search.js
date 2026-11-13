// YouTube: havoladan video id va qidiruv natijalari (API kalitsiz). Electron'siz — desktop ham, server ham ishlatadi.
const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const SEARCH_LIMIT = 5;

/** Havoladan yoki to'g'ridan-to'g'ri video id: youtu.be/ID, ?v=ID, /shorts/ID, /embed/ID. */
function videoIdFrom(input) {
  const value = String(input ?? "").trim();
  if (ID_RE.test(value)) return value;
  try {
    const url = new URL(value);
    if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(url.hostname)) return null;
    const id = url.hostname.endsWith("youtu.be") ? url.pathname.slice(1) : url.searchParams.get("v") || url.pathname.split("/")[2];
    return ID_RE.test(id ?? "") ? id : null;
  } catch {
    return null;
  }
}

/** YouTube qidiruv sahifasidan birinchi natijalar (API kalitsiz): [{ id, title }]. */
function parseSearch(html, limit = SEARCH_LIMIT) {
  const results = [];
  const re = /"videoRenderer":\{"videoId":"([A-Za-z0-9_-]{11})".{0,4000}?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/gs;
  for (const m of html.matchAll(re)) {
    if (results.some((r) => r.id === m[1])) continue;
    let title = m[2];
    try {
      title = JSON.parse(`"${m[2]}"`);
    } catch {
      /* xom matn qoladi */
    }
    results.push({ id: m[1], title });
    if (results.length >= limit) break;
  }
  return results;
}

async function search(query) {
  const q = String(query ?? "").trim().slice(0, 200);
  if (!q) return [];
  const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, {
    headers: { "Accept-Language": "uz,ru;q=0.9,en;q=0.8" },
    signal: AbortSignal.timeout(15_000),
  });
  return parseSearch(await res.text());
}

module.exports = { videoIdFrom, parseSearch, search };
