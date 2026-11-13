// Sozlamalardagi "Jigar ilovalari": qaysi ilova tayyor (macOS, Windows, Android) — /api/downloads; iPhone — PWA.
// To'liq sahifa (QR-kod, yo'riqnomalar) — /download.
const PLATFORMS = [
  ["mac", "🍎", "macOS"],
  ["windows", "🪟", "Windows"],
  ["android", "🤖", "Android"],
];

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

/** @param {HTMLElement} list @param {() => string} apiBase */
export async function renderApps(list, apiBase) {
  let files = [];
  try {
    ({ files = [] } = await (await fetch(`${apiBase()}/api/downloads`)).json());
  } catch {
    /* ro'yxat kelmadi — "tayyor emas" */
  }
  const rows = PLATFORMS.map(([platform, icon, title]) => {
    const file = files.find((f) => f.platform === platform);
    const row = el("div", "app-row");
    row.append(el("span", "app-name", `${icon} ${title}`));
    if (file?.ready) {
      const link = el("a", "ghost app-get", `Yuklab olish · ${(file.size / 1024 ** 2).toFixed(0)} MB`);
      link.href = `${apiBase()}${file.url}`;
      link.setAttribute("download", file.name);
      row.append(link);
    } else {
      row.append(el("small", "app-missing", "hali tayyor emas"));
    }
    return row;
  });
  const ios = el("div", "app-row");
  ios.append(el("span", "app-name", "📱 iPhone"), el("small", "app-missing", "Safari → Ulashish → Bosh ekranga qo'shish"));
  list.replaceChildren(...rows, ios);
}
